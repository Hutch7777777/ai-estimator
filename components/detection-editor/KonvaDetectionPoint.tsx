'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Circle, Group, Text, Label, Tag } from 'react-konva';
import type Konva from 'konva';
import type { ExtractionDetection, DetectionClass } from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS, CONFIDENCE_THRESHOLDS } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

export interface PointUpdatePayload {
  pixel_x: number;
  pixel_y: number;
}

export interface KonvaDetectionPointProps {
  detection: ExtractionDetection;
  isSelected: boolean;
  isHovered: boolean;
  scale: number; // Current viewport scale for sizing labels/handles
  onSelect: (id: string, addToSelection: boolean) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
  onPointUpdate: (detection: ExtractionDetection, updates: PointUpdatePayload) => void;
  draggable?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

// Marker styling
const MARKER_RADIUS = 10; // Base radius in pixels
const MARKER_STROKE_WIDTH = 2;
const MARKER_INNER_RADIUS = 4; // Inner dot radius

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
  if (!detectionClass) return 'Marker';
  return detectionClass
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// =============================================================================
// Component
// =============================================================================

export default function KonvaDetectionPoint({
  detection,
  isSelected,
  isHovered,
  scale,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onPointUpdate,
  draggable = true,
}: KonvaDetectionPointProps) {
  // Get point position from detection
  const initialPosition = useMemo(() => ({
    x: detection.pixel_x,
    y: detection.pixel_y,
  }), [detection.pixel_x, detection.pixel_y]);

  // Local state for smooth dragging
  const [localPosition, setLocalPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);

  // Ref to track local edits
  const lastLocalEditRef = useRef<{ x: number; y: number } | null>(null);

  // Sync local state with detection prop changes (when not dragging)
  useEffect(() => {
    const propsPosition = {
      x: detection.pixel_x,
      y: detection.pixel_y,
    };

    if (lastLocalEditRef.current) {
      const propsMatch =
        propsPosition.x === lastLocalEditRef.current.x &&
        propsPosition.y === lastLocalEditRef.current.y;
      if (propsMatch) {
        lastLocalEditRef.current = null;
        return;
      }
    }

    if (!isDragging && !lastLocalEditRef.current) {
      setLocalPosition(propsPosition);
    }
  }, [detection.id, detection.pixel_x, detection.pixel_y, isDragging]);

  const color = getClassColor(detection.class);
  const lowConfidence = isLowConfidence(detection.confidence);
  const isDeleted = detection.status === 'deleted';

  // Scale-adjusted sizes for consistent visual appearance
  const markerRadius = MARKER_RADIUS / scale;
  const markerStrokeWidth = MARKER_STROKE_WIDTH / scale;
  const innerRadius = MARKER_INNER_RADIUS / scale;
  const fontSize = 12 / scale;
  const labelPadding = 4 / scale;

  // ==========================================================================
  // Handlers
  // ==========================================================================

  // Handle click to select
  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    const addToSelection = e.evt.metaKey || e.evt.ctrlKey;
    onSelect(detection.id, addToSelection);
  }, [detection.id, onSelect]);

  // Handle drag start
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  // Handle drag move
  const handleDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x();
    const newY = e.target.y();
    setLocalPosition({ x: newX, y: newY });
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x();
    const newY = e.target.y();

    const newPosition = { x: newX, y: newY };
    lastLocalEditRef.current = newPosition;
    setLocalPosition(newPosition);
    setIsDragging(false);

    onPointUpdate(detection, {
      pixel_x: newX,
      pixel_y: newY,
    });
  }, [detection, onPointUpdate]);

  // ==========================================================================
  // Render deleted point (low opacity, no interaction)
  // ==========================================================================

  if (isDeleted) {
    return (
      <Circle
        x={localPosition.x}
        y={localPosition.y}
        radius={markerRadius}
        fill={color}
        opacity={0.2}
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
      name={`detection-point-${detection.id}`}
      x={localPosition.x}
      y={localPosition.y}
      draggable={draggable && isSelected}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      {/* Outer ring (shows selection state) */}
      <Circle
        x={0}
        y={0}
        radius={markerRadius}
        fill={isSelected ? color : 'transparent'}
        stroke={color}
        strokeWidth={markerStrokeWidth}
        opacity={isSelected ? 1 : isHovered ? 0.9 : 0.8}
        dash={lowConfidence ? [4 / scale, 2 / scale] : undefined}
        shadowColor={isSelected ? color : undefined}
        shadowBlur={isSelected ? 8 : 0}
        shadowOpacity={isSelected ? 0.5 : 0}
        onClick={handleClick}
        onTap={handleClick}
        onMouseEnter={() => {
          onHoverStart(detection.id);
          const container = document.querySelector('.konva-container');
          if (container) (container as HTMLElement).style.cursor = isSelected ? 'move' : 'pointer';
        }}
        onMouseLeave={() => {
          onHoverEnd();
          const container = document.querySelector('.konva-container');
          if (container) (container as HTMLElement).style.cursor = '';
        }}
      />

      {/* Inner dot (always visible) */}
      <Circle
        x={0}
        y={0}
        radius={innerRadius}
        fill={isSelected ? 'white' : color}
        listening={false}
      />

      {/* Class Label (shown on hover or when selected) */}
      {(isHovered || isSelected) && (
        <Label
          x={0}
          y={-markerRadius - fontSize - labelPadding * 2}
          listening={false}
        >
          <Tag
            fill={color}
            cornerRadius={4 / scale}
          />
          <Text
            text={formatClassName(detection.class)}
            fontSize={fontSize}
            fontFamily="system-ui, sans-serif"
            fontStyle="500"
            fill="white"
            padding={labelPadding}
            align="center"
            offsetX={-labelPadding}
          />
        </Label>
      )}
    </Group>
  );
}
