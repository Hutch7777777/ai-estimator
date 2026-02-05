'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, RefreshCw, Eye, EyeOff, X, Layers, CheckCircle, DollarSign, FileText, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import polygonClipping from 'polygon-clipping';
import {
  useExtractionData,
  useDetectionSync,
  useResizable,
  validateDetections,
  createOptimisticMove,
  createOptimisticMoveAndResize,
  createOptimisticDelete,
  createOptimisticVerify,
  createOptimisticReclassify,
  createOptimisticColorChange,
} from '@/lib/hooks';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { calculateRealWorldMeasurements } from '@/lib/utils/coordinates';
import {
  getClassDerivedMeasurements,
  rectToPolygonPoints,
  calculateBuildingMeasurements,
  calculateLineMeasurements,
  calculateAreaMeasurements,
} from '@/lib/utils/polygonUtils';
import { renderMarkupImage } from '@/lib/utils/markupRenderer';
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
  CountClass,
  PolygonPoints,
  MaterialAssignment,
  LaborSection,
  OverheadSection,
  ProjectTotals,
} from '@/lib/types/extraction';
import { isPolygonWithHoles } from '@/lib/types/extraction';
import DetectionToolbar from './DetectionToolbar';
import MarkupToolbar from './MarkupToolbar';
import KonvaDetectionCanvas, { type CalibrationData } from './KonvaDetectionCanvas';
import type { PolygonUpdatePayload } from './KonvaDetectionPolygon';
import DetectionSidebar from './DetectionSidebar';
import CalibrationModal from './CalibrationModal';
import DetectionContextMenu, { type ContextMenuPosition } from './DetectionContextMenu';
import ConfidenceFilter from './ConfidenceFilter';
import { PlanReaderChatbot, type PlanReaderChatbotRef } from './PlanReaderChatbot';
import type { PageInput } from '@/lib/utils/pageTypeMapping';
import { useConfidenceFilter } from '@/lib/hooks/useConfidenceFilter';
import { useRegionDetect, type RegionDetectionResult, type DetectionRegion } from '@/lib/hooks/useRegionDetect';
import { useSAMSegment, type SAMPendingDetection, type SAMSegmentResult } from '@/lib/hooks/useSAMSegment';
import SAMClassPicker from './SAMClassPicker';
import { exportTakeoffToExcel, type TakeoffData } from '@/lib/utils/exportTakeoffExcel';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { createClient } from '@supabase/supabase-js';

// Create untyped Supabase client for extraction_detections_draft operations
// (This table is not in the generated types)
const getSupabaseClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

// Display metadata for detection count classes
const CLASS_COUNT_INFO: Record<string, {
  display_name: string;
  measurement_type: 'count' | 'area' | 'linear';
  unit: string;
}> = {
  // === LINEAR CLASSES (LF) ===
  belly_band: { display_name: 'Belly Band', measurement_type: 'linear', unit: 'LF' },
  fascia: { display_name: 'Fascia', measurement_type: 'linear', unit: 'LF' },
  gutter: { display_name: 'Gutter', measurement_type: 'linear', unit: 'LF' },
  eave: { display_name: 'Eave', measurement_type: 'linear', unit: 'LF' },
  rake: { display_name: 'Rake', measurement_type: 'linear', unit: 'LF' },
  ridge: { display_name: 'Ridge', measurement_type: 'linear', unit: 'LF' },
  valley: { display_name: 'Valley', measurement_type: 'linear', unit: 'LF' },
  trim: { display_name: 'Trim', measurement_type: 'linear', unit: 'LF' },

  // === AREA CLASSES (SF) ===
  soffit: { display_name: 'Soffit', measurement_type: 'area', unit: 'SF' },

  // === COUNT CLASSES (EA) ===
  corbel: { display_name: 'Corbel', measurement_type: 'count', unit: 'EA' },
  bracket: { display_name: 'Bracket', measurement_type: 'count', unit: 'EA' },
  shutter: { display_name: 'Shutter', measurement_type: 'count', unit: 'EA' },
  post: { display_name: 'Post', measurement_type: 'count', unit: 'EA' },
  column: { display_name: 'Column', measurement_type: 'count', unit: 'EA' },
  vent: { display_name: 'Vent', measurement_type: 'count', unit: 'EA' },
  gable_vent: { display_name: 'Gable Vent', measurement_type: 'count', unit: 'EA' },
  downspout: { display_name: 'Downspout', measurement_type: 'count', unit: 'EA' },
  light_fixture: { display_name: 'Light Fixture', measurement_type: 'count', unit: 'EA' },
  outlet: { display_name: 'Outlet', measurement_type: 'count', unit: 'EA' },
  hose_bib: { display_name: 'Hose Bib', measurement_type: 'count', unit: 'EA' },
  flashing: { display_name: 'Flashing', measurement_type: 'count', unit: 'EA' },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract simple polygon points from a detection's polygon_points field.
 * For standard polygons, returns the points directly.
 * For polygons with holes (from split operation), returns the outer boundary.
 * This allows measurement functions to work uniformly with both types.
 */
function getSimplePolygonPoints(polygonPoints: PolygonPoints | null | undefined): PolygonPoint[] | null {
  if (!polygonPoints) return null;
  if (isPolygonWithHoles(polygonPoints)) {
    // Return outer boundary for polygons with holes
    return polygonPoints.outer as PolygonPoint[];
  }
  // Standard polygon - return as-is
  return polygonPoints as PolygonPoint[];
}

/**
 * Check if the API response uses the new V2 format with project_totals
 * V2 responses include labor, overhead, and project_totals from Mike Skjei methodology
 */
function isV2Response(response: unknown): response is ApprovalResult & {
  labor: LaborSection;
  overhead: OverheadSection;
  project_totals: ProjectTotals;
} {
  return (
    response !== null &&
    typeof response === 'object' &&
    'project_totals' in response &&
    'labor' in response &&
    'overhead' in response
  );
}

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

  // Get organization context for multi-tenant pricing
  const { organization } = useOrganization();

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
    detections, // Raw detections Map for all-pages calculation
    elevationCalcs,
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

  // Debug: Log aggregation data
  console.log('[DetectionEditor] Job results_summary:', job?.results_summary);
  console.log('[DetectionEditor] JobTotals:', jobTotals);

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
  // Sidebar Resize
  // ============================================================================

  const {
    width: sidebarWidth,
    isResizing: isSidebarResizing,
    handleMouseDown: handleSidebarResizeStart,
  } = useResizable({
    initialWidth: 320,
    minWidth: 280,
    maxWidth: 500,
    storageKey: 'detection-editor-sidebar-width',
    direction: 'left', // Handle on left edge of sidebar (since sidebar is on right)
  });

  // ============================================================================
  // Local UI State
  // ============================================================================

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [createClass, setCreateClass] = useState<DetectionClass>('siding');
  const [lineClass, setLineClass] = useState<DetectionClass>('eave');
  const [pointClass, setPointClass] = useState<DetectionClass>('vent');
  const [transform, setTransform] = useState<ViewTransform>(DEFAULT_TRANSFORM);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showArea, setShowArea] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isExportingBluebeam, setIsExportingBluebeam] = useState(false);
  const [approvalResult, setApprovalResult] = useState<ApprovalResult | null>(null);
  const [showApprovalResults, setShowApprovalResults] = useState(false);
  const [takeoffDetails, setTakeoffDetails] = useState<TakeoffData | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isDownloadingMarkup, setIsDownloadingMarkup] = useState(false);

  // Track when canvas is actively drawing (for point-level undo coordination)
  const [isCanvasDrawing, setIsCanvasDrawing] = useState(false);

  // Context menu state (for right-click on detections)
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    detectionId: string;
  } | null>(null);

  // Confidence filter state
  const {
    minConfidence,
    setMinConfidence,
    showLowConfidence,
    setShowLowConfidence,
    getConfidenceLevel,
    isActive: isConfidenceFilterActive,
  } = useConfidenceFilter();

  // Re-detection state
  const [isRedetecting, setIsRedetecting] = useState(false);

  // Plan Reader chatbot ref (for keyboard shortcut toggle)
  const planReaderRef = useRef<PlanReaderChatbotRef>(null);

  // Region detect pending detections
  const [regionPendingDetections, setRegionPendingDetections] = useState<RegionDetectionResult[]>([]);

  // Region detect hook - for drawing rectangle and running Roboflow on selected area
  const regionDetect = useRegionDetect({
    pageId: currentPageId || undefined,
    imageUrl: currentPage?.original_image_url || currentPage?.image_url || undefined,
    confidenceThreshold: minConfidence,
    onDetectionsFound: (detections) => {
      console.log('[DetectionEditor] Region detect found', detections.length, 'detections');
      setRegionPendingDetections(prev => [...prev, ...detections]);
      // Switch back to select mode after detection
      setToolMode('select');
    },
    onError: (error) => {
      toast.error(`Region detection failed: ${error}`);
      setToolMode('select');
    },
  });

  // SAM Magic Select pending detections
  const [samPendingDetections, setSamPendingDetections] = useState<SAMPendingDetection[]>([]);
  // Position for SAM class picker popup
  const [samClassPickerPosition, setSamClassPickerPosition] = useState<{ x: number; y: number } | null>(null);

  // SAM Magic Select hook - for click-to-segment precise boundary detection
  const samSegment = useSAMSegment({
    imageUrl: currentPage?.original_image_url || currentPage?.image_url || undefined,
    imageWidth: currentPage?.original_width || DEFAULT_IMAGE_WIDTH,
    imageHeight: currentPage?.original_height || DEFAULT_IMAGE_HEIGHT,
    onSegmentComplete: (result) => {
      console.log('[DetectionEditor] SAM segment complete:', result.id);
      // Show class picker near center of canvas
      if (canvasContainerRef.current) {
        const rect = canvasContainerRef.current.getBoundingClientRect();
        setSamClassPickerPosition({
          x: rect.width / 2 - 140, // Center the picker (280px width / 2)
          y: 60, // Near top
        });
      }
    },
    onDetectionConfirmed: (detection) => {
      console.log('[DetectionEditor] SAM detection confirmed:', detection);
      setSamPendingDetections(prev => [...prev, detection]);
      setSamClassPickerPosition(null);
    },
    onError: (error) => {
      toast.error(`SAM segmentation failed: ${error}`);
      setSamClassPickerPosition(null);
    },
  });

  // V2 response data (Mike Skjei methodology)
  const [laborSection, setLaborSection] = useState<LaborSection | undefined>();
  const [overheadSection, setOverheadSection] = useState<OverheadSection | undefined>();
  const [projectTotals, setProjectTotals] = useState<ProjectTotals | undefined>();

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

  // Handler for selecting all detections in a class (bulk selection via Cmd/Ctrl+click)
  const handleSelectAllInClass = useCallback((detectionIds: string[]) => {
    setSelectedIds(new Set(detectionIds));
  }, []);

  // Handler for marquee multi-selection from canvas
  const handleMultiSelect = useCallback((detectionIds: string[]) => {
    setSelectedIds(new Set(detectionIds));
    // Update the primary selected detection to the first one
    if (detectionIds.length > 0) {
      setSelectedDetectionId(detectionIds[0]);
    }
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

  // ============================================================================
  // Context Menu Handlers
  // ============================================================================

  // Handle right-click on a detection to show context menu
  const handleDetectionContextMenu = useCallback(
    (detection: ExtractionDetection, screenPosition: { x: number; y: number }) => {
      setContextMenu({
        position: screenPosition,
        detectionId: detection.id,
      });
    },
    []
  );

  // Close context menu
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Duplicate a detection from context menu
  const handleDuplicateDetection = useCallback(
    (detectionId: string) => {
      const detection = currentPageDetections.find((d) => d.id === detectionId);
      if (!detection || !currentPage) return;

      // Create a new detection with same properties but offset position
      const offsetPixels = 20; // Offset duplicated detection by 20 pixels
      const newDetection: Partial<ExtractionDetection> = {
        ...detection,
        id: crypto.randomUUID(),
        pixel_x: detection.pixel_x + offsetPixels,
        pixel_y: detection.pixel_y + offsetPixels,
        // Offset polygon points if they exist
        polygon_points: detection.polygon_points
          ? (Array.isArray(detection.polygon_points)
              ? detection.polygon_points.map((pt: PolygonPoint) => ({
                  x: pt.x + offsetPixels,
                  y: pt.y + offsetPixels,
                }))
              : {
                  outer: (detection.polygon_points as { outer: PolygonPoint[]; holes?: PolygonPoint[][] }).outer.map((pt) => ({
                    x: pt.x + offsetPixels,
                    y: pt.y + offsetPixels,
                  })),
                  holes: (detection.polygon_points as { outer: PolygonPoint[]; holes?: PolygonPoint[][] }).holes?.map((hole) =>
                    hole.map((pt) => ({
                      x: pt.x + offsetPixels,
                      y: pt.y + offsetPixels,
                    }))
                  ),
                })
          : undefined,
        status: 'auto', // New detection starts as auto (unverified)
        created_at: new Date().toISOString(),
      };

      // Add the duplicated detection
      addDetectionLocally(newDetection as ExtractionDetection);

      // Select the new detection
      setSelectedIds(new Set([newDetection.id!]));

      toast.success('Detection duplicated');
    },
    [currentPageDetections, currentPage, addDetectionLocally]
  );

  // Delete a single detection from context menu
  const handleDeleteDetectionFromMenu = useCallback(
    (detectionId: string) => {
      const detection = currentPageDetections.find((d) => d.id === detectionId);
      if (!detection) return;

      const optimistic = createOptimisticDelete(detection);
      updateDetectionLocally(optimistic);

      // Clear selection if this detection was selected
      if (selectedIds.has(detectionId)) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(detectionId);
          return next;
        });
      }

      toast.success('Detection deleted');
    },
    [currentPageDetections, updateDetectionLocally, selectedIds]
  );

  // Change class of a single detection from context menu
  const handleChangeClassFromMenu = useCallback(
    (detectionId: string, newClass: DetectionClass) => {
      const detection = currentPageDetections.find((d) => d.id === detectionId);
      if (!detection) return;

      const optimistic = createOptimisticReclassify(detection, newClass);
      updateDetectionLocally(optimistic);

      toast.success(`Class changed to ${newClass}`);
    },
    [currentPageDetections, updateDetectionLocally]
  );

  // Change color of a single detection from context menu
  const handleChangeColorFromMenu = useCallback(
    (detectionId: string, newColor: string | null) => {
      const detection = currentPageDetections.find((d) => d.id === detectionId);
      if (!detection) return;

      const optimistic = createOptimisticColorChange(detection, newColor);
      updateDetectionLocally(optimistic);

      toast.success(newColor ? `Color changed to ${newColor}` : 'Color reset to default');
    },
    [currentPageDetections, updateDetectionLocally]
  );

  // Handle split detection - creates carved piece + remaining pieces using TRUE polygon subtraction
  const handleSplitDetection = useCallback(
    (
      originalDetection: ExtractionDetection,
      splitPolygon: PolygonPoint[]
    ) => {
      console.log('[DetectionEditor] handleSplitDetection called:', {
        originalId: originalDetection.id,
        splitPolygonVertices: splitPolygon.length,
        originalPolygonPoints: originalDetection.polygon_points,
        originalPixel: {
          x: originalDetection.pixel_x,
          y: originalDetection.pixel_y,
          width: originalDetection.pixel_width,
          height: originalDetection.pixel_height,
        },
      });

      const scaleRatio = currentPage?.scale_ratio || 64;
      const pixelsPerFoot = scaleRatio;

      // Original detection bounds (convert from center-based to edges)
      const orig = {
        left: originalDetection.pixel_x - originalDetection.pixel_width / 2,
        top: originalDetection.pixel_y - originalDetection.pixel_height / 2,
        right: originalDetection.pixel_x + originalDetection.pixel_width / 2,
        bottom: originalDetection.pixel_y + originalDetection.pixel_height / 2,
      };

      // Validate split polygon has enough points
      if (splitPolygon.length < 3) {
        console.warn('[DetectionEditor] Split polygon must have at least 3 points');
        return;
      }

      // Get original polygon points, or create rectangle from bounding box
      let originalPolygon: [number, number][];
      if (originalDetection.polygon_points && Array.isArray(originalDetection.polygon_points) && originalDetection.polygon_points.length >= 3) {
        // Use existing polygon points
        originalPolygon = originalDetection.polygon_points.map(p => [p.x, p.y] as [number, number]);
        console.log('[DetectionEditor] Using original polygon_points for clipping');
      } else if (originalDetection.polygon_points && isPolygonWithHoles(originalDetection.polygon_points)) {
        // Handle polygon with holes - use outer boundary
        originalPolygon = originalDetection.polygon_points.outer.map(p => [p.x, p.y] as [number, number]);
        console.log('[DetectionEditor] Using outer boundary of polygon-with-holes for clipping');
      } else {
        // Create rectangle from bounding box
        originalPolygon = [
          [orig.left, orig.top],
          [orig.right, orig.top],
          [orig.right, orig.bottom],
          [orig.left, orig.bottom],
        ];
        console.log('[DetectionEditor] Created rectangle from bounding box for clipping');
      }

      // Convert split polygon points to polygon-clipping format
      const cutPolygon: [number, number][] = splitPolygon.map(p => [p.x, p.y] as [number, number]);

      // Use polygon-clipping for TRUE subtraction
      // intersection = carved piece (original AND cut polygon)
      // difference = remaining piece(s) (original MINUS cut polygon)
      const carvedResult = polygonClipping.intersection(
        [[originalPolygon]],
        [[cutPolygon]]
      );
      const remainingResult = polygonClipping.difference(
        [[originalPolygon]],
        [[cutPolygon]]
      );

      console.log('[DetectionEditor] Polygon clipping results:', {
        carvedPolygons: carvedResult.length,
        remainingPolygons: remainingResult.length,
      });

      if (carvedResult.length === 0) {
        console.warn('[DetectionEditor] No intersection found between detection and cut rectangle');
        return;
      }

      // Helper: Calculate polygon area using shoelace formula
      const calculateArea = (points: [number, number][]): number => {
        let area = 0;
        for (let i = 0; i < points.length; i++) {
          const j = (i + 1) % points.length;
          area += points[i][0] * points[j][1];
          area -= points[j][0] * points[i][1];
        }
        return Math.abs(area / 2);
      };

      // Helper: Calculate polygon perimeter
      const calculatePerimeter = (points: [number, number][]): number => {
        let perimeter = 0;
        for (let i = 0; i < points.length; i++) {
          const j = (i + 1) % points.length;
          const dx = points[j][0] - points[i][0];
          const dy = points[j][1] - points[i][1];
          perimeter += Math.sqrt(dx * dx + dy * dy);
        }
        return perimeter;
      };

      // Helper: Get bounding box of polygon
      const getBoundingBox = (points: [number, number][]) => {
        const xs = points.map(p => p[0]);
        const ys = points.map(p => p[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return {
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2,
          width: maxX - minX,
          height: maxY - minY,
        };
      };

      // Helper: Convert Ring (Pair[]) to PolygonPoint[]
      const toPolygonPoints = (ring: [number, number][]): PolygonPoint[] => {
        return ring.map(([x, y]) => ({ x, y }));
      };

      const newDetections: ExtractionDetection[] = [];

      // 1. Create CARVED piece(s) from intersection result
      // carvedResult is MultiPolygon = Polygon[] where Polygon = Ring[]
      for (const polygon of carvedResult) {
        // polygon[0] is the outer ring (Ring = Pair[])
        const outerRing = polygon[0];
        if (!outerRing || outerRing.length < 3) continue;

        const bbox = getBoundingBox(outerRing);
        const areaPx = calculateArea(outerRing);
        const perimeterPx = calculatePerimeter(outerRing);

        const carvedPiece: ExtractionDetection = {
          id: crypto.randomUUID(),
          job_id: job?.id || '',
          page_id: currentPage?.id || '',
          class: originalDetection.class,
          detection_index: currentPageDetections.length + newDetections.length,
          confidence: 1.0, // Manual split = user verified = high confidence
          pixel_x: bbox.centerX,
          pixel_y: bbox.centerY,
          pixel_width: bbox.width,
          pixel_height: bbox.height,
          real_width_ft: bbox.width / pixelsPerFoot,
          real_height_ft: bbox.height / pixelsPerFoot,
          real_width_in: (bbox.width / pixelsPerFoot) * 12,
          real_height_in: (bbox.height / pixelsPerFoot) * 12,
          area_sf: areaPx / (pixelsPerFoot * pixelsPerFoot),
          perimeter_lf: perimeterPx / pixelsPerFoot,
          is_triangle: false,
          matched_tag: null,
          created_at: new Date().toISOString(),
          status: 'edited',
          edited_by: null,
          edited_at: new Date().toISOString(),
          original_bbox: null,
          polygon_points: toPolygonPoints(outerRing),
          markup_type: 'polygon',
          notes: `Carved from ${originalDetection.id.slice(0, 8)}`,
        };
        newDetections.push(carvedPiece);
      }

      // 2. Create REMAINING piece(s) from difference result
      // Each polygon in remainingResult can have multiple rings:
      // - Ring 0 = outer boundary
      // - Ring 1+ = holes (if cut is in the middle of the polygon)
      for (const polygon of remainingResult) {
        const outerRing = polygon[0];
        if (!outerRing || outerRing.length < 3) continue;

        // Check for holes (additional rings beyond the outer)
        const holeRings = polygon.slice(1).filter(ring => ring && ring.length >= 3);
        const hasHoles = holeRings.length > 0;

        const bbox = getBoundingBox(outerRing);
        const outerPoints = toPolygonPoints(outerRing);

        // Calculate area: outer area minus hole areas
        let areaPx = calculateArea(outerRing);
        let perimeterPx = calculatePerimeter(outerRing);

        // Subtract hole areas and add hole perimeters
        for (const holeRing of holeRings) {
          areaPx -= calculateArea(holeRing);
          perimeterPx += calculatePerimeter(holeRing);
        }

        // Build polygon_points - either simple array or PolygonWithHoles
        let polygonData: PolygonPoint[] | { outer: PolygonPoint[]; holes?: PolygonPoint[][] };
        if (hasHoles) {
          // Has holes - use PolygonWithHoles structure
          polygonData = {
            outer: outerPoints,
            holes: holeRings.map(ring => toPolygonPoints(ring)),
          };
        } else {
          // No holes - simple polygon array
          polygonData = outerPoints;
        }

        const remainingPiece: ExtractionDetection = {
          id: crypto.randomUUID(),
          job_id: job?.id || '',
          page_id: currentPage?.id || '',
          class: originalDetection.class,
          detection_index: currentPageDetections.length + newDetections.length,
          confidence: 1.0, // Manual split = user verified = high confidence
          pixel_x: bbox.centerX,
          pixel_y: bbox.centerY,
          pixel_width: bbox.width,
          pixel_height: bbox.height,
          real_width_ft: bbox.width / pixelsPerFoot,
          real_height_ft: bbox.height / pixelsPerFoot,
          real_width_in: (bbox.width / pixelsPerFoot) * 12,
          real_height_in: (bbox.height / pixelsPerFoot) * 12,
          area_sf: areaPx / (pixelsPerFoot * pixelsPerFoot),
          perimeter_lf: perimeterPx / pixelsPerFoot,
          is_triangle: false,
          matched_tag: null,
          created_at: new Date().toISOString(),
          status: 'edited',
          edited_by: null,
          edited_at: new Date().toISOString(),
          original_bbox: null,
          polygon_points: polygonData,
          markup_type: 'polygon',
          notes: `Remaining from ${originalDetection.id.slice(0, 8)}${hasHoles ? ' (with hole)' : ''}`,
          // Only set has_hole if there are actual holes
          ...(hasHoles ? { has_hole: true } : {}),
        };
        newDetections.push(remainingPiece);
      }

      // Debug: Log polygon-clipping results first
      console.log('=== POLYGON-CLIPPING RESULTS ===');
      console.log('Carved polygons:', carvedResult.map(poly => ({
        rings: poly.length,
        outerPoints: poly[0]?.length || 0,
      })));
      console.log('Remaining polygons:', remainingResult.map(poly => ({
        rings: poly.length,
        outerPoints: poly[0]?.length || 0,
        holes: poly.slice(1).map(h => h?.length || 0),
      })));

      // Debug: Log all pieces BEFORE adding
      console.log('=== SPLIT DETECTION DEBUG (TRUE SUBTRACTION) ===');
      console.log(`Created ${newDetections.length} new detections:`);
      newDetections.forEach((det, idx) => {
        const areaSf = det.area_sf ?? 0;
        const hasHolesFlag = (det as ExtractionDetection & { has_hole?: boolean }).has_hole;
        const polygonPoints = det.polygon_points;
        const isPolygonWithHolesType = polygonPoints && typeof polygonPoints === 'object' && 'outer' in polygonPoints;
        console.log(`  [${idx}] ${det.notes}:`, {
          id: det.id.slice(0, 8),
          pixel_x: det.pixel_x.toFixed(1),
          pixel_y: det.pixel_y.toFixed(1),
          pixel_width: det.pixel_width.toFixed(1),
          pixel_height: det.pixel_height.toFixed(1),
          area_sf: areaSf.toFixed(2),
          vertices: isPolygonWithHolesType
            ? (polygonPoints as { outer: PolygonPoint[] }).outer.length
            : (polygonPoints as PolygonPoint[])?.length || 0,
          hasHoles: hasHolesFlag || false,
          holesCount: isPolygonWithHolesType
            ? (polygonPoints as { outer: PolygonPoint[]; holes?: PolygonPoint[][] }).holes?.length || 0
            : 0,
        });
      });
      console.log('=== END SPLIT DEBUG ===');

      // Mark original as deleted (soft delete via status)
      const deletedOriginal: ExtractionDetection = {
        ...originalDetection,
        status: 'deleted',
        edited_at: new Date().toISOString(),
      };
      updateDetectionLocally(deletedOriginal);
      console.log('[DetectionEditor] Marked original detection as deleted:', originalDetection.id);

      // Add all new pieces
      for (const detection of newDetections) {
        addDetectionLocally(detection);
        console.log(`[DetectionEditor] Created detection: ${detection.id} (${detection.notes})`);
      }

      console.log(`[DetectionEditor] Split complete: created ${newDetections.length} new detections via true polygon subtraction`);

      // Select the first carved piece (the one the user explicitly drew)
      const carvedPiece = newDetections.find(d => d.notes?.includes('Carved'));
      if (carvedPiece) {
        setSelectedDetectionId(carvedPiece.id);
        setSelectedIds(new Set([carvedPiece.id]));
      }

      // Switch back to select mode
      setToolMode('select');
    },
    [job?.id, currentPage?.id, currentPage?.scale_ratio, currentPageDetections.length, updateDetectionLocally, addDetectionLocally]
  );

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

  // Handle color override from Properties panel
  // Saves directly to Supabase and updates local state
  const handleColorChange = useCallback(
    async (detectionIds: string[], color: string | null) => {
      if (detectionIds.length === 0) return;

      // Update local state immediately for optimistic UI
      detectionIds.forEach((id) => {
        const detection = currentPageDetections.find((d) => d.id === id);
        if (detection) {
          const updatedDetection = {
            ...detection,
            color_override: color,
            edited_at: new Date().toISOString(),
          };
          updateDetectionLocally(updatedDetection);
        }
      });

      // Save to database directly
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('extraction_detections_draft')
        .update({
          color_override: color,
          updated_at: new Date().toISOString()
        })
        .in('id', detectionIds);

      if (error) {
        console.error('[DetectionEditor] Failed to save color override to database:', error);
        toast.error('Failed to save color change');
      } else {
        console.log(`[DetectionEditor] Color override saved: ${color} for ${detectionIds.length} detection(s)`);
      }
    },
    [currentPageDetections, updateDetectionLocally]
  );

  // Handle material assignment from Properties panel
  // Saves directly to Supabase and updates local state
  // Auto-verifies detection when a material is assigned
  const handleMaterialAssign = useCallback(
    async (detectionIds: string[], materialId: string | null) => {
      console.log('[DetectionEditor] handleMaterialAssign called:', { detectionIds, materialId });

      if (detectionIds.length === 0) {
        console.log('[DetectionEditor] No detection IDs provided, returning');
        return;
      }

      // Update local state immediately for optimistic UI
      detectionIds.forEach((id) => {
        const detection = currentPageDetections.find((d) => d.id === id);
        console.log('[DetectionEditor] Found detection:', detection?.id, 'current assigned_material_id:', detection?.assigned_material_id);

        if (detection) {
          const updatedDetection = {
            ...detection,
            assigned_material_id: materialId,
            // Clear price override when material is cleared
            material_cost_override: materialId === null ? null : detection.material_cost_override,
            // Auto-verify when material is assigned (don't change status if clearing)
            status: materialId ? 'verified' as const : detection.status,
            edited_at: new Date().toISOString(),
          };
          console.log('[DetectionEditor] Updating detection with:', {
            id: updatedDetection.id,
            assigned_material_id: updatedDetection.assigned_material_id,
            status: updatedDetection.status
          });
          updateDetectionLocally(updatedDetection);
        }
      });

      // Save to database directly
      const supabase = getSupabaseClient();
      const updateData: Record<string, unknown> = {
        assigned_material_id: materialId,
        updated_at: new Date().toISOString()
      };
      // Clear price override when material is cleared
      if (materialId === null) {
        updateData.material_cost_override = null;
      }
      // Auto-verify when material is assigned
      if (materialId) {
        updateData.status = 'verified';
      }

      console.log('[DetectionEditor] Saving to database:', {
        table: 'extraction_detections_draft',
        updateData,
        detectionIds,
      });

      const { data, error, status, statusText } = await supabase
        .from('extraction_detections_draft')
        .update(updateData)
        .in('id', detectionIds)
        .select();

      if (error) {
        console.error('[DetectionEditor] Failed to save material assignment to database:');
        console.error('  Error object:', error);
        console.error('  Error message:', error?.message);
        console.error('  Error code:', error?.code);
        console.error('  Error details:', error?.details);
        console.error('  Error hint:', error?.hint);
        console.error('  HTTP status:', status, statusText);
        console.error('  Full error JSON:', JSON.stringify(error, null, 2));
        toast.error(`Failed to save material assignment: ${error?.message || 'Unknown error'}`);
      } else {
        console.log('[DetectionEditor] Material assignment saved to database successfully');
        console.log('[DetectionEditor] Updated rows:', data);
      }

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

  // Handle price override from Properties panel
  // Saves directly to Supabase and updates local state
  // Note: Price editing is only enabled for single detection selection in the UI
  const handlePriceOverride = useCallback(
    async (detectionIds: string[], price: number | null) => {
      console.log('[DetectionEditor] handlePriceOverride called:', { detectionIds, price });

      if (detectionIds.length === 0) {
        console.log('[DetectionEditor] No detection IDs, returning');
        return;
      }

      // Update local state immediately for optimistic UI
      detectionIds.forEach((id) => {
        const detection = currentPageDetections.find((d) => d.id === id);
        console.log('[DetectionEditor] Found detection for price override:', detection?.id);

        if (detection) {
          const updatedDetection = {
            ...detection,
            material_cost_override: price,
            edited_at: new Date().toISOString(),
          };
          console.log('[DetectionEditor] Updating detection with price override:', { id: updatedDetection.id, material_cost_override: updatedDetection.material_cost_override });
          updateDetectionLocally(updatedDetection);
        }
      });

      // Save to database directly
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('extraction_detections_draft')
        .update({
          material_cost_override: price,
          updated_at: new Date().toISOString()
        })
        .in('id', detectionIds);

      if (error) {
        console.error('[DetectionEditor] Failed to save price override to database:', error);
        toast.error('Failed to save price override');
      } else {
        console.log('[DetectionEditor] Price override saved to database successfully');
      }

      console.log(
        `[DetectionEditor] Price override ${price !== null ? `set to $${price}` : 'cleared'} for ${detectionIds.length} detection(s)`
      );
    },
    [currentPageDetections, updateDetectionLocally]
  );

  // Handle assigning material AND setting price override in one action
  // This is used when editing a price in the product list (assigns + sets custom price)
  // Saves directly to Supabase and updates local state
  const handleMaterialAssignWithPrice = useCallback(
    async (detectionIds: string[], materialId: string, priceOverride: number) => {
      if (detectionIds.length === 0) return;

      // Update local state immediately for optimistic UI
      detectionIds.forEach((id) => {
        const detection = currentPageDetections.find((d) => d.id === id);
        if (detection) {
          updateDetectionLocally({
            ...detection,
            assigned_material_id: materialId,
            material_cost_override: priceOverride,
            edited_at: new Date().toISOString(),
          });
        }
      });

      // Save to database directly
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('extraction_detections_draft')
        .update({
          assigned_material_id: materialId,
          material_cost_override: priceOverride,
          updated_at: new Date().toISOString()
        })
        .in('id', detectionIds);

      if (error) {
        console.error('[DetectionEditor] Failed to save material assignment with price to database:', error);
        toast.error('Failed to save material assignment');
      } else {
        console.log('[DetectionEditor] Material assignment with price saved to database successfully');
      }

      console.log(
        `[DetectionEditor] Assigned material ${materialId} with price override $${priceOverride} for ${detectionIds.length} detection(s)`
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
        // Skip global undo/redo when canvas is actively drawing - KonvaDetectionCanvas handles point-level undo
        if (key === 'z') {
          if (isCanvasDrawing) {
            // Let KonvaDetectionCanvas handle point-level undo during drawing
            return;
          }
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

        // Ctrl/Cmd + K = Toggle Plan Reader chatbot
        if (key === 'k') {
          e.preventDefault();
          planReaderRef.current?.toggle();
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
      // Region AI Detect shortcut
      if (key === 'r') {
        e.preventDefault();
        setToolMode('region_detect');
        return;
      }
      // SAM Magic Select shortcut
      if (key === 'm') {
        e.preventDefault();
        setToolMode('sam_select');
        return;
      }

      // Delete selected detections
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Escape key: exit drawing/special modes, or clear selection
      if (key === 'escape') {
        e.preventDefault();
        // If in point, line, region detect, or SAM mode, exit to select mode
        if (toolMode === 'point' || toolMode === 'line' || toolMode === 'region_detect' || toolMode === 'sam_select') {
          // Cancel SAM if active
          if (toolMode === 'sam_select') {
            handleSAMCancel();
          }
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
  }, [selectedIds, canUndo, canRedo, undo, redo, hasUnsavedChanges, isValidating, handleValidate, handleVerifySelected, handleDeleteSelected, handleZoomIn, handleZoomOut, handleZoomReset, toolMode, isCanvasDrawing]);

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

    // Start with base filtering (deleted status and roof exclusion)
    let filtered = showDeleted
      ? currentPageDetections.filter((d) => d.class !== 'roof')
      : currentPageDetections.filter((d) => d.status !== 'deleted' && d.class !== 'roof');

    // Apply confidence filtering if active
    if (minConfidence > 0 && !showLowConfidence) {
      // Hide low confidence detections entirely
      filtered = filtered.filter((d) => {
        const confidence = d.confidence ?? 1.0;
        return confidence >= minConfidence;
      });
    }

    return filtered;
  }, [currentPageDetections, showDeleted, showOriginalOnly, minConfidence, showLowConfidence]);

  // Compute detection counts for confidence filter UI
  const confidenceFilterCounts = useMemo(() => {
    const baseDetections = showDeleted
      ? currentPageDetections.filter((d) => d.class !== 'roof')
      : currentPageDetections.filter((d) => d.status !== 'deleted' && d.class !== 'roof');

    const aboveThreshold = baseDetections.filter((d) => {
      const confidence = d.confidence ?? 1.0;
      return confidence >= minConfidence;
    });

    return {
      total: baseDetections.length,
      aboveThreshold: aboveThreshold.length,
    };
  }, [currentPageDetections, showDeleted, minConfidence]);

  // Combine pending detections from region detect and SAM for canvas display
  // (Claude assistant is now text-only, no longer produces pending detections)
  const combinedPendingDetections = useMemo(() => {
    const regionPending = regionPendingDetections.map(d => ({
      id: d.id,
      class: d.class,
      pixel_x: d.pixel_x,
      pixel_y: d.pixel_y,
      pixel_width: d.pixel_width,
      pixel_height: d.pixel_height,
      polygon_points: d.polygon_points as PolygonPoint[] | undefined,
      confidence: d.confidence,
    }));

    const samPending = samPendingDetections.map(d => ({
      id: d.id,
      class: d.class,
      pixel_x: d.pixel_x,
      pixel_y: d.pixel_y,
      pixel_width: d.pixel_width,
      pixel_height: d.pixel_height,
      polygon_points: d.polygon_points as PolygonPoint[] | undefined,
      confidence: d.confidence,
    }));

    return [...regionPending, ...samPending];
  }, [regionPendingDetections, samPendingDetections]);

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
      // BELLY BAND (line)
      bellyBandCount: 0,
      bellyBandLf: 0,
      // GUTTERS
      gutterCount: 0,
      gutterLf: 0,
      downspoutCount: 0,
      // SIDING (net area = building - openings)
      sidingNetSf: 0,
      // COUNTS (point markers)
      countsByClass: {},
      totalPointCount: 0,
    };

    // Track total openings for net siding calculation
    let totalOpeningsSf = 0;

    // Collect exterior wall polygons for auto-calculating corners
    const exteriorWallPolygons: { points: PolygonPoint[], minX: number, maxX: number }[] = [];

    for (const detection of pageDetections) {
      const cls = detection.class as string;

      // Handle point markers (count markers) - these have markup_type === 'point'
      if (detection.markup_type === 'point') {
        // Group by class name (or use 'Count' as default label)
        const countLabel = cls || 'Count';
        totals.countsByClass[countLabel] = (totals.countsByClass[countLabel] || 0) + 1;
        totals.totalPointCount++;
        continue; // Points don't have area/perimeter measurements
      }

      // Get polygon points (use existing or convert from bounding box)
      // For polygons with holes (from split), use the outer boundary for measurements
      const simplePoints = getSimplePolygonPoints(detection.polygon_points);
      const points = simplePoints && simplePoints.length > 0
        ? simplePoints
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
      } else if (cls === 'belly_band') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.bellyBandCount++;
        totals.bellyBandLf += lineMeasurement.length_lf;
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

  // Calculate all pages totals (aggregate across all elevation pages)
  // IMPORTANT: Uses the same filtering as currentPageDetections to ensure consistency
  const allPagesTotals = useMemo((): LiveDerivedTotals | null => {
    // Only include elevation pages that have been calibrated (scale_ratio !== 48)
    // The default uncalibrated scale_ratio is 48, which causes incorrect calculations
    // when mixed with properly calibrated pages
    const DEFAULT_UNCALIBRATED_SCALE = 48;
    const elevationPages = pages.filter(
      (p) => p.page_type === 'elevation' &&
             p.scale_ratio &&
             p.scale_ratio > 0 &&
             p.scale_ratio !== DEFAULT_UNCALIBRATED_SCALE
    );

    if (elevationPages.length === 0) {
      // No calibrated pages - return null to disable "All" tab
      return null;
    }

    // Helper function to filter detections the same way as currentPageDetections
    // This excludes building/exterior_wall/roof classes which are hidden from UI
    const filterDetectionsForPage = (pageId: string): ExtractionDetection[] => {
      const pageDetections = detections.get(pageId) || [];
      return pageDetections.filter((d) => {
        const cls = d.class as string;
        // Same filter as currentPageDetections in useExtractionData
        if (cls === 'exterior_wall' || cls === 'building' || cls === 'roof') return false;
        if (d.status === 'deleted') return false;
        return true;
      });
    };

    // Initialize aggregate totals
    const aggregateTotals: LiveDerivedTotals = {
      buildingCount: 0,
      buildingAreaSf: 0,
      buildingPerimeterLf: 0,
      buildingLevelStarterLf: 0,
      windowCount: 0,
      windowAreaSf: 0,
      windowPerimeterLf: 0,
      windowHeadLf: 0,
      windowJambLf: 0,
      windowSillLf: 0,
      doorCount: 0,
      doorAreaSf: 0,
      doorPerimeterLf: 0,
      doorHeadLf: 0,
      doorJambLf: 0,
      garageCount: 0,
      garageAreaSf: 0,
      garagePerimeterLf: 0,
      garageHeadLf: 0,
      garageJambLf: 0,
      gableCount: 0,
      gableAreaSf: 0,
      gableRakeLf: 0,
      insideCornerCount: 0,
      insideCornerLf: 0,
      outsideCornerCount: 0,
      outsideCornerLf: 0,
      eavesCount: 0,
      eavesLf: 0,
      rakesCount: 0,
      rakesLf: 0,
      ridgeCount: 0,
      ridgeLf: 0,
      valleyCount: 0,
      valleyLf: 0,
      soffitCount: 0,
      soffitAreaSf: 0,
      fasciaCount: 0,
      fasciaLf: 0,
      bellyBandCount: 0,
      bellyBandLf: 0,
      gutterCount: 0,
      gutterLf: 0,
      downspoutCount: 0,
      sidingNetSf: 0,
      countsByClass: {},
      totalPointCount: 0,
    };

    // Process each elevation page
    for (const page of elevationPages) {
      const scaleRatio = page.scale_ratio!;
      // Use the same filtering as currentPageDetections for consistency
      const pageDetections = filterDetectionsForPage(page.id);

      let pageOpeningsSf = 0;
      let pageBuildingAreaSf = 0;

      for (const detection of pageDetections) {
        const cls = detection.class as string;

        // Handle point markers
        if (detection.markup_type === 'point') {
          const countLabel = cls || 'Count';
          aggregateTotals.countsByClass[countLabel] = (aggregateTotals.countsByClass[countLabel] || 0) + 1;
          aggregateTotals.totalPointCount++;
          continue;
        }

        // Get polygon points (handle both simple and polygon-with-holes formats)
        const simplePoints = getSimplePolygonPoints(detection.polygon_points);
        const points = simplePoints && simplePoints.length > 0
          ? simplePoints
          : rectToPolygonPoints({
              pixel_x: detection.pixel_x,
              pixel_y: detection.pixel_y,
              pixel_width: detection.pixel_width,
              pixel_height: detection.pixel_height,
            });

        // Building/Facade
        if (cls === 'building' || cls === 'exterior_wall' || cls === 'exterior wall') {
          const measurements = calculateBuildingMeasurements(points, scaleRatio);
          aggregateTotals.buildingCount++;
          aggregateTotals.buildingAreaSf += measurements.area_sf;
          aggregateTotals.buildingPerimeterLf += measurements.perimeter_lf;
          aggregateTotals.buildingLevelStarterLf += measurements.level_starter_lf;
          pageBuildingAreaSf += measurements.area_sf;
          continue;
        }

        const derived = getClassDerivedMeasurements(cls, points, scaleRatio);
        const areaMeasurement = calculateAreaMeasurements(points, scaleRatio);

        if (cls === 'window' && derived && 'head_lf' in derived) {
          aggregateTotals.windowCount++;
          aggregateTotals.windowAreaSf += areaMeasurement.area_sf;
          aggregateTotals.windowPerimeterLf += areaMeasurement.perimeter_lf;
          aggregateTotals.windowHeadLf += derived.head_lf;
          aggregateTotals.windowJambLf += derived.jamb_lf;
          aggregateTotals.windowSillLf += (derived as { sill_lf?: number }).sill_lf || 0;
          pageOpeningsSf += areaMeasurement.area_sf;
        } else if (cls === 'door' && derived && 'head_lf' in derived) {
          aggregateTotals.doorCount++;
          aggregateTotals.doorAreaSf += areaMeasurement.area_sf;
          aggregateTotals.doorPerimeterLf += areaMeasurement.perimeter_lf;
          aggregateTotals.doorHeadLf += derived.head_lf;
          aggregateTotals.doorJambLf += derived.jamb_lf;
          pageOpeningsSf += areaMeasurement.area_sf;
        } else if (cls === 'garage' && derived && 'head_lf' in derived) {
          aggregateTotals.garageCount++;
          aggregateTotals.garageAreaSf += areaMeasurement.area_sf;
          aggregateTotals.garagePerimeterLf += areaMeasurement.perimeter_lf;
          aggregateTotals.garageHeadLf += derived.head_lf;
          aggregateTotals.garageJambLf += derived.jamb_lf;
          pageOpeningsSf += areaMeasurement.area_sf;
        } else if (cls === 'gable' && derived && 'rake_lf' in derived) {
          aggregateTotals.gableCount++;
          aggregateTotals.gableAreaSf += areaMeasurement.area_sf;
          aggregateTotals.gableRakeLf += derived.rake_lf;
        } else if (cls === 'soffit') {
          aggregateTotals.soffitCount++;
          aggregateTotals.soffitAreaSf += areaMeasurement.area_sf;
        } else if (cls === 'inside_corner' || cls === 'inside corner') {
          const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
          aggregateTotals.insideCornerCount++;
          aggregateTotals.insideCornerLf += lineMeasurement.length_lf;
        } else if (cls === 'outside_corner' || cls === 'outside corner') {
          const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
          aggregateTotals.outsideCornerCount++;
          aggregateTotals.outsideCornerLf += lineMeasurement.length_lf;
        } else if (cls === 'fascia') {
          const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
          aggregateTotals.fasciaCount++;
          aggregateTotals.fasciaLf += lineMeasurement.length_lf;
        } else if (cls === 'belly_band') {
          const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
          aggregateTotals.bellyBandCount++;
          aggregateTotals.bellyBandLf += lineMeasurement.length_lf;
        } else if (cls === 'gutter') {
          const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
          aggregateTotals.gutterCount++;
          aggregateTotals.gutterLf += lineMeasurement.length_lf;
        } else if (cls === 'downspout') {
          aggregateTotals.downspoutCount++;
        }

        // Line-type detections (roof elements)
        if (cls === 'eave' || cls === 'roof_eave') {
          const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
          aggregateTotals.eavesCount++;
          aggregateTotals.eavesLf += lineMeasurement.length_lf;
        } else if (cls === 'rake' || cls === 'roof_rake') {
          const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
          aggregateTotals.rakesCount++;
          aggregateTotals.rakesLf += lineMeasurement.length_lf;
        } else if (cls === 'ridge' || cls === 'roof_ridge') {
          const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
          aggregateTotals.ridgeCount++;
          aggregateTotals.ridgeLf += lineMeasurement.length_lf;
        } else if (cls === 'valley' || cls === 'roof_valley') {
          const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
          aggregateTotals.valleyCount++;
          aggregateTotals.valleyLf += lineMeasurement.length_lf;
        }
      }

      // Add page's net siding to aggregate
      aggregateTotals.sidingNetSf += Math.max(0, pageBuildingAreaSf - pageOpeningsSf);
    }

    return aggregateTotals;
  }, [pages, detections]);

  // ============================================================================
  // Material Assignment Helpers (for ID-based pricing) - V2 FIXED
  // ============================================================================

  /**
   * Determine the quantity unit based on detection class
   * V2: Handle both space and underscore in class names
   */
  const getUnitForClass = (detectionClass: string): 'SF' | 'LF' | 'EA' => {
    // Normalize: lowercase and replace spaces with underscores
    const normalized = detectionClass.toLowerCase().replace(/\s+/g, '_');

    const areaClasses = [
      'siding', 'exterior_wall', 'exterior_walls',
      'window', 'door', 'garage',
      'roof', 'gable', 'soffit', 'wall'
    ];
    const linearClasses = [
      'trim', 'fascia', 'gutter', 'downspout',
      'eave', 'rake', 'ridge', 'valley',
      'corner_inside', 'corner_outside', 'belly_band',
      'outside_corner', 'inside_corner'
    ];

    if (areaClasses.some(c => normalized.includes(c))) return 'SF';
    if (linearClasses.some(c => normalized.includes(c))) return 'LF';
    return 'EA';
  };

  /**
   * Calculate quantity based on detection class and measurements
   * V3: Calculate from pixel dimensions when area_sf/perimeter_lf is null
   * Falls back to stored values if available, otherwise calculates from pixels + scale
   */
  const calculateQuantityForDetection = (
    detection: ExtractionDetection,
    unit: 'SF' | 'LF' | 'EA',
    scaleRatio?: number
  ): number => {
    // Get scale - use passed value, page scale, or fallback to 48 (1/4"=1'-0" at 200 DPI)
    const scale = scaleRatio || currentPage?.scale_ratio || 48;

    switch (unit) {
      case 'SF': {
        // First try stored area_sf
        if (detection.area_sf && detection.area_sf > 0) {
          console.log(`[Qty] ${detection.class}: area_sf=${detection.area_sf.toFixed(2)} (stored)`);
          return detection.area_sf;
        }

        // Calculate from pixel dimensions
        if (detection.pixel_width && detection.pixel_height && scale > 0) {
          const widthFt = Number(detection.pixel_width) / scale;
          const heightFt = Number(detection.pixel_height) / scale;
          const areaSF = widthFt * heightFt;
          console.log(`[Qty] ${detection.class}: area_sf=${areaSF.toFixed(2)} (calculated: ${detection.pixel_width}×${detection.pixel_height}px @ ${scale.toFixed(1)}px/ft)`);
          return areaSF;
        }

        console.warn(`[Qty] ${detection.class}: area_sf=0 (no dimensions or scale)`);
        return 0;
      }

      case 'LF': {
        // First try stored perimeter_lf or linear_ft
        const storedLinear = detection.perimeter_lf || (detection as unknown as { linear_ft?: number }).linear_ft;
        if (storedLinear && storedLinear > 0) {
          console.log(`[Qty] ${detection.class}: perimeter_lf=${storedLinear.toFixed(2)} (stored)`);
          return storedLinear;
        }

        // Calculate from pixel dimensions - use longer dimension for linear items
        if (detection.pixel_width && detection.pixel_height && scale > 0) {
          const widthFt = Number(detection.pixel_width) / scale;
          const heightFt = Number(detection.pixel_height) / scale;
          const linearFt = Math.max(widthFt, heightFt);
          console.log(`[Qty] ${detection.class}: linear_ft=${linearFt.toFixed(2)} (calculated from pixels)`);
          return linearFt;
        }

        console.warn(`[Qty] ${detection.class}: linear_ft=0 (no dimensions or scale)`);
        return 0;
      }

      case 'EA':
        return 1;

      default:
        return detection.area_sf || 1;
    }
  };

  /**
   * Build material assignments from detections with assigned materials
   * V3: Calculate quantities from pixel dimensions when area_sf is null
   */
  const buildMaterialAssignments = (
    detections: ExtractionDetection[]
  ): MaterialAssignment[] => {
    console.log('[MaterialAssignments] ═══════════════════════════════════');
    console.log(`[MaterialAssignments] Total detections: ${detections.length}`);

    const withMaterials = detections.filter(d =>
      d.assigned_material_id &&
      d.status !== 'deleted'
    );

    console.log(`[MaterialAssignments] With assigned materials: ${withMaterials.length}`);

    if (withMaterials.length === 0) {
      console.warn('[MaterialAssignments] ⚠️ No detections have assigned materials!');
      console.log('[MaterialAssignments] Sample detections:');
      detections.slice(0, 3).forEach(d => {
        console.log(`  - ${d.class}: assigned_material_id=${d.assigned_material_id}, status=${d.status}`);
      });
    }

    const assignments = withMaterials.map(d => {
      const unit = getUnitForClass(d.class);

      // Get scale for this detection's page
      const detectionPage = pages?.find(p => p.id === d.page_id);
      const scale = detectionPage?.scale_ratio || currentPage?.scale_ratio || 48;
      const quantity = calculateQuantityForDetection(d, unit, scale);

      // Log with price override info if present
      const priceInfo = d.material_cost_override !== null && d.material_cost_override !== undefined
        ? ` (price override: $${d.material_cost_override})`
        : '';
      console.log(`[MaterialAssignments] ✅ ${d.class}: ${quantity.toFixed(2)} ${unit} → pricing_item_id: ${d.assigned_material_id}${priceInfo}`);

      return {
        detection_id: d.id,
        detection_class: d.class,
        pricing_item_id: d.assigned_material_id!,
        quantity,
        unit,
        area_sf: d.area_sf,
        perimeter_lf: d.perimeter_lf,
        // Include price overrides for user-edited prices
        material_cost_override: d.material_cost_override ?? null,
        labor_cost_override: d.labor_cost_override ?? null,
      };
    });

    console.log(`[MaterialAssignments] Built ${assignments.length} assignments`);
    console.log('[MaterialAssignments] ═══════════════════════════════════');

    return assignments;
  };

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

      // Build enriched detection_counts from countsByClass
      const detectionCounts: Record<string, {
        count: number;
        total_lf?: number;
        total_sf?: number;
        display_name: string;
        measurement_type: 'count' | 'area' | 'linear';
        unit: string;
      }> = {};

      // Add point-type detections from countsByClass
      if (totals.countsByClass) {
        Object.entries(totals.countsByClass).forEach(([className, count]) => {
          if (count > 0) {
            const info = CLASS_COUNT_INFO[className] || {
              display_name: className.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              measurement_type: 'count' as const,
              unit: 'EA'
            };

            detectionCounts[className] = {
              count: count as number,
              display_name: info.display_name,
              measurement_type: info.measurement_type,
              unit: info.unit
            };
          }
        });
      }

      // Add linear measurements (not in countsByClass, have dedicated fields)
      // These are line-type detections that have both count and total_lf
      const linearDetections = [
        { key: 'belly_band', count: totals.bellyBandCount, lf: totals.bellyBandLf },
        { key: 'fascia', count: totals.fasciaCount, lf: totals.fasciaLf },
        { key: 'gutter', count: totals.gutterCount, lf: totals.gutterLf },
        { key: 'eave', count: totals.eavesCount, lf: totals.eavesLf },
        { key: 'rake', count: totals.rakesCount, lf: totals.rakesLf },
        { key: 'ridge', count: totals.ridgeCount, lf: totals.ridgeLf },
        { key: 'valley', count: totals.valleyCount, lf: totals.valleyLf },
      ];

      linearDetections.forEach(({ key, count, lf }) => {
        if (count > 0) {
          const info = CLASS_COUNT_INFO[key] || {
            display_name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            measurement_type: 'linear' as const,
            unit: 'LF'
          };
          detectionCounts[key] = {
            count,
            total_lf: lf,
            display_name: info.display_name,
            measurement_type: info.measurement_type,
            unit: info.unit
          };
        }
      });

      // Add soffit as an area measurement
      if (totals.soffitCount > 0) {
        const soffitInfo = CLASS_COUNT_INFO['soffit'] || {
          display_name: 'Soffit',
          measurement_type: 'area' as const,
          unit: 'SF'
        };
        detectionCounts['soffit'] = {
          count: totals.soffitCount,
          total_sf: totals.soffitAreaSf,
          display_name: soffitInfo.display_name,
          measurement_type: soffitInfo.measurement_type,
          unit: soffitInfo.unit
        };
      }

      // Add downspout as a count measurement
      if (totals.downspoutCount > 0) {
        const downspoutInfo = CLASS_COUNT_INFO['downspout'] || {
          display_name: 'Downspout',
          measurement_type: 'count' as const,
          unit: 'EA'
        };
        detectionCounts['downspout'] = {
          count: totals.downspoutCount,
          display_name: downspoutInfo.display_name,
          measurement_type: downspoutInfo.measurement_type,
          unit: downspoutInfo.unit
        };
      }

      console.log('[Approve] Detection counts:', detectionCounts);

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

        // NEW: Include material assignments for ID-based pricing
        material_assignments: buildMaterialAssignments(allDetections),

        // NEW: Include organization_id for multi-tenant pricing overrides
        organization_id: organization?.id,

        // Detection counts by class (corbels, brackets, belly_bands, etc.)
        detection_counts: Object.keys(detectionCounts).length > 0 ? detectionCounts : undefined,

        // Total point markers count
        total_point_count: totals.totalPointCount > 0 ? totals.totalPointCount : undefined,
      };
    },
    [jobId, projectId, job?.project_name, getAllDetections, organization?.id]
  );

  // Re-detect page handler
  const handleRedetect = useCallback(async () => {
    if (!currentPageId) {
      toast.error('No page selected');
      return;
    }

    setIsRedetecting(true);
    toast.info('Re-running AI detection...', { duration: 3000 });

    try {
      const response = await fetch('/api/redetect-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: currentPageId,
          min_confidence: minConfidence,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 501) {
          toast.error('Re-detection feature pending backend implementation');
        } else {
          toast.error(result.error || 'Failed to re-detect page');
        }
        return;
      }

      if (result.success) {
        toast.success(`Re-detected ${result.detection_count} objects`);
        // Refresh data to show new detections
        await refresh();
      } else {
        toast.error(result.error || 'Re-detection failed');
      }
    } catch (error) {
      console.error('[ReDetect] Error:', error);
      toast.error('Failed to re-detect page');
    } finally {
      setIsRedetecting(false);
    }
  }, [currentPageId, minConfidence, refresh]);

  // Region Detect: Handle region selection from canvas
  const handleRegionSelected = useCallback(async (region: DetectionRegion) => {
    console.log('[DetectionEditor] Region selected:', region);
    await regionDetect.detectRegion(region);
  }, [regionDetect]);

  // Region Detect: Accept a single pending detection
  const handleRegionDetectionAccepted = useCallback((detection: RegionDetectionResult) => {
    const scaleRatio = currentPage?.scale_ratio || 64;

    // Calculate area and perimeter from pixel dimensions
    const widthFt = detection.pixel_width / scaleRatio;
    const heightFt = detection.pixel_height / scaleRatio;
    const area_sf = widthFt * heightFt;
    const perimeter_lf = 2 * (widthFt + heightFt);

    // Create polygon points from bounds if not provided
    // NOTE: pixel_x, pixel_y are CENTER coordinates (same as Roboflow detections)
    const halfWidth = detection.pixel_width / 2;
    const halfHeight = detection.pixel_height / 2;
    const polygon_points = detection.polygon_points || [
      { x: detection.pixel_x - halfWidth, y: detection.pixel_y - halfHeight },  // top-left
      { x: detection.pixel_x + halfWidth, y: detection.pixel_y - halfHeight },  // top-right
      { x: detection.pixel_x + halfWidth, y: detection.pixel_y + halfHeight },  // bottom-right
      { x: detection.pixel_x - halfWidth, y: detection.pixel_y + halfHeight },  // bottom-left
    ];

    // Generate UUID for new detection
    const tempId = crypto.randomUUID();

    // Create full ExtractionDetection object
    const newDetection: ExtractionDetection = {
      id: tempId,
      job_id: job?.id || '',
      page_id: currentPage?.id || '',
      class: detection.class,
      detection_index: currentPageDetections.length,
      confidence: detection.confidence,
      pixel_x: detection.pixel_x,
      pixel_y: detection.pixel_y,
      pixel_width: detection.pixel_width,
      pixel_height: detection.pixel_height,
      real_width_ft: widthFt,
      real_height_ft: heightFt,
      real_width_in: widthFt * 12,
      real_height_in: heightFt * 12,
      area_sf,
      perimeter_lf,
      is_triangle: false,
      matched_tag: null,
      created_at: new Date().toISOString(),
      status: 'auto',
      edited_by: null,
      edited_at: new Date().toISOString(),
      original_bbox: null,
      polygon_points,
      markup_type: 'polygon',
    };

    addDetectionLocally(newDetection);

    // Remove from pending
    setRegionPendingDetections(prev => prev.filter(d => d.id !== detection.id));
    toast.success(`Added ${detection.class} detection`);
  }, [currentPage?.scale_ratio, currentPage?.id, job?.id, currentPageDetections.length, addDetectionLocally]);

  // Region Detect: Reject a single pending detection
  const handleRegionDetectionRejected = useCallback((detectionId: string) => {
    setRegionPendingDetections(prev => prev.filter(d => d.id !== detectionId));
  }, []);

  // Region Detect: Accept all pending detections
  const handleRegionAllDetectionsAccepted = useCallback(() => {
    regionPendingDetections.forEach(detection => handleRegionDetectionAccepted(detection));
    toast.success(`Added ${regionPendingDetections.length} detections`);
  }, [regionPendingDetections, handleRegionDetectionAccepted]);

  // Region Detect: Clear all pending detections
  const handleRegionClearPending = useCallback(() => {
    setRegionPendingDetections([]);
  }, []);

  // SAM Magic Select: Handle click on canvas
  const handleSAMClick = useCallback(async (point: { x: number; y: number }) => {
    console.log('[DetectionEditor] SAM click at:', point);
    await samSegment.segment(point);
  }, [samSegment]);

  // SAM Magic Select: Handle class selection from picker
  const handleSAMClassSelect = useCallback((cls: DetectionClass) => {
    console.log('[DetectionEditor] SAM class selected:', cls);
    samSegment.confirmWithClass(cls);
  }, [samSegment]);

  // SAM Magic Select: Cancel current segmentation
  const handleSAMCancel = useCallback(() => {
    samSegment.cancel();
    setSamClassPickerPosition(null);
  }, [samSegment]);

  // SAM Magic Select: Accept a single pending detection
  const handleSAMDetectionAccepted = useCallback((detection: SAMPendingDetection) => {
    const scaleRatio = currentPage?.scale_ratio || 64;

    // Calculate area and perimeter from polygon points
    const { area_sf, perimeter_lf } = calculateAreaMeasurements(
      detection.polygon_points,
      scaleRatio
    );

    // Generate UUID for new detection
    const tempId = crypto.randomUUID();

    // Create full ExtractionDetection object
    const newDetection: ExtractionDetection = {
      id: tempId,
      job_id: job?.id || '',
      page_id: currentPage?.id || '',
      class: detection.class,
      detection_index: currentPageDetections.length,
      confidence: detection.confidence,
      pixel_x: detection.pixel_x,
      pixel_y: detection.pixel_y,
      pixel_width: detection.pixel_width,
      pixel_height: detection.pixel_height,
      real_width_ft: detection.pixel_width / scaleRatio,
      real_height_ft: detection.pixel_height / scaleRatio,
      real_width_in: (detection.pixel_width / scaleRatio) * 12,
      real_height_in: (detection.pixel_height / scaleRatio) * 12,
      area_sf,
      perimeter_lf,
      is_triangle: false,
      matched_tag: null,
      created_at: new Date().toISOString(),
      status: 'auto',
      edited_by: null,
      edited_at: new Date().toISOString(),
      original_bbox: null,
      polygon_points: detection.polygon_points,
      markup_type: 'polygon',
    };

    addDetectionLocally(newDetection);

    // Remove from pending
    setSamPendingDetections(prev => prev.filter(d => d.id !== detection.id));
    toast.success(`Added ${detection.class} detection (SAM)`);
  }, [currentPage?.scale_ratio, currentPage?.id, job?.id, currentPageDetections.length, addDetectionLocally]);

  // SAM Magic Select: Reject a single pending detection
  const handleSAMDetectionRejected = useCallback((detectionId: string) => {
    setSamPendingDetections(prev => prev.filter(d => d.id !== detectionId));
  }, []);

  // SAM Magic Select: Accept all pending detections
  const handleSAMAllDetectionsAccepted = useCallback(() => {
    samPendingDetections.forEach(detection => handleSAMDetectionAccepted(detection));
    toast.success(`Added ${samPendingDetections.length} SAM detections`);
  }, [samPendingDetections, handleSAMDetectionAccepted]);

  // SAM Magic Select: Clear all pending detections
  const handleSAMClearPending = useCallback(() => {
    setSamPendingDetections([]);
  }, []);

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
      console.log('[Approve] Material assignments:', payload.material_assignments?.length || 0);
      if (payload.material_assignments?.length) {
        console.log('[Approve] Sample assignment:', payload.material_assignments[0]);
        // Log assignments with price overrides
        const withOverrides = payload.material_assignments.filter(
          a => a.material_cost_override !== null || a.labor_cost_override !== null
        );
        if (withOverrides.length > 0) {
          console.log(`[Approve] Assignments with price overrides: ${withOverrides.length}`);
          withOverrides.forEach(a => {
            console.log(`  - ${a.detection_class}: material=$${a.material_cost_override}, labor=$${a.labor_cost_override}`);
          });
        }
      }

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

        // Parse V2 response format (Mike Skjei methodology)
        if (isV2Response(data)) {
          console.log('✅ Received V2 response with project_totals');

          // Set the new state for V2 data
          setLaborSection(data.labor);
          setOverheadSection(data.overhead);
          setProjectTotals(data.project_totals);

          // Log for debugging
          console.log('📊 Project Totals:', data.project_totals);
          console.log('👷 Labor Items:', data.labor?.installation_items?.length || 0);
          console.log('🏗️ Overhead Items:', data.overhead?.items?.length || 0);

          // Check for warnings in metadata
          const metadata = (data as { metadata?: { warnings?: string[] } }).metadata;
          if (metadata?.warnings?.length) {
            console.warn('⚠️ Calculation warnings:', metadata.warnings);
          }
        } else {
          console.log('⚠️ Received legacy response format (no project_totals)');
          // Clear V2 state if using legacy format
          setLaborSection(undefined);
          setOverheadSection(undefined);
          setProjectTotals(undefined);
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

  // ==========================================================================
  // Export to Bluebeam Handler
  // ==========================================================================

  const handleExportBluebeam = useCallback(async () => {
    if (!jobId) {
      toast.error('No job ID available');
      return;
    }

    setIsExportingBluebeam(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_EXTRACTION_API_URL || 'https://extraction-api-production.up.railway.app';

      const response = await fetch(`${apiUrl}/export-bluebeam`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: jobId,
          include_materials: true,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Export failed');
      }

      // Open the download URL in a new tab
      if (data.download_url) {
        window.open(data.download_url, '_blank');
        toast.success('Bluebeam PDF exported successfully');
      } else {
        throw new Error('No download URL returned');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Export failed');
      console.error('[ExportBluebeam] Error:', error);
      toast.error(`Failed to export to Bluebeam: ${error.message}`);
    } finally {
      if (isMountedRef.current) {
        setIsExportingBluebeam(false);
      }
    }
  }, [jobId]);

  // ==========================================================================
  // Download Markup Plans Handler
  // ==========================================================================

  const handleDownloadMarkupPlans = useCallback(async () => {
    if (!pages || pages.length === 0) {
      toast.error('No pages available to download');
      return;
    }

    // Filter to elevation pages only
    const elevationPages = pages.filter((p) => p.page_type === 'elevation');
    if (elevationPages.length === 0) {
      toast.error('No elevation pages found');
      return;
    }

    setIsDownloadingMarkup(true);

    try {
      // Get all detections to map by page
      const allDetections = getAllDetections();
      const detectionsByPage = new Map<string, ExtractionDetection[]>();
      for (const det of allDetections) {
        if (det.status !== 'deleted') {
          if (!detectionsByPage.has(det.page_id)) {
            detectionsByPage.set(det.page_id, []);
          }
          detectionsByPage.get(det.page_id)!.push(det);
        }
      }

      // Create zip file
      const zip = new JSZip();
      const folder = zip.folder('markup_plans');

      toast.info(`Rendering ${elevationPages.length} elevation pages with detections...`);

      // Render each page with detection overlays
      for (let i = 0; i < elevationPages.length; i++) {
        const page = elevationPages[i];
        const imageUrl = page.original_image_url || page.image_url;

        if (!imageUrl) {
          console.warn(`[Download] Page ${page.page_number} has no image URL, skipping`);
          continue;
        }

        try {
          toast.info(`Rendering ${page.elevation_name || `page ${page.page_number}`}...`);

          // Get detections for this page and convert to render format
          // For polygons with holes, use the outer boundary for rendering
          const pageDetections = detectionsByPage.get(page.id) || [];
          const detectionsForRender = pageDetections.map((d) => ({
            class: d.class,
            pixel_x: d.pixel_x,
            pixel_y: d.pixel_y,
            pixel_width: d.pixel_width,
            pixel_height: d.pixel_height,
            polygon_points: getSimplePolygonPoints(d.polygon_points),
          }));

          // Render detections onto the image
          const markupBlob = await renderMarkupImage(
            imageUrl,
            detectionsForRender,
            page.elevation_name
          );

          // Create filename from elevation name or page number
          const elevationLabel = page.elevation_name
            ? page.elevation_name.replace(/[^a-z0-9]/gi, '_')
            : `page_${page.page_number}`;
          const filename = `elevation_${String(i + 1).padStart(2, '0')}_${elevationLabel}_markup.png`;

          folder?.file(filename, markupBlob);
        } catch (imgErr) {
          console.error(`[Download] Error rendering page ${page.page_number}:`, imgErr);
          // Continue with other pages
        }
      }

      // Generate and download the zip
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const projectName = job?.project_name?.replace(/[^a-z0-9]/gi, '_') || 'project';
      const zipFilename = `${projectName}_markup_plans_${new Date().toISOString().split('T')[0]}.zip`;

      saveAs(zipBlob, zipFilename);
      toast.success(`Downloaded ${elevationPages.length} markup plans with detection overlays!`);
    } catch (err) {
      console.error('[Download] Markup plans error:', err);
      toast.error('Failed to download markup plans');
    } finally {
      setIsDownloadingMarkup(false);
    }
  }, [pages, job?.project_name, getAllDetections]);

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
            // Bluebeam export props
            onExportBluebeam={handleExportBluebeam}
            isExportingBluebeam={isExportingBluebeam}
            canExportBluebeam={!!approvalResult}
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
              onDownloadMarkupPlans={handleDownloadMarkupPlans}
              isDownloadingMarkup={isDownloadingMarkup}
              selectedCount={selectedIds.size}
            />

            {/* Canvas Area - flex-1 with min-h-0 allows proper flex shrinking */}
            <div ref={canvasContainerRef} className="flex-1 relative min-h-0">
              {/* Floating Controls - Confidence Filter & Claude Assistant */}
              {!showMarkup && !showOriginalOnly && (
                <div className="absolute top-3 left-3 z-50 flex items-center gap-2">
                  <ConfidenceFilter
                    minConfidence={minConfidence}
                    onMinConfidenceChange={setMinConfidence}
                    showLowConfidence={showLowConfidence}
                    onShowLowConfidenceChange={setShowLowConfidence}
                    onRedetect={handleRedetect}
                    isRedetecting={isRedetecting}
                    totalCount={confidenceFilterCounts.total}
                    aboveThresholdCount={confidenceFilterCounts.aboveThreshold}
                    isActive={isConfidenceFilterActive}
                  />
                </div>
              )}

              {/* Region Detection Pending Panel - appears when there are region pending detections */}
              {regionPendingDetections.length > 0 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[300px] max-w-[400px]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Region Detections ({regionPendingDetections.length})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleRegionAllDetectionsAccepted}
                        className="px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                      >
                        Accept All
                      </button>
                      <button
                        type="button"
                        onClick={handleRegionClearPending}
                        className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {regionPendingDetections.map((detection) => (
                      <div
                        key={detection.id}
                        className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: '#3b82f6' }}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-200 capitalize">
                            {detection.class.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {Math.round(detection.confidence * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRegionDetectionAccepted(detection)}
                            className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                            title="Accept"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRegionDetectionRejected(detection.id)}
                            className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                            title="Reject"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {regionDetect.isDetecting && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Detecting in region...</span>
                    </div>
                  )}
                </div>
              )}

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
                    key={currentPage.id}
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
                    onMultiSelect={handleMultiSelect}
                    onDetectionMove={handleDetectionMove}
                    onDetectionResize={handleDetectionResize}
                    onDetectionCreate={handleDetectionCreate}
                    onDetectionPolygonUpdate={handleDetectionPolygonUpdate}
                    onCalibrationComplete={handleCalibrationComplete}
                    onExitDrawingMode={() => setToolMode('select')}
                    multiSelectMode={multiSelectMode}
                    containerWidth={canvasContainerSize.width}
                    containerHeight={canvasContainerSize.height}
                    onSplitDetection={handleSplitDetection}
                    pdfUrl={job?.source_pdf_url}
                    onDrawingStateChange={setIsCanvasDrawing}
                    onDetectionContextMenu={handleDetectionContextMenu}
                    isDetectionDimmed={(d) => {
                      // Show as dimmed if below threshold AND showLowConfidence is enabled
                      if (!showLowConfidence) return false; // Hidden, not dimmed
                      const confidence = d.confidence ?? 1.0;
                      return confidence < minConfidence;
                    }}
                    pendingDetections={combinedPendingDetections}
                    onRegionSelected={handleRegionSelected}
                    isRegionDetecting={regionDetect.isDetecting}
                    onSAMClick={handleSAMClick}
                    isSAMSegmenting={samSegment.isSegmenting}
                    samResult={samSegment.currentResult}
                    samClickPoints={samSegment.clickPoints}
                  />

                  {/* SAM Class Picker Overlay */}
                  {(samSegment.currentResult || samSegment.isSegmenting || samSegment.isFeatureDisabled || samSegment.error) && (
                    <SAMClassPicker
                      isLoading={samSegment.isSegmenting}
                      polygonPointCount={samSegment.currentResult?.polygon_points?.length || 0}
                      onSelectClass={handleSAMClassSelect}
                      onCancel={handleSAMCancel}
                      position={samClassPickerPosition || undefined}
                      isVisible={true}
                      isFeatureDisabled={samSegment.isFeatureDisabled}
                      errorMessage={samSegment.error}
                      alternatives={samSegment.alternatives}
                    />
                  )}
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

            {/* Sidebar - pages, properties, and totals (resizable) */}
            <div
              className="relative flex-shrink-0 border-l border-gray-200 dark:border-gray-700"
              style={{ width: sidebarWidth }}
            >
              {/* Resize handle on left edge */}
              <ResizeHandle
                direction="left"
                isResizing={isSidebarResizing}
                onMouseDown={handleSidebarResizeStart}
              />
              <DetectionSidebar
                pages={pages}
                currentPageId={currentPageId}
                onPageSelect={setCurrentPageId}
                detections={currentPageDetections}
                selectedDetections={selectedDetections}
                onClassChange={handleClassChange}
                onColorChange={handleColorChange}
                onStatusChange={handleStatusChange}
                onMaterialAssign={handleMaterialAssign}
                onNotesChange={handleNotesChange}
                onPriceOverride={handlePriceOverride}
                onMaterialAssignWithPrice={handleMaterialAssignWithPrice}
                pixelsPerFoot={currentPage?.scale_ratio || 64}
                multiSelectMode={multiSelectMode}
                onMultiSelectModeChange={setMultiSelectMode}
                liveDerivedTotals={liveDerivedTotals}
                allPagesTotals={allPagesTotals}
                job={job}
                jobTotals={jobTotals}
              />
            </div>
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

      {/* Approval Results Panel - Clean Summary View */}
      {showApprovalResults && approvalResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="relative px-6 pt-6 pb-4">
              <button
                type="button"
                onClick={() => setShowApprovalResults(false)}
                className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mb-3 ring-4 ring-green-50 dark:ring-green-900/30">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Takeoff Created
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {approvalResult?.trades_processed?.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') || 'Siding'}
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6 space-y-5">
              {/* Line Items Count */}
              <div className="text-center py-3">
                <p className="text-4xl font-bold text-gray-900 dark:text-white">
                  {approvalResult?.line_items_created ?? 0}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  line items created
                  {(approvalResult?.line_items_failed ?? 0) > 0 && (
                    <span className="text-amber-500 ml-1">
                      ({approvalResult.line_items_failed} failed)
                    </span>
                  )}
                </p>
              </div>

              {/* Cost Summary Card */}
              {/* NOTE: Display BASE costs (before markup) to match Estimate page */}
              {/* material_cost = base, material_total = with markup */}
              {/* installation_labor_subtotal = base labor, labor_total = with markup */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Materials Row - Use base material_cost, not marked-up material_total */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Materials</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-white">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                      projectTotals?.material_cost ?? approvalResult?.totals?.material_cost ?? 0
                    )}
                  </span>
                </div>
                {/* Labor Row - Use base installation_labor_subtotal, not marked-up labor_total */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Labor</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-white">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                      projectTotals?.installation_labor_subtotal ?? laborSection?.installation_subtotal ?? 0
                    )}
                  </span>
                </div>
                {/* Overhead Row - Use overhead_total (includes project insurance) for display */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Overhead</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-white">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                      projectTotals?.overhead_total ?? projectTotals?.overhead_subtotal ?? overheadSection?.subtotal ?? approvalResult?.totals?.overhead_cost ?? 0
                    )}
                  </span>
                </div>
                {/* Grand Total Row - Keep using grand_total which includes markup + insurance */}
                <div className="flex justify-between items-center px-4 py-4 bg-green-50 dark:bg-green-900/20">
                  <span className="font-semibold text-gray-900 dark:text-white">Grand Total</span>
                  <span className="font-mono font-bold text-xl text-green-600 dark:text-green-400">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                      projectTotals?.grand_total ?? approvalResult?.totals?.final_price ?? approvalResult?.totals?.subtotal ?? 0
                    )}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
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
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download Excel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowApprovalResults(false);
                    if (approvalResult?.takeoff_id) {
                      router.push(`/takeoffs/${approvalResult.takeoff_id}`);
                    } else {
                      onComplete?.();
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Takeoff
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu for right-click on detections */}
      {contextMenu && (
        <DetectionContextMenu
          position={contextMenu.position}
          detectionId={contextMenu.detectionId}
          currentClass={
            currentPageDetections.find((d) => d.id === contextMenu.detectionId)?.class || 'siding'
          }
          currentColor={
            currentPageDetections.find((d) => d.id === contextMenu.detectionId)?.color_override
          }
          onDuplicate={handleDuplicateDetection}
          onDelete={handleDeleteDetectionFromMenu}
          onChangeClass={handleChangeClassFromMenu}
          onChangeColor={handleChangeColorFromMenu}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* Plan Reader Chatbot - floating widget for reading specs and materials */}
      <PlanReaderChatbot
        ref={planReaderRef}
        imageUrl={currentPage?.original_image_url || currentPage?.image_url || ''}
        currentPageId={currentPageId || undefined}
        allPages={pages as PageInput[]}
        pdfUrl={job?.source_pdf_url || undefined}
        pageContext="elevation"
        projectName={job?.project_name || 'Project'}
        projectAddress=""
      />
    </div>
  );
}
