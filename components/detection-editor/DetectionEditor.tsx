'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, RefreshCw, Eye, EyeOff, X, Layers, CheckCircle, DollarSign, FileText, Download, ExternalLink } from 'lucide-react';
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
import {
  getClassDerivedMeasurements,
  rectToPolygonPoints,
  calculateBuildingMeasurements,
  calculateLineMeasurements,
  calculateAreaMeasurements,
} from '@/lib/utils/polygonUtils';
import type {
  ViewTransform,
  ToolMode,
  DetectionClass,
  DetectionStatus,
  AllDetectionClasses,
  ExtractionDetection,
  PolygonPoint,
  MarkupType,
  LiveDerivedTotals,
  ApprovePayload,
  ApprovalResult,
} from '@/lib/types/extraction';
import DetectionToolbar from './DetectionToolbar';
import MarkupToolbar from './MarkupToolbar';
import KonvaDetectionCanvas, { type CalibrationData } from './KonvaDetectionCanvas';
import type { PolygonUpdatePayload } from './KonvaDetectionPolygon';
import DetectionSidebar from './DetectionSidebar';
import CalibrationModal from './CalibrationModal';
import { exportTakeoffToExcel, type TakeoffData } from '@/lib/utils/exportTakeoffExcel';

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
  const router = useRouter();

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
    elevationCalcs,
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
  const [createClass, setCreateClass] = useState<DetectionClass>('siding');
  const [lineClass, setLineClass] = useState<DetectionClass>('eave');
  const [pointClass, setPointClass] = useState<DetectionClass>('vent');
  const [transform, setTransform] = useState<ViewTransform>(DEFAULT_TRANSFORM);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showArea, setShowArea] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isGeneratingMarkup, setIsGeneratingMarkup] = useState(false);
  const [approvalResult, setApprovalResult] = useState<ApprovalResult | null>(null);
  const [showApprovalResults, setShowApprovalResults] = useState(false);
  const [takeoffDetails, setTakeoffDetails] = useState<TakeoffData | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Debug: Log render state for approval modal
  console.log('[DetectionEditor Render]', {
    showApprovalResults,
    hasApprovalResult: !!approvalResult,
    approvalResultTakeoffId: approvalResult?.takeoff_id,
    hasTakeoffDetails: !!takeoffDetails,
    takeoffDetailsLineItems: takeoffDetails?.line_items?.length,
    isLoadingDetails,
  });

  // Canvas container size tracking for Konva
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasContainerSize, setCanvasContainerSize] = useState({ width: 800, height: 600 });

  // Markup display state (PNG image view)
  const [markupUrl, setMarkupUrl] = useState<string | null>(null);
  const [showMarkup, setShowMarkup] = useState(false);

  // Show original/unmarked plans (hides all detections)
  const [showOriginalOnly, setShowOriginalOnly] = useState(false);

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
      // For point detections (count markers), use zero measurements
      // Points don't have area or perimeter - they're just counted
      const isPointDetection = newCoords.markup_type === 'point';

      // Use pre-calculated measurements if provided (polygon), otherwise calculate from bounding box
      const measurements = isPointDetection
        ? {
            area_sf: 0,
            perimeter_lf: 0,
            real_width_ft: 0,
            real_height_ft: 0,
            real_width_in: 0,
            real_height_in: 0,
          }
        : newCoords.area_sf !== undefined
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

      // For point/count mode, stay in point mode so user can keep placing markers
      // For polygon/line modes, switch back to select mode after creation
      if (newCoords.markup_type !== 'point') {
        setToolMode('select');
      }
      // Point mode: stay in point mode, user can press Escape to exit
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
        setToolMode('point');
        return;
      }
      if (key === 'h') {
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

      // Escape key: exit point/line mode, or clear selection
      if (key === 'escape') {
        e.preventDefault();
        // If in point or line mode, exit to select mode
        if (toolMode === 'point' || toolMode === 'line') {
          setToolMode('select');
          return;
        }
        // Otherwise, clear selection
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
  }, [selectedIds, canUndo, canRedo, undo, redo, hasUnsavedChanges, isValidating, handleValidate, handleVerifySelected, handleDeleteSelected, handleZoomIn, handleZoomOut, handleZoomReset, toolMode]);

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

  // Toggle original/unmarked view (hides all detections)
  const handleToggleOriginalOnly = useCallback(() => {
    setShowOriginalOnly((prev) => !prev);
  }, []);

  // ============================================================================
  // Filtered Detections for Canvas
  // ============================================================================

  const visibleDetections = useMemo(() => {
    // Hide all detections when showing original/unmarked view
    if (showOriginalOnly) {
      return [];
    }
    // Filter out roof detections - they belong on roof plans, not elevations
    if (showDeleted) {
      return currentPageDetections.filter((d) => d.class !== 'roof');
    }
    return currentPageDetections.filter((d) => d.status !== 'deleted' && d.class !== 'roof');
  }, [currentPageDetections, showDeleted, showOriginalOnly]);

  // Compute selected detections from both selection systems (Set-based and single-ID)
  const selectedDetections = useMemo(() => {
    const ids = selectedIds.size > 0
      ? Array.from(selectedIds)
      : selectedDetectionId
        ? [selectedDetectionId]
        : [];
    return currentPageDetections.filter((d) => ids.includes(d.id));
  }, [selectedIds, selectedDetectionId, currentPageDetections]);

  // ============================================================================
  // Live Derived Totals (for Approve & Calculate)
  // ============================================================================

  // Calculate live derived measurements from current page detections (HOVER-style)
  const liveDerivedTotals = useMemo((): LiveDerivedTotals | null => {
    if (!currentPage?.scale_ratio || currentPage.scale_ratio <= 0) {
      return null;
    }

    const scaleRatio = currentPage.scale_ratio;
    // Filter out roof detections - they belong on roof plans, not elevations
    const pageDetections = currentPageDetections.filter(
      (d) => d.status !== 'deleted' && d.class !== 'roof'
    );

    const totals: LiveDerivedTotals = {
      // FACADE (building/exterior wall)
      buildingCount: 0,
      buildingAreaSf: 0,
      buildingPerimeterLf: 0,
      buildingLevelStarterLf: 0,
      // WINDOWS
      windowCount: 0,
      windowAreaSf: 0,
      windowPerimeterLf: 0,
      windowHeadLf: 0,
      windowJambLf: 0,
      windowSillLf: 0,
      // DOORS
      doorCount: 0,
      doorAreaSf: 0,
      doorPerimeterLf: 0,
      doorHeadLf: 0,
      doorJambLf: 0,
      // GARAGES
      garageCount: 0,
      garageAreaSf: 0,
      garagePerimeterLf: 0,
      garageHeadLf: 0,
      garageJambLf: 0,
      // GABLES
      gableCount: 0,
      gableAreaSf: 0,
      gableRakeLf: 0,
      // CORNERS
      insideCornerCount: 0,
      insideCornerLf: 0,
      outsideCornerCount: 0,
      outsideCornerLf: 0,
      // ROOFLINE (line-type measurements)
      eavesCount: 0,
      eavesLf: 0,
      rakesCount: 0,
      rakesLf: 0,
      ridgeCount: 0,
      ridgeLf: 0,
      valleyCount: 0,
      valleyLf: 0,
      // SOFFIT (area)
      soffitCount: 0,
      soffitAreaSf: 0,
      // FASCIA (line)
      fasciaCount: 0,
      fasciaLf: 0,
      // GUTTERS
      gutterCount: 0,
      gutterLf: 0,
      downspoutCount: 0,
      // SIDING (net area = building - openings)
      sidingNetSf: 0,
    };

    // Track total openings for net siding calculation
    let totalOpeningsSf = 0;

    // Collect exterior wall polygons for auto-calculating corners
    const exteriorWallPolygons: { points: PolygonPoint[], minX: number, maxX: number }[] = [];

    for (const detection of pageDetections) {
      const cls = detection.class as string;

      // Get polygon points (use existing or convert from bounding box)
      const points = detection.polygon_points && detection.polygon_points.length > 0
        ? detection.polygon_points
        : rectToPolygonPoints({
            pixel_x: detection.pixel_x,
            pixel_y: detection.pixel_y,
            pixel_width: detection.pixel_width,
            pixel_height: detection.pixel_height,
          });

      // Building/Facade class (handle both underscore and space versions)
      if (cls === 'building' || cls === 'exterior_wall' || cls === 'exterior wall') {
        const buildingMeasurements = calculateBuildingMeasurements(points, scaleRatio);
        totals.buildingCount++;
        totals.buildingAreaSf += buildingMeasurements.area_sf;
        totals.buildingPerimeterLf += buildingMeasurements.perimeter_lf;
        totals.buildingLevelStarterLf += buildingMeasurements.level_starter_lf;

        // Collect for corner calculation
        const xs = points.map(p => p.x);
        exteriorWallPolygons.push({
          points,
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
        });
        continue;
      }

      // Window/Door/Garage/Gable derived measurements
      const derived = getClassDerivedMeasurements(cls, points, scaleRatio);
      const areaMeasurement = calculateAreaMeasurements(points, scaleRatio);

      if (cls === 'window' && derived && 'head_lf' in derived) {
        totals.windowCount++;
        totals.windowAreaSf += areaMeasurement.area_sf;
        totals.windowPerimeterLf += areaMeasurement.perimeter_lf;
        totals.windowHeadLf += derived.head_lf;
        totals.windowJambLf += derived.jamb_lf;
        totals.windowSillLf += (derived as { sill_lf?: number }).sill_lf || 0;
        totalOpeningsSf += areaMeasurement.area_sf;
      } else if (cls === 'door' && derived && 'head_lf' in derived) {
        totals.doorCount++;
        totals.doorAreaSf += areaMeasurement.area_sf;
        totals.doorPerimeterLf += areaMeasurement.perimeter_lf;
        totals.doorHeadLf += derived.head_lf;
        totals.doorJambLf += derived.jamb_lf;
        totalOpeningsSf += areaMeasurement.area_sf;
      } else if (cls === 'garage' && derived && 'head_lf' in derived) {
        totals.garageCount++;
        totals.garageAreaSf += areaMeasurement.area_sf;
        totals.garagePerimeterLf += areaMeasurement.perimeter_lf;
        totals.garageHeadLf += derived.head_lf;
        totals.garageJambLf += derived.jamb_lf;
        totalOpeningsSf += areaMeasurement.area_sf;
      } else if (cls === 'gable' && derived && 'rake_lf' in derived) {
        totals.gableCount++;
        totals.gableAreaSf += areaMeasurement.area_sf;
        totals.gableRakeLf += derived.rake_lf;
      } else if (cls === 'soffit') {
        totals.soffitCount++;
        totals.soffitAreaSf += areaMeasurement.area_sf;
      } else if (cls === 'inside_corner' || cls === 'inside corner') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.insideCornerCount++;
        totals.insideCornerLf += lineMeasurement.length_lf;
      } else if (cls === 'outside_corner' || cls === 'outside corner') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.outsideCornerCount++;
        totals.outsideCornerLf += lineMeasurement.length_lf;
      } else if (cls === 'fascia') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.fasciaCount++;
        totals.fasciaLf += lineMeasurement.length_lf;
      } else if (cls === 'gutter') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.gutterCount++;
        totals.gutterLf += lineMeasurement.length_lf;
      } else if (cls === 'downspout') {
        totals.downspoutCount++;
      }

      // Line-type detections (roof elements)
      if (cls === 'eave' || cls === 'roof_eave') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.eavesCount++;
        totals.eavesLf += lineMeasurement.length_lf;
      } else if (cls === 'rake' || cls === 'roof_rake') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.rakesCount++;
        totals.rakesLf += lineMeasurement.length_lf;
      } else if (cls === 'ridge' || cls === 'roof_ridge') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.ridgeCount++;
        totals.ridgeLf += lineMeasurement.length_lf;
      } else if (cls === 'valley' || cls === 'roof_valley') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.valleyCount++;
        totals.valleyLf += lineMeasurement.length_lf;
      }
    }

    // Calculate net siding (building area minus openings)
    totals.sidingNetSf = Math.max(0, totals.buildingAreaSf - totalOpeningsSf);

    // Calculate corners from exterior wall polygons
    if (exteriorWallPolygons.length > 0 && scaleRatio > 0) {
      // Calculate center Y for each wall to group by row
      const wallsWithCenterY = exteriorWallPolygons.map((wall) => {
        const ys = wall.points.map(p => p.y);
        const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
        return { ...wall, centerY };
      });

      // Sort by centerY
      wallsWithCenterY.sort((a, b) => a.centerY - b.centerY);

      // Group walls into rows (walls within ~50 pixels of each other vertically are same row)
      const rowTolerance = 50;
      const rows: typeof wallsWithCenterY[] = [];
      let currentRow: typeof wallsWithCenterY = [];

      wallsWithCenterY.forEach((wall) => {
        if (currentRow.length === 0) {
          currentRow.push(wall);
        } else {
          const lastWallY = currentRow[currentRow.length - 1].centerY;
          if (Math.abs(wall.centerY - lastWallY) < rowTolerance) {
            currentRow.push(wall);
          } else {
            rows.push(currentRow);
            currentRow = [wall];
          }
        }
      });
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }

      // For each row, find leftmost and rightmost walls for outside corners
      rows.forEach((row) => {
        if (row.length === 0) return;

        const leftmostWall = row.reduce((prev, curr) =>
          curr.minX < prev.minX ? curr : prev
        );
        const rightmostWall = row.reduce((prev, curr) =>
          curr.maxX > prev.maxX ? curr : prev
        );

        // Get left edge of leftmost wall (outside corner)
        const leftPoints = [...leftmostWall.points].sort((a, b) => a.x - b.x).slice(0, 2);
        if (leftPoints.length === 2) {
          const leftEdgeHeightPixels = Math.abs(leftPoints[1].y - leftPoints[0].y);
          const leftEdgeHeightLf = leftEdgeHeightPixels / scaleRatio;
          totals.outsideCornerLf += leftEdgeHeightLf;
          totals.outsideCornerCount += 1;
        }

        // Get right edge of rightmost wall (outside corner)
        if (rightmostWall !== leftmostWall) {
          const rightPoints = [...rightmostWall.points].sort((a, b) => b.x - a.x).slice(0, 2);
          if (rightPoints.length === 2) {
            const rightEdgeHeightPixels = Math.abs(rightPoints[1].y - rightPoints[0].y);
            const rightEdgeHeightLf = rightEdgeHeightPixels / scaleRatio;
            totals.outsideCornerLf += rightEdgeHeightLf;
            totals.outsideCornerCount += 1;
          }
        } else {
          // Only one wall in this row - it has both left and right outside corners
          const rightPoints = [...leftmostWall.points].sort((a, b) => b.x - a.x).slice(0, 2);
          if (rightPoints.length === 2) {
            const rightEdgeHeightPixels = Math.abs(rightPoints[1].y - rightPoints[0].y);
            const rightEdgeHeightLf = rightEdgeHeightPixels / scaleRatio;
            totals.outsideCornerLf += rightEdgeHeightLf;
            totals.outsideCornerCount += 1;
          }
        }

        // Calculate inside corners - edges between walls in the same row (gaps)
        if (row.length > 1) {
          const sortedRow = [...row].sort((a, b) => a.minX - b.minX);
          for (let i = 0; i < sortedRow.length - 1; i++) {
            const leftWall = sortedRow[i];
            const rightWall = sortedRow[i + 1];
            const gapThreshold = 10;
            if (rightWall.minX > leftWall.maxX + gapThreshold) {
              // Left wall's right edge is an inside corner
              const leftWallRightPoints = [...leftWall.points].sort((a, b) => b.x - a.x).slice(0, 2);
              if (leftWallRightPoints.length === 2) {
                const edgeHeightPixels = Math.abs(leftWallRightPoints[1].y - leftWallRightPoints[0].y);
                const edgeHeightLf = edgeHeightPixels / scaleRatio;
                totals.insideCornerLf += edgeHeightLf;
                totals.insideCornerCount += 1;
              }

              // Right wall's left edge is an inside corner
              const rightWallLeftPoints = [...rightWall.points].sort((a, b) => a.x - b.x).slice(0, 2);
              if (rightWallLeftPoints.length === 2) {
                const edgeHeightPixels = Math.abs(rightWallLeftPoints[1].y - rightWallLeftPoints[0].y);
                const edgeHeightLf = edgeHeightPixels / scaleRatio;
                totals.insideCornerLf += edgeHeightLf;
                totals.insideCornerCount += 1;
              }
            }
          }
        }
      });
    }

    return totals;
  }, [currentPage, currentPageDetections]);

  // ============================================================================
  // Approval Handler - Build Payload & Call Webhook
  // ============================================================================

  // Helper function to build the ApprovePayload from liveDerivedTotals
  const buildApprovePayload = useCallback(
    (totals: LiveDerivedTotals): ApprovePayload => {
      // =========================================================================
      // DYNAMIC TRADE DETECTION
      // Determine which trades to include based on detection classes with assigned materials
      // Siding is always included (core business)
      // Other trades only if user has assigned materials to relevant detection classes
      // Roofing is EXCLUDED - feature disabled due to page_id bug
      // =========================================================================
      const trades = new Set<string>(['siding']);

      // Map detection classes to trades
      const CLASS_TO_TRADE: Record<string, string> = {
        // Siding-related classes
        siding: 'siding',
        door: 'siding',
        garage: 'siding',
        gable: 'siding',
        trim: 'siding',
        fascia: 'siding',
        eave: 'siding',
        rake: 'siding',
        soffit: 'siding',
        corbel: 'siding',
        belly_band: 'siding',
        corner_inside: 'siding',
        corner_outside: 'siding',
        shutter: 'siding',
        post: 'siding',
        column: 'siding',
        bracket: 'siding',
        // Windows trade
        window: 'windows',
        // Gutters trade
        gutter: 'gutters',
        // Roofing - DISABLED
        // roof: 'roofing',
        // ridge: 'roofing',
      };

      // Check all detections with assigned materials to determine additional trades
      const allDetections = getAllDetections();
      const detectionsWithMaterials = allDetections.filter(
        (d) => d.assigned_material_id && d.status !== 'deleted'
      );

      detectionsWithMaterials.forEach((detection) => {
        const trade = CLASS_TO_TRADE[detection.class];
        if (trade && trade !== 'siding') {
          // Only add supported trades (roofing excluded - feature disabled)
          if (['windows', 'gutters'].includes(trade)) {
            trades.add(trade);
          }
        }
      });

      const selectedTrades = Array.from(trades);

      // Log trade detection for debugging
      const materialsByClass = detectionsWithMaterials.reduce((acc, d) => {
        acc[d.class] = (acc[d.class] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log('[Approve] Trade detection:', {
        totalDetections: allDetections.length,
        detectionsWithMaterials: detectionsWithMaterials.length,
        materialsByClass,
        selectedTrades,
      });

      return {
        job_id: jobId,
        project_id: projectId,
        project_name: job?.project_name || 'Untitled Project',
        // client_name and address are fetched by n8n from the project record
        selected_trades: selectedTrades,

        facade: {
          gross_area_sf: totals.buildingAreaSf,
          net_siding_sf: totals.sidingNetSf,
          perimeter_lf: totals.buildingPerimeterLf,
          level_starter_lf: totals.buildingLevelStarterLf,
        },

        windows: {
          count: totals.windowCount,
          area_sf: totals.windowAreaSf,
          perimeter_lf: totals.windowPerimeterLf,
          head_lf: totals.windowHeadLf,
          jamb_lf: totals.windowJambLf,
          sill_lf: totals.windowSillLf,
        },

        doors: {
          count: totals.doorCount,
          area_sf: totals.doorAreaSf,
          perimeter_lf: totals.doorPerimeterLf,
          head_lf: totals.doorHeadLf,
          jamb_lf: totals.doorJambLf,
        },

        garages: {
          count: totals.garageCount,
          area_sf: totals.garageAreaSf,
          perimeter_lf: totals.garagePerimeterLf,
          head_lf: totals.garageHeadLf,
          jamb_lf: totals.garageJambLf,
        },

        trim: {
          total_head_lf:
            totals.windowHeadLf + totals.doorHeadLf + totals.garageHeadLf,
          total_jamb_lf:
            totals.windowJambLf + totals.doorJambLf + totals.garageJambLf,
          total_sill_lf: totals.windowSillLf,
          total_trim_lf:
            totals.windowHeadLf +
            totals.doorHeadLf +
            totals.garageHeadLf +
            totals.windowJambLf +
            totals.doorJambLf +
            totals.garageJambLf +
            totals.windowSillLf,
        },

        corners: {
          outside_count: totals.outsideCornerCount,
          outside_lf: totals.outsideCornerLf,
          inside_count: totals.insideCornerCount,
          inside_lf: totals.insideCornerLf,
        },

        gables: {
          count: totals.gableCount,
          area_sf: totals.gableAreaSf,
          rake_lf: totals.gableRakeLf,
        },

        // Minimal product config - n8n uses auto-scope rules and DB defaults
        products: {
          color: null,
          profile: 'cedarmill',
        },
      };
    },
    [jobId, projectId, job?.project_name, getAllDetections]
  );

  const handleApprove = useCallback(async () => {
    if (!jobId || !liveDerivedTotals) {
      console.error('[Approve] Missing job ID or calculations');
      return;
    }

    setIsApproving(true);

    try {
      // Build the payload with all measurements
      const payload = buildApprovePayload(liveDerivedTotals);
      console.log('[Approve] Sending payload:', payload);

      const webhookUrl =
        process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || 'https://n8n-production-293e.up.railway.app';
      const response = await fetch(
        `${webhookUrl}/webhook/approve-detection-editor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      // Check content type to determine response format
      const contentType = response.headers.get('content-type');

      if (
        contentType?.includes(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      ) {
        // It's an Excel file - trigger download
        if (!response.ok) {
          throw new Error(`Workflow failed: ${response.status}`);
        }

        const blob = await response.blob();
        const filename =
          response.headers
            .get('content-disposition')
            ?.match(/filename="(.+)"/)?.[1] ||
          `takeoff_${jobId.slice(0, 8)}.xlsx`;

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        console.log('[Approve] Excel downloaded:', filename);
        toast.success(`Takeoff downloaded: ${filename}`);
      } else {
        // It's JSON - parse response text once
        const responseText = await response.text();
        console.log('[Approve] Raw response:', responseText);

        let data: ApprovalResult;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[Approve] JSON parse error:', parseError);
          throw new Error(`Invalid JSON response: ${responseText.slice(0, 100)}`);
        }

        console.log('[Approve] Parsed result:', data);

        if (!data.success) {
          throw new Error((data as { error?: string }).error || 'Approval failed');
        }

        // Store the approval result and show the results panel
        console.log('[Approve] Setting approvalResult:', data.takeoff_id);
        setApprovalResult(data);
        console.log('[Approve] Setting showApprovalResults: true');
        setShowApprovalResults(true);

        // Format cost for toast (with defensive checks)
        const subtotal = data?.totals?.subtotal ?? 0;
        const lineItemsCreated = data?.line_items_created ?? 0;
        const formattedSubtotal = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(subtotal);

        toast.success(`Takeoff created: ${lineItemsCreated} items, ${formattedSubtotal}`, {
          duration: 5000,
        });

        // Fetch full takeoff details for display and Excel export
        if (data.takeoff_id) {
          try {
            setIsLoadingDetails(true);
            console.log('[Approve] Fetching takeoff details for:', data.takeoff_id);
            const detailsResponse = await fetch(`/api/takeoffs/${data.takeoff_id}`);
            console.log('[Approve] Details response status:', detailsResponse.status);

            const details = await detailsResponse.json();
            console.log('[Approve] Takeoff details response:', details);

            if (details.success && details.takeoff && Array.isArray(details.line_items)) {
              console.log('[Approve] Setting takeoff details:', {
                takeoff_id: details.takeoff?.id,
                line_items_count: details.line_items?.length,
              });
              setTakeoffDetails({
                takeoff: details.takeoff,
                line_items: details.line_items,
              });
            } else {
              console.warn('[Approve] Invalid takeoff details response:', {
                success: details.success,
                has_takeoff: !!details.takeoff,
                has_line_items: Array.isArray(details.line_items),
              });
              // Don't set takeoffDetails - we'll just show the summary from approvalResult
            }
          } catch (detailsErr) {
            console.error('[Approve] Error fetching takeoff details:', detailsErr);
            // Don't crash - we'll just show the summary data we already have
          } finally {
            setIsLoadingDetails(false);
          }
        }
      }

      // Refresh data (but don't call onComplete yet - user needs to see the results panel first)
      console.log('[Approve] About to call refresh()');
      await refresh();
      console.log('[Approve] After refresh(), showApprovalResults should still be true');
      // NOTE: onComplete is now called when user clicks "Done" button in the approval results panel
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Approval failed');
      console.error('[Approve] Error:', error);
      toast.error(`Failed to generate takeoff: ${error.message}`);
      onError?.(error);
    } finally {
      if (isMountedRef.current) {
        setIsApproving(false);
      }
    }
  }, [
    jobId,
    liveDerivedTotals,
    buildApprovePayload,
    refresh,
    onError,
  ]);

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
            canApprove={!!liveDerivedTotals}
            isApproved={!!approvalResult}
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
              createClass={createClass}
              lineClass={lineClass}
              pointClass={pointClass}
              onClassSelect={(cls, mode) => {
                // Update the appropriate class state based on the tool mode
                if (mode === 'create') setCreateClass(cls);
                else if (mode === 'line') setLineClass(cls);
                else if (mode === 'point') setPointClass(cls);
              }}
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
                    activeClass={
                      toolMode === 'line'
                        ? lineClass
                        : toolMode === 'point'
                        ? pointClass
                        : createClass
                    }
                    onSelectionChange={handleCanvasSelect}
                    onDetectionMove={handleDetectionMove}
                    onDetectionResize={handleDetectionResize}
                    onDetectionCreate={handleDetectionCreate}
                    onDetectionPolygonUpdate={handleDetectionPolygonUpdate}
                    onCalibrationComplete={handleCalibrationComplete}
                    onExitDrawingMode={() => setToolMode('select')}
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

              {/* Show Original / Unmarked Plans Toggle Button */}
              {!showMarkup && (
                <button
                  type="button"
                  onClick={handleToggleOriginalOnly}
                  className={`absolute top-4 ${markupUrl ? 'right-36' : 'right-4'} flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg shadow-lg transition-colors z-10 ${
                    showOriginalOnly
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                  title="Toggle between marked and unmarked plans"
                >
                  {showOriginalOnly ? (
                    <>
                      <Layers className="w-4 h-4" />
                      Show Detections
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-4 h-4" />
                      Show Original
                    </>
                  )}
                </button>
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
              showDeleted={showDeleted}
              onShowDeletedChange={setShowDeleted}
              jobId={jobId}
              selectedDetections={selectedDetections}
              onClassChange={handleClassChange}
              onStatusChange={handleStatusChange}
              onMaterialAssign={handleMaterialAssign}
              onNotesChange={handleNotesChange}
              pixelsPerFoot={currentPage?.scale_ratio || 64}
              liveDerivedTotals={liveDerivedTotals}
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

      {/* Approval Results Panel */}
      {showApprovalResults && approvalResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-green-50 dark:bg-green-900/30 border-b border-green-100 dark:border-green-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Takeoff Created
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {approvalResult?.trades_processed?.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') || 'Siding'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowApprovalResults(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Line Items Summary */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <FileText className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {approvalResult?.line_items_created ?? 0}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Line items created
                    {(approvalResult?.line_items_failed ?? 0) > 0 && (
                      <span className="text-amber-500 ml-1">
                        ({approvalResult.line_items_failed} failed)
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Cost Breakdown */}
              {approvalResult?.totals && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Cost Breakdown
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                    <div className="flex justify-between px-4 py-3">
                      <span className="text-gray-600 dark:text-gray-400">Material Cost</span>
                      <span className="font-mono font-medium text-gray-900 dark:text-white">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(approvalResult.totals.material_cost ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between px-4 py-3">
                      <span className="text-gray-600 dark:text-gray-400">Labor Cost</span>
                      <span className="font-mono font-medium text-gray-900 dark:text-white">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(approvalResult.totals.labor_cost ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between px-4 py-3">
                      <span className="text-gray-600 dark:text-gray-400">Overhead & Profit ({approvalResult.totals.markup_percent ?? 15}%)</span>
                      <span className="font-mono font-medium text-gray-900 dark:text-white">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(approvalResult.totals.overhead_cost ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between px-4 py-3 bg-green-50 dark:bg-green-900/20">
                      <span className="font-semibold text-gray-900 dark:text-white">Subtotal</span>
                      <span className="font-mono font-bold text-lg text-green-600 dark:text-green-400">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(approvalResult.totals.subtotal ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Line Items Table */}
              {isLoadingDetails && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                  <span className="ml-2 text-gray-500 dark:text-gray-400">Loading line items...</span>
                </div>
              )}
              {!isLoadingDetails && takeoffDetails?.takeoff && Array.isArray(takeoffDetails?.line_items) && takeoffDetails.line_items.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Line Items
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-gray-700">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Qty</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Unit</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Material</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Labor</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {takeoffDetails.line_items.map((item, idx) => (
                            <tr key={item.id || idx} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'}>
                              <td className="px-3 py-2 text-gray-900 dark:text-white">
                                <div className="max-w-xs truncate" title={item.description}>
                                  {item.description}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-white">
                                {typeof item.quantity === 'number' ? item.quantity.toFixed(1) : item.quantity}
                              </td>
                              <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">
                                {item.unit}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-white">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(item.material_extended) || 0)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-white">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(item.labor_extended) || 0)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-medium text-gray-900 dark:text-white">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(item.line_total) || 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              {!isLoadingDetails && (!takeoffDetails?.takeoff || !Array.isArray(takeoffDetails?.line_items) || takeoffDetails.line_items.length === 0) && (
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                  Line item details not available
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                {takeoffDetails?.takeoff && Array.isArray(takeoffDetails?.line_items) && takeoffDetails.line_items.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        console.log('[Excel Export] Starting export with:', {
                          takeoff_id: takeoffDetails.takeoff?.id,
                          line_items_count: takeoffDetails.line_items?.length,
                        });
                        const filename = `takeoff_${approvalResult?.takeoff_id?.slice(0, 8) || jobId.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.xlsx`;
                        await exportTakeoffToExcel(takeoffDetails, filename);
                        toast.success('Excel downloaded successfully');
                      } catch (err) {
                        console.error('[Excel Export] Error:', err);
                        toast.error('Failed to download Excel');
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download Excel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowApprovalResults(false);
                    // Navigate to the takeoff details page if we have a takeoff_id
                    if (approvalResult?.takeoff_id) {
                      router.push(`/takeoffs/${approvalResult.takeoff_id}`);
                    } else {
                      // Fallback to onComplete callback
                      onComplete?.();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Takeoff
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
