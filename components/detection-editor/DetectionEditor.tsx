'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Loader2, AlertCircle, RefreshCw, Eye, EyeOff, X, Layers, Home } from 'lucide-react';
import {
  useExtractionData,
  useDetectionSync,
  createOptimisticMove,
  createOptimisticMoveAndResize,
  createOptimisticDelete,
  createOptimisticVerify,
  createOptimisticReclassify,
} from '@/lib/hooks';
import type {
  ViewTransform,
  ToolMode,
  DetectionClass,
  ExtractionDetection,
} from '@/lib/types/extraction';
import DetectionToolbar from './DetectionToolbar';
import DetectionCanvas from './DetectionCanvas';
import DetectionSidebar from './DetectionSidebar';

// =============================================================================
// Types
// =============================================================================

export interface DetectionEditorProps {
  jobId: string;
  projectId?: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TRANSFORM: ViewTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_STEP = 1.2;

// Default image dimensions if not available from page data
const DEFAULT_IMAGE_WIDTH = 1920;
const DEFAULT_IMAGE_HEIGHT = 1080;

// Class shortcuts mapping (1-7 keys)
const CLASS_SHORTCUTS: DetectionClass[] = [
  'window',
  'door',
  'garage',
  'building',
  'exterior_wall',
  'roof',
  'gable',
];

// =============================================================================
// Helper Components
// =============================================================================

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-gray-600 dark:text-gray-400 text-lg">Loading extraction...</p>
      </div>
    </div>
  );
}

interface ErrorDisplayProps {
  error: Error;
  onRetry: () => void;
}

function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-950">
      <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
        <AlertCircle className="w-16 h-16 text-red-500" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Failed to load extraction
        </h2>
        <p className="text-gray-600 dark:text-gray-400">{error.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function DetectionEditor({
  jobId,
  projectId,
  onComplete,
  onError,
}: DetectionEditorProps) {
  // ============================================================================
  // Data Hooks
  // ============================================================================

  const {
    job,
    pages,
    currentPage,
    currentPageId,
    setCurrentPageId,
    currentPageDetections,
    allCurrentPageDetections,
    elevationCalcs,
    currentElevationCalcs,
    jobTotals,
    loading,
    error: dataError,
    reviewProgress,
    refresh,
    updateDetectionLocally,
    removeDetectionLocally,
    addDetectionLocally,
    updateJobTotalsLocally,
    updateElevationCalcsLocally,
  } = useExtractionData(jobId, { includeDeleted: true });

  const {
    verifyDetection,
    moveDetection,
    resizeDetection,
    moveAndResizeDetection,
    deleteDetection,
    reclassifyDetection,
    createDetection,
    isSyncing,
    pendingEdits,
    lastError: syncError,
    clearError,
  } = useDetectionSync({
    jobId,
    pageId: currentPageId || '',
    scaleRatio: currentPage?.scale_ratio || 64,
    dpi: currentPage?.dpi || 100,
    onSuccess: (response) => {
      if (response.updated_detection) {
        // For move/resize/verify operations, preserve the original class
        // The server should not change the class, but some backends return "Unknown"
        // Only reclassify should actually change the class
        const editType = response.edit_type;
        const preserveClassTypes: string[] = ['move', 'resize', 'verify'];

        if (preserveClassTypes.includes(editType) && response.detection_id) {
          // Find the current detection to preserve its class
          const currentDetection = currentPageDetections.find(
            (d) => d.id === response.detection_id
          );
          if (currentDetection) {
            // Merge server response with preserved class
            updateDetectionLocally({
              ...response.updated_detection,
              class: currentDetection.class,
            });
          } else {
            // Fallback: use server response as-is
            updateDetectionLocally(response.updated_detection);
          }
        } else {
          // For reclassify, create, delete - use server response
          updateDetectionLocally(response.updated_detection);
        }
      }
      if (response.elevation_totals && currentPageId) {
        updateElevationCalcsLocally(currentPageId, response.elevation_totals);
      }
      if (response.job_totals) {
        updateJobTotalsLocally(response.job_totals);
      }
    },
    onError: (err) => onError?.(err),
  });

  // ============================================================================
  // Local UI State
  // ============================================================================

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [createClass, setCreateClass] = useState<DetectionClass>('window');
  const [transform, setTransform] = useState<ViewTransform>(DEFAULT_TRANSFORM);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showArea, setShowArea] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isGeneratingMarkup, setIsGeneratingMarkup] = useState(false);

  // Markup display state (PNG image view)
  const [markupUrl, setMarkupUrl] = useState<string | null>(null);
  const [showMarkup, setShowMarkup] = useState(false);

  // Canvas-based markup overlay state
  const [showMarkupOverlay, setShowMarkupOverlay] = useState(false);

  // Siding polygon overlay state
  const [showSidingOverlay, setShowSidingOverlay] = useState(false);

  // Track image dimensions
  const [imageDimensions, setImageDimensions] = useState({
    width: DEFAULT_IMAGE_WIDTH,
    height: DEFAULT_IMAGE_HEIGHT,
  });

  // Ref to track if component is mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ============================================================================
  // Computed Image URL and Dimensions
  // ============================================================================

  // Prefer original_image_url (unmarked) since detection coordinates are in that space
  const canvasImageUrl = currentPage?.original_image_url || currentPage?.image_url;

  // Use stored dimensions if available, otherwise load from image
  useEffect(() => {
    // If we have stored original dimensions, use those
    if (currentPage?.original_width && currentPage?.original_height) {
      setImageDimensions({
        width: currentPage.original_width,
        height: currentPage.original_height,
      });
      return;
    }

    // Otherwise load dimensions from the image
    if (!canvasImageUrl) return;

    const img = new Image();
    img.onload = () => {
      if (isMountedRef.current) {
        setImageDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      }
    };
    img.src = canvasImageUrl;
  }, [currentPage?.original_width, currentPage?.original_height, canvasImageUrl]);

  // ============================================================================
  // Clear selection and markup when page changes
  // ============================================================================

  useEffect(() => {
    setSelectedIds(new Set());
    setHoveredId(null);
    // Clear markup when changing pages since markup is page-specific
    setMarkupUrl(null);
    setShowMarkup(false);
  }, [currentPageId]);

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // Tool mode shortcuts
      if (key === 's') {
        e.preventDefault();
        setToolMode('select');
        return;
      }
      if (key === 'd') {
        e.preventDefault();
        setToolMode('create');
        return;
      }
      if (key === 'p') {
        e.preventDefault();
        setToolMode('pan');
        return;
      }
      if (key === 'v') {
        e.preventDefault();
        // If something is selected, verify it; otherwise switch to verify mode
        if (selectedIds.size > 0) {
          handleVerifySelected();
        } else {
          setToolMode('verify');
        }
        return;
      }

      // Delete selected detections
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Clear selection
      if (key === 'escape') {
        e.preventDefault();
        setSelectedIds(new Set());
        return;
      }

      // Class shortcuts (1-7)
      const num = parseInt(key);
      if (num >= 1 && num <= 7) {
        e.preventDefault();
        setCreateClass(CLASS_SHORTCUTS[num - 1]);
        return;
      }

      // Zoom shortcuts
      if (key === '+' || key === '=') {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      if (key === '-') {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      if (key === '0') {
        e.preventDefault();
        handleZoomReset();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================================
  // Selection Handlers
  // ============================================================================

  const handleSelect = useCallback((id: string, addToSelection: boolean) => {
    setSelectedIds((prev) => {
      if (addToSelection) {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      } else {
        return new Set([id]);
      }
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleHover = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  // ============================================================================
  // Detection Edit Handlers
  // ============================================================================

  // Handler now receives absolute new position instead of delta
  // This fixes the compounding movement bug where optimistic updates
  // caused deltas to be applied to already-moved positions
  const handleMoveDetection = useCallback(
    (id: string, newX: number, newY: number) => {
      const detection = currentPageDetections.find((d) => d.id === id);
      if (!detection) return;

      // Apply optimistic update with the absolute new position
      const optimistic = createOptimisticMove(detection, newX, newY);
      updateDetectionLocally(optimistic);

      // Sync to server
      moveDetection(id, newX, newY);
    },
    [currentPageDetections, updateDetectionLocally, moveDetection]
  );

  const handleResizeDetection = useCallback(
    (id: string, newBounds: { x: number; y: number; width: number; height: number }) => {
      const detection = currentPageDetections.find((d) => d.id === id);
      if (!detection) return;

      // Apply optimistic update
      const optimistic = createOptimisticMoveAndResize(
        detection,
        newBounds.x,
        newBounds.y,
        newBounds.width,
        newBounds.height
      );
      updateDetectionLocally(optimistic);

      // Sync to server
      moveAndResizeDetection(id, newBounds.x, newBounds.y, newBounds.width, newBounds.height);
    },
    [currentPageDetections, updateDetectionLocally, moveAndResizeDetection]
  );

  const handleCreateDetection = useCallback(
    async (
      bounds: { x: number; y: number; width: number; height: number },
      detectionClass: DetectionClass
    ) => {
      const response = await createDetection(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        detectionClass
      );

      // Select the new detection if created successfully
      if (response.success && response.detection_id) {
        setSelectedIds(new Set([response.detection_id]));
      }
    },
    [createDetection]
  );

  const handleVerifyDetection = useCallback(
    (id: string) => {
      const detection = currentPageDetections.find((d) => d.id === id);
      if (!detection) return;

      // Apply optimistic update
      const optimistic = createOptimisticVerify(detection);
      updateDetectionLocally(optimistic);

      // Sync to server
      verifyDetection(id);
    },
    [currentPageDetections, updateDetectionLocally, verifyDetection]
  );

  const handleVerifySelected = useCallback(() => {
    selectedIds.forEach((id) => {
      handleVerifyDetection(id);
    });
  }, [selectedIds, handleVerifyDetection]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    selectedIds.forEach((id) => {
      const detection = currentPageDetections.find((d) => d.id === id);
      if (!detection) return;

      // Apply optimistic update
      const optimistic = createOptimisticDelete(detection);
      updateDetectionLocally(optimistic);

      // Sync to server
      deleteDetection(id);
    });

    // Clear selection after delete
    setSelectedIds(new Set());
  }, [selectedIds, currentPageDetections, updateDetectionLocally, deleteDetection]);

  // ============================================================================
  // Zoom Handlers
  // ============================================================================

  const handleZoomIn = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(MAX_SCALE, prev.scale * ZOOM_STEP),
    }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(MIN_SCALE, prev.scale / ZOOM_STEP),
    }));
  }, []);

  const handleZoomReset = useCallback(() => {
    setTransform(DEFAULT_TRANSFORM);
  }, []);

  // ============================================================================
  // Approval Handler
  // ============================================================================

  const handleApprove = useCallback(async () => {
    if (!jobId) return;

    setIsApproving(true);

    try {
      const webhookUrl =
        process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
        'https://n8n-production-293e.up.railway.app';
      const response = await fetch(`${webhookUrl}/webhook/approve-extraction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: jobId,
          project_id: projectId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Approval failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Approval failed');
      }

      // Refresh data and call completion callback
      await refresh();
      onComplete?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Approval failed');
      onError?.(error);
    } finally {
      if (isMountedRef.current) {
        setIsApproving(false);
      }
    }
  }, [jobId, projectId, refresh, onComplete, onError]);

  // ============================================================================
  // Generate Facade Markup Handler
  // ============================================================================

  const handleGenerateMarkup = useCallback(async () => {
    if (!jobId || !currentPageId) {
      console.error('Missing jobId or currentPageId', { jobId, currentPageId });
      return;
    }

    setIsGeneratingMarkup(true);

    try {
      const payload = { job_id: jobId, page_id: currentPageId };
      console.log('Sending markup request:', payload);

      const response = await fetch(
        'https://extraction-api-production.up.railway.app/generate-facade-markup',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      console.log('Response status:', response.status, response.statusText);
      console.log('Response ok:', response.ok);

      // Parse JSON first, then check for success
      // Don't check response.ok first - API might return 200 with success:true
      const data = await response.json();
      console.log('Response data:', data);

      let url: string | null = null;
      if (data.success && data.pages?.[0]?.markup_url) {
        url = data.pages[0].markup_url;
      } else if (data.markup_url) {
        url = data.markup_url;
      } else {
        throw new Error(data.error || 'No markup URL in response');
      }

      // Add cache buster to prevent stale images
      if (url) {
        url = url + '?t=' + Date.now();
        setMarkupUrl(url);
        setShowMarkup(true);
      }
    } catch (err) {
      console.error('Markup generation error:', err);
      const error = err instanceof Error ? err : new Error('Markup generation failed');
      onError?.(error);
    } finally {
      if (isMountedRef.current) {
        setIsGeneratingMarkup(false);
      }
    }
  }, [jobId, currentPageId, onError]);

  // Toggle between markup view and editor view
  const handleToggleMarkup = useCallback(() => {
    setShowMarkup((prev) => !prev);
  }, []);

  // Clear the current markup
  const handleClearMarkup = useCallback(() => {
    setMarkupUrl(null);
    setShowMarkup(false);
  }, []);

  // Toggle canvas-based markup overlay
  const handleToggleMarkupOverlay = useCallback(() => {
    setShowMarkupOverlay((prev) => !prev);
  }, []);

  // Toggle siding polygon overlay
  const handleToggleSidingOverlay = useCallback(() => {
    setShowSidingOverlay((prev) => !prev);
  }, []);

  // Compute markup overlay summary from ALL detections (including building/exterior_wall)
  const markupOverlaySummary = useMemo(() => {
    if (!showMarkupOverlay) return null;

    // Debug: log detection classes and areas - use allCurrentPageDetections to include building class
    console.log('[MarkupOverlay] Computing summary from', allCurrentPageDetections.length, 'detections (all classes)');
    const classCounts = allCurrentPageDetections.reduce((acc, d) => {
      if (d.status !== 'deleted') {
        acc[d.class] = (acc[d.class] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    console.log('[MarkupOverlay] Class counts:', classCounts);

    let buildingAreaSf = 0;
    let roofAreaSf = 0;
    let windowAreaSf = 0;
    let doorAreaSf = 0;
    let garageAreaSf = 0;
    let windowCount = 0;
    let doorCount = 0;
    let garageCount = 0;

    for (const detection of allCurrentPageDetections) {
      if (detection.status === 'deleted') continue;
      const areaSf = detection.area_sf || 0;
      const cls = detection.class;

      if (cls === 'building' || cls === 'exterior_wall') {
        buildingAreaSf += areaSf;
      } else if (cls === 'roof') {
        roofAreaSf += areaSf;
      } else if (cls === 'window') {
        windowAreaSf += areaSf;
        windowCount++;
      } else if (cls === 'door') {
        doorAreaSf += areaSf;
        doorCount++;
      } else if (cls === 'garage') {
        garageAreaSf += areaSf;
        garageCount++;
      }
    }

    const grossFacadeSf = buildingAreaSf - roofAreaSf;
    const openingsSf = windowAreaSf + doorAreaSf + garageAreaSf;
    const netSidingSf = grossFacadeSf - openingsSf;

    return {
      buildingAreaSf: Math.round(buildingAreaSf),
      roofAreaSf: Math.round(roofAreaSf),
      grossFacadeSf: Math.round(grossFacadeSf),
      windowAreaSf: Math.round(windowAreaSf),
      doorAreaSf: Math.round(doorAreaSf),
      garageAreaSf: Math.round(garageAreaSf),
      openingsSf: Math.round(openingsSf),
      netSidingSf: Math.round(netSidingSf),
      windowCount,
      doorCount,
      garageCount,
    };
  }, [showMarkupOverlay, allCurrentPageDetections]);

  // ============================================================================
  // Filtered Detections for Canvas
  // ============================================================================

  const visibleDetections = useMemo(() => {
    if (showDeleted) {
      return currentPageDetections;
    }
    return currentPageDetections.filter((d) => d.status !== 'deleted');
  }, [currentPageDetections, showDeleted]);

  // All detections for overlay (includes building/exterior_wall for colored fills)
  const overlayDetections = useMemo(() => {
    return allCurrentPageDetections.filter((d) => d.status !== 'deleted');
  }, [allCurrentPageDetections]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-950 relative">
      {/* Loading State */}
      {loading && <LoadingOverlay />}

      {/* Error State */}
      {dataError && <ErrorDisplay error={dataError} onRetry={refresh} />}

      {/* Main Content */}
      {!loading && !dataError && job && (
        <>
          <DetectionToolbar
            toolMode={toolMode}
            onToolModeChange={setToolMode}
            createClass={createClass}
            onCreateClassChange={setCreateClass}
            scale={transform.scale}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
            isSyncing={isSyncing}
            pendingEdits={pendingEdits}
            lastError={syncError}
            onClearError={clearError}
            reviewProgress={reviewProgress}
            onApprove={handleApprove}
            isApproving={isApproving}
            onGenerateMarkup={handleGenerateMarkup}
            isGeneratingMarkup={isGeneratingMarkup}
          />

          <div className="flex-1 flex overflow-hidden">
            {/* Canvas Area */}
            <div className="flex-1 relative">
              {/* Markup View Mode */}
              {showMarkup && markupUrl ? (
                <div className="absolute inset-0 flex flex-col bg-gray-900">
                  {/* Markup Header Bar */}
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-white">Facade Markup View</span>
                      <span className="text-xs text-gray-400 ml-2">
                        (Shows: Building - Roof = Net Facade)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleMarkup}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                      >
                        <EyeOff className="w-4 h-4" />
                        Back to Editor
                      </button>
                      <button
                        type="button"
                        onClick={handleClearMarkup}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors"
                        title="Clear markup"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {/* Markup Image Display */}
                  <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                    <img
                      src={markupUrl}
                      alt="Facade Markup"
                      className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                      style={{ imageRendering: 'auto' }}
                    />
                  </div>
                  {/* Legend */}
                  <div className="flex items-center justify-center gap-6 px-4 py-2 bg-gray-800 border-t border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(59, 130, 246)' }} />
                      <span className="text-xs text-gray-300">Facade (Siding Area)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(220, 38, 38)' }} />
                      <span className="text-xs text-gray-300">Roof (Excluded)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(249, 115, 22)' }} />
                      <span className="text-xs text-gray-300">Windows</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(34, 197, 94)' }} />
                      <span className="text-xs text-gray-300">Doors</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(234, 179, 8)' }} />
                      <span className="text-xs text-gray-300">Garage</span>
                    </div>
                  </div>
                </div>
              ) : canvasImageUrl ? (
                <DetectionCanvas
                  imageUrl={canvasImageUrl}
                  imageWidth={imageDimensions.width}
                  imageHeight={imageDimensions.height}
                  detections={visibleDetections}
                  overlayDetections={overlayDetections}
                  selectedIds={selectedIds}
                  hoveredId={hoveredId}
                  toolMode={toolMode}
                  createClass={createClass}
                  transform={transform}
                  onTransformChange={setTransform}
                  onSelect={handleSelect}
                  onClearSelection={handleClearSelection}
                  onHover={handleHover}
                  onMoveDetection={handleMoveDetection}
                  onResizeDetection={handleResizeDetection}
                  onCreateDetection={handleCreateDetection}
                  onVerifyDetection={handleVerifyDetection}
                  showDimensions={showDimensions}
                  showArea={showArea}
                  showMarkupOverlay={showMarkupOverlay}
                  showSidingOverlay={showSidingOverlay}
                  pageId={currentPageId || undefined}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500 dark:text-gray-400">
                    Select a page to view detections
                  </p>
                </div>
              )}

              {/* Floating Toggle Button when markup exists but not showing */}
              {markupUrl && !showMarkup && (
                <button
                  type="button"
                  onClick={handleToggleMarkup}
                  className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-lg transition-colors z-10"
                >
                  <Eye className="w-4 h-4" />
                  View Markup
                </button>
              )}

              {/* Canvas Markup Overlay Toggle Button */}
              {!showMarkup && (
                <button
                  type="button"
                  onClick={handleToggleMarkupOverlay}
                  className={`absolute top-4 ${markupUrl ? 'right-36' : 'right-4'} flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg shadow-lg transition-colors z-10 ${
                    showMarkupOverlay
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                  title="Toggle colored overlay showing facade calculations"
                >
                  <Layers className="w-4 h-4" />
                  {showMarkupOverlay ? 'Hide Overlay' : 'Show Overlay'}
                </button>
              )}

              {/* Siding Polygon Overlay Toggle Button */}
              {!showMarkup && (
                <button
                  type="button"
                  onClick={handleToggleSidingOverlay}
                  className={`absolute top-4 ${markupUrl ? 'right-[17rem]' : 'right-[9.5rem]'} flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg shadow-lg transition-colors z-10 ${
                    showSidingOverlay
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                  title="Toggle siding polygon overlay showing net siding area"
                >
                  <Home className="w-4 h-4" />
                  {showSidingOverlay ? 'Hide Siding' : 'Show Siding'}
                </button>
              )}

              {/* Floating Summary Panel when markup overlay is active */}
              {showMarkupOverlay && markupOverlaySummary && !showMarkup && (
                <div className="absolute bottom-4 left-4 bg-gray-900/95 backdrop-blur-sm text-white rounded-lg shadow-2xl border border-gray-700 z-10 min-w-[280px]">
                  <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Facade Calculation</h3>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs text-gray-400">Live</span>
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-2 text-sm">
                    {/* Building Area */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(59, 130, 246, 0.8)' }} />
                        <span className="text-gray-300">Building Area</span>
                      </div>
                      <span className="font-mono">{markupOverlaySummary.buildingAreaSf.toLocaleString()} SF</span>
                    </div>
                    {/* Roof Area (subtract) */}
                    <div className="flex items-center justify-between text-red-400">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(220, 53, 69, 0.8)' }} />
                        <span>− Roof Area</span>
                      </div>
                      <span className="font-mono">−{markupOverlaySummary.roofAreaSf.toLocaleString()} SF</span>
                    </div>
                    {/* Gross Facade (subtotal) */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-700">
                      <span className="text-gray-300 font-medium">Gross Facade</span>
                      <span className="font-mono font-medium">{markupOverlaySummary.grossFacadeSf.toLocaleString()} SF</span>
                    </div>
                    {/* Openings */}
                    <div className="space-y-1 pl-2 text-xs">
                      <div className="flex items-center justify-between text-orange-400">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'rgba(249, 115, 22, 0.8)' }} />
                          <span>− Windows ({markupOverlaySummary.windowCount})</span>
                        </div>
                        <span className="font-mono">−{markupOverlaySummary.windowAreaSf.toLocaleString()} SF</span>
                      </div>
                      <div className="flex items-center justify-between text-green-400">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'rgba(34, 197, 94, 0.8)' }} />
                          <span>− Doors ({markupOverlaySummary.doorCount})</span>
                        </div>
                        <span className="font-mono">−{markupOverlaySummary.doorAreaSf.toLocaleString()} SF</span>
                      </div>
                      <div className="flex items-center justify-between text-yellow-400">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'rgba(234, 179, 8, 0.8)' }} />
                          <span>− Garages ({markupOverlaySummary.garageCount})</span>
                        </div>
                        <span className="font-mono">−{markupOverlaySummary.garageAreaSf.toLocaleString()} SF</span>
                      </div>
                    </div>
                    {/* Total Openings */}
                    <div className="flex items-center justify-between text-gray-400 text-xs">
                      <span>Total Openings</span>
                      <span className="font-mono">−{markupOverlaySummary.openingsSf.toLocaleString()} SF</span>
                    </div>
                    {/* Net Siding (final result) */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-600 text-base">
                      <span className="font-bold text-white">Net Siding Area</span>
                      <span className="font-mono font-bold text-green-400">{markupOverlaySummary.netSidingSf.toLocaleString()} SF</span>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="px-4 py-2 border-t border-gray-700 text-xs text-gray-500">
                    Formula: Building − Roof − Openings = Net Siding
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <DetectionSidebar
              pages={pages}
              currentPageId={currentPageId}
              onPageSelect={setCurrentPageId}
              detections={currentPageDetections}
              selectedIds={selectedIds}
              onDetectionSelect={handleSelect}
              onDetectionHover={handleHover}
              elevationCalcs={currentElevationCalcs}
              jobTotals={jobTotals}
              showDeleted={showDeleted}
              onShowDeletedChange={setShowDeleted}
              jobId={jobId}
            />
          </div>
        </>
      )}
    </div>
  );
}
