'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Line, Circle, Group, Text, Label, Tag } from 'react-konva';
import type Konva from 'konva';
import type { ExtractionDetection, DetectionClass, PolygonPoint, PolygonPoints } from '@/lib/types/extraction';
import { CONFIDENCE_THRESHOLDS, isPolygonWithHoles, getDetectionColor, getEffectiveDetectionColor, getClassDisplayLabel } from '@/lib/types/extraction';

/**
 * Extract simple polygon points array from PolygonPoints union type.
 * For lines, we only care about the simple array format.
 */
function getSimplePoints(points: PolygonPoints | null | undefined): PolygonPoint[] | null {
  if (!points) return null;
  if (isPolygonWithHoles(points)) {
    return points.outer as PolygonPoint[];
  }
  return points as PolygonPoint[];
}
import { formatLength } from '@/lib/utils/coordinates';

// =============================================================================
// Types
// =============================================================================

export interface LineUpdatePayload {
  polygon_points: PolygonPoint[];
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;
  perimeter_lf: number;
  area_sf: number;
  real_width_ft: number;
  real_height_ft: number;
}

export interface KonvaDetectionLineProps {
  detection: ExtractionDetection;
  isSelected: boolean;
  isHovered: boolean;
  scale: number; // Current viewport scale for sizing labels/handles
  scaleRatio: number; // Pixels per foot for measurement calculations
  onSelect: (id: string, addToSelection: boolean) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
  onLineUpdate: (detection: ExtractionDetection, updates: LineUpdatePayload) => void;
  showLength?: boolean;
  draggable?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

// Line styling
const STROKE_WIDTH = 3;
const STROKE_WIDTH_SELECTED = 4;

// Endpoint handle styling
const HANDLE_FILL = '#3b82f6'; // Blue
const HANDLE_STROKE = '#1e40af'; // Darker blue
const HANDLE_RADIUS = 7; // Base radius in pixels
const HANDLE_STROKE_WIDTH = 2;

// =============================================================================
// Helper Functions
// =============================================================================

// Use centralized getDetectionColor which handles class normalization

function isLowConfidence(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.medium;
}

function formatClassName(detectionClass: DetectionClass | string): string {
  // Use centralized display label function which handles normalization
  const label = getClassDisplayLabel(detectionClass);
  return label === 'Unclassified' ? 'Line' : label;
}

function calculateLineLength(p1: PolygonPoint, p2: PolygonPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getLineMidpoint(p1: PolygonPoint, p2: PolygonPoint): PolygonPoint {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

function getLineBoundingBox(p1: PolygonPoint, p2: PolygonPoint) {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

// =============================================================================
// Component
// =============================================================================

export default function KonvaDetectionLine({
  detection,
  isSelected,
  isHovered,
  scale,
  scaleRatio,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onLineUpdate,
  showLength = true,
  draggable = true,
}: KonvaDetectionLineProps) {
  // Get line endpoints from detection (handle both simple and polygon-with-holes format)
  const initialPoints = useMemo((): [PolygonPoint, PolygonPoint] => {
    const simplePoints = getSimplePoints(detection.polygon_points);
    if (simplePoints && simplePoints.length >= 2) {
      return [simplePoints[0], simplePoints[1]];
    }
    // Fallback: create line from bounding box center with some width
    const halfWidth = detection.pixel_width / 2;
    return [
      { x: detection.pixel_x - halfWidth, y: detection.pixel_y },
      { x: detection.pixel_x + halfWidth, y: detection.pixel_y },
    ];
  }, [detection.polygon_points, detection.pixel_x, detection.pixel_y, detection.pixel_width]);

  // Local state for smooth endpoint dragging
  const [localPoints, setLocalPoints] = useState<[PolygonPoint, PolygonPoint]>(initialPoints);
  const [isDraggingEndpoint, setIsDraggingEndpoint] = useState(false);
  const [isDraggingLine, setIsDraggingLine] = useState(false);

  // Ref to track local edits
  const lastLocalEditRef = useRef<[PolygonPoint, PolygonPoint] | null>(null);

  // Sync local state with detection prop changes (when not dragging)
  useEffect(() => {
    const simplePoints = getSimplePoints(detection.polygon_points);
    const propsPoints: [PolygonPoint, PolygonPoint] =
      simplePoints && simplePoints.length >= 2
        ? [simplePoints[0], simplePoints[1]]
        : initialPoints;

    if (lastLocalEditRef.current) {
      const propsMatch = JSON.stringify(propsPoints) === JSON.stringify(lastLocalEditRef.current);
      if (propsMatch) {
        lastLocalEditRef.current = null;
        return;
      }
    }

    if (!isDraggingEndpoint && !isDraggingLine && !lastLocalEditRef.current) {
      setLocalPoints(propsPoints);
    }
  }, [detection.id, detection.polygon_points, isDraggingEndpoint, isDraggingLine, initialPoints]);

  const color = getEffectiveDetectionColor(detection);
  const lowConfidence = isLowConfidence(detection.confidence);
  const isDeleted = detection.status === 'deleted';

  // Scale-adjusted sizes for consistent visual appearance
  const handleRadius = HANDLE_RADIUS / scale;
  const handleStrokeWidth = HANDLE_STROKE_WIDTH / scale;
  const strokeWidth = (isSelected ? STROKE_WIDTH_SELECTED : STROKE_WIDTH) / scale;
  const fontSize = 12 / scale;
  const labelPadding = 4 / scale;

  // Calculate length dynamically
  const calculatedLengthLf = useMemo(() => {
    if (scaleRatio <= 0) return 0;
    const pixelLength = calculateLineLength(localPoints[0], localPoints[1]);
    return pixelLength / scaleRatio;
  }, [localPoints, scaleRatio]);

  const midpoint = useMemo(() => getLineMidpoint(localPoints[0], localPoints[1]), [localPoints]);
  const bbox = useMemo(() => getLineBoundingBox(localPoints[0], localPoints[1]), [localPoints]);

  // Check if line is long enough to show length label
  const pixelLength = calculateLineLength(localPoints[0], localPoints[1]);
  const showLengthLabel = showLength && calculatedLengthLf > 0 && pixelLength > 50;

  // ==========================================================================
  // Handlers
  // ==========================================================================

  // Handle click to select (with multi-select support via Cmd/Ctrl/Shift)
  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    const addToSelection = e.evt.metaKey || e.evt.ctrlKey || e.evt.shiftKey;
    onSelect(detection.id, addToSelection);
  }, [detection.id, onSelect]);

  // Handle endpoint drag
  const handleEndpointDrag = useCallback((endpointIndex: 0 | 1, e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x();
    const newY = e.target.y();

    setLocalPoints((prev) => {
      const newPoints: [PolygonPoint, PolygonPoint] = [...prev];
      newPoints[endpointIndex] = { x: newX, y: newY };
      return newPoints;
    });
  }, []);

  // Handle endpoint drag start
  const handleEndpointDragStart = useCallback(() => {
    setIsDraggingEndpoint(true);
  }, []);

  // Handle endpoint drag end
  const handleEndpointDragEnd = useCallback((endpointIndex: 0 | 1, e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x();
    const newY = e.target.y();

    const newPoints: [PolygonPoint, PolygonPoint] = [...localPoints];
    newPoints[endpointIndex] = { x: newX, y: newY };

    lastLocalEditRef.current = newPoints;
    setLocalPoints(newPoints);
    setIsDraggingEndpoint(false);

    // Calculate measurements
    const pixelLen = calculateLineLength(newPoints[0], newPoints[1]);
    const lengthLf = pixelLen / scaleRatio;
    const lineBox = getLineBoundingBox(newPoints[0], newPoints[1]);

    onLineUpdate(detection, {
      polygon_points: newPoints,
      pixel_x: lineBox.centerX,
      pixel_y: lineBox.centerY,
      pixel_width: lineBox.width,
      pixel_height: lineBox.height,
      perimeter_lf: lengthLf,
      area_sf: 0,
      real_width_ft: lineBox.width / scaleRatio,
      real_height_ft: lineBox.height / scaleRatio,
    });
  }, [localPoints, detection, scaleRatio, onLineUpdate]);

  // Handle entire line drag start
  const handleLineDragStart = useCallback(() => {
    setIsDraggingLine(true);
  }, []);

  // Handle entire line drag end
  const handleLineDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const group = e.target;
    const dx = group.x();
    const dy = group.y();

    group.position({ x: 0, y: 0 });

    if (isDraggingEndpoint) {
      return;
    }

    if (dx === 0 && dy === 0) {
      setIsDraggingLine(false);
      return;
    }

    const newPoints: [PolygonPoint, PolygonPoint] = [
      { x: localPoints[0].x + dx, y: localPoints[0].y + dy },
      { x: localPoints[1].x + dx, y: localPoints[1].y + dy },
    ];

    lastLocalEditRef.current = newPoints;
    setLocalPoints(newPoints);
    setIsDraggingLine(false);

    const pixelLen = calculateLineLength(newPoints[0], newPoints[1]);
    const lengthLf = pixelLen / scaleRatio;
    const lineBox = getLineBoundingBox(newPoints[0], newPoints[1]);

    onLineUpdate(detection, {
      polygon_points: newPoints,
      pixel_x: lineBox.centerX,
      pixel_y: lineBox.centerY,
      pixel_width: lineBox.width,
      pixel_height: lineBox.height,
      perimeter_lf: lengthLf,
      area_sf: 0,
      real_width_ft: lineBox.width / scaleRatio,
      real_height_ft: lineBox.height / scaleRatio,
    });
  }, [localPoints, isDraggingEndpoint, detection, scaleRatio, onLineUpdate]);

  // ==========================================================================
  // Render deleted line (low opacity, no interaction)
  // ==========================================================================

  if (isDeleted) {
    return (
      <Line
        points={[localPoints[0].x, localPoints[0].y, localPoints[1].x, localPoints[1].y]}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={0.2}
        dash={[4 / scale, 2 / scale]}
        lineCap="round"
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
      name={`detection-line-${detection.id}`}
      draggable={draggable && isSelected && !isDraggingEndpoint}
      onDragStart={handleLineDragStart}
      onDragEnd={handleLineDragEnd}
    >
      {/* Main Line */}
      <Line
        points={[localPoints[0].x, localPoints[0].y, localPoints[1].x, localPoints[1].y]}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={isSelected ? 1 : isHovered ? 0.9 : 0.8}
        lineCap="round"
        dash={lowConfidence ? [6 / scale, 3 / scale] : undefined}
        shadowColor={isSelected ? color : undefined}
        shadowBlur={isSelected ? 6 : 0}
        shadowOpacity={isSelected ? 0.5 : 0}
        hitStrokeWidth={20 / scale}
        onClick={handleClick}
        onTap={handleClick}
        onMouseEnter={() => onHoverStart(detection.id)}
        onMouseLeave={() => onHoverEnd()}
      />

      {/* Endpoint Handles (always visible, draggable when selected) */}
      {[0, 1].map((index) => (
        <Circle
          key={`endpoint-${index}`}
          x={localPoints[index as 0 | 1].x}
          y={localPoints[index as 0 | 1].y}
          radius={handleRadius}
          fill={isSelected ? HANDLE_FILL : color}
          stroke={isSelected ? HANDLE_STROKE : '#FFFFFF'}
          strokeWidth={handleStrokeWidth}
          strokeScaleEnabled={false}
          opacity={isSelected ? 1 : isHovered ? 0.8 : 0.6}
          draggable={isSelected}
          onMouseDown={(e) => {
            e.cancelBubble = true;
            if (e.evt) e.evt.stopPropagation();
          }}
          onDragStart={(e) => {
            e.cancelBubble = true;
            handleEndpointDragStart();
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            handleEndpointDrag(index as 0 | 1, e);
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            handleEndpointDragEnd(index as 0 | 1, e);
          }}
          onMouseEnter={(e) => {
            if (!draggable) return;
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = isSelected ? 'move' : 'pointer';
          }}
          onMouseLeave={(e) => {
            if (!draggable) return;
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = '';
          }}
        />
      ))}

      {/* Length Label (centered on line) */}
      {showLengthLabel && (
        <Text
          x={midpoint.x}
          y={midpoint.y - fontSize - 4 / scale}
          text={formatLength(calculatedLengthLf)}
          fontSize={fontSize}
          fontFamily="system-ui, sans-serif"
          fontStyle="bold"
          fill="white"
          align="center"
          offsetX={fontSize * 2}
          shadowColor="black"
          shadowBlur={2}
          shadowOpacity={0.8}
          listening={false}
        />
      )}

      {/* Class Label (shown on hover or when selected) */}
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
