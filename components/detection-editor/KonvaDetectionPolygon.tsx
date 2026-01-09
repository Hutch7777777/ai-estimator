'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Line, Circle, Group, Text, Label, Tag, Rect } from 'react-konva';
import type Konva from 'konva';
import type { ExtractionDetection, DetectionClass, PolygonPoint } from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS, CONFIDENCE_THRESHOLDS } from '@/lib/types/extraction';
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
  polygon_points: PolygonPoint[];
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
}

// =============================================================================
// Constants
// =============================================================================

// Solid black stroke for all detections - provides clear boundary visibility
const STROKE_COLOR = '#000000';

// Corner handle styling
const HANDLE_FILL = '#3b82f6'; // Blue
const HANDLE_STROKE = '#1e40af'; // Darker blue
const HANDLE_RADIUS = 6; // Base radius in pixels
const HANDLE_STROKE_WIDTH = 2;

// Edge click zone width for adding points
const EDGE_CLICK_WIDTH = 12;

// =============================================================================
// Helper Functions
// =============================================================================

function getClassColor(detectionClass: DetectionClass): string {
  return DETECTION_CLASS_COLORS[detectionClass] || DETECTION_CLASS_COLORS[''];
}

function isLowConfidence(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.medium;
}

function formatClassName(detectionClass: DetectionClass): string {
  if (!detectionClass) return 'Unknown';
  return detectionClass
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
}: KonvaDetectionPolygonProps) {
  // Get or convert polygon points from detection
  const initialPoints = useMemo(() => {
    return detection.polygon_points ?? rectToPolygonPoints(detection);
  }, [detection.polygon_points, detection.pixel_x, detection.pixel_y, detection.pixel_width, detection.pixel_height]);

  // Local state for smooth corner dragging
  const [localPoints, setLocalPoints] = useState<PolygonPoint[]>(initialPoints);
  const [isDraggingCorner, setIsDraggingCorner] = useState(false);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const [hoveredEdgeIndex, setHoveredEdgeIndex] = useState<number | null>(null);

  // Ref to track local edits - prevents useEffect from resetting points before parent updates
  const lastLocalEditRef = useRef<PolygonPoint[] | null>(null);

  // Sync local state with detection prop changes (when not dragging)
  useEffect(() => {
    // Get points from props
    const propsPoints = detection.polygon_points ?? rectToPolygonPoints(detection);

    // If we just made a local edit and props now match it, clear the ref
    if (lastLocalEditRef.current) {
      const propsMatch = JSON.stringify(propsPoints) === JSON.stringify(lastLocalEditRef.current);
      if (propsMatch) {
        lastLocalEditRef.current = null;
        return; // Props caught up with our edit, no need to sync
      }
    }

    // Only sync from props if not currently dragging AND we didn't just make a local edit
    if (!isDraggingCorner && !isDraggingShape && !lastLocalEditRef.current) {
      setLocalPoints(propsPoints);
    }
  }, [detection.id, detection.polygon_points, isDraggingCorner, isDraggingShape]);

  const color = getClassColor(detection.class);
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

  // Handle click to select (with multi-select support via Cmd/Ctrl)
  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    // Check for Cmd (Mac) or Ctrl (Windows) modifier for multi-select
    const addToSelection = e.evt.metaKey || e.evt.ctrlKey;
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

    // IMPORTANT: Don't process shape drag if we were dragging a corner
    // Both events can fire when dragging a corner handle
    if (isDraggingCorner) {
      console.log('=== SHAPE DRAG END (IGNORED - corner drag in progress) ===');
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
  }, [localPoints, isDraggingCorner, detection, onPolygonUpdate, getEffectiveScaleRatio]);

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
    return (
      <Line
        points={flattenPoints(localPoints)}
        closed={true}
        fill={color}
        opacity={0.1}
        stroke={STROKE_COLOR}
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
      draggable={draggable && isSelected && !isDraggingCorner}
      onDragStart={handleShapeDragStart}
      onDragEnd={handleShapeDragEnd}
    >
      {/* Main Polygon Shape */}
      <Line
        points={flattenPoints(localPoints)}
        closed={true}
        fill={color}
        opacity={isSelected ? 0.3 : isHovered ? 0.25 : 0.2}
        stroke={STROKE_COLOR}
        strokeWidth={1}
        strokeScaleEnabled={false}
        dash={lowConfidence ? [4 / scale, 2 / scale] : undefined}
        shadowColor={isSelected ? STROKE_COLOR : undefined}
        shadowBlur={isSelected ? 4 : 0}
        shadowOpacity={isSelected ? 0.3 : 0}
        onClick={handleClick}
        onTap={handleClick}
        onMouseEnter={() => onHoverStart(detection.id)}
        onMouseLeave={() => onHoverEnd()}
      />

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

      {/* Corner Handles (only when selected) */}
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
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'move';
          }}
          onMouseLeave={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = '';
          }}
        />
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

      {/* Status Indicator (top-right of bounding box) */}
      {detection.status === 'verified' && (
        <Rect
          x={bbox.maxX - handleRadius * 2 - labelPadding}
          y={bbox.minY + labelPadding}
          width={handleRadius * 2}
          height={handleRadius * 2}
          fill="#10B981"
          cornerRadius={handleRadius}
          listening={false}
        />
      )}

      {detection.status === 'edited' && (
        <Rect
          x={bbox.maxX - handleRadius * 2 - labelPadding}
          y={bbox.minY + labelPadding}
          width={handleRadius * 2}
          height={handleRadius * 2}
          fill="#3B82F6"
          cornerRadius={handleRadius}
          listening={false}
        />
      )}

      {detection.status === 'auto' && lowConfidence && (
        <Rect
          x={bbox.maxX - handleRadius * 2 - labelPadding}
          y={bbox.minY + labelPadding}
          width={handleRadius * 2}
          height={handleRadius * 2}
          fill="#F59E0B"
          cornerRadius={2 / scale}
          listening={false}
        />
      )}
    </Group>
  );
}
