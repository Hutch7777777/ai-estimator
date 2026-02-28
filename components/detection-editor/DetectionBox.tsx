'use client';

import React, { memo, useCallback } from 'react';
import { Check, AlertTriangle, Pencil } from 'lucide-react';
import type {
  ExtractionDetection,
  DetectionClass,
  ResizeHandle,
  PolygonPoints,
  SimplePolygonPoint,
} from '@/lib/types/extraction';
import {
  DETECTION_CLASS_COLORS,
  CONFIDENCE_THRESHOLDS,
  isPolygonWithHoles,
} from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

export interface DetectionBoxProps {
  detection: ExtractionDetection;
  isSelected: boolean;
  isHovered: boolean;
  scale: number;
  onSelect: (id: string, addToSelection: boolean) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
  onDragStart: (id: string, startX: number, startY: number) => void;
  onResizeStart: (id: string, handle: ResizeHandle, startX: number, startY: number) => void;
  showDimensions?: boolean;
  showArea?: boolean;
  showStatus?: boolean;
}

export type { ResizeHandle };

// =============================================================================
// Constants
// =============================================================================

const RESIZE_HANDLES: { handle: ResizeHandle; cursor: string }[] = [
  { handle: 'nw', cursor: 'nwse-resize' },
  { handle: 'n', cursor: 'ns-resize' },
  { handle: 'ne', cursor: 'nesw-resize' },
  { handle: 'w', cursor: 'ew-resize' },
  { handle: 'e', cursor: 'ew-resize' },
  { handle: 'sw', cursor: 'nesw-resize' },
  { handle: 's', cursor: 'ns-resize' },
  { handle: 'se', cursor: 'nwse-resize' },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format feet to feet-inches notation
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
 * Get handle position based on detection bounds
 */
function getHandlePosition(
  handle: ResizeHandle,
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  const positions: Record<ResizeHandle, { x: number; y: number }> = {
    nw: { x, y },
    n: { x: x + width / 2, y },
    ne: { x: x + width, y },
    w: { x, y: y + height / 2 },
    e: { x: x + width, y: y + height / 2 },
    sw: { x, y: y + height },
    s: { x: x + width / 2, y: y + height },
    se: { x: x + width, y: y + height },
  };
  return positions[handle];
}

/**
 * Capitalize detection class for display
 */
function formatClassName(detectionClass: DetectionClass): string {
  if (!detectionClass) return 'Unknown';
  return detectionClass
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Convert polygon points to SVG points string
 */
function getPolygonPointsString(polygonPoints: PolygonPoints): string {
  const points = isPolygonWithHoles(polygonPoints) ? polygonPoints.outer : polygonPoints;
  return points.map((p: SimplePolygonPoint) => `${p.x},${p.y}`).join(' ');
}

/**
 * Check if polygon has enough points to render
 */
function hasValidPolygon(polygonPoints: PolygonPoints | null | undefined): polygonPoints is PolygonPoints {
  if (!polygonPoints) return false;
  const points = isPolygonWithHoles(polygonPoints) ? polygonPoints.outer : polygonPoints;
  return Array.isArray(points) && points.length >= 3;
}

// =============================================================================
// Component
// =============================================================================

const DetectionBox = memo(function DetectionBox({
  detection,
  isSelected,
  isHovered,
  scale,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onDragStart,
  onResizeStart,
  showDimensions = true,
  showArea = true,
  showStatus = true,
}: DetectionBoxProps) {
  const { pixel_x: centerX, pixel_y: centerY, pixel_width, pixel_height } = detection;

  // Convert from Roboflow center coordinates to top-left for SVG rendering
  // Roboflow returns x,y as the CENTER of the bounding box
  const x = centerX - pixel_width / 2;
  const y = centerY - pixel_height / 2;

  const color = DETECTION_CLASS_COLORS[detection.class] || DETECTION_CLASS_COLORS[''];
  const isLowConfidence = detection.confidence < CONFIDENCE_THRESHOLDS.medium;
  const isDeleted = detection.status === 'deleted';

  // Handle sizes scaled for consistent visual appearance
  const handleSize = 8 / scale;
  const strokeWidth = 2 / scale;
  const fontSize = {
    dimension: 11 / scale,
    area: 12 / scale,
    class: 10 / scale,
    status: 14 / scale,
  };

  // Check if box is large enough to show area label
  const showAreaLabel = showArea && detection.area_sf !== null && pixel_width > 40 && pixel_height > 30;

  // Click handler
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(detection.id, e.shiftKey);
    },
    [detection.id, onSelect]
  );

  // Drag start handler
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only left click
      e.stopPropagation();
      onDragStart(detection.id, e.clientX, e.clientY);
    },
    [detection.id, onDragStart]
  );

  // Resize handle mouse down
  const handleResizeMouseDown = useCallback(
    (handle: ResizeHandle) => (e: React.MouseEvent) => {
      e.stopPropagation();
      onResizeStart(detection.id, handle, e.clientX, e.clientY);
    },
    [detection.id, onResizeStart]
  );

  // Hover handlers
  const handleMouseEnter = useCallback(() => {
    onHoverStart(detection.id);
  }, [detection.id, onHoverStart]);

  const handleMouseLeave = useCallback(() => {
    onHoverEnd();
  }, [onHoverEnd]);

  // Check if we should render as polygon
  const usePolygon = hasValidPolygon(detection.polygon_points);

  // Don't render deleted detections (or render with low opacity)
  if (isDeleted) {
    return (
      <g opacity={0.3}>
        {usePolygon ? (
          <polygon
            points={getPolygonPointsString(detection.polygon_points!)}
            fill={color}
            fillOpacity={0.1}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${4 / scale} ${2 / scale}`}
          />
        ) : (
          <rect
            x={x}
            y={y}
            width={pixel_width}
            height={pixel_height}
            fill={color}
            fillOpacity={0.1}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${4 / scale} ${2 / scale}`}
          />
        )}
      </g>
    );
  }

  return (
    <g>
      {/* Main Shape - Polygon or Rectangle */}
      {usePolygon ? (
        <polygon
          points={getPolygonPointsString(detection.polygon_points!)}
          fill={color}
          fillOpacity={isSelected ? 0.25 : 0.15}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={isLowConfidence ? `${4 / scale} ${2 / scale}` : undefined}
          cursor="move"
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      ) : (
        <rect
          x={x}
          y={y}
          width={pixel_width}
          height={pixel_height}
          fill={color}
          fillOpacity={isSelected ? 0.25 : 0.15}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={isLowConfidence ? `${4 / scale} ${2 / scale}` : undefined}
          cursor="move"
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      )}

      {/* Resize Handles (only when selected) */}
      {isSelected &&
        RESIZE_HANDLES.map(({ handle, cursor }) => {
          const pos = getHandlePosition(handle, x, y, pixel_width, pixel_height);
          return (
            <rect
              key={handle}
              x={pos.x - handleSize / 2}
              y={pos.y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              fill="white"
              stroke={color}
              strokeWidth={1 / scale}
              cursor={cursor}
              onMouseDown={handleResizeMouseDown(handle)}
            />
          );
        })}

      {/* Dimension Label (below the detection box) */}
      {showDimensions && detection.real_width_ft !== null && detection.real_height_ft !== null && (
        <g>
          {/* Background for readability */}
          <rect
            x={x + pixel_width / 2 - 40 / scale}
            y={y + pixel_height + 4 / scale}
            width={80 / scale}
            height={16 / scale}
            rx={3 / scale}
            fill="rgba(0, 0, 0, 0.7)"
          />
          <text
            x={x + pixel_width / 2}
            y={y + pixel_height + 15 / scale}
            textAnchor="middle"
            fontSize={fontSize.dimension}
            fill="white"
            fontFamily="system-ui, sans-serif"
          >
            {formatDimension(detection.real_width_ft)} × {formatDimension(detection.real_height_ft)}
          </text>
        </g>
      )}

      {/* Area Label (centered inside the box) */}
      {showAreaLabel && detection.area_sf !== null && (
        <text
          x={x + pixel_width / 2}
          y={y + pixel_height / 2 + fontSize.area / 3}
          textAnchor="middle"
          fontSize={fontSize.area}
          fill="white"
          fontFamily="system-ui, sans-serif"
          fontWeight="600"
          style={{
            textShadow: '0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5)',
          }}
        >
          {detection.area_sf.toFixed(0)} SF
        </text>
      )}

      {/* Status Indicator (top-right corner) */}
      {showStatus && (
        <g>
          {detection.status === 'verified' && (
            <g transform={`translate(${x + pixel_width - 4 / scale - fontSize.status}, ${y + 4 / scale})`}>
              <circle
                cx={fontSize.status / 2}
                cy={fontSize.status / 2}
                r={fontSize.status / 2}
                fill="#10B981"
              />
              <Check
                x={fontSize.status / 6}
                y={fontSize.status / 6}
                width={(fontSize.status * 2) / 3}
                height={(fontSize.status * 2) / 3}
                color="white"
                strokeWidth={2.5}
              />
            </g>
          )}
          {detection.status === 'auto' && isLowConfidence && (
            <g transform={`translate(${x + pixel_width - 4 / scale - fontSize.status}, ${y + 4 / scale})`}>
              <AlertTriangle
                x={0}
                y={0}
                width={fontSize.status}
                height={fontSize.status}
                color="#F59E0B"
                fill="#FEF3C7"
              />
            </g>
          )}
          {detection.status === 'edited' && (
            <g transform={`translate(${x + pixel_width - 4 / scale - fontSize.status}, ${y + 4 / scale})`}>
              <circle
                cx={fontSize.status / 2}
                cy={fontSize.status / 2}
                r={fontSize.status / 2}
                fill="#3B82F6"
              />
              <Pencil
                x={fontSize.status / 5}
                y={fontSize.status / 5}
                width={(fontSize.status * 3) / 5}
                height={(fontSize.status * 3) / 5}
                color="white"
                strokeWidth={2}
              />
            </g>
          )}
        </g>
      )}

      {/* Class Label (above box, shown on hover or when selected) */}
      {(isHovered || isSelected) && (
        <g>
          {/* Background pill */}
          <rect
            x={x}
            y={y - 20 / scale}
            width={Math.max(60 / scale, formatClassName(detection.class).length * 6 / scale)}
            height={16 / scale}
            rx={8 / scale}
            fill={color}
          />
          <text
            x={x + 8 / scale}
            y={y - 8 / scale}
            fontSize={fontSize.class}
            fill="white"
            fontFamily="system-ui, sans-serif"
            fontWeight="500"
          >
            {formatClassName(detection.class)}
          </text>
        </g>
      )}
    </g>
  );
});

export default DetectionBox;
