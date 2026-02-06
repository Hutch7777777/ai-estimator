'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Line, Circle, Group, Text, Label, Tag, Rect, Shape } from 'react-konva';
import type Konva from 'konva';
import type { ExtractionDetection, DetectionClass, PolygonPoint } from '@/lib/types/extraction';
import { CONFIDENCE_THRESHOLDS, isPolygonWithHoles, type PolygonWithHoles, getDetectionColor, getEffectiveDetectionColor, getClassDisplayLabel } from '@/lib/types/extraction';
import { formatArea } from '@/lib/utils/coordinates';
import {
  rectToPolygonPoints,
  flattenPoints,
  getPolygonBoundingBox,
  getPolygonCentroid,
  calculatePolygonMeasurements,
  calculatePolygonAreaSf,
  findClosestEdge,
  canRemovePoint,
} from '@/lib/utils/polygonUtils';

// =============================================================================
// Types
// =============================================================================

export interface PolygonUpdatePayload {
  polygon_points: PolygonPoint[] | PolygonWithHoles;
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;
  area_sf: number;
  perimeter_lf: number;
  real_width_ft: number;
  real_height_ft: number;
}

export interface KonvaDetectionPolygonProps {
  detection: ExtractionDetection;
  isSelected: boolean;
  isHovered: boolean;
  scale: number; // Current viewport scale for sizing labels/handles
  scaleRatio: number; // Pixels per foot for measurement calculations
  onSelect: (id: string, addToSelection: boolean) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
  onPolygonUpdate: (detection: ExtractionDetection, updates: PolygonUpdatePayload) => void;
  showArea?: boolean;
  draggable?: boolean;
  /** When true, detection is below confidence threshold but shown with reduced opacity */
  dimmed?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

// Standard grey stroke for unselected detections
const STROKE_COLOR_UNSELECTED = '#9ca3af';

// Corner handle styling (blue for all handles)
const HANDLE_FILL = '#3b82f6'; // Blue
const HANDLE_STROKE = '#1e40af'; // Darker blue
const HANDLE_RADIUS = 6; // Base radius in pixels
const HANDLE_STROKE_WIDTH = 2;

// Edge click zone width for adding points
const EDGE_CLICK_WIDTH = 12;

// =============================================================================
// Helper Functions
// =============================================================================

// Use centralized getDetectionColor which handles class normalization

/**
 * Darken a hex color by a given percentage for stroke visibility.
 * @param hex - The hex color string (e.g., '#ff6b6b')
 * @param percent - The percentage to darken (0-100), default 30%
 * @returns The darkened hex color
 */
function darkenColor(hex: string, percent: number = 30): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');

  // Parse RGB components
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Darken each component
  const factor = 1 - percent / 100;
  const newR = Math.round(r * factor);
  const newG = Math.round(g * factor);
  const newB = Math.round(b * factor);

  // Convert back to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

function isLowConfidence(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.medium;
}

function formatClassName(detectionClass: DetectionClass | string): string {
  // Use centralized display label function which handles normalization
  return getClassDisplayLabel(detectionClass);
}

// =============================================================================
// Component
// =============================================================================

export default function KonvaDetectionPolygon({
  detection,
  isSelected,
  isHovered,
  scale,
  scaleRatio,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onPolygonUpdate,
  showArea = true,
  draggable = true,
  dimmed = false,
}: KonvaDetectionPolygonProps) {
  // Check if this detection has holes (polygon with hole structure)
  const hasHoles = useMemo(() => {
    return detection.has_hole || isPolygonWithHoles(detection.polygon_points);
  }, [detection.has_hole, detection.polygon_points]);

  // Get polygon with holes structure if applicable
  const polygonWithHoles = useMemo((): PolygonWithHoles | null => {
    if (isPolygonWithHoles(detection.polygon_points)) {
      return detection.polygon_points;
    }
    return null;
  }, [detection.polygon_points]);

  // Get or convert polygon points from detection (for simple polygons without holes)
  const initialPoints = useMemo(() => {
    // If it's a polygon with holes, use the outer boundary
    if (isPolygonWithHoles(detection.polygon_points)) {
      return detection.polygon_points.outer;
    }
    // Simple polygon points or convert from rectangle
    return (detection.polygon_points as PolygonPoint[] | null) ?? rectToPolygonPoints(detection);
  }, [detection.polygon_points, detection.pixel_x, detection.pixel_y, detection.pixel_width, detection.pixel_height]);

  // Local state for smooth corner dragging
  const [localPoints, setLocalPoints] = useState<PolygonPoint[]>(initialPoints);
  const [isDraggingCorner, setIsDraggingCorner] = useState(false);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const [isDraggingEdge, setIsDraggingEdge] = useState<number | null>(null);
  const [hoveredEdgeIndex, setHoveredEdgeIndex] = useState<number | null>(null);

  // Local state for hole points (for polygons with holes)
  const [localHoles, setLocalHoles] = useState<PolygonPoint[][] | null>(() => {
    if (isPolygonWithHoles(detection.polygon_points) && detection.polygon_points.holes) {
      return detection.polygon_points.holes as PolygonPoint[][];
    }
    return null;
  });
  const [isDraggingHoleCorner, setIsDraggingHoleCorner] = useState(false);

  // Ref to track local edits - prevents useEffect from resetting points before parent updates
  const lastLocalEditRef = useRef<PolygonPoint[] | null>(null);

  // Ref to track local hole edits
  const lastLocalHoleEditRef = useRef<PolygonPoint[][] | null>(null);

  // Ref to track edge drag start position and original points
  const edgeDragStartRef = useRef<{ startX: number; startY: number; startPoints: PolygonPoint[] } | null>(null);

  // Sync local state with detection prop changes (when not dragging)
  useEffect(() => {
    // Get points from props, handling both simple and polygon-with-holes formats
    let propsPoints: PolygonPoint[];
    if (isPolygonWithHoles(detection.polygon_points)) {
      propsPoints = detection.polygon_points.outer as PolygonPoint[];
    } else {
      propsPoints = (detection.polygon_points as PolygonPoint[] | null) ?? rectToPolygonPoints(detection);
    }

    // If we just made a local edit and props now match it, clear the ref
    if (lastLocalEditRef.current) {
      const propsMatch = JSON.stringify(propsPoints) === JSON.stringify(lastLocalEditRef.current);
      if (propsMatch) {
        lastLocalEditRef.current = null;
        return; // Props caught up with our edit, no need to sync
      }
    }

    // Only sync from props if not currently dragging AND we didn't just make a local edit
    if (!isDraggingCorner && !isDraggingShape && isDraggingEdge === null && !lastLocalEditRef.current) {
      setLocalPoints(propsPoints);
    }
  }, [detection.id, detection.polygon_points, isDraggingCorner, isDraggingShape, isDraggingEdge]);

  // Sync localHoles with detection prop changes (when not dragging)
  useEffect(() => {
    if (!isPolygonWithHoles(detection.polygon_points)) {
      setLocalHoles(null);
      return;
    }

    const propsHoles = detection.polygon_points.holes as PolygonPoint[][] | undefined;

    // If we just made a local hole edit and props now match it, clear the ref
    if (lastLocalHoleEditRef.current) {
      const propsMatch = JSON.stringify(propsHoles) === JSON.stringify(lastLocalHoleEditRef.current);
      if (propsMatch) {
        lastLocalHoleEditRef.current = null;
        return; // Props caught up with our edit, no need to sync
      }
    }

    // Only sync from props if not currently dragging hole corners AND we didn't just make a local edit
    if (!isDraggingHoleCorner && !lastLocalHoleEditRef.current) {
      setLocalHoles(propsHoles || null);
    }
  }, [detection.id, detection.polygon_points, isDraggingHoleCorner]);

  const color = getEffectiveDetectionColor(detection);

  // Material assignment visual feedback - higher opacity and colored stroke when material is assigned
  const hasMaterial = Boolean(detection.assigned_material_id);

  // Stroke color: class color when selected OR has material, grey otherwise
  // When selected: darker shade for prominence, when just material assigned: standard class color
  const strokeColor = isSelected
    ? darkenColor(color, 20)
    : hasMaterial
      ? color
      : STROKE_COLOR_UNSELECTED;

  // Stroke width: slightly thicker when material is assigned for visual emphasis
  const baseStrokeWidth = hasMaterial ? 2 : 1;

  const lowConfidence = isLowConfidence(detection.confidence);
  const isDeleted = detection.status === 'deleted';

  // Scale-adjusted sizes for consistent visual appearance
  const handleRadius = HANDLE_RADIUS / scale;
  const handleStrokeWidth = HANDLE_STROKE_WIDTH / scale;
  const fontSize = 11 / scale;
  const labelPadding = 4 / scale;
  const edgeClickWidth = EDGE_CLICK_WIDTH / scale;

  // Calculate bounding box and centroid for positioning labels
  const bbox = useMemo(() => getPolygonBoundingBox(localPoints), [localPoints]);
  const centroid = useMemo(() => getPolygonCentroid(localPoints), [localPoints]);

  // Calculate area dynamically from pixel dimensions and current scale
  // This ensures labels update immediately after calibration without needing a data refresh
  const calculatedAreaSf = useMemo(() => {
    if (scaleRatio <= 0) return 0;

    // Use localPoints (current polygon shape) for calculation
    if (localPoints.length >= 3) {
      return calculatePolygonAreaSf(localPoints, scaleRatio);
    }

    // Fallback for rectangles (no polygon_points)
    const widthFt = detection.pixel_width / scaleRatio;
    const heightFt = detection.pixel_height / scaleRatio;
    return widthFt * heightFt;
  }, [localPoints, detection.pixel_width, detection.pixel_height, scaleRatio]);

  // Check if polygon is large enough to show area label
  const showAreaLabel = showArea && calculatedAreaSf > 0 && bbox.width > 40 && bbox.height > 30;

  // Derive effective scale ratio from detection's own measurements to avoid mismatch
  // This ensures moving/resizing doesn't incorrectly change area calculations
  const getEffectiveScaleRatio = useCallback(() => {
    if (detection.real_width_ft && detection.real_width_ft > 0 && detection.pixel_width > 0) {
      return detection.pixel_width / detection.real_width_ft;
    }
    return scaleRatio;
  }, [detection.real_width_ft, detection.pixel_width, scaleRatio]);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  // Handle click to select (with multi-select support via Cmd/Ctrl/Shift)
  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    // Check for Cmd (Mac), Ctrl (Windows), or Shift modifier for multi-select
    const addToSelection = e.evt.metaKey || e.evt.ctrlKey || e.evt.shiftKey;
    onSelect(detection.id, addToSelection);
  }, [detection.id, onSelect]);

  // Handle corner drag - update local state for smooth visual feedback
  // Konva handles scale transformation internally - e.target.x()/y() returns
  // the position in LOCAL coordinates (image pixels), not screen pixels
  const handleCornerDrag = useCallback((cornerIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x();
    const newY = e.target.y();

    console.log('[handleCornerDrag] Corner', cornerIndex, 'at:', { newX, newY });

    setLocalPoints((prev) => {
      const newPoints = [...prev];
      newPoints[cornerIndex] = { x: newX, y: newY };
      return newPoints;
    });
  }, []);

  // Debug: Log initial points when detection changes
  useEffect(() => {
    console.log('[KonvaDetectionPolygon] Detection:', detection.id);
    console.log('[KonvaDetectionPolygon] detection.polygon_points:', JSON.stringify(detection.polygon_points));
    console.log('[KonvaDetectionPolygon] localPoints:', JSON.stringify(localPoints));
  }, [detection.id, detection.polygon_points, localPoints]);

  // Handle corner drag start
  const handleCornerDragStart = useCallback((cornerIndex: number) => {
    console.log('[handleCornerDragStart] Starting drag for corner', cornerIndex);
    console.log('[handleCornerDragStart] Initial position:', localPoints[cornerIndex]);
    setIsDraggingCorner(true);
  }, [localPoints]);

  // Handle corner drag end - calculate measurements and call update
  // Konva handles scale transformation internally - e.target.x()/y() returns
  // the position in LOCAL coordinates (image pixels), not screen pixels
  const handleCornerDragEnd = useCallback((cornerIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x();
    const newY = e.target.y();

    console.log('=== CORNER DRAG END ===');
    console.log('Corner', cornerIndex, 'final position:', { newX, newY });
    console.log('Previous localPoints:', JSON.stringify(localPoints));

    // Simply use the node's position - Konva gives us local coordinates
    const newPoints = [...localPoints];
    newPoints[cornerIndex] = { x: newX, y: newY };

    console.log('New points:', JSON.stringify(newPoints));

    // Track this local edit so useEffect doesn't reset it
    lastLocalEditRef.current = newPoints;
    setLocalPoints(newPoints);
    setIsDraggingCorner(false);

    // Calculate new measurements using effective scale ratio
    const effectiveScaleRatio = getEffectiveScaleRatio();
    const measurements = calculatePolygonMeasurements(newPoints, effectiveScaleRatio);

    console.log('Measurements:', measurements);

    onPolygonUpdate(detection, {
      polygon_points: newPoints,
      ...measurements,
    });
  }, [localPoints, detection, onPolygonUpdate, getEffectiveScaleRatio]);

  // Handle double-click on corner to remove point
  const handleRemovePoint = useCallback((cornerIndex: number) => {
    if (!canRemovePoint(localPoints)) {
      // Could show a toast here - minimum 3 points required
      console.warn('Cannot remove point: minimum 3 points required');
      return;
    }

    const newPoints = localPoints.filter((_, i) => i !== cornerIndex);

    // Track this local edit so useEffect doesn't reset it
    lastLocalEditRef.current = newPoints;
    setLocalPoints(newPoints);

    // Calculate new measurements using effective scale ratio
    const effectiveScaleRatio = getEffectiveScaleRatio();
    const measurements = calculatePolygonMeasurements(newPoints, effectiveScaleRatio);

    onPolygonUpdate(detection, {
      polygon_points: newPoints,
      ...measurements,
    });
  }, [localPoints, detection, onPolygonUpdate, getEffectiveScaleRatio]);

  // ==========================================================================
  // Hole Vertex Drag Handlers
  // ==========================================================================

  // Handle hole corner drag start
  const handleHoleCornerDragStart = useCallback((holeIndex: number, cornerIndex: number) => {
    console.log('[handleHoleCornerDragStart] Starting drag for hole', holeIndex, 'corner', cornerIndex);
    setIsDraggingHoleCorner(true);
  }, []);

  // Handle hole corner drag - update local state for smooth visual feedback
  const handleHoleCornerDrag = useCallback((holeIndex: number, cornerIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x();
    const newY = e.target.y();

    setLocalHoles((prevHoles) => {
      if (!prevHoles) return null;
      const newHoles = prevHoles.map((hole, hIdx) => {
        if (hIdx !== holeIndex) return hole;
        return hole.map((point, pIdx) => {
          if (pIdx !== cornerIndex) return point;
          return { x: newX, y: newY };
        });
      });
      return newHoles;
    });
  }, []);

  // Handle hole corner drag end - calculate measurements and call update with PolygonWithHoles
  const handleHoleCornerDragEnd = useCallback((holeIndex: number, cornerIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x();
    const newY = e.target.y();

    console.log('=== HOLE CORNER DRAG END ===');
    console.log('Hole', holeIndex, 'Corner', cornerIndex, 'final position:', { newX, newY });

    // Update the hole points
    const newHoles = localHoles?.map((hole, hIdx) => {
      if (hIdx !== holeIndex) return hole;
      return hole.map((point, pIdx) => {
        if (pIdx !== cornerIndex) return point;
        return { x: newX, y: newY };
      });
    }) || null;

    // Track this local hole edit so useEffect doesn't reset it
    lastLocalHoleEditRef.current = newHoles;
    setLocalHoles(newHoles);
    setIsDraggingHoleCorner(false);

    // Create the PolygonWithHoles structure for the update
    // Note: onPolygonUpdate currently expects simple polygon_points,
    // but we need to pass the full structure for holes to work
    const polygonWithHolesUpdate: PolygonWithHoles = {
      outer: localPoints,
      holes: newHoles || undefined,
    };

    // Calculate new measurements using effective scale ratio
    // For polygons with holes, we use the outer boundary for bounding box calculations
    const effectiveScaleRatio = getEffectiveScaleRatio();
    const measurements = calculatePolygonMeasurements(localPoints, effectiveScaleRatio);

    console.log('Hole update - polygonWithHoles:', JSON.stringify(polygonWithHolesUpdate));

    onPolygonUpdate(detection, {
      polygon_points: polygonWithHolesUpdate,
      ...measurements,
    });
  }, [localHoles, localPoints, detection, onPolygonUpdate, getEffectiveScaleRatio]);

  // Handle entire shape drag start
  const handleShapeDragStart = useCallback(() => {
    setIsDraggingShape(true);
  }, []);

  // Handle entire shape drag end - offset all points by the drag delta
  // Konva handles scale transformation internally - group.x()/y() returns
  // the delta in LOCAL coordinates (image pixels), not screen pixels
  const handleShapeDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const group = e.target;
    const dx = group.x();
    const dy = group.y();

    // Reset group position (we'll bake the offset into points)
    group.position({ x: 0, y: 0 });

    // IMPORTANT: Don't process shape drag if we were dragging a corner or edge
    // Both events can fire when dragging a corner/edge handle
    if (isDraggingCorner || isDraggingEdge !== null) {
      console.log('=== SHAPE DRAG END (IGNORED - corner/edge drag in progress) ===');
      return;
    }

    console.log('=== SHAPE DRAG END ===');
    console.log('Delta:', { dx, dy });

    if (dx === 0 && dy === 0) {
      setIsDraggingShape(false);
      return;
    }

    // Offset all points by the drag delta (already in image coordinates)
    const newPoints = localPoints.map(p => ({
      x: p.x + dx,
      y: p.y + dy,
    }));

    console.log('New points:', JSON.stringify(newPoints));

    // Track this local edit so useEffect doesn't reset it
    lastLocalEditRef.current = newPoints;
    setLocalPoints(newPoints);
    setIsDraggingShape(false);

    // Calculate new measurements using effective scale ratio
    const effectiveScaleRatio = getEffectiveScaleRatio();
    const measurements = calculatePolygonMeasurements(newPoints, effectiveScaleRatio);

    onPolygonUpdate(detection, {
      polygon_points: newPoints,
      ...measurements,
    });
  }, [localPoints, isDraggingCorner, isDraggingEdge, detection, onPolygonUpdate, getEffectiveScaleRatio]);

  // Handle edge drag end - move both vertices of the edge together
  const handleEdgeDragEnd = useCallback(() => {
    console.log('=== EDGE DRAG END ===');
    console.log('Final localPoints:', JSON.stringify(localPoints));

    // Track this local edit so useEffect doesn't reset it
    // Must be set BEFORE calling parent update to prevent race condition
    lastLocalEditRef.current = localPoints;

    setIsDraggingEdge(null);

    // Calculate new measurements using effective scale ratio
    const effectiveScaleRatio = getEffectiveScaleRatio();
    const measurements = calculatePolygonMeasurements(localPoints, effectiveScaleRatio);

    console.log('Edge drag measurements:', measurements);

    // Update parent with new polygon points and measurements
    onPolygonUpdate(detection, {
      polygon_points: localPoints,
      ...measurements,
    });
  }, [localPoints, detection, onPolygonUpdate, getEffectiveScaleRatio]);

  // Handle click on edge to add point
  const handleEdgeClick = useCallback((edgeIndex: number, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;

    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    // Find the closest point on this edge
    const p1 = localPoints[edgeIndex];
    const p2 = localPoints[(edgeIndex + 1) % localPoints.length];

    // Get stage scale and position for coordinate conversion
    const stageScale = stage.scaleX();
    const stageX = stage.x();
    const stageY = stage.y();

    // Convert pointer position to image coordinates
    const clickX = (pointerPos.x - stageX) / stageScale;
    const clickY = (pointerPos.y - stageY) / stageScale;

    // Project click onto the edge
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthSq = dx * dx + dy * dy;

    let t = 0.5; // Default to midpoint if edge has no length
    if (lengthSq > 0) {
      t = ((clickX - p1.x) * dx + (clickY - p1.y) * dy) / lengthSq;
      t = Math.max(0.1, Math.min(0.9, t)); // Keep new point away from existing corners
    }

    const newPoint: PolygonPoint = {
      x: p1.x + t * dx,
      y: p1.y + t * dy,
    };

    // Insert new point after edgeIndex
    const newPoints = [...localPoints];
    newPoints.splice(edgeIndex + 1, 0, newPoint);

    // Track this local edit so useEffect doesn't reset it
    lastLocalEditRef.current = newPoints;
    setLocalPoints(newPoints);

    // Calculate new measurements using effective scale ratio
    const effectiveScaleRatio = getEffectiveScaleRatio();
    const measurements = calculatePolygonMeasurements(newPoints, effectiveScaleRatio);

    onPolygonUpdate(detection, {
      polygon_points: newPoints,
      ...measurements,
    });
  }, [localPoints, detection, onPolygonUpdate, getEffectiveScaleRatio]);

  // ==========================================================================
  // Render deleted detection (low opacity, no interaction)
  // ==========================================================================

  if (isDeleted) {
    // Handle polygon with holes for deleted state
    if (hasHoles && localHoles) {
      return (
        <Shape
          sceneFunc={(context) => {
            const ctx = context._context;
            ctx.beginPath();

            // Draw outer boundary - use localPoints
            if (localPoints.length > 0) {
              ctx.moveTo(localPoints[0].x, localPoints[0].y);
              for (let i = 1; i < localPoints.length; i++) {
                ctx.lineTo(localPoints[i].x, localPoints[i].y);
              }
              ctx.closePath();
            }

            // Draw holes - use localHoles
            for (const hole of localHoles) {
              if (hole.length > 0) {
                ctx.moveTo(hole[0].x, hole[0].y);
                for (let i = 1; i < hole.length; i++) {
                  ctx.lineTo(hole[i].x, hole[i].y);
                }
                ctx.closePath();
              }
            }

            ctx.fillStyle = color;
            ctx.globalAlpha = 0.1;
            ctx.fill('evenodd');
            ctx.globalAlpha = 1;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([4 / scale, 2 / scale]);
            ctx.stroke();
            ctx.setLineDash([]);
          }}
          listening={false}
        />
      );
    }

    // Standard polygon deleted state
    return (
      <Line
        points={flattenPoints(localPoints)}
        closed={true}
        fill={color}
        opacity={0.1}
        stroke={strokeColor}
        strokeWidth={1}
        strokeScaleEnabled={false}
        dash={[4 / scale, 2 / scale]}
        listening={false}
      />
    );
  }

  // ==========================================================================
  // Main Render
  // ==========================================================================

  return (
    <Group
      id={detection.id}
      name={`detection-${detection.id}`}
      draggable={draggable && isSelected && !isDraggingCorner && isDraggingEdge === null}
      onDragStart={handleShapeDragStart}
      onDragEnd={handleShapeDragEnd}
    >
      {/* Main Polygon Shape - with hole support */}
      {hasHoles && localHoles ? (
        // Render polygon with hole using custom Shape for evenodd fill rule
        // Uses localPoints and localHoles for live updates during dragging
        <Shape
          sceneFunc={(context, shape) => {
            const ctx = context._context;
            ctx.beginPath();

            // Draw outer boundary (clockwise) - use localPoints for live updates
            if (localPoints.length > 0) {
              ctx.moveTo(localPoints[0].x, localPoints[0].y);
              for (let i = 1; i < localPoints.length; i++) {
                ctx.lineTo(localPoints[i].x, localPoints[i].y);
              }
              ctx.closePath();
            }

            // Draw holes (counter-clockwise for proper fill-rule) - use localHoles for live updates
            for (const hole of localHoles) {
              if (hole.length > 0) {
                ctx.moveTo(hole[0].x, hole[0].y);
                for (let i = 1; i < hole.length; i++) {
                  ctx.lineTo(hole[i].x, hole[i].y);
                }
                ctx.closePath();
              }
            }

            // Use evenodd fill rule to properly render holes (hole area is transparent)
            ctx.fillStyle = color;
            // Apply dimmed opacity if below confidence filter threshold
            // Higher opacity when material is assigned for visual feedback
            const materialBoost = hasMaterial ? 0.15 : 0;
            const baseOpacity = (isSelected ? 0.3 : isHovered ? 0.25 : 0.2) + materialBoost;
            ctx.globalAlpha = dimmed ? baseOpacity * 0.4 : baseOpacity;
            ctx.fill('evenodd');

            // Stroke outer boundary
            ctx.globalAlpha = dimmed ? 0.4 : 1;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = baseStrokeWidth;
            if (lowConfidence || dimmed) {
              ctx.setLineDash([4 / scale, 2 / scale]);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            // Note: Holes are rendered as transparent cutouts via evenodd fill rule
            // No additional stroke needed - the hole is visually cut out from the polygon
          }}
          hitFunc={(context, shape) => {
            // Define hit area - same path as sceneFunc for accurate click detection
            // Uses evenodd fill rule so clicks inside holes don't register
            context.beginPath();

            // Draw outer boundary - use localPoints for live updates
            if (localPoints.length > 0) {
              context.moveTo(localPoints[0].x, localPoints[0].y);
              for (let i = 1; i < localPoints.length; i++) {
                context.lineTo(localPoints[i].x, localPoints[i].y);
              }
              context.closePath();
            }

            // Draw holes (so clicks inside holes don't register) - use localHoles for live updates
            for (const hole of localHoles) {
              if (hole.length > 0) {
                context.moveTo(hole[0].x, hole[0].y);
                for (let i = 1; i < hole.length; i++) {
                  context.lineTo(hole[i].x, hole[i].y);
                }
                context.closePath();
              }
            }

            // Fill the shape for hit detection (evenodd excludes holes)
            context.fillStrokeShape(shape);
          }}
          fill={color}
          stroke={strokeColor}
          onClick={handleClick}
          onTap={handleClick}
          onMouseEnter={() => onHoverStart(detection.id)}
          onMouseLeave={() => onHoverEnd()}
        />
      ) : (
        // Standard polygon without holes
        <Line
          points={flattenPoints(localPoints)}
          closed={true}
          fill={color}
          opacity={((isSelected ? 0.3 : isHovered ? 0.25 : 0.2) + (hasMaterial ? 0.15 : 0)) * (dimmed ? 0.4 : 1)}
          stroke={strokeColor}
          strokeWidth={baseStrokeWidth}
          strokeScaleEnabled={false}
          dash={(lowConfidence || dimmed) ? [4 / scale, 2 / scale] : undefined}
          shadowColor={isSelected ? strokeColor : undefined}
          shadowBlur={isSelected ? 4 : 0}
          shadowOpacity={isSelected ? 0.3 : 0}
          onClick={handleClick}
          onTap={handleClick}
          onMouseEnter={() => onHoverStart(detection.id)}
          onMouseLeave={() => onHoverEnd()}
        />
      )}

      {/* Edge Click Zones (only when selected) - for adding new points */}
      {isSelected && localPoints.map((point, index) => {
        const nextIndex = (index + 1) % localPoints.length;
        const nextPoint = localPoints[nextIndex];
        const isHoveredEdge = hoveredEdgeIndex === index;

        return (
          <Line
            key={`edge-${index}`}
            points={[point.x, point.y, nextPoint.x, nextPoint.y]}
            stroke={isHoveredEdge ? HANDLE_FILL : 'transparent'}
            strokeWidth={edgeClickWidth}
            hitStrokeWidth={edgeClickWidth * 1.5}
            opacity={isHoveredEdge ? 0.5 : 0}
            onClick={(e) => handleEdgeClick(index, e)}
            onMouseEnter={() => setHoveredEdgeIndex(index)}
            onMouseLeave={() => setHoveredEdgeIndex(null)}
            listening={true}
          />
        );
      })}

      {/* Draggable Edge Lines (only when selected) - for resizing by dragging edges */}
      {isSelected && localPoints.length >= 2 && localPoints.map((point, index) => {
        const nextPoint = localPoints[(index + 1) % localPoints.length];

        return (
          <Line
            key={`edge-drag-${index}`}
            points={[point.x, point.y, nextPoint.x, nextPoint.y]}
            stroke="transparent"
            strokeWidth={edgeClickWidth}
            hitStrokeWidth={edgeClickWidth}
            draggable
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage && isDraggingEdge === null && draggable) {
                stage.container().style.cursor = 'pointer';
              }
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage && isDraggingEdge === null && draggable) {
                stage.container().style.cursor = '';
              }
            }}
            onDblClick={(e) => {
              e.cancelBubble = true;

              // Get click position in stage coordinates
              const stage = e.target.getStage();
              if (!stage) return;

              const pointerPos = stage.getPointerPosition();
              if (!pointerPos) return;

              // Convert to image coordinates
              const stageScale = stage.scaleX();
              const stagePos = stage.position();
              const imageX = (pointerPos.x - stagePos.x) / stageScale;
              const imageY = (pointerPos.y - stagePos.y) / stageScale;

              // Insert new point between index and index+1
              const newPoints = [...localPoints];
              const insertIndex = index + 1;
              newPoints.splice(insertIndex, 0, { x: imageX, y: imageY });

              // Update local state
              setLocalPoints(newPoints);

              // Track this edit
              lastLocalEditRef.current = newPoints;

              // Calculate new measurements and update parent
              const effectiveScaleRatio = getEffectiveScaleRatio();
              const measurements = calculatePolygonMeasurements(newPoints, effectiveScaleRatio);

              onPolygonUpdate(detection, {
                polygon_points: newPoints,
                ...measurements,
              });
            }}
            onDragStart={(e) => {
              e.cancelBubble = true;
              setIsDraggingEdge(index);
              // Store the starting position and original points
              edgeDragStartRef.current = {
                startX: e.target.x(),
                startY: e.target.y(),
                startPoints: [...localPoints],
              };
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;

              if (!edgeDragStartRef.current) return;

              const line = e.target;
              const stage = line.getStage();
              const stageScale = stage?.scaleX() || 1;

              // Calculate delta from start position (not from 0)
              const dx = (line.x() - edgeDragStartRef.current.startX) / stageScale;
              const dy = (line.y() - edgeDragStartRef.current.startY) / stageScale;

              // Get the two vertex indices for this edge
              const idx1 = index;
              const idx2 = (index + 1) % localPoints.length;

              // Apply delta to the ORIGINAL start points (not current points)
              const startPoints = edgeDragStartRef.current.startPoints;
              const newPoints = [...localPoints];
              newPoints[idx1] = {
                x: startPoints[idx1].x + dx,
                y: startPoints[idx1].y + dy
              };
              newPoints[idx2] = {
                x: startPoints[idx2].x + dx,
                y: startPoints[idx2].y + dy
              };

              setLocalPoints(newPoints);
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;

              // Reset the line position for next drag
              e.target.x(0);
              e.target.y(0);

              // Clear the drag start ref
              edgeDragStartRef.current = null;

              handleEdgeDragEnd();

              const stage = e.target.getStage();
              if (stage && draggable) {
                stage.container().style.cursor = '';
              }
            }}
          />
        );
      })}

      {/* Corner Handles for outer boundary (all polygons, including those with holes) */}
      {isSelected && localPoints.map((point, index) => (
        <Circle
          key={`corner-${index}`}
          x={point.x}
          y={point.y}
          radius={handleRadius}
          fill={HANDLE_FILL}
          stroke={HANDLE_STROKE}
          strokeWidth={handleStrokeWidth}
          strokeScaleEnabled={false}
          draggable
          onMouseDown={(e) => {
            // Stop event from reaching Group to prevent shape drag when corner is dragged
            e.cancelBubble = true;
            if (e.evt) e.evt.stopPropagation();
          }}
          onDragStart={(e) => {
            e.cancelBubble = true;
            handleCornerDragStart(index);
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            handleCornerDrag(index, e);
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            handleCornerDragEnd(index, e);
          }}
          onDblClick={() => handleRemovePoint(index)}
          onMouseEnter={(e) => {
            if (!draggable) return;
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'move';
          }}
          onMouseLeave={(e) => {
            if (!draggable) return;
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = '';
          }}
        />
      ))}

      {/* Corner Handles for hole vertices (when selected and has holes) */}
      {/* Both outer boundary and hole vertices are editable */}
      {isSelected && hasHoles && localHoles && localHoles.map((hole, holeIndex) => (
        hole.map((point, cornerIndex) => (
          <Circle
            key={`hole-${holeIndex}-corner-${cornerIndex}`}
            x={point.x}
            y={point.y}
            radius={handleRadius}
            fill={HANDLE_FILL}
            stroke={HANDLE_STROKE}
            strokeWidth={handleStrokeWidth}
            strokeScaleEnabled={false}
            draggable
            onMouseDown={(e) => {
              // Stop event from reaching Group to prevent shape drag when corner is dragged
              e.cancelBubble = true;
              if (e.evt) e.evt.stopPropagation();
            }}
            onDragStart={(e) => {
              e.cancelBubble = true;
              handleHoleCornerDragStart(holeIndex, cornerIndex);
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              handleHoleCornerDrag(holeIndex, cornerIndex, e);
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              handleHoleCornerDragEnd(holeIndex, cornerIndex, e);
            }}
            onMouseEnter={(e) => {
              const container = e.target.getStage()?.container();
              if (container) container.style.cursor = 'move';
            }}
            onMouseLeave={(e) => {
              const container = e.target.getStage()?.container();
              if (container) container.style.cursor = '';
            }}
          />
        ))
      ))}

      {/* Area Label (centered in polygon) - calculated dynamically from pixels + scale */}
      {showAreaLabel && (
        <Text
          x={centroid.x - bbox.width / 2}
          y={centroid.y - fontSize / 2}
          width={bbox.width}
          text={formatArea(calculatedAreaSf)}
          fontSize={fontSize * 1.1}
          fontFamily="system-ui, sans-serif"
          fontStyle="bold"
          fill="white"
          align="center"
          shadowColor="black"
          shadowBlur={2}
          shadowOpacity={0.8}
          listening={false}
        />
      )}

      {/* Class Label (above polygon, shown on hover or when selected) */}
      {(isHovered || isSelected) && (
        <Label
          x={bbox.minX}
          y={bbox.minY - fontSize - labelPadding * 3}
          listening={false}
        >
          <Tag
            fill={color}
            cornerRadius={8 / scale}
          />
          <Text
            text={formatClassName(detection.class)}
            fontSize={fontSize}
            fontFamily="system-ui, sans-serif"
            fontStyle="500"
            fill="white"
            padding={labelPadding}
          />
        </Label>
      )}
    </Group>
  );
}
