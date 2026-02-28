'use client';

import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import type {
  ExtractionDetection,
  DetectionClass,
  AllDetectionClasses,
  ViewTransform,
  ToolMode,
  ResizeHandle,
  PolygonPoints,
  SimplePolygonPoint,
} from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS, isPolygonWithHoles } from '@/lib/types/extraction';
import DetectionBox from './DetectionBox';
import { getSidingPolygons, type SidingPolygonResponse } from '@/lib/api/extractionApi';

// =============================================================================
// Types
// =============================================================================

export interface DetectionCanvasProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  detections: ExtractionDetection[];
  overlayDetections?: ExtractionDetection[]; // All detections including building/exterior_wall for overlay
  selectedIds: Set<string>;
  hoveredId: string | null;
  toolMode: ToolMode;
  createClass: DetectionClass;
  transform: ViewTransform;
  onTransformChange: (transform: ViewTransform) => void;
  onSelect: (id: string, addToSelection: boolean) => void;
  onClearSelection: () => void;
  onHover: (id: string | null) => void;
  // Changed from delta to absolute position to fix compounding movement bug
  onMoveDetection: (id: string, newX: number, newY: number) => void;
  onResizeDetection: (id: string, newBounds: { x: number; y: number; width: number; height: number }) => void;
  onCreateDetection: (bounds: { x: number; y: number; width: number; height: number }, detectionClass: DetectionClass) => void;
  onVerifyDetection: (id: string) => void;
  showDimensions?: boolean;
  showArea?: boolean;
  showMarkupOverlay?: boolean;
  showSidingOverlay?: boolean;
  pageId?: string; // Required for siding polygon fetch
}

interface DragStart {
  x: number;
  y: number;
  detectionX: number;
  detectionY: number;
  detectionId: string;
}

interface ResizeState {
  detectionId: string;
  handle: ResizeHandle;
  startBounds: { x: number; y: number; width: number; height: number };
  startMouse: { x: number; y: number };
}

interface PanStart {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_FACTOR = 0.1;
const MIN_DETECTION_SIZE = 5;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate new bounds during resize based on handle being dragged
 */
function calculateResizeBounds(
  handle: ResizeHandle,
  startBounds: { x: number; y: number; width: number; height: number },
  deltaX: number,
  deltaY: number
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = startBounds;

  switch (handle) {
    case 'nw':
      x += deltaX;
      y += deltaY;
      width -= deltaX;
      height -= deltaY;
      break;
    case 'n':
      y += deltaY;
      height -= deltaY;
      break;
    case 'ne':
      y += deltaY;
      width += deltaX;
      height -= deltaY;
      break;
    case 'w':
      x += deltaX;
      width -= deltaX;
      break;
    case 'e':
      width += deltaX;
      break;
    case 'sw':
      x += deltaX;
      width -= deltaX;
      height += deltaY;
      break;
    case 's':
      height += deltaY;
      break;
    case 'se':
      width += deltaX;
      height += deltaY;
      break;
  }

  // Ensure minimum size and prevent negative dimensions
  if (width < MIN_DETECTION_SIZE) {
    if (handle.includes('w')) {
      x = startBounds.x + startBounds.width - MIN_DETECTION_SIZE;
    }
    width = MIN_DETECTION_SIZE;
  }
  if (height < MIN_DETECTION_SIZE) {
    if (handle.includes('n')) {
      y = startBounds.y + startBounds.height - MIN_DETECTION_SIZE;
    }
    height = MIN_DETECTION_SIZE;
  }

  return { x, y, width, height };
}

/**
 * Get cursor style based on tool mode and current action
 */
function getCursor(
  toolMode: ToolMode,
  isPanning: boolean,
  isDragging: boolean,
  isDrawing: boolean
): string {
  if (isPanning) return 'grabbing';
  if (isDragging) return 'move';
  if (isDrawing) return 'crosshair';

  switch (toolMode) {
    case 'pan':
      return 'grab';
    case 'create':
      return 'crosshair';
    case 'verify':
      return 'pointer';
    case 'select':
    default:
      return 'default';
  }
}

/**
 * Format dimension for drawing preview
 */
function formatPixelDimension(pixels: number): string {
  return `${Math.round(pixels)}px`;
}

/**
 * Format feet to feet-inches notation (matches DetectionBox format)
 * Example: 3.75 -> "3'-9""
 */
function formatDimension(feet: number): string {
  const wholeFeet = Math.floor(feet);
  const inches = Math.round((feet - wholeFeet) * 12);
  if (inches === 0) return `${wholeFeet}'`;
  if (inches === 12) return `${wholeFeet + 1}'`;
  return `${wholeFeet}'-${inches}"`;
}

/**
 * Ray casting algorithm for point-in-polygon test
 */
function isPointInPolygon(px: number, py: number, polygon: SimplePolygonPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if point is inside a detection (supports both polygons and rectangles)
 */
function isPointInDetection(
  px: number,
  py: number,
  detection: ExtractionDetection
): boolean {
  const { pixel_x, pixel_y, pixel_width, pixel_height, polygon_points } = detection;

  // Check polygon if available
  if (polygon_points) {
    const points = isPolygonWithHoles(polygon_points) ? polygon_points.outer : polygon_points;
    if (Array.isArray(points) && points.length >= 3) {
      return isPointInPolygon(px, py, points);
    }
  }

  // Fall back to bounding box check (center-based coordinates)
  const x = pixel_x - pixel_width / 2;
  const y = pixel_y - pixel_height / 2;
  return px >= x && px <= x + pixel_width && py >= y && py <= y + pixel_height;
}

/**
 * Convert polygon points to SVG points string
 */
function getPolygonPointsString(polygonPoints: PolygonPoints): string {
  const points = isPolygonWithHoles(polygonPoints) ? polygonPoints.outer : polygonPoints;
  return points.map((p: SimplePolygonPoint) => `${p.x},${p.y}`).join(' ');
}

/**
 * Check if detection has valid polygon points
 */
function hasValidPolygon(polygonPoints: PolygonPoints | null | undefined): polygonPoints is PolygonPoints {
  if (!polygonPoints) return false;
  const points = isPolygonWithHoles(polygonPoints) ? polygonPoints.outer : polygonPoints;
  return Array.isArray(points) && points.length >= 3;
}

// =============================================================================
// Component
// =============================================================================

const DetectionCanvas = memo(function DetectionCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  detections,
  overlayDetections,
  selectedIds,
  hoveredId,
  toolMode,
  createClass,
  transform,
  onTransformChange,
  onSelect,
  onClearSelection,
  onHover,
  onMoveDetection,
  onResizeDetection,
  onCreateDetection,
  onVerifyDetection,
  showDimensions = true,
  showArea = true,
  showMarkupOverlay = false,
  showSidingOverlay = false,
  pageId,
}: DetectionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Interaction state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<DragStart | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<PanStart | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // Overlay hover state
  const [hoveredOverlay, setHoveredOverlay] = useState<{
    detection: ExtractionDetection;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  // Siding polygon data state
  const [sidingData, setSidingData] = useState<SidingPolygonResponse | null>(null);

  // ==========================================================================
  // Coordinate Conversion
  // ==========================================================================

  const screenToImage = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const x = (screenX - rect.left - transform.offsetX) / transform.scale;
      const y = (screenY - rect.top - transform.offsetY) / transform.scale;
      return { x, y };
    },
    [transform]
  );

  const imageToScreen = useCallback(
    (imageX: number, imageY: number): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const x = imageX * transform.scale + transform.offsetX + rect.left;
      const y = imageY * transform.scale + transform.offsetY + rect.top;
      return { x, y };
    },
    [transform]
  );

  // ==========================================================================
  // Zoom Handling
  // ==========================================================================

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();

      const zoomFactor = e.deltaY > 0 ? 1 - ZOOM_FACTOR : 1 + ZOOM_FACTOR;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale * zoomFactor));

      if (newScale === transform.scale) return;

      // Get mouse position relative to container
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calculate the point in image coordinates under the mouse
      const imageX = (mouseX - transform.offsetX) / transform.scale;
      const imageY = (mouseY - transform.offsetY) / transform.scale;

      // Calculate new offsets to keep the point under the mouse stationary
      const newOffsetX = mouseX - imageX * newScale;
      const newOffsetY = mouseY - imageY * newScale;

      onTransformChange({
        scale: newScale,
        offsetX: newOffsetX,
        offsetY: newOffsetY,
      });
    },
    [transform, onTransformChange]
  );

  // ==========================================================================
  // Detection Box Callbacks
  // ==========================================================================

  const handleDragStart = useCallback(
    (id: string, startX: number, startY: number) => {
      if (toolMode !== 'select') return;

      const detection = detections.find((d) => d.id === id);
      if (!detection) return;

      // Select the detection if not already selected
      if (!selectedIds.has(id)) {
        onSelect(id, false);
      }

      setIsDragging(true);
      setDragStart({
        x: startX,
        y: startY,
        detectionX: detection.pixel_x,
        detectionY: detection.pixel_y,
        detectionId: id,
      });
    },
    [toolMode, detections, selectedIds, onSelect]
  );

  const handleResizeStart = useCallback(
    (id: string, handle: ResizeHandle, startX: number, startY: number) => {
      const detection = detections.find((d) => d.id === id);
      if (!detection) return;

      setIsResizing(true);
      setResizeState({
        detectionId: id,
        handle,
        startBounds: {
          x: detection.pixel_x,
          y: detection.pixel_y,
          width: detection.pixel_width,
          height: detection.pixel_height,
        },
        startMouse: { x: startX, y: startY },
      });
    },
    [detections]
  );

  const handleHoverStart = useCallback(
    (id: string) => {
      onHover(id);
    },
    [onHover]
  );

  const handleHoverEnd = useCallback(() => {
    onHover(null);
  }, [onHover]);

  // ==========================================================================
  // Mouse Handlers
  // ==========================================================================

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle mouse button always pans
      if (e.button === 1) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({
          x: e.clientX,
          y: e.clientY,
          offsetX: transform.offsetX,
          offsetY: transform.offsetY,
        });
        return;
      }

      // Only left mouse button for other actions
      if (e.button !== 0) return;

      const imageCoords = screenToImage(e.clientX, e.clientY);

      // Pan mode
      if (toolMode === 'pan') {
        setIsPanning(true);
        setPanStart({
          x: e.clientX,
          y: e.clientY,
          offsetX: transform.offsetX,
          offsetY: transform.offsetY,
        });
        return;
      }

      // Shift+click on empty space also pans
      if (e.shiftKey && e.target === svgRef.current) {
        setIsPanning(true);
        setPanStart({
          x: e.clientX,
          y: e.clientY,
          offsetX: transform.offsetX,
          offsetY: transform.offsetY,
        });
        return;
      }

      // Create mode - start drawing
      if (toolMode === 'create') {
        setIsDrawing(true);
        setDrawStart(imageCoords);
        setDrawCurrent(imageCoords);
        return;
      }

      // Select mode - clicking on empty space clears selection
      if (toolMode === 'select' && e.target === svgRef.current) {
        onClearSelection();
      }
    },
    [toolMode, transform, screenToImage, onClearSelection]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Panning
      if (isPanning && panStart) {
        const deltaX = e.clientX - panStart.x;
        const deltaY = e.clientY - panStart.y;
        onTransformChange({
          ...transform,
          offsetX: panStart.offsetX + deltaX,
          offsetY: panStart.offsetY + deltaY,
        });
        return;
      }

      // Dragging detection - calculate absolute new position from original
      if (isDragging && dragStart) {
        const deltaX = (e.clientX - dragStart.x) / transform.scale;
        const deltaY = (e.clientY - dragStart.y) / transform.scale;
        // Use the ORIGINAL detection position stored in dragStart, not the current position
        // This prevents compounding movement from optimistic updates
        const newX = dragStart.detectionX + deltaX;
        const newY = dragStart.detectionY + deltaY;
        onMoveDetection(dragStart.detectionId, newX, newY);
        return;
      }

      // Resizing detection
      if (isResizing && resizeState) {
        const deltaX = (e.clientX - resizeState.startMouse.x) / transform.scale;
        const deltaY = (e.clientY - resizeState.startMouse.y) / transform.scale;
        const newBounds = calculateResizeBounds(resizeState.handle, resizeState.startBounds, deltaX, deltaY);
        onResizeDetection(resizeState.detectionId, newBounds);
        return;
      }

      // Drawing new detection
      if (isDrawing && drawStart) {
        const imageCoords = screenToImage(e.clientX, e.clientY);
        setDrawCurrent(imageCoords);
      }
    },
    [
      isPanning,
      panStart,
      isDragging,
      dragStart,
      isResizing,
      resizeState,
      isDrawing,
      drawStart,
      transform,
      screenToImage,
      onTransformChange,
      onMoveDetection,
      onResizeDetection,
    ]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      // Finish drawing
      if (isDrawing && drawStart && drawCurrent) {
        const x = Math.min(drawStart.x, drawCurrent.x);
        const y = Math.min(drawStart.y, drawCurrent.y);
        const width = Math.abs(drawCurrent.x - drawStart.x);
        const height = Math.abs(drawCurrent.y - drawStart.y);

        // Only create if large enough
        if (width > MIN_DETECTION_SIZE && height > MIN_DETECTION_SIZE) {
          onCreateDetection({ x, y, width, height }, createClass);
        }
      }

      // Reset all states
      setIsDragging(false);
      setDragStart(null);
      setIsResizing(false);
      setResizeState(null);
      setIsPanning(false);
      setPanStart(null);
      setIsDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
    },
    [isDrawing, drawStart, drawCurrent, createClass, onCreateDetection]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (toolMode !== 'verify' && toolMode !== 'select') return;

      const imageCoords = screenToImage(e.clientX, e.clientY);

      // Find detection under cursor (check in reverse order since later ones render on top)
      const sortedDetections = [...detections]
        .filter((d) => d.status !== 'deleted')
        .reverse();

      for (const detection of sortedDetections) {
        // Use point-in-polygon test for accurate hit detection
        if (isPointInDetection(imageCoords.x, imageCoords.y, detection)) {
          onVerifyDetection(detection.id);
          break;
        }
      }
    },
    [toolMode, detections, screenToImage, onVerifyDetection]
  );

  // ==========================================================================
  // Global Mouse Up (for ending drag/resize outside canvas)
  // ==========================================================================

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging || isResizing || isPanning || isDrawing) {
        setIsDragging(false);
        setDragStart(null);
        setIsResizing(false);
        setResizeState(null);
        setIsPanning(false);
        setPanStart(null);
        setIsDrawing(false);
        setDrawStart(null);
        setDrawCurrent(null);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, isResizing, isPanning, isDrawing]);

  // ==========================================================================
  // Fetch Siding Polygon Data
  // ==========================================================================

  useEffect(() => {
    if (!showSidingOverlay || !pageId) {
      setSidingData(null);
      return;
    }

    getSidingPolygons(pageId).then((data) => {
      if (data?.success) {
        setSidingData(data);
      }
    });
  }, [showSidingOverlay, pageId]);

  // ==========================================================================
  // Sort Detections for Rendering
  // ==========================================================================

  const sortedDetections = [...detections]
    .filter((d) => d.status !== 'deleted')
    .sort((a, b) => {
      // Selected items render on top
      const aSelected = selectedIds.has(a.id);
      const bSelected = selectedIds.has(b.id);
      if (aSelected !== bSelected) {
        return aSelected ? 1 : -1;
      }
      // Within same selection state, larger areas render first (smaller on top)
      const aArea = a.pixel_width * a.pixel_height;
      const bArea = b.pixel_width * b.pixel_height;
      return bArea - aArea;
    });

  // ==========================================================================
  // Markup Overlay Colors
  // ==========================================================================

  const MARKUP_OVERLAY_COLORS: Record<string, string> = {
    building: 'rgba(59, 130, 246, 0.3)',      // Blue fill
    exterior_wall: 'rgba(59, 130, 246, 0.3)', // Blue fill (same as building)
    roof: 'rgba(220, 53, 69, 0.3)',           // Red fill
    window: 'rgba(249, 115, 22, 0.4)',        // Orange fill
    door: 'rgba(34, 197, 94, 0.4)',           // Green fill
    garage: 'rgba(234, 179, 8, 0.4)',         // Yellow fill
    gable: 'rgba(168, 85, 247, 0.3)',         // Purple fill
  };

  // Sort detections for overlay rendering: roof first (bottom), then openings on top
  // Filter out building/exterior_wall - they are used for calculations only, not visualized
  const sortedOverlayDetections = showMarkupOverlay
    ? [...(overlayDetections || detections)]
        .filter((d) => d.status !== 'deleted')
        .filter((d) => {
          const cls = d.class as AllDetectionClasses;
          return cls !== 'building' && cls !== 'exterior_wall';
        })
        .sort((a, b) => {
          const order: Record<string, number> = {
            roof: 0,
            gable: 1,
            window: 2,
            door: 2,
            garage: 2,
          };
          return (order[a.class] ?? 99) - (order[b.class] ?? 99);
        })
    : [];

  // ==========================================================================
  // Drawing Preview Rect
  // ==========================================================================

  const drawingRect =
    isDrawing && drawStart && drawCurrent
      ? {
          x: Math.min(drawStart.x, drawCurrent.x),
          y: Math.min(drawStart.y, drawCurrent.y),
          width: Math.abs(drawCurrent.x - drawStart.x),
          height: Math.abs(drawCurrent.y - drawStart.y),
        }
      : null;

  const drawingColor = DETECTION_CLASS_COLORS[createClass] || DETECTION_CLASS_COLORS[''];

  // ==========================================================================
  // Render
  // ==========================================================================

  const cursor = getCursor(toolMode, isPanning, isDragging, isDrawing);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-neutral-900"
      style={{ cursor }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      <svg
        ref={svgRef}
        className="absolute top-0 left-0"
        style={{
          width: imageWidth * transform.scale,
          height: imageHeight * transform.scale,
          transform: `translate(${transform.offsetX}px, ${transform.offsetY}px)`,
        }}
        viewBox={`0 0 ${imageWidth} ${imageHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background Image */}
        <image
          href={imageUrl}
          x={0}
          y={0}
          width={imageWidth}
          height={imageHeight}
          preserveAspectRatio="none"
        />

        {/* Siding Polygon Overlay - renders net siding area with hole cutouts */}
        {/* Supports multiple buildings per page */}
        {showSidingOverlay && sidingData && (sidingData.siding_polygons?.length || sidingData.exterior.points.length > 0) && (
          <>
            {/* Use new multi-building format if available, otherwise fall back to legacy */}
            {(sidingData.siding_polygons || [{
              building_id: 'legacy',
              exterior: sidingData.exterior,
              holes: sidingData.holes,
              summary: sidingData.summary
            }]).map((polygon, buildingIdx) => (
              <g key={`building-${polygon.building_id || buildingIdx}`}>
                {/* Define mask with holes cut out for this building */}
                <defs>
                  <mask id={`siding-mask-${buildingIdx}`}>
                    {/* White = visible, black = hidden */}
                    <polygon
                      points={polygon.exterior.points.map(([px, py]) => `${px},${py}`).join(' ')}
                      fill="white"
                    />
                    {/* Cut out holes (roof, windows, doors, etc.) */}
                    {polygon.holes.map((hole, idx) => (
                      <polygon
                        key={`hole-${idx}`}
                        points={hole.points.map(([px, py]) => `${px},${py}`).join(' ')}
                        fill="black"
                      />
                    ))}
                  </mask>
                </defs>
                {/* Render siding area with mask applied */}
                <polygon
                  points={polygon.exterior.points.map(([px, py]) => `${px},${py}`).join(' ')}
                  fill="rgba(59, 130, 246, 0.35)"
                  stroke="rgba(59, 130, 246, 0.8)"
                  strokeWidth={2 / transform.scale}
                  mask={`url(#siding-mask-${buildingIdx})`}
                />
                {/* Net siding area label for this building */}
                {polygon.summary.net_siding_sf > 0 && polygon.exterior.points[0] && (
                  <g>
                    <rect
                      x={polygon.exterior.points[0][0]}
                      y={polygon.exterior.points[0][1] - 28 / transform.scale}
                      width={140 / transform.scale}
                      height={24 / transform.scale}
                      rx={4 / transform.scale}
                      fill="rgba(59, 130, 246, 0.9)"
                    />
                    <text
                      x={polygon.exterior.points[0][0] + 8 / transform.scale}
                      y={polygon.exterior.points[0][1] - 10 / transform.scale}
                      fontSize={14 / transform.scale}
                      fill="white"
                      fontFamily="system-ui, sans-serif"
                      fontWeight="600"
                    >
                      Net Siding: {polygon.summary.net_siding_sf.toFixed(0)} SF
                    </text>
                  </g>
                )}
              </g>
            ))}
            {/* Page total label (shown when multiple buildings) */}
            {sidingData.page_summary && sidingData.page_summary.total_buildings > 1 && (
              <g>
                <rect
                  x={10 / transform.scale}
                  y={10 / transform.scale}
                  width={200 / transform.scale}
                  height={28 / transform.scale}
                  rx={4 / transform.scale}
                  fill="rgba(30, 64, 175, 0.95)"
                />
                <text
                  x={18 / transform.scale}
                  y={30 / transform.scale}
                  fontSize={14 / transform.scale}
                  fill="white"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="600"
                >
                  Page Total: {sidingData.page_summary.total_net_siding_sf.toFixed(0)} SF ({sidingData.page_summary.total_buildings} elevations)
                </text>
              </g>
            )}
          </>
        )}

        {/* Markup Overlay Layer - renders colored fills for each detection */}
        {/* Buildings/exterior_wall are filtered out - used for calculations only */}
        {showMarkupOverlay && sortedOverlayDetections.map((detection) => {
          const fillColor = MARKUP_OVERLAY_COLORS[detection.class] || 'rgba(128, 128, 128, 0.3)';
          const isRoof = detection.class === 'roof';
          const isHoveredOverlay = hoveredOverlay?.detection.id === detection.id;

          // Convert from Roboflow center coordinates to top-left for SVG rendering
          // (Same transformation as DetectionBox uses)
          const x = detection.pixel_x - detection.pixel_width / 2;
          const y = detection.pixel_y - detection.pixel_height / 2;

          // Check if we should render as polygon
          const usePolygon = hasValidPolygon(detection.polygon_points);

          // Determine if shape is large enough for SF label
          const showLabel = detection.pixel_width > 50 && detection.pixel_height > 30 && detection.area_sf;

          // Only roof needs pointer events for tooltip - openings have DetectionBox
          const hasPointerEvents = isRoof;

          // Common event handlers
          const mouseHandlers = hasPointerEvents ? {
            onMouseEnter: (e: React.MouseEvent) => {
              setHoveredOverlay({
                detection,
                mouseX: e.clientX,
                mouseY: e.clientY,
              });
            },
            onMouseMove: (e: React.MouseEvent) => {
              if (hoveredOverlay?.detection.id === detection.id) {
                setHoveredOverlay({
                  detection,
                  mouseX: e.clientX,
                  mouseY: e.clientY,
                });
              }
            },
            onMouseLeave: () => {
              setHoveredOverlay(null);
            },
          } : {};

          return (
            <g key={`overlay-${detection.id}`}>
              {usePolygon ? (
                <polygon
                  points={getPolygonPointsString(detection.polygon_points!)}
                  fill={fillColor}
                  stroke={isHoveredOverlay ? 'white' : (isRoof ? 'rgba(220, 53, 69, 0.6)' : 'none')}
                  strokeWidth={isHoveredOverlay ? 3 / transform.scale : (isRoof ? 2 / transform.scale : 0)}
                  style={{ cursor: hasPointerEvents ? 'pointer' : 'default' }}
                  pointerEvents={hasPointerEvents ? 'auto' : 'none'}
                  {...mouseHandlers}
                />
              ) : (
                <rect
                  x={x}
                  y={y}
                  width={detection.pixel_width}
                  height={detection.pixel_height}
                  fill={fillColor}
                  stroke={isHoveredOverlay ? 'white' : (isRoof ? 'rgba(220, 53, 69, 0.6)' : 'none')}
                  strokeWidth={isHoveredOverlay ? 3 / transform.scale : (isRoof ? 2 / transform.scale : 0)}
                  style={{ cursor: hasPointerEvents ? 'pointer' : 'default' }}
                  pointerEvents={hasPointerEvents ? 'auto' : 'none'}
                  {...mouseHandlers}
                />
              )}
              {/* Area label centered on rectangle - matches DetectionBox style */}
              {showLabel && detection.area_sf !== null && (
                <text
                  x={x + detection.pixel_width / 2}
                  y={y + detection.pixel_height / 2 + (12 / transform.scale) / 3}
                  textAnchor="middle"
                  fontSize={12 / transform.scale}
                  fill="white"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="600"
                  pointerEvents="none"
                  style={{
                    textShadow: '0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5)',
                  }}
                >
                  {detection.area_sf.toFixed(0)} SF
                </text>
              )}
              {/* Dimension label below rectangle - matches DetectionBox style */}
              {showLabel && detection.real_width_ft !== null && detection.real_height_ft !== null && (
                <g pointerEvents="none">
                  <rect
                    x={x + detection.pixel_width / 2 - 40 / transform.scale}
                    y={y + detection.pixel_height + 4 / transform.scale}
                    width={80 / transform.scale}
                    height={16 / transform.scale}
                    rx={3 / transform.scale}
                    fill="rgba(0, 0, 0, 0.7)"
                  />
                  <text
                    x={x + detection.pixel_width / 2}
                    y={y + detection.pixel_height + 15 / transform.scale}
                    textAnchor="middle"
                    fontSize={11 / transform.scale}
                    fill="white"
                    fontFamily="system-ui, sans-serif"
                  >
                    {formatDimension(detection.real_width_ft)} × {formatDimension(detection.real_height_ft)}
                  </text>
                </g>
              )}
              {/* Cross-hatch pattern for roof to indicate exclusion */}
              {isRoof && (
                <>
                  <defs>
                    <pattern
                      id={`crosshatch-${detection.id}`}
                      patternUnits="userSpaceOnUse"
                      width={20 / transform.scale}
                      height={20 / transform.scale}
                      patternTransform={`rotate(45)`}
                    >
                      <line
                        x1={0}
                        y1={0}
                        x2={0}
                        y2={20 / transform.scale}
                        stroke="rgba(220, 53, 69, 0.4)"
                        strokeWidth={2 / transform.scale}
                      />
                    </pattern>
                  </defs>
                  {usePolygon ? (
                    <polygon
                      points={getPolygonPointsString(detection.polygon_points!)}
                      fill={`url(#crosshatch-${detection.id})`}
                    />
                  ) : (
                    <rect
                      x={x}
                      y={y}
                      width={detection.pixel_width}
                      height={detection.pixel_height}
                      fill={`url(#crosshatch-${detection.id})`}
                    />
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Detection Boxes */}
        {sortedDetections.map((detection) => (
          <DetectionBox
            key={detection.id}
            detection={detection}
            isSelected={selectedIds.has(detection.id)}
            isHovered={hoveredId === detection.id}
            scale={transform.scale}
            onSelect={onSelect}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
            onDragStart={handleDragStart}
            onResizeStart={handleResizeStart}
            showDimensions={showDimensions}
            showArea={showArea}
            showStatus={true}
          />
        ))}

        {/* Drawing Preview */}
        {drawingRect && drawingRect.width > 0 && drawingRect.height > 0 && (
          <g>
            {/* Preview rectangle */}
            <rect
              x={drawingRect.x}
              y={drawingRect.y}
              width={drawingRect.width}
              height={drawingRect.height}
              fill={drawingColor}
              fillOpacity={0.2}
              stroke={drawingColor}
              strokeWidth={2 / transform.scale}
              strokeDasharray={`${6 / transform.scale} ${3 / transform.scale}`}
            />
            {/* Dimension label */}
            <g>
              <rect
                x={drawingRect.x + drawingRect.width / 2 - 50 / transform.scale}
                y={drawingRect.y + drawingRect.height + 4 / transform.scale}
                width={100 / transform.scale}
                height={18 / transform.scale}
                rx={4 / transform.scale}
                fill="rgba(0, 0, 0, 0.8)"
              />
              <text
                x={drawingRect.x + drawingRect.width / 2}
                y={drawingRect.y + drawingRect.height + 16 / transform.scale}
                textAnchor="middle"
                fontSize={11 / transform.scale}
                fill="white"
                fontFamily="system-ui, sans-serif"
              >
                {formatPixelDimension(drawingRect.width)} × {formatPixelDimension(drawingRect.height)}
              </text>
            </g>
          </g>
        )}
      </svg>

      {/* Overlay Tooltip - renders outside SVG for proper layering */}
      {hoveredOverlay && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: hoveredOverlay.mouseX + 12,
            top: hoveredOverlay.mouseY + 12,
          }}
        >
          <div className="bg-black/90 text-white px-3 py-2 rounded-lg shadow-lg text-sm min-w-[140px]">
            <div className="font-semibold capitalize mb-1">
              {hoveredOverlay.detection.class.replace('_', ' ')}
            </div>
            {hoveredOverlay.detection.area_sf !== null && (
              <div className="text-gray-300">
                Area: <span className="text-white font-medium">{hoveredOverlay.detection.area_sf.toFixed(1)} SF</span>
              </div>
            )}
            {hoveredOverlay.detection.real_width_ft !== null && hoveredOverlay.detection.real_height_ft !== null && (
              <div className="text-gray-300">
                Size: <span className="text-white font-medium">
                  {hoveredOverlay.detection.real_width_ft.toFixed(1)}′ × {hoveredOverlay.detection.real_height_ft.toFixed(1)}′
                </span>
              </div>
            )}
            {hoveredOverlay.detection.confidence !== undefined && (
              <div className="text-gray-400 text-xs mt-1">
                Confidence: {Math.round(hoveredOverlay.detection.confidence * 100)}%
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default DetectionCanvas;
