'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect } from 'react-konva';
import type Konva from 'konva';
import type {
  ExtractionPage,
  ExtractionDetection,
  DetectionClass,
  ToolMode,
  PolygonPoint,
  MarkupType,
} from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS, isPolygonWithHoles } from '@/lib/types/extraction';
import KonvaDetectionPolygon, { type PolygonUpdatePayload } from './KonvaDetectionPolygon';
import KonvaDetectionLine, { type LineUpdatePayload } from './KonvaDetectionLine';
import KonvaDetectionPoint, { type PointUpdatePayload } from './KonvaDetectionPoint';
import {
  calculateFitScale,
  calculateCenterOffset,
  constrainScale,
} from '@/lib/utils/coordinates';
import { pointInPolygon } from '../cad-markup/hitTesting';
import {
  getPolygonBoundingBox,
  flattenPoints,
  calculatePolygonMeasurements,
} from '@/lib/utils/polygonUtils';
import { usePdfRenderer } from '@/lib/hooks/usePdfRenderer';
import SAMSelectOverlay from './SAMSelectOverlay';

// =============================================================================
// Types
// =============================================================================

export interface CalibrationPoint {
  x: number;
  y: number;
}

export interface CalibrationData {
  pointA: CalibrationPoint;
  pointB: CalibrationPoint;
  pixelDistance: number;
}

interface CalibrationState {
  isCalibrating: boolean;
  pointA: CalibrationPoint | null;
  pointB: CalibrationPoint | null;
  pixelDistance: number | null;
}

export interface KonvaDetectionCanvasProps {
  page: ExtractionPage;
  /** Override the page image URL (for Show Bluebeam Markups toggle) */
  imageUrlOverride?: string | null;
  detections: ExtractionDetection[];
  selectedDetectionId: string | null;
  selectedIds: Set<string>;
  toolMode: ToolMode;
  activeClass: DetectionClass;
  onSelectionChange: (id: string | null, addToSelection?: boolean) => void;
  /** Called when paint selection completes with array of detection IDs */
  onMultiSelect?: (ids: string[]) => void;
  onDetectionMove: (
    detection: ExtractionDetection,
    newPosition: { pixel_x: number; pixel_y: number }
  ) => void;
  onDetectionResize: (
    detection: ExtractionDetection,
    newBounds: {
      pixel_x: number;
      pixel_y: number;
      pixel_width: number;
      pixel_height: number;
    }
  ) => void;
  onDetectionCreate: (bounds: {
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
  }) => void;
  onDetectionPolygonUpdate?: (
    detection: ExtractionDetection,
    updates: PolygonUpdatePayload
  ) => void;
  onDetectionLineUpdate?: (
    detection: ExtractionDetection,
    updates: LineUpdatePayload
  ) => void;
  onDetectionPointUpdate?: (
    detection: ExtractionDetection,
    updates: PointUpdatePayload
  ) => void;
  onCalibrationComplete?: (data: CalibrationData) => void;
  /** Called when user right-clicks to exit point/line mode */
  onExitDrawingMode?: () => void;
  /** Multi-select mode - clicks add to selection instead of replacing */
  multiSelectMode?: boolean;
  containerWidth: number;
  containerHeight: number;
  /** Called when user completes a split operation with a polygon */
  onSplitDetection?: (
    originalDetection: ExtractionDetection,
    splitPolygon: PolygonPoint[]
  ) => void;
  /** URL to the source PDF for crisp rendering at any zoom level */
  pdfUrl?: string | null;
  /** Called when drawing state changes (for point-level undo coordination) */
  onDrawingStateChange?: (isDrawing: boolean) => void;
  /** Called when user right-clicks on a detection (for context menu) */
  onDetectionContextMenu?: (
    detection: ExtractionDetection,
    screenPosition: { x: number; y: number }
  ) => void;
  /** Returns true if detection should be shown dimmed (below confidence threshold) */
  isDetectionDimmed?: (detection: ExtractionDetection) => boolean;
  /** Pending detections from Region Detect and SAM (shown with special preview styling) */
  pendingDetections?: Array<{
    id: string;
    class: DetectionClass;
    pixel_x: number;
    pixel_y: number;
    pixel_width: number;
    pixel_height: number;
    polygon_points?: PolygonPoint[];
    confidence: number;
  }>;
  /** Called when user completes a region selection (region_detect mode) */
  onRegionSelected?: (region: { x: number; y: number; width: number; height: number }) => void;
  /** Whether region detection is currently running */
  isRegionDetecting?: boolean;
  /** Called when user clicks in SAM select mode */
  onSAMClick?: (point: { x: number; y: number }) => void;
  /** Whether SAM is currently segmenting */
  isSAMSegmenting?: boolean;
  /** Current SAM segmentation result */
  samResult?: {
    polygon_points: Array<{ x: number; y: number }>;
    bounding_box?: { x: number; y: number; width: number; height: number };
  } | null;
  /** Click points used for SAM segmentation */
  samClickPoints?: Array<{ x: number; y: number; label: 0 | 1 }>;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_FACTOR = 1.1;
const CLOSE_THRESHOLD = 15; // Pixels to detect "near starting point"
const MIN_POLYGON_POINTS = 3;
const SNAP_ANGLE_INCREMENT = 45; // Degrees for angle snapping when Shift is held

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Snap a point to the nearest angle increment from a reference point.
 * Used when Shift is held during polygon/split drawing.
 * @param fromPoint - The reference point (last placed point)
 * @param toPoint - The target point (current cursor position)
 * @param snapDegrees - The angle increment to snap to (default 45°)
 * @returns The snapped point at the same distance but adjusted angle
 */
function snapToAngle(
  fromPoint: PolygonPoint,
  toPoint: PolygonPoint,
  snapDegrees: number = SNAP_ANGLE_INCREMENT
): PolygonPoint {
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // If points are too close, don't snap
  if (distance < 5) return toPoint;

  // Calculate current angle in radians, then convert to degrees
  const angleRadians = Math.atan2(dy, dx);
  const angleDegrees = angleRadians * (180 / Math.PI);

  // Snap to nearest increment
  const snappedDegrees = Math.round(angleDegrees / snapDegrees) * snapDegrees;
  const snappedRadians = snappedDegrees * (Math.PI / 180);

  // Calculate new point at snapped angle, same distance
  return {
    x: fromPoint.x + Math.cos(snappedRadians) * distance,
    y: fromPoint.y + Math.sin(snappedRadians) * distance,
  };
}

// Classes appropriate for linear measurements (lines) - measured in LF, not SF
// Note: soffit is NOT included here - it uses area (SF) measurement via rectangle/polygon tool
const LINEAR_CLASSES: DetectionClass[] = ['trim', 'fascia', 'gutter', 'eave', 'rake', 'ridge', 'valley', 'belly_band', 'corner_inside', 'corner_outside'];

/**
 * Get the simple points array from polygon_points (handles both formats)
 */
function getPolygonPointsArray(detection: ExtractionDetection): PolygonPoint[] | null {
  if (!detection.polygon_points) return null;

  // If it's a PolygonWithHoles, use the outer boundary
  if (isPolygonWithHoles(detection.polygon_points)) {
    return detection.polygon_points.outer;
  }

  // It's a simple array
  return detection.polygon_points;
}

/**
 * Get bounding box for a detection (works for both bbox and polygon formats)
 */
function getDetectionBounds(detection: ExtractionDetection): { x: number; y: number; width: number; height: number } {
  // If detection has polygon_points, calculate bounds from those
  const points = getPolygonPointsArray(detection);
  if (points && points.length >= 3) {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  // Fall back to pixel coordinates (center-based format)
  const halfWidth = detection.pixel_width / 2;
  const halfHeight = detection.pixel_height / 2;

  return {
    x: detection.pixel_x - halfWidth,
    y: detection.pixel_y - halfHeight,
    width: detection.pixel_width,
    height: detection.pixel_height,
  };
}

/**
 * Check if a point is inside a detection (works for both polygon and bbox formats)
 * Uses pointInPolygon for polygons, bounding box check for rectangles
 */
function isPointInDetection(point: PolygonPoint, detection: ExtractionDetection): boolean {
  // If detection has polygon_points, use point-in-polygon test
  const points = getPolygonPointsArray(detection);
  if (points && points.length >= 3) {
    return pointInPolygon(point, points);
  }

  // Fall back to bounding box check
  const bounds = getDetectionBounds(detection);
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/**
 * Find the topmost (visually front-most) detection at a given point.
 * Uses the same sorting logic as rendering: smaller area = on top.
 * Returns null if no detection contains the point.
 */
function findTopmostDetectionAtPoint(
  point: PolygonPoint,
  detections: ExtractionDetection[],
  selectedDetectionId?: string | null
): ExtractionDetection | null {
  // Filter to non-deleted detections that contain the point
  const matchingDetections = detections.filter(
    d => d.status !== 'deleted' && isPointInDetection(point, d)
  );

  if (matchingDetections.length === 0) return null;
  if (matchingDetections.length === 1) return matchingDetections[0];

  // Sort by the same criteria as rendering order:
  // - Selected items are on top
  // - Within same selection state, smaller areas are on top
  // Array is sorted so topmost is LAST (same as render order)
  matchingDetections.sort((a, b) => {
    const aSelected = a.id === selectedDetectionId;
    const bSelected = b.id === selectedDetectionId;
    if (aSelected !== bSelected) {
      return aSelected ? 1 : -1;
    }
    const aArea = a.pixel_width * a.pixel_height;
    const bArea = b.pixel_width * b.pixel_height;
    return bArea - aArea; // Larger first, smaller last (on top)
  });

  // Return the last one (topmost in render order)
  return matchingDetections[matchingDetections.length - 1];
}

// =============================================================================
// Component
// =============================================================================

export default function KonvaDetectionCanvas({
  page,
  imageUrlOverride,
  detections,
  selectedDetectionId,
  selectedIds,
  toolMode,
  activeClass,
  onSelectionChange,
  onMultiSelect,
  onDetectionMove,
  onDetectionResize,
  onDetectionCreate,
  onDetectionPolygonUpdate,
  onDetectionLineUpdate,
  onDetectionPointUpdate,
  onCalibrationComplete,
  onExitDrawingMode,
  multiSelectMode = false,
  containerWidth,
  containerHeight,
  onSplitDetection,
  pdfUrl,
  onDrawingStateChange,
  onDetectionContextMenu,
  isDetectionDimmed,
  pendingDetections = [],
  onRegionSelected,
  isRegionDetecting = false,
  onSAMClick,
  isSAMSegmenting = false,
  samResult = null,
  samClickPoints = [],
}: KonvaDetectionCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const imageRef = useRef<Konva.Image>(null);

  // Image state
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Viewport state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Point-by-point polygon drawing state (create mode)
  const [drawingPoints, setDrawingPoints] = useState<PolygonPoint[]>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [mousePosition, setMousePosition] = useState<PolygonPoint | null>(null);
  const [isNearStart, setIsNearStart] = useState(false);
  // Rectangle mode for create tool: click and drag to draw rectangle
  const [createRectStart, setCreateRectStart] = useState<PolygonPoint | null>(null);
  const [createRectEnd, setCreateRectEnd] = useState<PolygonPoint | null>(null);
  const [isDraggingCreateRect, setIsDraggingCreateRect] = useState(false);

  // Hover state
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Calibration state
  const [calibrationState, setCalibrationState] = useState<CalibrationState>({
    isCalibrating: false,
    pointA: null,
    pointB: null,
    pixelDistance: null,
  });
  const [calibrationMousePos, setCalibrationMousePos] = useState<CalibrationPoint | null>(null);

  // Line drawing state (2-point line for LF measurements)
  const [lineStartPoint, setLineStartPoint] = useState<PolygonPoint | null>(null);

  // Split tool state - supports both polygon click and rectangle drag modes
  // Polygon mode: click sequential points to draw custom shape
  const [splitPolygonPoints, setSplitPolygonPoints] = useState<PolygonPoint[]>([]);
  const [isSplitDrawing, setIsSplitDrawing] = useState(false);
  const [splitMousePos, setSplitMousePos] = useState<PolygonPoint | null>(null);
  const [isSplitNearStart, setIsSplitNearStart] = useState(false);
  // Rectangle mode: click and drag to draw rectangle
  const [splitRectStart, setSplitRectStart] = useState<PolygonPoint | null>(null);
  const [splitRectEnd, setSplitRectEnd] = useState<PolygonPoint | null>(null);
  const [isDraggingRect, setIsDraggingRect] = useState(false);

  // Region detect state - click and drag to select region for AI detection
  const [regionRectStart, setRegionRectStart] = useState<PolygonPoint | null>(null);
  const [regionRectEnd, setRegionRectEnd] = useState<PolygonPoint | null>(null);
  const [isDraggingRegion, setIsDraggingRegion] = useState(false);

  // Paint selection state - drag across detections in select mode to add them to selection
  const [isPaintSelecting, setIsPaintSelecting] = useState(false);
  const [paintSelectedIds, setPaintSelectedIds] = useState<Set<string>>(new Set());

  // Auto-pan state for edge scrolling during drawing
  const [autoPanDirection, setAutoPanDirection] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const autoPanAnimationRef = useRef<number | null>(null);
  const lastPointerPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Ref to track if paint selection just completed (prevents detection click from overriding selection)
  const paintSelectionJustCompletedRef = useRef(false);

  // Auto-pan constants
  const EDGE_THRESHOLD = 60; // pixels from edge to start panning
  const PAN_SPEED_BASE = 8; // base pixels per frame
  const PAN_SPEED_MAX = 25; // max pixels per frame when far past edge

  // Shift key state for angle snapping during drawing
  const [isShiftHeld, setIsShiftHeld] = useState(false);

  // Ref to track current drawing state for keyboard handlers (avoids useEffect dependency issues)
  const drawingStateRef = useRef({
    isDrawingPolygon: false,
    drawingPointsLength: 0,
    isSplitDrawing: false,
    splitPolygonPointsLength: 0,
  });

  // Keep ref in sync with state
  useEffect(() => {
    drawingStateRef.current = {
      isDrawingPolygon,
      drawingPointsLength: drawingPoints.length,
      isSplitDrawing,
      splitPolygonPointsLength: splitPolygonPoints.length,
    };
  }, [isDrawingPolygon, drawingPoints.length, isSplitDrawing, splitPolygonPoints.length]);

  // Notify parent of drawing state changes (for point-level undo coordination)
  useEffect(() => {
    const isDrawing = isDrawingPolygon || isSplitDrawing || lineStartPoint !== null;
    onDrawingStateChange?.(isDrawing);
  }, [isDrawingPolygon, isSplitDrawing, lineStartPoint, onDrawingStateChange]);

  // Track shift key and handle keyboard shortcuts for drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift key for angle snapping
      if (e.key === 'Shift') setIsShiftHeld(true);

      // Cmd+Z (Mac) / Ctrl+Z (Windows) - undo last point while drawing
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        const { isDrawingPolygon: isDrawing, drawingPointsLength, isSplitDrawing: isSplit, splitPolygonPointsLength } = drawingStateRef.current;

        // Handle polygon drawing mode
        if (isDrawing && drawingPointsLength > 0) {
          e.preventDefault();
          if (drawingPointsLength === 1) {
            // Only one point - cancel drawing entirely
            setDrawingPoints([]);
            setIsDrawingPolygon(false);
            setMousePosition(null);
            setIsNearStart(false);
          } else {
            // Remove last point
            setDrawingPoints(prev => prev.slice(0, -1));
          }
          return;
        }

        // Handle split drawing mode
        if (isSplit && splitPolygonPointsLength > 0) {
          e.preventDefault();
          if (splitPolygonPointsLength === 1) {
            // Only one point - cancel drawing entirely
            setSplitPolygonPoints([]);
            setIsSplitDrawing(false);
            setSplitMousePos(null);
            setIsSplitNearStart(false);
          } else {
            // Remove last point
            setSplitPolygonPoints(prev => prev.slice(0, -1));
          }
          return;
        }
      }

      // Cmd+X (Mac) / Ctrl+X (Windows) - cancel entire drawing
      if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
        const { isDrawingPolygon: isDrawing, isSplitDrawing: isSplit } = drawingStateRef.current;

        // Only preventDefault if actively drawing (preserve normal cut behavior otherwise)
        if (isDrawing || isSplit) {
          e.preventDefault();

          if (isDrawing) {
            setDrawingPoints([]);
            setIsDrawingPolygon(false);
            setMousePosition(null);
            setIsNearStart(false);
          }

          if (isSplit) {
            setSplitPolygonPoints([]);
            setIsSplitDrawing(false);
            setSplitMousePos(null);
            setIsSplitNearStart(false);
          }
          return;
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftHeld(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []); // Empty deps - ref always has current values

  // Get image dimensions
  const imageWidth = page.original_width || 1920;
  const imageHeight = page.original_height || 1080;
  // Use imageUrlOverride if provided (for Show Bluebeam Markups toggle), otherwise default
  const imageUrl = imageUrlOverride || page.original_image_url || page.image_url;

  // Debug: Log detections by markup_type
  React.useEffect(() => {
    const pointDetections = detections?.filter(d => d.markup_type === 'point') || [];
    const lineDetections = detections?.filter(d => d.markup_type === 'line') || [];
    const polygonDetections = detections?.filter(d => d.markup_type !== 'line' && d.markup_type !== 'point') || [];
    const cornerDetections = detections?.filter(d => d.class === 'corner_inside' || d.class === 'corner_outside') || [];

    console.log('[KonvaCanvas] Detection breakdown:', {
      total: detections?.length || 0,
      polygons: polygonDetections.length,
      lines: lineDetections.length,
      points: pointDetections.length,
      corners: cornerDetections.length,
      cornerClasses: cornerDetections.map(d => ({ class: d.class, markup_type: d.markup_type, id: d.id.slice(0, 8) })),
    });
  }, [detections]);

  // Track which image we've positioned for to avoid resetting on container resize
  const positionedForImageRef = useRef<string | null>(null);

  // ==========================================================================
  // Load Image
  // ==========================================================================

  useEffect(() => {
    if (!imageUrl) return;

    // Check if we're loading a NEW image (page change) vs same image
    const isNewImage = positionedForImageRef.current !== imageUrl;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      setImageLoaded(true);

      // Only reset viewport position when loading a different image (page change)
      // This preserves zoom/pan when tool or selection changes
      if (isNewImage) {
        // Calculate initial fit scale and position
        const fitScale = calculateFitScale(
          img.naturalWidth || imageWidth,
          img.naturalHeight || imageHeight,
          containerWidth,
          containerHeight
        );
        const centerOffset = calculateCenterOffset(
          img.naturalWidth || imageWidth,
          img.naturalHeight || imageHeight,
          containerWidth,
          containerHeight,
          fitScale
        );

        setScale(fitScale);
        setPosition(centerOffset);
        positionedForImageRef.current = imageUrl;
      }
    };
    img.onerror = () => {
      console.error('Failed to load image:', imageUrl);
    };
    img.src = imageUrl;
  }, [imageUrl, imageWidth, imageHeight, containerWidth, containerHeight]);

  // ==========================================================================
  // PDF Rendering (provides crisp zoom at any level)
  // ==========================================================================

  // Get actual image dimensions from the loaded image (critical for coordinate alignment)
  const actualImageWidth = image?.naturalWidth || page.original_width || imageWidth;
  const actualImageHeight = image?.naturalHeight || page.original_height || imageHeight;

  // PDF rendering hook - renders PDF at resolution matching original image pixels
  const {
    pdfCanvas,
    isLoading: pdfLoading,
    pdfDimensions,
    renderAtZoom,
    error: pdfError
  } = usePdfRenderer({
    pdfUrl: pdfUrl || null,
    pageNumber: page.page_number || 1,
    dpi: page.dpi || 200,
    imageWidth: actualImageWidth,
    imageHeight: actualImageHeight,
  });

  // Track current render zoom level to avoid unnecessary re-renders
  const lastRenderZoomRef = useRef<number>(0);

  // Re-render PDF when zoom changes significantly (crossing integer thresholds)
  useEffect(() => {
    if (!pdfCanvas || !renderAtZoom) return;

    const renderZoom = Math.max(1, Math.ceil(scale));

    // Only re-render if we've crossed a zoom threshold
    if (renderZoom !== lastRenderZoomRef.current) {
      lastRenderZoomRef.current = renderZoom;
      renderAtZoom(scale);
    }
  }, [pdfCanvas, renderAtZoom, scale]);

  // Initial render when PDF is ready
  useEffect(() => {
    if (pdfCanvas && renderAtZoom && lastRenderZoomRef.current === 0) {
      renderAtZoom(1);
      lastRenderZoomRef.current = 1;
    }
  }, [pdfCanvas, renderAtZoom]);

  // Determine if we should use PDF rendering (available and loaded)
  const usePdfRendering = !!pdfCanvas && !pdfLoading && !pdfError;

  // Use PDF dimensions if available, fall back to existing image dimensions
  // These are the "display" dimensions - Konva will scale the hi-res canvas to fit
  const effectiveWidth = usePdfRendering && pdfDimensions ? pdfDimensions.width : imageWidth;
  const effectiveHeight = usePdfRendering && pdfDimensions ? pdfDimensions.height : imageHeight;

  // Debug: Log PDF rendering state
  useEffect(() => {
    if (pdfUrl) {
      console.log('[KonvaCanvas] PDF rendering state:', {
        pdfUrl: pdfUrl?.substring(0, 50) + '...',
        pdfLoading,
        pdfError: pdfError?.message,
        usePdfRendering,
        pdfDimensions,
        effectiveWidth,
        effectiveHeight,
        actualImageDimensions: actualImageWidth && actualImageHeight ? `${actualImageWidth}x${actualImageHeight}` : 'not loaded',
        currentZoom: scale,
      });
    }
  }, [pdfUrl, pdfLoading, pdfError, usePdfRendering, pdfDimensions, effectiveWidth, effectiveHeight, actualImageWidth, actualImageHeight, scale]);

  // ==========================================================================
  // Scale Ratio for Measurements
  // ==========================================================================

  // Get scale ratio from page (pixels per foot) - default to 64 if not set
  const scaleRatio = page.scale_ratio ?? 64;

  // ==========================================================================
  // Auto-Pan During Drawing (Edge Scrolling)
  // ==========================================================================

  // Check if we're in an active drawing state that should trigger auto-pan
  const isActivelyDrawing = isDrawingPolygon || isSplitDrawing || isDraggingCreateRect || isDraggingRect || isDraggingRegion || isPaintSelecting;

  // Auto-pan animation effect
  useEffect(() => {
    // Only run if we have a pan direction and are actively drawing
    if ((autoPanDirection.x === 0 && autoPanDirection.y === 0) || !isActivelyDrawing) {
      // Cancel any existing animation
      if (autoPanAnimationRef.current) {
        cancelAnimationFrame(autoPanAnimationRef.current);
        autoPanAnimationRef.current = null;
      }
      return;
    }

    const animate = () => {
      setPosition(prev => ({
        x: prev.x + autoPanDirection.x,
        y: prev.y + autoPanDirection.y,
      }));

      // Continue animation
      autoPanAnimationRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    autoPanAnimationRef.current = requestAnimationFrame(animate);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (autoPanAnimationRef.current) {
        cancelAnimationFrame(autoPanAnimationRef.current);
        autoPanAnimationRef.current = null;
      }
    };
  }, [autoPanDirection.x, autoPanDirection.y, isActivelyDrawing]);

  // Stop auto-pan when drawing ends
  useEffect(() => {
    if (!isActivelyDrawing) {
      setAutoPanDirection({ x: 0, y: 0 });
      lastPointerPositionRef.current = null;
    }
  }, [isActivelyDrawing]);

  // Calculate auto-pan direction based on pointer position
  const calculateAutoPan = useCallback((pointerX: number, pointerY: number) => {
    if (!isActivelyDrawing) {
      setAutoPanDirection({ x: 0, y: 0 });
      return;
    }

    let panX = 0;
    let panY = 0;

    // Calculate distance from each edge
    const distFromLeft = pointerX;
    const distFromRight = containerWidth - pointerX;
    const distFromTop = pointerY;
    const distFromBottom = containerHeight - pointerY;

    // Calculate pan speed based on how far past the threshold we are
    // The further past, the faster we pan (up to PAN_SPEED_MAX)
    const calculatePanSpeed = (distFromEdge: number) => {
      if (distFromEdge >= EDGE_THRESHOLD) return 0;
      // Linear interpolation from 0 at threshold to max at edge
      const factor = 1 - (distFromEdge / EDGE_THRESHOLD);
      return PAN_SPEED_BASE + (PAN_SPEED_MAX - PAN_SPEED_BASE) * factor * factor; // Quadratic for smoother feel
    };

    // Check horizontal edges
    if (distFromLeft < EDGE_THRESHOLD) {
      panX = calculatePanSpeed(distFromLeft); // Pan right (positive) to show more on left
    } else if (distFromRight < EDGE_THRESHOLD) {
      panX = -calculatePanSpeed(distFromRight); // Pan left (negative) to show more on right
    }

    // Check vertical edges
    if (distFromTop < EDGE_THRESHOLD) {
      panY = calculatePanSpeed(distFromTop); // Pan down (positive) to show more on top
    } else if (distFromBottom < EDGE_THRESHOLD) {
      panY = -calculatePanSpeed(distFromBottom); // Pan up (negative) to show more on bottom
    }

    setAutoPanDirection({ x: panX, y: panY });
  }, [isActivelyDrawing, containerWidth, containerHeight, EDGE_THRESHOLD, PAN_SPEED_BASE, PAN_SPEED_MAX]);

  // ==========================================================================
  // Wheel Zoom
  // ==========================================================================

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();

      const stage = stageRef.current;
      if (!stage) return;

      const oldScale = scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      // Calculate new scale
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = constrainScale(
        direction > 0 ? oldScale * ZOOM_FACTOR : oldScale / ZOOM_FACTOR,
        MIN_SCALE,
        MAX_SCALE
      );

      // Calculate new position to zoom toward pointer
      const mousePointTo = {
        x: (pointer.x - position.x) / oldScale,
        y: (pointer.y - position.y) / oldScale,
      };

      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };

      setScale(newScale);
      setPosition(newPos);
    },
    [scale, position]
  );

  // ==========================================================================
  // Stage Drag (Pan Mode)
  // ==========================================================================

  const handleStageDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (toolMode !== 'pan') return;
    setPosition({
      x: e.target.x(),
      y: e.target.y(),
    });
  }, [toolMode]);

  // ==========================================================================
  // Point-by-Point Polygon Drawing (Create Mode)
  // ==========================================================================

  // Check if a point is near the starting point
  const isPointNearStart = useCallback(
    (point: PolygonPoint, startPoint: PolygonPoint): boolean => {
      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      // Scale threshold by zoom level so it feels consistent
      return Math.sqrt(dx * dx + dy * dy) < CLOSE_THRESHOLD / scale;
    },
    [scale]
  );

  // Complete the polygon and create detection
  const completePolygon = useCallback(() => {
    if (drawingPoints.length < MIN_POLYGON_POINTS) return;

    // Calculate measurements using scale ratio for accurate real-world values
    const measurements = calculatePolygonMeasurements(drawingPoints, scaleRatio);

    onDetectionCreate({
      pixel_x: measurements.pixel_x,
      pixel_y: measurements.pixel_y,
      pixel_width: measurements.pixel_width,
      pixel_height: measurements.pixel_height,
      class: activeClass,
      polygon_points: drawingPoints,
      area_sf: measurements.area_sf,
      perimeter_lf: measurements.perimeter_lf,
      real_width_ft: measurements.real_width_ft,
      real_height_ft: measurements.real_height_ft,
    });

    // Reset drawing state
    setDrawingPoints([]);
    setIsDrawingPolygon(false);
    setMousePosition(null);
    setIsNearStart(false);
  }, [drawingPoints, activeClass, onDetectionCreate, scaleRatio]);

  // Cancel drawing (both polygon and rectangle modes for create tool)
  const cancelDrawing = useCallback(() => {
    setDrawingPoints([]);
    setIsDrawingPolygon(false);
    setMousePosition(null);
    setIsNearStart(false);
    // Also reset rectangle state
    setCreateRectStart(null);
    setCreateRectEnd(null);
    setIsDraggingCreateRect(false);
  }, []);

  // Complete a rectangle drawing and create detection (create tool)
  const completeRectangleCreate = useCallback(() => {
    if (!createRectStart || !createRectEnd) return;

    const minX = Math.min(createRectStart.x, createRectEnd.x);
    const maxX = Math.max(createRectStart.x, createRectEnd.x);
    const minY = Math.min(createRectStart.y, createRectEnd.y);
    const maxY = Math.max(createRectStart.y, createRectEnd.y);

    // Convert rectangle to 4 polygon points (clockwise from top-left)
    const rectPolygon: PolygonPoint[] = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];

    console.log('[completeRectangleCreate] Rectangle as polygon:', rectPolygon);

    // Calculate measurements
    const measurements = calculatePolygonMeasurements(rectPolygon, scaleRatio);

    onDetectionCreate({
      pixel_x: measurements.pixel_x,
      pixel_y: measurements.pixel_y,
      pixel_width: measurements.pixel_width,
      pixel_height: measurements.pixel_height,
      class: activeClass,
      polygon_points: rectPolygon,
      area_sf: measurements.area_sf,
      perimeter_lf: measurements.perimeter_lf,
      real_width_ft: measurements.real_width_ft,
      real_height_ft: measurements.real_height_ft,
    });

    // Reset rectangle state
    setCreateRectStart(null);
    setCreateRectEnd(null);
    setIsDraggingCreateRect(false);
  }, [createRectStart, createRectEnd, activeClass, onDetectionCreate, scaleRatio]);

  // Complete split polygon and execute split
  const completeSplitPolygon = useCallback(() => {
    console.log('[completeSplitPolygon] Called with points:', splitPolygonPoints.length);

    if (splitPolygonPoints.length < MIN_POLYGON_POINTS) {
      console.log('[completeSplitPolygon] Not enough points, need at least', MIN_POLYGON_POINTS);
      return;
    }

    // Get the selected detection
    const selectedId = Array.from(selectedIds)[0];
    const selectedDetection = detections.find(d => d.id === selectedId);

    console.log('[completeSplitPolygon] Selected detection:', selectedDetection?.id);

    if (selectedDetection && onSplitDetection) {
      console.log('[completeSplitPolygon] Calling onSplitDetection with', splitPolygonPoints.length, 'points');
      onSplitDetection(selectedDetection, splitPolygonPoints);
    } else {
      console.log('[completeSplitPolygon] Missing selectedDetection or onSplitDetection');
    }

    // Reset split state
    setSplitPolygonPoints([]);
    setIsSplitDrawing(false);
    setSplitMousePos(null);
    setIsSplitNearStart(false);
  }, [splitPolygonPoints, selectedIds, detections, onSplitDetection]);

  // Cancel split drawing (both polygon and rectangle modes)
  const cancelSplitDrawing = useCallback(() => {
    setSplitPolygonPoints([]);
    setIsSplitDrawing(false);
    setSplitMousePos(null);
    setIsSplitNearStart(false);
    // Also reset rectangle state
    setSplitRectStart(null);
    setSplitRectEnd(null);
    setIsDraggingRect(false);
  }, []);

  // Execute split with a rectangle (converted to polygon points)
  const executeSplitWithRect = useCallback(() => {
    if (!splitRectStart || !splitRectEnd) return;

    const minX = Math.min(splitRectStart.x, splitRectEnd.x);
    const maxX = Math.max(splitRectStart.x, splitRectEnd.x);
    const minY = Math.min(splitRectStart.y, splitRectEnd.y);
    const maxY = Math.max(splitRectStart.y, splitRectEnd.y);

    // Convert rectangle to polygon points (clockwise from top-left)
    const rectPolygon: PolygonPoint[] = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];

    console.log('[executeSplitWithRect] Rectangle as polygon:', rectPolygon);

    // Get the selected detection
    const selectedId = Array.from(selectedIds)[0];
    const selectedDetection = detections.find(d => d.id === selectedId);

    if (selectedDetection && onSplitDetection) {
      console.log('[executeSplitWithRect] Calling onSplitDetection');
      onSplitDetection(selectedDetection, rectPolygon);
    }

    // Reset all split state
    setSplitRectStart(null);
    setSplitRectEnd(null);
    setIsDraggingRect(false);
    setSplitPolygonPoints([]);
    setIsSplitDrawing(false);
  }, [splitRectStart, splitRectEnd, selectedIds, detections, onSplitDetection]);

  // Reset calibration state
  const resetCalibration = useCallback(() => {
    setCalibrationState({
      isCalibrating: false,
      pointA: null,
      pointB: null,
      pixelDistance: null,
    });
    setCalibrationMousePos(null);
  }, []);

  // Cancel region selection drawing
  const cancelRegionDrawing = useCallback(() => {
    setRegionRectStart(null);
    setRegionRectEnd(null);
    setIsDraggingRegion(false);
  }, []);

  // Execute region selection and call callback
  const executeRegionSelection = useCallback(() => {
    if (!regionRectStart || !regionRectEnd || !onRegionSelected) return;

    const minX = Math.min(regionRectStart.x, regionRectEnd.x);
    const maxX = Math.max(regionRectStart.x, regionRectEnd.x);
    const minY = Math.min(regionRectStart.y, regionRectEnd.y);
    const maxY = Math.max(regionRectStart.y, regionRectEnd.y);

    const width = maxX - minX;
    const height = maxY - minY;

    // Only proceed if region is big enough
    if (width >= 50 && height >= 50) {
      console.log('[Region Detect] Executing region selection:', { x: minX, y: minY, width, height });
      onRegionSelected({ x: minX, y: minY, width, height });
    } else {
      console.log('[Region Detect] Region too small, cancelling');
    }

    // Reset state
    cancelRegionDrawing();
  }, [regionRectStart, regionRectEnd, onRegionSelected, cancelRegionDrawing]);

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // IMPORTANT: Check drawing tool modes FIRST before checking if we clicked on a detection
      // This allows placing points, lines, and polygons ON TOP of existing markups

      // Point mode - single click to place a marker (works over existing detections)
      if (toolMode === 'point') {
        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform to image coordinates
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;

        // Create point detection
        onDetectionCreate({
          pixel_x: imageX,
          pixel_y: imageY,
          pixel_width: 0,
          pixel_height: 0,
          class: activeClass,
          markup_type: 'point',
        });
        return;
      }

      // Region detect mode - click and drag to select region for AI detection
      if (toolMode === 'region_detect') {
        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform to image coordinates
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;
        const newPoint = { x: imageX, y: imageY };

        console.log('[Region Detect MouseDown] Starting at:', newPoint);

        // Start rectangle drawing
        setRegionRectStart(newPoint);
        setRegionRectEnd(newPoint);
        setIsDraggingRegion(false); // Not dragging yet
        return;
      }

      // SAM Magic Select mode - single click to trigger segmentation
      if (toolMode === 'sam_select' && onSAMClick) {
        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform to image coordinates
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;

        console.log('[SAM Select] Click at:', { x: imageX, y: imageY });
        onSAMClick({ x: imageX, y: imageY });
        return;
      }

      // Split mode - supports both polygon click and rectangle drag
      // Click and release = add polygon vertex
      // Click and drag = draw rectangle
      if (toolMode === 'split' && selectedIds.size === 1) {
        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform to image coordinates
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;
        const newPoint = { x: imageX, y: imageY };

        console.log('[Split MouseDown] Point:', newPoint);
        console.log('[Split MouseDown] Polygon points:', splitPolygonPoints.length);
        console.log('[Split MouseDown] isSplitDrawing:', isSplitDrawing);

        // If we're already drawing a polygon, check for close
        if (isSplitDrawing && splitPolygonPoints.length >= MIN_POLYGON_POINTS) {
          const firstPoint = splitPolygonPoints[0];
          const dx = newPoint.x - firstPoint.x;
          const dy = newPoint.y - firstPoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const threshold = CLOSE_THRESHOLD;

          console.log('[Split MouseDown] Distance to first:', distance.toFixed(1), 'Threshold:', threshold);

          if (distance < threshold) {
            console.log('[Split MouseDown] CLOSING POLYGON');
            completeSplitPolygon();
            return;
          }
        }

        // Record start position for potential rectangle drag
        // We'll decide between polygon and rectangle mode on mouse up
        setSplitRectStart(newPoint);
        setSplitRectEnd(newPoint);
        setIsDraggingRect(false); // Not dragging yet, will become true on move
        return;
      }

      // Line mode - two clicks to draw a line (works over existing detections)
      if (toolMode === 'line') {
        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform to image coordinates
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;
        const imagePoint = { x: imageX, y: imageY };

        if (!lineStartPoint) {
          // First click - set start point
          setLineStartPoint(imagePoint);
        } else {
          // Second click - create line detection
          const dx = imagePoint.x - lineStartPoint.x;
          const dy = imagePoint.y - lineStartPoint.y;
          const pixelLength = Math.sqrt(dx * dx + dy * dy);
          const lengthLf = pixelLength / scaleRatio;

          // For lines, use activeClass if it's a linear class, otherwise default to 'trim'
          const lineClass = LINEAR_CLASSES.includes(activeClass) ? activeClass : 'trim';

          onDetectionCreate({
            pixel_x: (lineStartPoint.x + imagePoint.x) / 2,
            pixel_y: (lineStartPoint.y + imagePoint.y) / 2,
            pixel_width: Math.abs(dx),
            pixel_height: Math.abs(dy),
            class: lineClass,
            polygon_points: [lineStartPoint, imagePoint],
            markup_type: 'line',
            perimeter_lf: lengthLf,
            area_sf: 0,
            real_width_ft: Math.abs(dx) / scaleRatio,
            real_height_ft: Math.abs(dy) / scaleRatio,
          });

          setLineStartPoint(null);
        }
        return;
      }

      // Create (polygon) mode - supports both polygon click and rectangle drag
      // Click and release = add polygon vertex
      // Click and drag = draw rectangle
      if (toolMode === 'create') {
        const stage = stageRef.current;
        if (!stage) return;

        // Use getRelativePointerPosition() which returns coordinates in the Stage's
        // local coordinate system (accounts for scale and position transforms)
        const pointer = stage.getRelativePointerPosition();
        if (!pointer) return;

        // Pointer is now directly in image-pixel coordinates
        const clickPoint = { x: pointer.x, y: pointer.y };

        console.log('[Create MouseDown] Point:', clickPoint);
        console.log('[Create MouseDown] Polygon points:', drawingPoints.length);
        console.log('[Create MouseDown] isDrawingPolygon:', isDrawingPolygon);

        // If we're already drawing a polygon, check for close
        if (isDrawingPolygon && drawingPoints.length >= MIN_POLYGON_POINTS) {
          const firstPoint = drawingPoints[0];
          const dx = clickPoint.x - firstPoint.x;
          const dy = clickPoint.y - firstPoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const threshold = CLOSE_THRESHOLD;

          console.log('[Create MouseDown] Distance to first:', distance.toFixed(1), 'Threshold:', threshold);

          if (distance < threshold) {
            console.log('[Create MouseDown] CLOSING POLYGON');
            completePolygon();
            return;
          }
        }

        // Record start position for potential rectangle drag
        // We'll decide between polygon and rectangle mode on mouse up
        setCreateRectStart(clickPoint);
        setCreateRectEnd(clickPoint);
        setIsDraggingCreateRect(false); // Not dragging yet, will become true on move
        return;
      }

      // Calibration mode - click two points to measure pixel distance (works over existing detections)
      if (toolMode === 'calibrate') {
        const stage = stageRef.current;
        if (!stage) return;

        // Get pointer position in screen/canvas coordinates
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform screen coordinates to image coordinates
        // Formula: imageCoord = (screenCoord - stagePosition) / scale
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;
        const imagePoint = { x: imageX, y: imageY };

        console.log('[Calibration] Screen point:', pointer);
        console.log('[Calibration] Scale:', scale, 'Position:', position);
        console.log('[Calibration] Image point:', imagePoint);

        if (!calibrationState.pointA) {
          // First click - store point A in IMAGE coordinates
          setCalibrationState({
            isCalibrating: true,
            pointA: imagePoint,
            pointB: null,
            pixelDistance: null,
          });
        } else {
          // Second click - calculate distance in IMAGE coordinates
          const dx = imagePoint.x - calibrationState.pointA.x;
          const dy = imagePoint.y - calibrationState.pointA.y;
          const pixelDistance = Math.sqrt(dx * dx + dy * dy);

          console.log('[Calibration] Distance in IMAGE pixels:', pixelDistance);

          // Update state with final values
          setCalibrationState({
            isCalibrating: true,
            pointA: calibrationState.pointA,
            pointB: imagePoint,
            pixelDistance,
          });

          // Call the completion callback with IMAGE pixel distance
          onCalibrationComplete?.({
            pointA: calibrationState.pointA,
            pointB: imagePoint,
            pixelDistance,
          });

          // Reset calibration state after callback
          resetCalibration();
        }
        return;
      }

      // For select mode, start paint selection regardless of whether we clicked on a detection or empty space
      if (toolMode === 'select') {
        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform to image coordinates
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;
        const startPoint = { x: imageX, y: imageY };

        // Check if clicking on a detection - find the topmost (smallest/front-most) one
        const clickedDetection = findTopmostDetectionAtPoint(startPoint, detections, selectedDetectionId);

        // Check if shift is held or multi-select mode is on to add to existing selection
        const isShiftHeld = e.evt.shiftKey;
        const shouldAddToSelection = isShiftHeld || multiSelectMode;

        // Start paint selection
        setIsPaintSelecting(true);

        if (shouldAddToSelection) {
          if (!clickedDetection) {
            // Clicked empty space - clear selection even in multi-select mode
            setPaintSelectedIds(new Set());
            onSelectionChange(null, false);
          } else {
            // Toggle detection in/out of existing selection
            const newSet = new Set(selectedIds);
            if (newSet.has(clickedDetection.id)) {
              newSet.delete(clickedDetection.id);
            } else {
              newSet.add(clickedDetection.id);
            }
            setPaintSelectedIds(newSet);
          }
        } else {
          // Start fresh with clicked detection (if any)
          setPaintSelectedIds(clickedDetection ? new Set([clickedDetection.id]) : new Set());
          if (!clickedDetection) {
            // Only clear selection if clicking on empty space
            onSelectionChange(null, false);
          }
        }
        return;
      }

      // For pan/verify modes, check if we clicked on a detection
      // Walk up the parent chain to find if any parent is a detection
      let target = e.target;
      let isDetectionShape = false;
      while (target && target !== stageRef.current) {
        const targetName = target.name?.() || '';
        if (targetName.startsWith('detection-')) {
          isDetectionShape = true;
          break;
        }
        target = target.parent as typeof target;
      }

      // If clicking on a detection shape (and not in select mode), let its own handler deal with it
      if (isDetectionShape) {
        return;
      }

      // Pan mode handled by Konva's draggable property
      // Verify mode handled by detection click handlers
    },
    [toolMode, onSelectionChange, isDrawingPolygon, drawingPoints.length, isNearStart, completePolygon, calibrationState.pointA, onCalibrationComplete, resetCalibration, position, scale, lineStartPoint, scaleRatio, activeClass, onDetectionCreate, selectedIds, splitPolygonPoints, isSplitDrawing, completeSplitPolygon, onSAMClick, detections, selectedDetectionId, multiSelectMode]
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;

      // Get screen pointer position for auto-pan edge detection
      const screenPointer = stage.getPointerPosition();
      if (screenPointer) {
        lastPointerPositionRef.current = screenPointer;
        // Calculate auto-pan based on screen position (only when actively drawing)
        calculateAutoPan(screenPointer.x, screenPointer.y);
      }

      // Handle calibration mode mouse move - use screen coords + manual transform
      // to match the click handler (must use same coordinate system)
      if (toolMode === 'calibrate' && calibrationState.pointA) {
        const pointer = stage.getPointerPosition();
        if (pointer) {
          // Transform to image coordinates (same formula as click handler)
          const imageX = (pointer.x - position.x) / scale;
          const imageY = (pointer.y - position.y) / scale;
          setCalibrationMousePos({ x: imageX, y: imageY });
        }
        return;
      }

      // Handle line mode mouse move
      if (toolMode === 'line' && lineStartPoint) {
        const pointer = stage.getPointerPosition();
        if (pointer) {
          const imageX = (pointer.x - position.x) / scale;
          const imageY = (pointer.y - position.y) / scale;
          setCalibrationMousePos({ x: imageX, y: imageY }); // Reuse for line preview
        }
        return;
      }

      // Handle region detect mode mouse move
      if (toolMode === 'region_detect') {
        const pointer = stage.getPointerPosition();
        if (pointer) {
          const imageX = (pointer.x - position.x) / scale;
          const imageY = (pointer.y - position.y) / scale;
          const currentPoint = { x: imageX, y: imageY };

          // Check if we're dragging a rectangle (mouse button down)
          const isMouseDown = 'buttons' in e.evt ? e.evt.buttons === 1 : true;
          if (regionRectStart && isMouseDown) {
            const dx = Math.abs(currentPoint.x - regionRectStart.x);
            const dy = Math.abs(currentPoint.y - regionRectStart.y);
            // Only consider it a drag if moved more than 5 pixels
            if (dx > 5 || dy > 5) {
              setIsDraggingRegion(true);
              setRegionRectEnd(currentPoint);
            }
          }
        }
        return;
      }

      // Handle split mode mouse move
      if (toolMode === 'split') {
        const pointer = stage.getPointerPosition();
        if (pointer) {
          const imageX = (pointer.x - position.x) / scale;
          const imageY = (pointer.y - position.y) / scale;
          const currentPoint = { x: imageX, y: imageY };

          // Check if we're dragging a rectangle (mouse button down and moved > 5 pixels)
          // Use 'buttons' for MouseEvent, assume button down for TouchEvent
          const isMouseDown = 'buttons' in e.evt ? e.evt.buttons === 1 : true;
          if (splitRectStart && isMouseDown) {
            const dx = Math.abs(currentPoint.x - splitRectStart.x);
            const dy = Math.abs(currentPoint.y - splitRectStart.y);
            // Only consider it a drag if moved more than 5 pixels in image coords
            if (dx > 5 || dy > 5) {
              setIsDraggingRect(true);
              setSplitRectEnd(currentPoint);
            }
          }

          // Track cursor for polygon preview when actively drawing polygon
          if (isSplitDrawing) {
            // Apply angle snapping when Shift is held and we have at least one point
            const previewPoint = (isShiftHeld && splitPolygonPoints.length > 0)
              ? snapToAngle(splitPolygonPoints[splitPolygonPoints.length - 1], currentPoint)
              : currentPoint;
            setSplitMousePos(previewPoint);

            // Check if near starting point for polygon completion (use original point for proximity check)
            if (splitPolygonPoints.length >= MIN_POLYGON_POINTS) {
              setIsSplitNearStart(isPointNearStart(currentPoint, splitPolygonPoints[0]));
            } else {
              setIsSplitNearStart(false);
            }
          }
        }
        return;
      }

      // Handle create mode mouse move
      if (toolMode === 'create') {
        const pointer = stage.getRelativePointerPosition();
        if (pointer) {
          const currentPoint = { x: pointer.x, y: pointer.y };

          // Check if we're dragging a rectangle (mouse button down and moved > 5 pixels)
          const isMouseDown = 'buttons' in e.evt ? e.evt.buttons === 1 : true;
          if (createRectStart && isMouseDown) {
            const dx = Math.abs(currentPoint.x - createRectStart.x);
            const dy = Math.abs(currentPoint.y - createRectStart.y);
            // Only consider it a drag if moved more than 5 pixels
            if (dx > 5 || dy > 5) {
              setIsDraggingCreateRect(true);
              setCreateRectEnd(currentPoint);
            }
          }

          // Track cursor for polygon preview when actively drawing polygon
          if (isDrawingPolygon) {
            // Apply angle snapping when Shift is held and we have at least one point
            const previewPoint = (isShiftHeld && drawingPoints.length > 0)
              ? snapToAngle(drawingPoints[drawingPoints.length - 1], currentPoint)
              : currentPoint;
            setMousePosition(previewPoint);

            // Check if near starting point for polygon completion (use original point for proximity check)
            if (drawingPoints.length >= MIN_POLYGON_POINTS) {
              setIsNearStart(isPointNearStart(currentPoint, drawingPoints[0]));
            } else {
              setIsNearStart(false);
            }
          }
        }
        return;
      }

      // Handle paint selection mode (dragging in select mode adds detections as cursor touches them)
      if (toolMode === 'select' && isPaintSelecting) {
        const pointer = stage.getPointerPosition();
        if (pointer) {
          const imageX = (pointer.x - position.x) / scale;
          const imageY = (pointer.y - position.y) / scale;
          const currentPoint = { x: imageX, y: imageY };

          // Find only the topmost detection at cursor position (not all overlapping ones)
          const topmost = findTopmostDetectionAtPoint(currentPoint, detections, selectedDetectionId);
          if (topmost && !paintSelectedIds.has(topmost.id)) {
            setPaintSelectedIds(prev => new Set([...prev, topmost.id]));
          }
        }
        return;
      }

      // For other modes, use getRelativePointerPosition (works for polygon drawing)
      const pointer = stage.getRelativePointerPosition();
      if (!pointer) return;

      const currentPoint = { x: pointer.x, y: pointer.y };
      setMousePosition(currentPoint);
    },
    [toolMode, isDrawingPolygon, drawingPoints, isPointNearStart, calibrationState.pointA, position, scale, lineStartPoint, isSplitDrawing, splitPolygonPoints, splitRectStart, createRectStart, calculateAutoPan, isShiftHeld, regionRectStart, isPaintSelecting, paintSelectedIds, detections, selectedDetectionId]
  );

  const handleStageMouseUp = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Handle paint selection completion (select mode)
      if (toolMode === 'select' && isPaintSelecting) {
        // Finalize the paint selection
        if (paintSelectedIds.size > 0 && onMultiSelect) {
          console.log('[Canvas] Paint selected:', paintSelectedIds.size, 'detections');
          onMultiSelect(Array.from(paintSelectedIds));
        } else if (paintSelectedIds.size === 0 && multiSelectMode) {
          // All items were toggled off - clear selection
          onSelectionChange(null, false);
        }
        // Reset paint selection state
        setIsPaintSelecting(false);
        setPaintSelectedIds(new Set());

        // Set flag to prevent detection's onClick from overriding selection
        paintSelectionJustCompletedRef.current = true;
        setTimeout(() => {
          paintSelectionJustCompletedRef.current = false;
        }, 50);
        return;
      }

      // Handle region detect mode - execute region selection
      if (toolMode === 'region_detect' && regionRectStart) {
        if (isDraggingRegion && regionRectEnd) {
          console.log('[Region Detect MouseUp] Executing region selection');
          executeRegionSelection();
        } else {
          // Just clicked, not dragged - cancel
          console.log('[Region Detect MouseUp] No drag detected, cancelling');
          cancelRegionDrawing();
        }
        return;
      }

      // Handle create mode - distinguish between rectangle drag and polygon click
      if (toolMode === 'create' && createRectStart) {
        if (isDraggingCreateRect && createRectEnd) {
          // User was dragging - create detection with rectangle
          console.log('[Create MouseUp] Executing rectangle create');
          completeRectangleCreate();
        } else {
          // User clicked (no drag) - add polygon vertex
          console.log('[Create MouseUp] Adding polygon point at', createRectStart);

          if (!isDrawingPolygon) {
            // Start new polygon (first point - no snapping needed)
            setIsDrawingPolygon(true);
            setDrawingPoints([createRectStart]);
            setMousePosition(createRectStart);
          } else {
            // Add point to existing polygon - apply snapping if Shift is held
            const pointToAdd = (isShiftHeld && drawingPoints.length > 0)
              ? snapToAngle(drawingPoints[drawingPoints.length - 1], createRectStart)
              : createRectStart;
            setDrawingPoints(prev => [...prev, pointToAdd]);
          }

          // Reset rectangle state but keep polygon drawing active
          setCreateRectStart(null);
          setCreateRectEnd(null);
          setIsDraggingCreateRect(false);
        }
      }

      // Handle split mode - distinguish between rectangle drag and polygon click
      if (toolMode === 'split' && splitRectStart) {
        if (isDraggingRect && splitRectEnd) {
          // User was dragging - execute split with rectangle
          console.log('[Split MouseUp] Executing rectangle split');
          executeSplitWithRect();
        } else {
          // User clicked (no drag) - add polygon vertex
          console.log('[Split MouseUp] Adding polygon point at', splitRectStart);

          if (!isSplitDrawing) {
            // Start new polygon (first point - no snapping needed)
            setIsSplitDrawing(true);
            setSplitPolygonPoints([splitRectStart]);
            setSplitMousePos(splitRectStart);
          } else {
            // Add point to existing polygon - apply snapping if Shift is held
            const pointToAdd = (isShiftHeld && splitPolygonPoints.length > 0)
              ? snapToAngle(splitPolygonPoints[splitPolygonPoints.length - 1], splitRectStart)
              : splitRectStart;
            setSplitPolygonPoints(prev => [...prev, pointToAdd]);
          }

          // Reset rectangle state but keep polygon drawing active
          setSplitRectStart(null);
          setSplitRectEnd(null);
          setIsDraggingRect(false);
        }
      }
    },
    [toolMode, createRectStart, createRectEnd, isDraggingCreateRect, isDrawingPolygon, completeRectangleCreate, splitRectStart, splitRectEnd, isDraggingRect, isSplitDrawing, executeSplitWithRect, isShiftHeld, drawingPoints, splitPolygonPoints, regionRectStart, regionRectEnd, isDraggingRegion, executeRegionSelection, cancelRegionDrawing, isPaintSelecting, paintSelectedIds, onMultiSelect, multiSelectMode, onSelectionChange]
  );

  const handleStageDoubleClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Handle double-click to complete split polygon
      if (toolMode === 'split' && isSplitDrawing && splitPolygonPoints.length >= MIN_POLYGON_POINTS) {
        e.evt.preventDefault();
        completeSplitPolygon();
        return;
      }

      // Handle double-click to complete create polygon
      if (toolMode !== 'create' || !isDrawingPolygon) return;

      e.evt.preventDefault();

      if (drawingPoints.length >= MIN_POLYGON_POINTS) {
        completePolygon();
      }
    },
    [toolMode, isDrawingPolygon, drawingPoints.length, completePolygon, isSplitDrawing, splitPolygonPoints.length, completeSplitPolygon]
  );

  // Right-click to complete polygon/split (if enough points) or cancel/exit drawing mode
  // In select mode, right-click on a detection shows context menu
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();

      // Split polygon drawing - complete if >= 3 points, otherwise cancel
      if (isSplitDrawing) {
        if (splitPolygonPoints.length >= MIN_POLYGON_POINTS) {
          completeSplitPolygon();
        } else {
          cancelSplitDrawing();
        }
        return;
      }

      // Polygon drawing - complete if >= 3 points, otherwise cancel
      if (isDrawingPolygon) {
        if (drawingPoints.length >= MIN_POLYGON_POINTS) {
          completePolygon();
        } else {
          cancelDrawing();
        }
        return;
      }

      // Cancel line drawing
      if (lineStartPoint) {
        setLineStartPoint(null);
        setCalibrationMousePos(null);
        return;
      }

      // Exit point mode, line mode, or split mode (when not actively drawing)
      if (toolMode === 'point' || toolMode === 'line' || toolMode === 'split') {
        onExitDrawingMode?.();
        return;
      }

      // In select mode, check if right-click is on a detection for context menu
      if (toolMode === 'select' && onDetectionContextMenu) {
        // Check if the click target or any parent has a detection ID
        // The name attribute is on the Group, but the click target might be a child shape
        let node: Konva.Node | null = e.target;
        console.log('[ContextMenu] Right-click on node:', e.target.getClassName(), 'name:', e.target.name());
        while (node) {
          const nodeName = node.name();
          console.log('[ContextMenu] Checking node:', node.getClassName(), 'name:', nodeName);
          if (nodeName && nodeName.startsWith('detection-')) {
            const detectionId = nodeName.replace('detection-', '');
            console.log('[ContextMenu] Found detection name, extracted ID:', detectionId);
            const detection = detections.find(d => d.id === detectionId);
            if (detection) {
              console.log('[ContextMenu] Found detection:', detection.id, 'class:', detection.class, 'markup_type:', detection.markup_type);
              // Get screen position for the context menu
              const screenPosition = {
                x: e.evt.clientX,
                y: e.evt.clientY,
              };
              onDetectionContextMenu(detection, screenPosition);
              return;
            } else {
              console.error('[ContextMenu] Detection NOT FOUND for ID:', detectionId, 'detections count:', detections.length);
            }
          }
          node = node.parent;
        }
        console.log('[ContextMenu] No detection found in node hierarchy');
      }
    },
    [isDrawingPolygon, drawingPoints.length, completePolygon, cancelDrawing, lineStartPoint, toolMode, onExitDrawingMode, isSplitDrawing, splitPolygonPoints.length, completeSplitPolygon, cancelSplitDrawing, onDetectionContextMenu, detections]
  );

  // Escape key to cancel drawing, calibration, line drawing, or split
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDrawingPolygon || isDraggingCreateRect || createRectStart) {
          e.preventDefault();
          cancelDrawing();
        }
        if (calibrationState.isCalibrating || calibrationState.pointA) {
          e.preventDefault();
          resetCalibration();
        }
        if (lineStartPoint) {
          e.preventDefault();
          setLineStartPoint(null);
          setCalibrationMousePos(null);
        }
        if (isSplitDrawing || isDraggingRect || splitRectStart) {
          e.preventDefault();
          cancelSplitDrawing();
        }
        // Exit split mode on escape
        if (toolMode === 'split') {
          e.preventDefault();
          onExitDrawingMode?.();
        }
        // Cancel region detection drawing
        if (isDraggingRegion || regionRectStart) {
          e.preventDefault();
          cancelRegionDrawing();
        }
        // Exit region_detect mode on escape
        if (toolMode === 'region_detect') {
          e.preventDefault();
          onExitDrawingMode?.();
        }
        // Cancel paint selection
        if (isPaintSelecting) {
          e.preventDefault();
          setIsPaintSelecting(false);
          setPaintSelectedIds(new Set());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingPolygon, isDraggingCreateRect, createRectStart, cancelDrawing, calibrationState.isCalibrating, calibrationState.pointA, resetCalibration, lineStartPoint, isSplitDrawing, isDraggingRect, splitRectStart, cancelSplitDrawing, toolMode, onExitDrawingMode, isDraggingRegion, regionRectStart, cancelRegionDrawing, isPaintSelecting]);

  // ==========================================================================
  // Detection Handlers
  // ==========================================================================

  const handleDetectionSelect = useCallback(
    (id: string, addToSelection: boolean) => {
      // Skip if paint selection just completed (prevents click from overriding paint selection)
      if (paintSelectionJustCompletedRef.current) {
        return;
      }

      if (toolMode === 'select' || toolMode === 'verify') {
        // If multiSelectMode is enabled, always add to selection
        // (OR with modifier key check from child components)
        onSelectionChange(id, addToSelection || multiSelectMode);
      }
    },
    [toolMode, onSelectionChange, multiSelectMode]
  );

  const handlePolygonUpdate = useCallback(
    (detection: ExtractionDetection, updates: PolygonUpdatePayload) => {
      onDetectionPolygonUpdate?.(detection, updates);
    },
    [onDetectionPolygonUpdate]
  );

  const handleLineUpdate = useCallback(
    (detection: ExtractionDetection, updates: LineUpdatePayload) => {
      onDetectionLineUpdate?.(detection, updates);
    },
    [onDetectionLineUpdate]
  );

  const handlePointUpdate = useCallback(
    (detection: ExtractionDetection, updates: PointUpdatePayload) => {
      onDetectionPointUpdate?.(detection, updates);
    },
    [onDetectionPointUpdate]
  );

  // ==========================================================================
  // Drawing Color for Polygon Preview
  // ==========================================================================

  const drawingColor = DETECTION_CLASS_COLORS[activeClass] || DETECTION_CLASS_COLORS[''];

  // ==========================================================================
  // Cursor Style
  // ==========================================================================

  // Determine if we're in a mode that requires consistent crosshair cursor
  // This is used to prevent child elements from overriding the cursor
  const isDrawingMode =
    isDrawingPolygon ||
    lineStartPoint !== null ||
    isSplitDrawing ||
    isDraggingRegion ||
    toolMode === 'create' ||
    toolMode === 'line' ||
    toolMode === 'point' ||
    toolMode === 'calibrate' ||
    toolMode === 'split' ||
    toolMode === 'region_detect' ||
    toolMode === 'sam_select';

  // Enforce cursor on the Konva stage container when tool mode changes.
  // This ensures the cursor is set directly on Konva's internal container div,
  // not just the parent wrapper. Clears on exit so parent div cursor cascades.
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;

    if (isDrawingMode) {
      container.style.cursor = 'crosshair';
    } else if (toolMode === 'pan') {
      container.style.cursor = 'grab';
    } else if (toolMode === 'verify') {
      container.style.cursor = 'pointer';
    } else {
      // Remove inline cursor so parent div's cursor cascades through
      container.style.cursor = '';
    }
  }, [isDrawingMode, toolMode]);

  const getCursor = () => {
    if (isDrawingPolygon) return 'crosshair';
    if (lineStartPoint) return 'crosshair';
    if (isSplitDrawing) return 'crosshair';
    if (isDraggingRegion) return 'crosshair';
    switch (toolMode) {
      case 'pan':
        return 'grab';
      case 'create':
        return 'crosshair';
      case 'line':
        return 'crosshair';
      case 'point':
        return 'crosshair';
      case 'calibrate':
        return 'crosshair';
      case 'split':
        return 'crosshair';
      case 'region_detect':
        return 'crosshair';
      case 'sam_select':
        return 'crosshair';
      case 'verify':
        return 'pointer';
      default:
        return 'default';
    }
  };

  // ==========================================================================
  // Sort Detections for Rendering
  // ==========================================================================

  const sortedDetections = [...detections]
    .filter((d) => d.status !== 'deleted')
    .sort((a, b) => {
      // Selected items render on top
      const aSelected = a.id === selectedDetectionId;
      const bSelected = b.id === selectedDetectionId;
      if (aSelected !== bSelected) {
        return aSelected ? 1 : -1;
      }
      // Within same selection state, larger areas render first (smaller on top)
      const aArea = a.pixel_width * a.pixel_height;
      const bArea = b.pixel_width * b.pixel_height;
      return bArea - aArea;
    });

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div
      className={`w-full h-full overflow-hidden ${isDrawingMode ? 'drawing-mode-active' : ''}`}
      style={{
        cursor: getCursor(),
        backgroundColor: '#1a1a2e',
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px',
      }}
    >
      {/* Force crosshair cursor during drawing modes - prevents child elements from overriding */}
      {isDrawingMode && (
        <style>{`
          .drawing-mode-active,
          .drawing-mode-active *,
          .drawing-mode-active canvas {
            cursor: crosshair !important;
          }
        `}</style>
      )}
      <Stage
        ref={stageRef}
        width={containerWidth}
        height={containerHeight}
        x={position.x}
        y={position.y}
        scaleX={scale}
        scaleY={scale}
        draggable={toolMode === 'pan'}
        onWheel={handleWheel}
        onDragEnd={handleStageDragEnd}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={handleStageMouseUp}
        onDblClick={handleStageDoubleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleStageMouseDown}
        onTouchMove={handleStageMouseMove}
        onTouchEnd={handleStageMouseUp}
      >
        <Layer>
          {/* Background: PDF (preferred for crisp zoom) or Image (fallback) */}
          {/* When using PDF, Konva scales the hi-res canvas to fit the display dimensions */}
          {/* listening={false} prevents background from capturing mouse events */}
          {usePdfRendering ? (
            <KonvaImage
              image={pdfCanvas!}
              width={effectiveWidth}
              height={effectiveHeight}
              listening={false}
            />
          ) : image ? (
            <KonvaImage
              ref={imageRef}
              image={image}
              width={imageWidth}
              height={imageHeight}
              listening={false}
            />
          ) : null}

          {/* Detection Polygons (filter out lines and points) */}
          {sortedDetections
            .filter((d) => d.markup_type !== 'line' && d.markup_type !== 'point')
            .map((detection) => (
              <KonvaDetectionPolygon
                key={detection.id}
                detection={detection}
                isSelected={selectedIds.has(detection.id)}
                isHovered={detection.id === hoveredId}
                scale={scale}
                scaleRatio={scaleRatio}
                onSelect={handleDetectionSelect}
                onHoverStart={setHoveredId}
                onHoverEnd={() => setHoveredId(null)}
                onPolygonUpdate={handlePolygonUpdate}
                showArea={true}
                draggable={toolMode === 'select'}
                dimmed={isDetectionDimmed?.(detection) ?? false}
              />
            ))}

          {/* Detection Lines */}
          {sortedDetections
            .filter((d) => d.markup_type === 'line')
            .map((detection) => (
              <KonvaDetectionLine
                key={detection.id}
                detection={detection}
                isSelected={selectedIds.has(detection.id)}
                isHovered={detection.id === hoveredId}
                scale={scale}
                scaleRatio={scaleRatio}
                onSelect={handleDetectionSelect}
                onHoverStart={setHoveredId}
                onHoverEnd={() => setHoveredId(null)}
                onLineUpdate={handleLineUpdate}
                showLength={true}
                draggable={toolMode === 'select'}
              />
            ))}

          {/* Detection Points (Count Markers) */}
          {/* Note: corner_inside and corner_outside are excluded - they come from floor plan analysis with unreliable pixel coordinates */}
          {sortedDetections
            .filter((d) => d.markup_type === 'point' && d.class !== 'corner_inside' && d.class !== 'corner_outside')
            .map((detection) => (
              <KonvaDetectionPoint
                key={detection.id}
                detection={detection}
                isSelected={selectedIds.has(detection.id)}
                isHovered={detection.id === hoveredId}
                scale={scale}
                onSelect={handleDetectionSelect}
                onHoverStart={setHoveredId}
                onHoverEnd={() => setHoveredId(null)}
                onPointUpdate={handlePointUpdate}
                draggable={toolMode === 'select'}
              />
            ))}

          {/* Pending Detections from Region Detect and SAM */}
          {pendingDetections.map((pending) => {
            const color = DETECTION_CLASS_COLORS[pending.class] || '#8b5cf6';
            // Use polygon_points if available, otherwise create rectangle points from CENTER coordinates
            // pixel_x, pixel_y are CENTER coordinates (same as Roboflow detections)
            const halfWidth = pending.pixel_width / 2;
            const halfHeight = pending.pixel_height / 2;
            const points = pending.polygon_points && pending.polygon_points.length >= 3
              ? pending.polygon_points.flatMap(p => [p.x, p.y])
              : [
                  pending.pixel_x - halfWidth, pending.pixel_y - halfHeight,  // top-left
                  pending.pixel_x + halfWidth, pending.pixel_y - halfHeight,  // top-right
                  pending.pixel_x + halfWidth, pending.pixel_y + halfHeight,  // bottom-right
                  pending.pixel_x - halfWidth, pending.pixel_y + halfHeight,  // bottom-left
                ];

            return (
              <Line
                key={`pending-${pending.id}`}
                points={points}
                closed={true}
                fill={`${color}15`}
                stroke="#8b5cf6"
                strokeWidth={2 / scale}
                dash={[8 / scale, 4 / scale]}
                shadowColor="#8b5cf6"
                shadowBlur={8 / scale}
                shadowOpacity={0.5}
                listening={false}
              />
            );
          })}

          {/* SAM Magic Select Overlay */}
          {toolMode === 'sam_select' && (samResult || isSAMSegmenting || samClickPoints.length > 0) && (
            <SAMSelectOverlay
              result={samResult}
              clickPoints={samClickPoints}
              isSegmenting={isSAMSegmenting}
              scale={1}
              offset={{ x: 0, y: 0 }}
            />
          )}

          {/* Point-by-Point Polygon Drawing Preview */}
          {isDrawingPolygon && drawingPoints.length > 0 && (
            <>
              {/* Lines between placed points */}
              <Line
                points={flattenPoints(drawingPoints)}
                stroke={drawingColor}
                strokeWidth={2 / scale}
                dash={[5 / scale, 5 / scale]}
                closed={false}
                listening={false}
              />

              {/* Preview line from last point to mouse */}
              {mousePosition && (
                <Line
                  points={[
                    drawingPoints[drawingPoints.length - 1].x,
                    drawingPoints[drawingPoints.length - 1].y,
                    mousePosition.x,
                    mousePosition.y,
                  ]}
                  stroke={drawingColor}
                  strokeWidth={1 / scale}
                  dash={[3 / scale, 3 / scale]}
                  opacity={0.5}
                  listening={false}
                />
              )}

              {/* Closing line preview when near start */}
              {mousePosition && isNearStart && drawingPoints.length >= MIN_POLYGON_POINTS && (
                <Line
                  points={[
                    mousePosition.x,
                    mousePosition.y,
                    drawingPoints[0].x,
                    drawingPoints[0].y,
                  ]}
                  stroke="#22c55e"
                  strokeWidth={2 / scale}
                  dash={[4 / scale, 4 / scale]}
                  opacity={0.8}
                  listening={false}
                />
              )}

              {/* Placed points */}
              {drawingPoints.map((point, idx) => (
                <Circle
                  key={idx}
                  x={point.x}
                  y={point.y}
                  radius={(idx === 0 ? 6 : 4) / scale}
                  fill={idx === 0 && isNearStart ? '#22c55e' : drawingColor}
                  stroke="#ffffff"
                  strokeWidth={1.5 / scale}
                  listening={false}
                  shadowColor={idx === 0 && isNearStart ? '#22c55e' : undefined}
                  shadowBlur={idx === 0 && isNearStart ? 8 / scale : 0}
                  shadowOpacity={idx === 0 && isNearStart ? 0.8 : 0}
                />
              ))}
            </>
          )}

          {/* Create Rectangle Preview (when dragging in create mode) */}
          {isDraggingCreateRect && createRectStart && createRectEnd && (
            <Rect
              x={Math.min(createRectStart.x, createRectEnd.x)}
              y={Math.min(createRectStart.y, createRectEnd.y)}
              width={Math.abs(createRectEnd.x - createRectStart.x)}
              height={Math.abs(createRectEnd.y - createRectStart.y)}
              stroke={drawingColor}
              strokeWidth={2 / scale}
              dash={[8 / scale, 4 / scale]}
              fill={`${drawingColor}26`}
              listening={false}
            />
          )}

          {/* Calibration Line Overlay */}
          {toolMode === 'calibrate' && calibrationState.pointA && (
            <>
              {/* Point A marker */}
              <Circle
                x={calibrationState.pointA.x}
                y={calibrationState.pointA.y}
                radius={6 / scale}
                fill="#FF00FF"
                stroke="#FFFFFF"
                strokeWidth={2 / scale}
                listening={false}
              />

              {/* Preview line from Point A to mouse position */}
              {calibrationMousePos && !calibrationState.pointB && (
                <Line
                  points={[
                    calibrationState.pointA.x,
                    calibrationState.pointA.y,
                    calibrationMousePos.x,
                    calibrationMousePos.y,
                  ]}
                  stroke="#FF00FF"
                  strokeWidth={3 / scale}
                  dash={[10 / scale, 5 / scale]}
                  listening={false}
                />
              )}

              {/* Final line and Point B (when completed) */}
              {calibrationState.pointB && (
                <>
                  <Line
                    points={[
                      calibrationState.pointA.x,
                      calibrationState.pointA.y,
                      calibrationState.pointB.x,
                      calibrationState.pointB.y,
                    ]}
                    stroke="#FF00FF"
                    strokeWidth={3 / scale}
                    dash={[10 / scale, 5 / scale]}
                    listening={false}
                  />
                  <Circle
                    x={calibrationState.pointB.x}
                    y={calibrationState.pointB.y}
                    radius={6 / scale}
                    fill="#FF00FF"
                    stroke="#FFFFFF"
                    strokeWidth={2 / scale}
                    listening={false}
                  />
                </>
              )}
            </>
          )}

          {/* Line Drawing Preview */}
          {toolMode === 'line' && lineStartPoint && (
            <>
              {/* Start point marker */}
              <Circle
                x={lineStartPoint.x}
                y={lineStartPoint.y}
                radius={6 / scale}
                fill={drawingColor}
                stroke="#FFFFFF"
                strokeWidth={2 / scale}
                listening={false}
              />

              {/* Preview line from start to mouse position */}
              {calibrationMousePos && (
                <>
                  <Line
                    points={[
                      lineStartPoint.x,
                      lineStartPoint.y,
                      calibrationMousePos.x,
                      calibrationMousePos.y,
                    ]}
                    stroke={drawingColor}
                    strokeWidth={3 / scale}
                    dash={[10 / scale, 5 / scale]}
                    lineCap="round"
                    listening={false}
                  />
                  <Circle
                    x={calibrationMousePos.x}
                    y={calibrationMousePos.y}
                    radius={5 / scale}
                    fill={drawingColor}
                    stroke="#FFFFFF"
                    strokeWidth={1.5 / scale}
                    opacity={0.7}
                    listening={false}
                  />
                </>
              )}
            </>
          )}

          {/* Split Polygon Preview */}
          {isSplitDrawing && splitPolygonPoints.length > 0 && (
            <>
              {/* Completed edges (solid red) */}
              {splitPolygonPoints.length >= 2 && (
                <Line
                  points={splitPolygonPoints.flatMap(p => [p.x, p.y])}
                  stroke="#ef4444"
                  strokeWidth={2 / scale}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              )}

              {/* Preview line to cursor (dashed red) */}
              {splitMousePos && splitPolygonPoints.length >= 1 && (
                <Line
                  points={[
                    splitPolygonPoints[splitPolygonPoints.length - 1].x,
                    splitPolygonPoints[splitPolygonPoints.length - 1].y,
                    splitMousePos.x,
                    splitMousePos.y,
                  ]}
                  stroke="#ef4444"
                  strokeWidth={2 / scale}
                  dash={[5 / scale, 5 / scale]}
                  lineCap="round"
                  listening={false}
                />
              )}

              {/* Closing line preview (when near start) */}
              {splitMousePos && isSplitNearStart && (
                <Line
                  points={[
                    splitMousePos.x,
                    splitMousePos.y,
                    splitPolygonPoints[0].x,
                    splitPolygonPoints[0].y,
                  ]}
                  stroke="#22c55e"
                  strokeWidth={2 / scale}
                  dash={[5 / scale, 5 / scale]}
                  lineCap="round"
                  listening={false}
                />
              )}

              {/* Vertex points */}
              {splitPolygonPoints.map((point, idx) => (
                <Circle
                  key={`split-point-${idx}`}
                  x={point.x}
                  y={point.y}
                  radius={idx === 0 ? 8 / scale : 5 / scale}
                  fill={idx === 0 ? (isSplitNearStart ? '#22c55e' : '#ef4444') : '#ef4444'}
                  stroke="#FFFFFF"
                  strokeWidth={2 / scale}
                  listening={false}
                />
              ))}

              {/* Cursor position indicator */}
              {splitMousePos && !isSplitNearStart && (
                <Circle
                  x={splitMousePos.x}
                  y={splitMousePos.y}
                  radius={4 / scale}
                  fill="#ef4444"
                  opacity={0.5}
                  listening={false}
                />
              )}
            </>
          )}

          {/* Split Rectangle Preview (when dragging) */}
          {isDraggingRect && splitRectStart && splitRectEnd && (
            <Rect
              x={Math.min(splitRectStart.x, splitRectEnd.x)}
              y={Math.min(splitRectStart.y, splitRectEnd.y)}
              width={Math.abs(splitRectEnd.x - splitRectStart.x)}
              height={Math.abs(splitRectEnd.y - splitRectStart.y)}
              stroke="#ef4444"
              strokeWidth={2 / scale}
              dash={[8 / scale, 4 / scale]}
              fill="rgba(239, 68, 68, 0.15)"
              listening={false}
            />
          )}

          {/* Region Detect Rectangle Preview (when dragging) */}
          {isDraggingRegion && regionRectStart && regionRectEnd && (
            <>
              <Rect
                x={Math.min(regionRectStart.x, regionRectEnd.x)}
                y={Math.min(regionRectStart.y, regionRectEnd.y)}
                width={Math.abs(regionRectEnd.x - regionRectStart.x)}
                height={Math.abs(regionRectEnd.y - regionRectStart.y)}
                stroke="#3b82f6"
                strokeWidth={2 / scale}
                dash={[8 / scale, 4 / scale]}
                fill="rgba(59, 130, 246, 0.15)"
                listening={false}
              />
              {/* Corner markers */}
              <Circle
                x={regionRectStart.x}
                y={regionRectStart.y}
                radius={4 / scale}
                fill="#3b82f6"
                stroke="#ffffff"
                strokeWidth={1.5 / scale}
                listening={false}
              />
              <Circle
                x={regionRectEnd.x}
                y={regionRectEnd.y}
                radius={4 / scale}
                fill="#3b82f6"
                stroke="#ffffff"
                strokeWidth={1.5 / scale}
                listening={false}
              />
            </>
          )}

          {/* Loading indicator during region detection */}
          {isRegionDetecting && (
            <Rect
              x={0}
              y={0}
              width={effectiveWidth}
              height={effectiveHeight}
              fill="rgba(0, 0, 0, 0.3)"
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* Scale Indicator */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1.5 rounded-md text-sm font-mono">
        {Math.round(scale * 100)}%
      </div>

      {/* Loading State */}
      {(!imageLoaded && !usePdfRendering) && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
          <div className="text-gray-400">
            {pdfUrl && pdfLoading ? 'Loading PDF...' : 'Loading image...'}
          </div>
        </div>
      )}

      {/* PDF Rendering Indicator (subtle, in corner) */}
      {usePdfRendering && (
        <div className="absolute bottom-4 left-24 bg-green-900/70 text-green-300 px-2 py-1 rounded text-xs font-mono">
          PDF
        </div>
      )}
    </div>
  );
}
