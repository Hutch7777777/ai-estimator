'use client';

import React, { memo, useMemo } from 'react';
import { Group, Line, Circle, Text, Rect } from 'react-konva';

// =============================================================================
// Types
// =============================================================================

/** Simplified SAM result type that only includes fields needed for rendering */
interface SAMResultForOverlay {
  polygon_points: Array<{ x: number; y: number }>;
  bounding_box?: { x: number; y: number; width: number; height: number };
}

/** Click point type */
interface SAMClickPointType {
  x: number;
  y: number;
  label: 0 | 1; // 0 = background, 1 = foreground
}

interface SAMSelectOverlayProps {
  /** Current SAM result to display */
  result: SAMResultForOverlay | null;
  /** Click points used for segmentation */
  clickPoints: SAMClickPointType[];
  /** Whether SAM is currently processing */
  isSegmenting: boolean;
  /** Scale factor for coordinates */
  scale: number;
  /** Offset for canvas positioning */
  offset?: { x: number; y: number };
}

// =============================================================================
// Constants
// =============================================================================

const SAM_PREVIEW_COLOR = '#9333EA'; // Purple for SAM preview
const SAM_FILL_OPACITY = 0.25;
const CLICK_POINT_RADIUS = 8;
const INCLUDE_POINT_COLOR = '#22C55E'; // Green for include
const EXCLUDE_POINT_COLOR = '#EF4444'; // Red for exclude

// =============================================================================
// Component
// =============================================================================

const SAMSelectOverlay = memo(function SAMSelectOverlay({
  result,
  clickPoints,
  isSegmenting,
  scale,
  offset = { x: 0, y: 0 },
}: SAMSelectOverlayProps) {
  // Convert polygon points to flat array for Konva Line
  const polygonFlatPoints = useMemo(() => {
    if (!result?.polygon_points?.length) return [];
    return result.polygon_points.flatMap(p => [
      p.x * scale + offset.x,
      p.y * scale + offset.y,
    ]);
  }, [result, scale, offset]);

  // Scale click points
  const scaledClickPoints = useMemo(() => {
    return clickPoints.map(p => ({
      ...p,
      x: p.x * scale + offset.x,
      y: p.y * scale + offset.y,
    }));
  }, [clickPoints, scale, offset]);

  // Calculate centroid for label placement
  const centroid = useMemo(() => {
    if (!result?.polygon_points?.length) return null;
    const points = result.polygon_points;
    const sumX = points.reduce((acc, p) => acc + p.x, 0);
    const sumY = points.reduce((acc, p) => acc + p.y, 0);
    return {
      x: (sumX / points.length) * scale + offset.x,
      y: (sumY / points.length) * scale + offset.y,
    };
  }, [result, scale, offset]);

  return (
    <Group>
      {/* Polygon preview */}
      {polygonFlatPoints.length >= 6 && (
        <>
          {/* Fill */}
          <Line
            points={polygonFlatPoints}
            closed
            fill={SAM_PREVIEW_COLOR}
            opacity={SAM_FILL_OPACITY}
          />
          {/* Stroke */}
          <Line
            points={polygonFlatPoints}
            closed
            stroke={SAM_PREVIEW_COLOR}
            strokeWidth={2}
            dash={[8, 4]}
          />
        </>
      )}

      {/* Processing indicator at centroid */}
      {isSegmenting && centroid && (
        <Group x={centroid.x} y={centroid.y}>
          {/* Animated loading ring */}
          <Circle
            radius={20}
            stroke={SAM_PREVIEW_COLOR}
            strokeWidth={3}
            dash={[10, 5]}
            opacity={0.8}
          />
          <Text
            text="..."
            fontSize={14}
            fill={SAM_PREVIEW_COLOR}
            fontStyle="bold"
            align="center"
            verticalAlign="middle"
            offsetX={10}
            offsetY={7}
          />
        </Group>
      )}

      {/* Click points */}
      {scaledClickPoints.map((point, index) => (
        <Group key={`click-${index}`} x={point.x} y={point.y}>
          {/* Outer ring */}
          <Circle
            radius={CLICK_POINT_RADIUS + 2}
            stroke="white"
            strokeWidth={2}
          />
          {/* Inner circle */}
          <Circle
            radius={CLICK_POINT_RADIUS}
            fill={point.label === 1 ? INCLUDE_POINT_COLOR : EXCLUDE_POINT_COLOR}
            stroke={point.label === 1 ? INCLUDE_POINT_COLOR : EXCLUDE_POINT_COLOR}
            strokeWidth={2}
          />
          {/* Label */}
          <Text
            text={point.label === 1 ? '+' : '-'}
            fontSize={12}
            fontStyle="bold"
            fill="white"
            align="center"
            verticalAlign="middle"
            offsetX={4}
            offsetY={6}
          />
        </Group>
      ))}

      {/* Result label */}
      {result && !isSegmenting && centroid && (
        <Group x={centroid.x} y={centroid.y}>
          {/* Background */}
          <Rect
            x={-40}
            y={-12}
            width={80}
            height={24}
            fill="rgba(147, 51, 234, 0.9)"
            cornerRadius={4}
          />
          {/* Text */}
          <Text
            text="Click to assign"
            fontSize={11}
            fill="white"
            align="center"
            width={80}
            offsetX={40}
            offsetY={6}
          />
        </Group>
      )}

      {/* Bounding box (optional, for reference) */}
      {result?.bounding_box && (
        <Rect
          x={result.bounding_box.x * scale + offset.x}
          y={result.bounding_box.y * scale + offset.y}
          width={result.bounding_box.width * scale}
          height={result.bounding_box.height * scale}
          stroke={SAM_PREVIEW_COLOR}
          strokeWidth={1}
          dash={[4, 4]}
          opacity={0.5}
        />
      )}
    </Group>
  );
});

export default SAMSelectOverlay;
