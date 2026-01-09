'use client';

import React, { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import type { ExtractionDetection, DetectionStatus, PolygonPoint } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

interface SelectionPropertiesProps {
  selectedDetections: ExtractionDetection[];
  pixelsPerFoot: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatValue(value: number | null | undefined, suffix: string = ''): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(1)}${suffix}`;
}

/**
 * Calculate the distance between two points in pixels.
 */
function calculateLineLength(p1: PolygonPoint, p2: PolygonPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate real-world measurements from pixel dimensions using scale ratio.
 * This ensures measurements update dynamically when scale is recalibrated.
 */
function calculateMeasurementsFromPixels(
  detection: ExtractionDetection,
  pixelsPerFoot: number
): { widthFt: number; heightFt: number; areaSf: number; perimeterLf: number; lengthLf?: number; isLine: boolean } {
  // Check if this is a line detection
  const isLine = detection.markup_type === 'line';

  if (isLine && detection.polygon_points && detection.polygon_points.length >= 2) {
    // For lines, calculate length from the two endpoints
    const pixelLength = calculateLineLength(
      detection.polygon_points[0],
      detection.polygon_points[1]
    );
    const lengthLf = pixelLength / pixelsPerFoot;
    return {
      widthFt: 0,
      heightFt: 0,
      areaSf: 0,
      perimeterLf: 0,
      lengthLf,
      isLine: true,
    };
  }

  // Standard polygon/rectangle measurements
  const widthFt = (detection.pixel_width || 0) / pixelsPerFoot;
  const heightFt = (detection.pixel_height || 0) / pixelsPerFoot;
  const areaSf = widthFt * heightFt;
  const perimeterLf = 2 * (widthFt + heightFt);
  return { widthFt, heightFt, areaSf, perimeterLf, isLine: false };
}

// =============================================================================
// Constants
// =============================================================================

const STATUS_BADGE_VARIANT: Record<DetectionStatus, 'default' | 'success' | 'warning' | 'destructive'> = {
  auto: 'default',
  verified: 'success',
  edited: 'warning',
  deleted: 'destructive',
};

const STATUS_LABELS: Record<DetectionStatus, string> = {
  auto: 'Auto-detected',
  verified: 'Verified',
  edited: 'Edited',
  deleted: 'Deleted',
};

// =============================================================================
// Property Row Component
// =============================================================================

interface PropertyRowProps {
  label: string;
  value: string;
}

const PropertyRow = memo(function PropertyRow({ label, value }: PropertyRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-mono text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

const SelectionProperties = memo(function SelectionProperties({
  selectedDetections,
  pixelsPerFoot,
}: SelectionPropertiesProps) {
  // Calculate totals for multi-selection using dynamic scale
  const measurements = useMemo(() => {
    if (selectedDetections.length === 0) {
      return null;
    }

    if (selectedDetections.length === 1) {
      const detection = selectedDetections[0];
      // Calculate measurements dynamically from pixel dimensions
      const { widthFt, heightFt, areaSf, perimeterLf, lengthLf, isLine } = calculateMeasurementsFromPixels(
        detection,
        pixelsPerFoot
      );
      return {
        isSingle: true,
        status: detection.status,
        areaSf,
        perimeterLf,
        widthFt,
        heightFt,
        lengthLf,
        isLine,
        count: 1,
      };
    }

    // Multi-selection - sum totals using dynamic calculations
    let totalArea = 0;
    let totalPerimeter = 0;
    let totalLength = 0;
    let hasLines = false;
    let hasPolygons = false;

    for (const detection of selectedDetections) {
      const { areaSf, perimeterLf, lengthLf, isLine } = calculateMeasurementsFromPixels(detection, pixelsPerFoot);
      if (isLine) {
        hasLines = true;
        totalLength += lengthLf || 0;
      } else {
        hasPolygons = true;
        totalArea += areaSf;
        totalPerimeter += perimeterLf;
      }
    }

    return {
      isSingle: false,
      status: null,
      areaSf: totalArea > 0 ? totalArea : null,
      perimeterLf: totalPerimeter > 0 ? totalPerimeter : null,
      lengthLf: totalLength > 0 ? totalLength : null,
      widthFt: null,
      heightFt: null,
      isLine: hasLines && !hasPolygons,
      hasMixed: hasLines && hasPolygons,
      count: selectedDetections.length,
    };
  }, [selectedDetections, pixelsPerFoot]);

  if (!measurements) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Status Badge - only for single selection */}
      {measurements.isSingle && measurements.status && (
        <div className="space-y-1">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Status
          </span>
          <div>
            <Badge variant={STATUS_BADGE_VARIANT[measurements.status]}>
              {STATUS_LABELS[measurements.status]}
            </Badge>
          </div>
        </div>
      )}

      {/* Measurements */}
      <div className="space-y-1">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {measurements.isSingle
            ? measurements.isLine
              ? 'Line Measurement'
              : 'Measurements'
            : `Combined (${measurements.count} items)`}
        </span>
        <div className="space-y-1.5 bg-gray-50 dark:bg-gray-800/50 rounded-md p-2">
          {/* For lines, show Length instead of Area/Perimeter */}
          {measurements.isLine ? (
            <PropertyRow
              label="Length"
              value={formatValue(measurements.lengthLf, ' LF')}
            />
          ) : (
            <>
              <PropertyRow
                label="Area"
                value={formatValue(measurements.areaSf, ' SF')}
              />
              <PropertyRow
                label="Perimeter"
                value={formatValue(measurements.perimeterLf, ' LF')}
              />
            </>
          )}
          {/* For mixed selections, also show total line length */}
          {measurements.hasMixed && measurements.lengthLf && (
            <PropertyRow
              label="Total Line Length"
              value={formatValue(measurements.lengthLf, ' LF')}
            />
          )}
          {measurements.isSingle && !measurements.isLine && (
            <>
              <PropertyRow
                label="Width"
                value={formatValue(measurements.widthFt, "'")}
              />
              <PropertyRow
                label="Height"
                value={formatValue(measurements.heightFt, "'")}
              />
            </>
          )}
        </div>
      </div>

      {/* Placeholder for future MaterialSearch component */}
      {/*
      <div className="space-y-1">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Assigned Material
        </span>
        <MaterialSearch
          assignedMaterialId={selectedDetections[0]?.assigned_material_id}
          onMaterialChange={...}
        />
      </div>
      */}
    </div>
  );
});

export default SelectionProperties;
