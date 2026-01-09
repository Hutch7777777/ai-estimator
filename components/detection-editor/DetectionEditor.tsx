'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Loader2, AlertCircle, RefreshCw, Eye, EyeOff, X, Layers, Home } from 'lucide-react';
import { toast } from 'sonner';
import {
  useExtractionData,
  useDetectionSync,
  validateDetections,
  createOptimisticMove,
  createOptimisticMoveAndResize,
  createOptimisticDelete,
  createOptimisticVerify,
  createOptimisticReclassify,
} from '@/lib/hooks';
import { calculateRealWorldMeasurements } from '@/lib/utils/coordinates';
import type {
  ViewTransform,
  ToolMode,
  DetectionClass,
  DetectionStatus,
  AllDetectionClasses,
  ExtractionDetection,
  PolygonPoint,
  MarkupType,
} from '@/lib/types/extraction';
import DetectionToolbar from './DetectionToolbar';
import MarkupToolbar from './MarkupToolbar';
import KonvaDetectionCanvas, { type CalibrationData } from './KonvaDetectionCanvas';
import type { PolygonUpdatePayload } from './KonvaDetectionPolygon';
import DetectionSidebar from './DetectionSidebar';
import CalibrationModal from './CalibrationModal';

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
// Note: Uses AllDetectionClasses to include internal classes for keyboard shortcuts
const CLASS_SHORTCUTS: AllDetectionClasses[] = [
  'window',
  'door',
  'garage',
  'siding',
  'roof',
  'gable',
  'building', // Internal class - still accessible via shortcut for power users
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
    markAsRecentlyEdited,
    // Local-first editing
    hasUnsavedChanges,
    canUndo,
    canRedo,
    undo,
    redo,
    resetToSaved,
    clearUnsavedChanges,
    restoreDrafts,
    getAllDetections,
  } = useExtractionData(jobId, { includeDeleted: true });

  // Note: In local-first mode, we only use useDetectionSync for legacy/fallback purposes
  // All edits now stay local until explicit validation
  const {
    isSyncing,
    pendingEdits,
    lastError: syncError,
    clearError,
  } = useDetectionSync({
    jobId,
    pageId: currentPageId || '',
    scaleRatio: currentPage?.scale_ratio || 64,
    dpi: currentPage?.dpi || 100,
    onError: (err) => onError?.(err),
  });

  // Validation state
  const [isValidating, setIsValidating] = useState(false);

  // Draft recovery modal state
  const [showDraftRecovery, setShowDraftRecovery] = useState(false);
  const [draftTimestamp, setDraftTimestamp] = useState<number | null>(null);
  const draftCheckDoneRef = useRef(false);

  // ============================================================================
  // Local UI State
  // ============================================================================

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [createClass, setCreateClass] = useState<DetectionClass>('window');
  const [transform, setTransform] = useState<ViewTransform>(DEFAULT_TRANSFORM);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showArea, setShowArea] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isGeneratingMarkup, setIsGeneratingMarkup] = useState(false);

  // Canvas container size tracking for Konva
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasContainerSize, setCanvasContainerSize] = useState({ width: 800, height: 600 });

  // Markup display state (PNG image view)
  const [markupUrl, setMarkupUrl] = useState<string | null>(null);
  const [showMarkup, setShowMarkup] = useState(false);

  // Canvas-based markup overlay state
  const [showMarkupOverlay, setShowMarkupOverlay] = useState(false);

  // Siding polygon overlay state
  const [showSidingOverlay, setShowSidingOverlay] = useState(false);

  // Calibration state (for scale calibration modal)
  const [calibrationData, setCalibrationData] = useState<CalibrationData | null>(null);
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);

  // Handle calibration complete - receives data from canvas and opens modal
  const handleCalibrationComplete = useCallback((data: CalibrationData) => {
    setCalibrationData(data);
    setShowCalibrationModal(true);
    // Switch back to select mode after calibration
    setToolMode('select');
  }, []);

  // Handle scale application from calibration modal
  const handleApplyScale = useCallback(
    async (pixelsPerFoot: number) => {
      console.log('[DetectionEditor] handleApplyScale called:', {
        pixelsPerFoot,
        currentPageId,
      });

      if (!currentPageId) {
        console.error('[DetectionEditor] No current page ID');
        toast.error('No page selected');
        return;
      }

      try {
        // Use direct fetch to bypass Supabase client type issues
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) {
          throw new Error('Missing Supabase environment variables');
        }

        console.log('[DetectionEditor] Saving scale via direct fetch:', {
          pageId: currentPageId,
          pixelsPerFoot,
        });

        const response = await fetch(
          `${url}/rest/v1/extraction_pages?id=eq.${currentPageId}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': key,
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({ scale_ratio: pixelsPerFoot }),
          }
        );

        console.log('[DetectionEditor] Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[DetectionEditor] Failed to save scale:', errorText);
          toast.error('Failed to save scale', {
            description: `HTTP ${response.status}: ${errorText}`,
          });
          return;
        }

        const data = await response.json();
        console.log('[DetectionEditor] Scale saved successfully:', data);

        toast.success('Scale calibrated successfully', {
          description: `New scale: ${pixelsPerFoot.toFixed(1)} px/ft`,
        });

        // Refresh data to get updated scale
        await refresh();
      } catch (err) {
        console.error('[DetectionEditor] Error saving scale:', err);
        toast.error('Failed to save scale', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setShowCalibrationModal(false);
        setCalibrationData(null);
      }
    },
    [currentPageId, refresh]
  );

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
    setSelectedDetectionId(null);
    setHoveredId(null);
    // Clear markup when changing pages since markup is page-specific
    setMarkupUrl(null);
    setShowMarkup(false);
  }, [currentPageId]);

  // ============================================================================
  // Canvas Container Size Tracking
  // ============================================================================

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) {
      console.log('[DetectionEditor] Canvas container ref is null');
      return;
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      console.log('[DetectionEditor] Canvas container size update:', {
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        boundingRect: { width: rect.width, height: rect.height },
      });

      // Use bounding rect dimensions, fallback to client dimensions, then window
      const width = rect.width || container.clientWidth || window.innerWidth - 400;
      const height = rect.height || container.clientHeight || window.innerHeight - 200;

      if (width > 0 && height > 0) {
        setCanvasContainerSize({ width, height });
      }
    };

    // Initial size
    updateSize();

    // Also try after a short delay (in case layout hasn't settled)
    const timeoutId = setTimeout(updateSize, 100);
    // And another slightly later for slow renders
    const timeoutId2 = setTimeout(updateSize, 500);

    // Observe resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        console.log('[DetectionEditor] ResizeObserver fired:', { width, height });
        if (width > 0 && height > 0) {
          setCanvasContainerSize({ width, height });
        }
      }
    });
    resizeObserver.observe(container);

    // Also listen to window resize as fallback
    const handleWindowResize = () => {
      updateSize();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [currentPage]); // Re-run when currentPage changes to re-measure after data loads

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

  // Handler for canvas selection changes (wrapper for KonvaDetectionCanvas)
  const handleCanvasSelect = useCallback(
    (id: string | null, addToSelection: boolean = false) => {
      if (id === null) {
        // Clear selection when clicking empty canvas
        setSelectedIds(new Set());
        setSelectedDetectionId(null);
      } else {
        // Use existing handleSelect logic for single/multi-select
        handleSelect(id, addToSelection);
        // Also update legacy selectedDetectionId for compatibility
        setSelectedDetectionId(id);
      }
    },
    [handleSelect]
  );

  const handleHover = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  // ============================================================================
  // Detection Edit Handlers (Konva-compatible)
  // ============================================================================

  // Handle detection move - receives detection object and new center coordinates
  // Local-first: Only updates local state, no sync to server
  const handleDetectionMove = useCallback(
    (detection: ExtractionDetection, newCoords: { pixel_x: number; pixel_y: number }) => {
      // Apply optimistic update with the absolute new position
      const optimistic = createOptimisticMove(detection, newCoords.pixel_x, newCoords.pixel_y);

      // Update local state only - no server sync in local-first mode
      updateDetectionLocally(optimistic);
    },
    [updateDetectionLocally]
  );

  // Handle detection resize - receives detection object and new bounds (center coordinates)
  // Local-first: Only updates local state, no sync to server
  const handleDetectionResize = useCallback(
    (
      detection: ExtractionDetection,
      newCoords: { pixel_x: number; pixel_y: number; pixel_width: number; pixel_height: number }
    ) => {
      // CRITICAL: Derive scale_ratio from the detection's existing measurements
      // This ensures we use the same scale that was used to create the original measurements
      // Formula: scale_ratio = pixel_width / real_width_ft
      let scaleRatio: number;

      if (detection.real_width_ft && detection.real_width_ft > 0 && detection.pixel_width > 0) {
        // Derive from existing detection measurements (most accurate)
        scaleRatio = detection.pixel_width / detection.real_width_ft;
      } else if (currentPage?.scale_ratio) {
        // Fallback to page scale_ratio
        scaleRatio = currentPage.scale_ratio;
      } else {
        // Last resort default
        scaleRatio = 64;
      }

      // Calculate new real-world measurements using the derived scale_ratio
      const measurements = calculateRealWorldMeasurements(
        newCoords.pixel_width,
        newCoords.pixel_height,
        scaleRatio
      );

      // Create optimistic update with measurements
      const optimistic: ExtractionDetection = {
        ...detection,
        pixel_x: newCoords.pixel_x,
        pixel_y: newCoords.pixel_y,
        pixel_width: newCoords.pixel_width,
        pixel_height: newCoords.pixel_height,
        real_width_ft: measurements.real_width_ft,
        real_height_ft: measurements.real_height_ft,
        real_width_in: measurements.real_width_in,
        real_height_in: measurements.real_height_in,
        area_sf: measurements.area_sf,
        perimeter_lf: measurements.perimeter_lf,
        status: 'edited',
        edited_at: new Date().toISOString(),
        original_bbox: detection.original_bbox || {
          pixel_x: detection.pixel_x,
          pixel_y: detection.pixel_y,
          pixel_width: detection.pixel_width,
          pixel_height: detection.pixel_height,
        },
      };

      // Update local state only - no server sync in local-first mode
      updateDetectionLocally(optimistic);
    },
    [currentPage?.scale_ratio, updateDetectionLocally]
  );

  // Handle polygon update - receives detection and complete update payload from polygon corner drag
  // Local-first: Only updates local state, no sync to server
  const handleDetectionPolygonUpdate = useCallback(
    (detection: ExtractionDetection, updates: PolygonUpdatePayload) => {
      // Create optimistic update with all polygon data
      const optimistic: ExtractionDetection = {
        ...detection,
        polygon_points: updates.polygon_points,
        pixel_x: updates.pixel_x,
        pixel_y: updates.pixel_y,
        pixel_width: updates.pixel_width,
        pixel_height: updates.pixel_height,
        area_sf: updates.area_sf,
        perimeter_lf: updates.perimeter_lf,
        real_width_ft: updates.real_width_ft,
        real_height_ft: updates.real_height_ft,
        status: 'edited',
        edited_at: new Date().toISOString(),
        original_bbox: detection.original_bbox || {
          pixel_x: detection.pixel_x,
          pixel_y: detection.pixel_y,
          pixel_width: detection.pixel_width,
          pixel_height: detection.pixel_height,
        },
      };

      // Update local state only - no server sync in local-first mode
      updateDetectionLocally(optimistic);
    },
    [updateDetectionLocally]
  );

  // Handle detection creation - receives bounds (center coordinates) with class
  // Local-first: Only updates local state, no sync to server
  const handleDetectionCreate = useCallback(
    (newCoords: {
      pixel_x: number;
      pixel_y: number;
      pixel_width: number;
      pixel_height: number;
      class: DetectionClass;
      polygon_points?: PolygonPoint[];
      area_sf?: number;
      perimeter_lf?: number;
      real_width_ft?: number;
      real_height_ft?: number;
      markup_type?: MarkupType;
    }) => {
      // Use pre-calculated measurements if provided (polygon), otherwise calculate from bounding box
      const measurements = newCoords.area_sf !== undefined
        ? {
            area_sf: newCoords.area_sf,
            perimeter_lf: newCoords.perimeter_lf!,
            real_width_ft: newCoords.real_width_ft!,
            real_height_ft: newCoords.real_height_ft!,
            real_width_in: newCoords.real_width_ft! * 12,
            real_height_in: newCoords.real_height_ft! * 12,
          }
        : calculateRealWorldMeasurements(
            newCoords.pixel_width,
            newCoords.pixel_height,
            currentPage?.scale_ratio || 64
          );

      // Generate valid UUID for new detection (required for PostgreSQL)
      const tempId = crypto.randomUUID();

      const newDetection: ExtractionDetection = {
        id: tempId,
        job_id: job?.id || '',
        page_id: currentPage?.id || '',
        class: newCoords.class,
        detection_index: currentPageDetections.length,
        confidence: 1.0,
        pixel_x: newCoords.pixel_x,
        pixel_y: newCoords.pixel_y,
        pixel_width: newCoords.pixel_width,
        pixel_height: newCoords.pixel_height,
        real_width_ft: measurements.real_width_ft,
        real_height_ft: measurements.real_height_ft,
        real_width_in: measurements.real_width_in,
        real_height_in: measurements.real_height_in,
        area_sf: measurements.area_sf,
        perimeter_lf: measurements.perimeter_lf,
        is_triangle: false,
        matched_tag: null,
        created_at: new Date().toISOString(),
        status: 'edited',
        edited_by: null,
        edited_at: new Date().toISOString(),
        original_bbox: null,
        polygon_points: newCoords.polygon_points || null,
        markup_type: newCoords.markup_type || 'polygon',
      };

      // Add to local state only - no server sync in local-first mode
      addDetectionLocally(newDetection);
      setSelectedDetectionId(tempId);
      setSelectedIds(new Set([tempId]));
      setToolMode('select');
    },
    [job?.id, currentPage?.id, currentPage?.scale_ratio, currentPageDetections.length, addDetectionLocally]
  );

  // Legacy handlers for backward compatibility with old canvas
  const handleMoveDetection = useCallback(
    (id: string, newX: number, newY: number) => {
      const detection = currentPageDetections.find((d) => d.id === id);
      if (!detection) return;
      handleDetectionMove(detection, { pixel_x: newX, pixel_y: newY });
    },
    [currentPageDetections, handleDetectionMove]
  );

  const handleResizeDetection = useCallback(
    (id: string, newBounds: { x: number; y: number; width: number; height: number }) => {
      const detection = currentPageDetections.find((d) => d.id === id);
      if (!detection) return;
      handleDetectionResize(detection, {
        pixel_x: newBounds.x,
        pixel_y: newBounds.y,
        pixel_width: newBounds.width,
        pixel_height: newBounds.height,
      });
    },
    [currentPageDetections, handleDetectionResize]
  );

  const handleCreateDetectionLegacy = useCallback(
    (
      bounds: { x: number; y: number; width: number; height: number },
      detectionClass: DetectionClass
    ) => {
      handleDetectionCreate({
        pixel_x: bounds.x,
        pixel_y: bounds.y,
        pixel_width: bounds.width,
        pixel_height: bounds.height,
        class: detectionClass,
      });
    },
    [handleDetectionCreate]
  );

  // Local-first: Only updates local state, no sync to server
  const handleVerifyDetection = useCallback(
    (id: string) => {
      const detection = currentPageDetections.find((d) => d.id === id);
      if (!detection) return;

      // Apply local update only - no server sync in local-first mode
      const optimistic = createOptimisticVerify(detection);
      updateDetectionLocally(optimistic);
    },
    [currentPageDetections, updateDetectionLocally]
  );

  const handleVerifySelected = useCallback(() => {
    selectedIds.forEach((id) => {
      handleVerifyDetection(id);
    });
  }, [selectedIds, handleVerifyDetection]);

  // Local-first: Only updates local state, no sync to server
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    selectedIds.forEach((id) => {
      const detection = currentPageDetections.find((d) => d.id === id);
      if (!detection) return;

      // Apply local update only - no server sync in local-first mode
      const optimistic = createOptimisticDelete(detection);
      updateDetectionLocally(optimistic);
    });

    // Clear selection after delete
    setSelectedIds(new Set());
  }, [selectedIds, currentPageDetections, updateDetectionLocally]);

  // Handle class change from PropertiesPanel
  // Local-first: Only updates local state, no sync to server
  const handleClassChange = useCallback(
    (detectionIds: string[], newClass: DetectionClass) => {
      if (detectionIds.length === 0) return;

      detectionIds.forEach((id) => {
        const detection = currentPageDetections.find((d) => d.id === id);
        if (!detection) return;

        // Apply optimistic update with new class
        const optimistic = createOptimisticReclassify(detection, newClass);
        updateDetectionLocally(optimistic);
      });

      console.log(
        `[DetectionEditor] Changed class to '${newClass}' for ${detectionIds.length} detection(s)`
      );
    },
    [currentPageDetections, updateDetectionLocally]
  );

  // Handle status change from Properties panel (verify, delete, reset)
  const handleStatusChange = useCallback(
    (detectionIds: string[], newStatus: DetectionStatus) => {
      if (detectionIds.length === 0) return;

      detectionIds.forEach((id) => {
        const detection = currentPageDetections.find((d) => d.id === id);
        if (!detection) return;

        // Update detection with new status
        updateDetectionLocally({
          ...detection,
          status: newStatus,
          edited_at: new Date().toISOString(),
        });
      });

      // Clear selection after delete
      if (newStatus === 'deleted') {
        setSelectedIds(new Set());
      }

      console.log(
        `[DetectionEditor] Changed status to '${newStatus}' for ${detectionIds.length} detection(s)`
      );
    },
    [currentPageDetections, updateDetectionLocally]
  );

  // Handle material assignment from Properties panel
  // Local-first: Only updates local state, no sync to server
  const handleMaterialAssign = useCallback(
    (detectionIds: string[], materialId: string | null) => {
      if (detectionIds.length === 0) return;

      detectionIds.forEach((id) => {
        const detection = currentPageDetections.find((d) => d.id === id);
        if (detection) {
          updateDetectionLocally({
            ...detection,
            assigned_material_id: materialId,
            edited_at: new Date().toISOString(),
          });
        }
      });

      console.log(
        `[DetectionEditor] Assigned material '${materialId}' to ${detectionIds.length} detection(s)`
      );
    },
    [currentPageDetections, updateDetectionLocally]
  );

  // Handle notes change from Properties panel
  // Local-first: Only updates local state, no sync to server
  const handleNotesChange = useCallback(
    (detectionIds: string[], notes: string) => {
      if (detectionIds.length === 0) return;

      detectionIds.forEach((id) => {
        const detection = currentPageDetections.find((d) => d.id === id);
        if (detection) {
          updateDetectionLocally({
            ...detection,
            notes,
            edited_at: new Date().toISOString(),
          });
        }
      });

      console.log(
        `[DetectionEditor] Updated notes for ${detectionIds.length} detection(s)`
      );
    },
    [currentPageDetections, updateDetectionLocally]
  );

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
  // Local-First Editing Handlers
  // ============================================================================

  // Handle validation - saves all local changes to database
  const handleValidate = useCallback(async () => {
    if (!jobId || !hasUnsavedChanges) return;

    setIsValidating(true);

    try {
      const allDetections = getAllDetections();
      console.log('[DetectionEditor] Validating', allDetections.length, 'detections');

      const result = await validateDetections(jobId, allDetections);

      if (result.success) {
        // Clear undo/redo stacks and localStorage
        clearUnsavedChanges();
        toast.success('Changes saved successfully', {
          description: `Updated ${result.updated_count || 0} detections`,
        });
      } else {
        toast.error('Validation failed', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (err) {
      console.error('[DetectionEditor] Validation error:', err);
      toast.error('Validation failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      if (isMountedRef.current) {
        setIsValidating(false);
      }
    }
  }, [jobId, hasUnsavedChanges, getAllDetections, clearUnsavedChanges]);

  // Handle reset - discard all local changes
  const handleReset = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    await resetToSaved();
    toast.info('Changes discarded', {
      description: 'Reset to last saved state',
    });
  }, [hasUnsavedChanges, resetToSaved]);

  // Handle draft recovery - restore from localStorage
  const handleRestoreDrafts = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const draftKey = `detection-drafts-${jobId}`;
      const draftData = localStorage.getItem(draftKey);

      if (draftData) {
        const parsed = JSON.parse(draftData);
        const detectionsArray: [string, ExtractionDetection[]][] = parsed.detections;
        const restoredMap = new Map<string, ExtractionDetection[]>(detectionsArray);

        restoreDrafts(restoredMap);
        toast.success('Drafts restored', {
          description: 'Your unsaved changes have been recovered',
        });
      }
    } catch (err) {
      console.error('[DetectionEditor] Failed to restore drafts:', err);
      toast.error('Failed to restore drafts');
    }

    setShowDraftRecovery(false);
  }, [jobId, restoreDrafts]);

  // Handle discard drafts
  const handleDiscardDrafts = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`detection-drafts-${jobId}`);
    }
    setShowDraftRecovery(false);
    toast.info('Drafts discarded');
  }, [jobId]);

  // ============================================================================
  // Draft Recovery Check (on mount)
  // ============================================================================

  useEffect(() => {
    if (draftCheckDoneRef.current || typeof window === 'undefined' || loading) return;

    const draftKey = `detection-drafts-${jobId}`;
    const draftData = localStorage.getItem(draftKey);

    if (draftData) {
      try {
        const parsed = JSON.parse(draftData);
        const age = Date.now() - parsed.timestamp;
        const maxAge = 60 * 60 * 1000; // 60 minutes

        if (age < maxAge) {
          setDraftTimestamp(parsed.timestamp);
          setShowDraftRecovery(true);
        } else {
          // Draft is too old, clear it
          localStorage.removeItem(draftKey);
        }
      } catch {
        localStorage.removeItem(draftKey);
      }
    }

    draftCheckDoneRef.current = true;
  }, [jobId, loading]);

  // ============================================================================
  // Beforeunload Warning
  // ============================================================================

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

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
      const isMeta = e.metaKey || e.ctrlKey;

      // Undo/Redo/Save shortcuts (Ctrl/Cmd + key)
      if (isMeta) {
        // Ctrl/Cmd + Z = Undo (or Ctrl/Cmd + Shift + Z = Redo)
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            // Redo
            if (canRedo) redo();
          } else {
            // Undo
            if (canUndo) undo();
          }
          return;
        }

        // Ctrl/Cmd + S = Validate & Save
        if (key === 's') {
          e.preventDefault();
          if (hasUnsavedChanges && !isValidating) {
            handleValidate();
          }
          return;
        }
      }

      // Tool mode shortcuts (without Ctrl/Cmd)
      if (!isMeta && key === 's') {
        e.preventDefault();
        setToolMode('select');
        return;
      }
      if (key === 'd') {
        e.preventDefault();
        setToolMode('create');
        return;
      }
      if (key === 'l') {
        e.preventDefault();
        setToolMode('line');
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
      if (num >= 1 && num <= CLASS_SHORTCUTS.length) {
        e.preventDefault();
        const cls = CLASS_SHORTCUTS[num - 1];
        // Only allow setting user-selectable classes (not internal ones like 'building')
        if (cls !== 'building' && cls !== 'exterior_wall') {
          setCreateClass(cls as DetectionClass);
        }
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
  }, [selectedIds, canUndo, canRedo, undo, redo, hasUnsavedChanges, isValidating, handleValidate, handleVerifySelected, handleDeleteSelected, handleZoomIn, handleZoomOut, handleZoomReset]);

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
      // Cast to AllDetectionClasses to handle legacy 'building'/'exterior_wall' values from DB
      const cls = detection.class as AllDetectionClasses;

      if (cls === 'building' || cls === 'exterior_wall' || cls === 'siding') {
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

  // Compute selected detections from both selection systems (Set-based and single-ID)
  const selectedDetections = useMemo(() => {
    const ids = selectedIds.size > 0
      ? Array.from(selectedIds)
      : selectedDetectionId
        ? [selectedDetectionId]
        : [];
    return currentPageDetections.filter((d) => ids.includes(d.id));
  }, [selectedIds, selectedDetectionId, currentPageDetections]);

  // Debug: Log when visibleDetections changes
  useEffect(() => {
    if (visibleDetections.length > 0) {
      const sample = visibleDetections[0];
      console.log('[DetectionEditor] visibleDetections UPDATED - sample:', {
        id: sample.id,
        class: sample.class,
        pixel_width: sample.pixel_width,
        pixel_height: sample.pixel_height,
        total_count: visibleDetections.length,
      });
    }
  }, [visibleDetections]);

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
            // Local-first editing props
            hasUnsavedChanges={hasUnsavedChanges}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onValidate={handleValidate}
            onReset={handleReset}
            isValidating={isValidating}
          />

          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left Markup Toolbar */}
            <MarkupToolbar
              activeMode={toolMode}
              onModeChange={setToolMode}
              disabled={loading || isValidating}
            />

            {/* Canvas Area - flex-1 with min-h-0 allows proper flex shrinking */}
            <div ref={canvasContainerRef} className="flex-1 relative min-h-0">
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
              ) : currentPage ? (
                <div className="absolute inset-0">
                  <KonvaDetectionCanvas
                    page={currentPage}
                    detections={visibleDetections}
                    selectedDetectionId={selectedDetectionId}
                    selectedIds={selectedIds}
                    toolMode={toolMode}
                    activeClass={createClass}
                    onSelectionChange={handleCanvasSelect}
                    onDetectionMove={handleDetectionMove}
                    onDetectionResize={handleDetectionResize}
                    onDetectionCreate={handleDetectionCreate}
                    onDetectionPolygonUpdate={handleDetectionPolygonUpdate}
                    onCalibrationComplete={handleCalibrationComplete}
                    containerWidth={canvasContainerSize.width}
                    containerHeight={canvasContainerSize.height}
                  />
                </div>
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

            {/* Sidebar - pages, detection list, and selection properties */}
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
              selectedDetections={selectedDetections}
              onClassChange={handleClassChange}
              onStatusChange={handleStatusChange}
              onMaterialAssign={handleMaterialAssign}
              onNotesChange={handleNotesChange}
              pixelsPerFoot={currentPage?.scale_ratio || 64}
            />
          </div>
        </>
      )}

      {/* Draft Recovery Modal */}
      {showDraftRecovery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Unsaved Changes Found
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You have unsaved detection edits from{' '}
              {draftTimestamp
                ? new Date(draftTimestamp).toLocaleString()
                : 'a previous session'}
              . Would you like to restore them?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleDiscardDrafts}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleRestoreDrafts}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calibration Modal */}
      <CalibrationModal
        isOpen={showCalibrationModal}
        onClose={() => {
          setShowCalibrationModal(false);
          setCalibrationData(null);
        }}
        pixelDistance={calibrationData?.pixelDistance || 0}
        currentScaleRatio={currentPage?.scale_ratio || null}
        onApplyScale={handleApplyScale}
      />
    </div>
  );
}
