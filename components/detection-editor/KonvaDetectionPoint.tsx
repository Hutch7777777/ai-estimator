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

// Marker styling - small solid dots
const MARKER_RADIUS = 5; // Small solid dot radius
const SELECTION_RING_RADIUS = 9; // Ring shown when selected
const SELECTION_RING_WIDTH = 1.5;

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
  const selectionRingRadius = SELECTION_RING_RADIUS / scale;
  const selectionRingWidth = SELECTION_RING_WIDTH / scale;
  const fontSize = 11 / scale;
  const labelPadding = 3 / scale;

  // ==========================================================================
  // Handlers
  // ==========================================================================

  // Handle click to select
  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    const addToSelection = e.evt.metaKey || e.evt.ctrlKey || e.evt.shiftKey;
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
        opacity={0.15}
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
      {/* Selection ring (only visible when selected or hovered) */}
      {(isSelected || isHovered) && (
        <Circle
          x={0}
          y={0}
          radius={selectionRingRadius}
          fill="transparent"
          stroke={isSelected ? color : 'rgba(255,255,255,0.6)'}
          strokeWidth={selectionRingWidth}
          dash={lowConfidence ? [3 / scale, 1.5 / scale] : undefined}
          listening={false}
        />
      )}

      {/* Main solid dot - small filled circle */}
      <Circle
        x={0}
        y={0}
        radius={markerRadius}
        fill={color}
        opacity={isSelected ? 1 : isHovered ? 0.95 : 0.85}
        stroke={isSelected ? 'white' : undefined}
        strokeWidth={isSelected ? 1 / scale : 0}
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

      {/* Class Label (shown on hover or when selected) */}
      {(isHovered || isSelected) && (
        <Label
          x={0}
          y={-selectionRingRadius - fontSize - labelPadding}
          listening={false}
        >
          <Tag
            fill={color}
            cornerRadius={3 / scale}
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
