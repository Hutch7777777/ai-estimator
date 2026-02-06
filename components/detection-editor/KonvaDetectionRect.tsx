'use client';

import React, { useRef, useEffect } from 'react';
import { Rect, Group, Text, Label, Tag } from 'react-konva';
import type Konva from 'konva';
import type { ExtractionDetection, DetectionClass } from '@/lib/types/extraction';
import { CONFIDENCE_THRESHOLDS, getDetectionColor, getClassDisplayLabel } from '@/lib/types/extraction';
import { centerToCanvas, formatFeetInches, formatArea } from '@/lib/utils/coordinates';

// =============================================================================
// Types
// =============================================================================

export interface KonvaDetectionRectProps {
  detection: ExtractionDetection;
  isSelected: boolean;
  isHovered: boolean;
  scale: number; // Current viewport scale for sizing labels/handles
  onSelect: (id: string, addToSelection: boolean) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
  onDragEnd: (detection: ExtractionDetection, newPosition: { pixel_x: number; pixel_y: number }) => void;
  onTransformEnd?: (detection: ExtractionDetection, newBounds: {
    pixel_x: number;
    pixel_y: number;
    pixel_width: number;
    pixel_height: number;
  }) => void;
  showDimensions?: boolean;
  showArea?: boolean;
  draggable?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

// Use centralized getDetectionColor which handles class normalization

/**
 * Darken a hex color by a given percentage for stroke visibility.
 */
function darkenColor(hex: string, percent: number = 20): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const factor = 1 - percent / 100;
  const toHex = (n: number) => Math.round(n * factor).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Standard grey stroke for unselected detections
const STROKE_COLOR_UNSELECTED = '#9ca3af';

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

export default function KonvaDetectionRect({
  detection,
  isSelected,
  isHovered,
  scale,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onDragEnd,
  onTransformEnd,
  showDimensions = true,
  showArea = true,
  draggable = true,
}: KonvaDetectionRectProps) {
  const rectRef = useRef<Konva.Rect>(null);
  const groupRef = useRef<Konva.Group>(null);

  // Convert center-based coords to canvas top-left coords
  const canvasCoords = centerToCanvas({
    pixel_x: detection.pixel_x,
    pixel_y: detection.pixel_y,
    pixel_width: detection.pixel_width,
    pixel_height: detection.pixel_height,
  });

  const color = getDetectionColor(detection.class);

  // Material assignment visual feedback - higher opacity and colored stroke when material is assigned
  const hasMaterial = Boolean(detection.assigned_material_id);

  // Stroke color: class color when selected OR has material, grey otherwise
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
  const handleSize = 8 / scale;
  const fontSize = 11 / scale;
  const labelPadding = 4 / scale;

  // Don't render deleted detections (or render with low opacity)
  if (isDeleted) {
    return (
      <Rect
        x={canvasCoords.x}
        y={canvasCoords.y}
        width={canvasCoords.width}
        height={canvasCoords.height}
        fill={color}
        opacity={0.1}
        stroke={STROKE_COLOR_UNSELECTED}
        strokeWidth={1}
        strokeScaleEnabled={false}
        dash={[4 / scale, 2 / scale]}
        listening={false}
      />
    );
  }

  // Handle click to select (works for both mouse and touch, with multi-select support)
  const handleClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    // Check for Cmd (Mac), Ctrl (Windows), or Shift modifier for multi-select
    const addToSelection = e.evt.metaKey || e.evt.ctrlKey || e.evt.shiftKey;
    onSelect(detection.id, addToSelection);
  };

  // Handle drag end - convert back to center coordinates
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const newX = node.x();
    const newY = node.y();

    // Convert top-left to center coordinates for database
    const newCenterX = newX + canvasCoords.width / 2;
    const newCenterY = newY + canvasCoords.height / 2;

    onDragEnd(detection, {
      pixel_x: newCenterX,
      pixel_y: newCenterY,
    });
  };

  // Handle transform end (resize)
  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    if (!onTransformEnd) return;

    const node = rectRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale and apply to width/height
    node.scaleX(1);
    node.scaleY(1);

    const newWidth = Math.max(5, node.width() * scaleX);
    const newHeight = Math.max(5, node.height() * scaleY);
    const newX = node.x();
    const newY = node.y();

    // Convert to center coordinates
    const newCenterX = newX + newWidth / 2;
    const newCenterY = newY + newHeight / 2;

    onTransformEnd(detection, {
      pixel_x: newCenterX,
      pixel_y: newCenterY,
      pixel_width: newWidth,
      pixel_height: newHeight,
    });
  };

  // Check if box is large enough to show area label
  const showAreaLabel = showArea && detection.area_sf !== null && canvasCoords.width > 40 && canvasCoords.height > 30;

  return (
    <Group
      ref={groupRef}
      id={detection.id}
      name={`detection-${detection.id}`}
      x={canvasCoords.x}
      y={canvasCoords.y}
      draggable={draggable}
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => onHoverStart(detection.id)}
      onMouseLeave={() => onHoverEnd()}
    >
      {/* Main Rectangle - positioned at 0,0 relative to group */}
      {/* Note: name="detection-rect" is used by Transformer to find this specific Rect */}
      <Rect
        ref={rectRef}
        name="detection-rect"
        x={0}
        y={0}
        width={canvasCoords.width}
        height={canvasCoords.height}
        fill={color}
        opacity={(isSelected ? 0.3 : isHovered ? 0.25 : 0.2) + (hasMaterial ? 0.15 : 0)}
        stroke={strokeColor}
        strokeWidth={baseStrokeWidth}
        strokeScaleEnabled={false}
        dash={lowConfidence ? [4 / scale, 2 / scale] : undefined}
        cornerRadius={2 / scale}
        shadowColor={isSelected ? strokeColor : undefined}
        shadowBlur={isSelected ? 4 : 0}
        shadowOpacity={isSelected ? 0.3 : 0}
      />

      {/* Area Label (centered inside the box) */}
      {showAreaLabel && detection.area_sf !== null && (
        <Text
          x={0}
          y={canvasCoords.height / 2 - fontSize / 2}
          width={canvasCoords.width}
          text={formatArea(detection.area_sf)}
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

      {/* Dimension Label (below the detection box) */}
      {showDimensions && detection.real_width_ft !== null && detection.real_height_ft !== null && (
        <Label
          x={canvasCoords.width / 2}
          y={canvasCoords.height + labelPadding}
          listening={false}
        >
          <Tag
            fill="rgba(0, 0, 0, 0.7)"
            cornerRadius={3 / scale}
            pointerDirection="up"
            pointerWidth={0}
            pointerHeight={0}
          />
          <Text
            text={`${formatFeetInches(detection.real_width_ft)} × ${formatFeetInches(detection.real_height_ft)}`}
            fontSize={fontSize}
            fontFamily="system-ui, sans-serif"
            fill="white"
            padding={labelPadding}
          />
        </Label>
      )}

      {/* Class Label (above box, shown on hover or when selected) */}
      {(isHovered || isSelected) && (
        <Label
          x={0}
          y={-fontSize - labelPadding * 3}
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

      {/* Status Indicator (top-right corner) */}
      {detection.status === 'verified' && (
        <Group
          x={canvasCoords.width - handleSize - labelPadding}
          y={labelPadding}
          listening={false}
        >
          <Rect
            width={handleSize}
            height={handleSize}
            fill="#10B981"
            cornerRadius={handleSize / 2}
          />
        </Group>
      )}

      {detection.status === 'edited' && (
        <Group
          x={canvasCoords.width - handleSize - labelPadding}
          y={labelPadding}
          listening={false}
        >
          <Rect
            width={handleSize}
            height={handleSize}
            fill="#3B82F6"
            cornerRadius={handleSize / 2}
          />
        </Group>
      )}

      {detection.status === 'auto' && lowConfidence && (
        <Group
          x={canvasCoords.width - handleSize - labelPadding}
          y={labelPadding}
          listening={false}
        >
          <Rect
            width={handleSize}
            height={handleSize}
            fill="#F59E0B"
            cornerRadius={2 / scale}
          />
        </Group>
      )}

      {/* Resize Handles (only when selected) - NOT rendered here, handled by Transformer */}
    </Group>
  );
}
