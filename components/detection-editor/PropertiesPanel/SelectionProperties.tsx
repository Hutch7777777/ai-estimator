'use client';

import React, { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import type { ExtractionDetection, DetectionStatus, PolygonPoint } from '@/lib/types/extraction';
import { isPolygonWithHoles } from '@/lib/types/extraction';
import { calculatePolygonArea, calculatePolygonPerimeter } from '@/lib/utils/polygonUtils';

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
 * Calculate real-world measurements from detection data.
 * PREFERS database values (area_sf, perimeter_lf, item_count) when available
 * from Bluebeam imports. Falls back to calculating from polygon_points.
 * Supports polygons with holes for split detections.
 */
function calculateMeasurementsFromPixels(
  detection: ExtractionDetection,
  pixelsPerFoot: number
): { widthFt: number; heightFt: number; areaSf: number; perimeterLf: number; lengthLf?: number; isLine: boolean; isPoint: boolean; hasHole: boolean; itemCount?: number; markerLabel?: string } {
  const isLine = detection.markup_type === 'line';
  const isPoint = detection.markup_type === 'point';

  // For points, return stored item_count if available
  if (isPoint) {
    return {
      widthFt: 0,
      heightFt: 0,
      areaSf: 0,
      perimeterLf: 0,
      isLine: false,
      isPoint: true,
      hasHole: false,
      itemCount: detection.item_count ?? 1,
      markerLabel: detection.marker_label ?? undefined,
    };
  }

  // For lines, prefer DB perimeter_lf if available, else calculate from polygon_points
  if (isLine) {
    // Use stored perimeter_lf from Bluebeam if available
    if (detection.perimeter_lf != null && detection.perimeter_lf > 0) {
      return {
        widthFt: 0,
        heightFt: 0,
        areaSf: 0,
        perimeterLf: 0,
        lengthLf: detection.perimeter_lf,
        isLine: true,
        isPoint: false,
        hasHole: false,
        markerLabel: detection.marker_label ?? undefined,
      };
    }
    // Fallback: calculate from polygon_points
    if (detection.polygon_points && !isPolygonWithHoles(detection.polygon_points)) {
      const points = detection.polygon_points as PolygonPoint[];
      if (points.length >= 2) {
        const p1 = points[0];
        const p2 = points[1];
        const pixelLength = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        const lengthLf = pixelLength / pixelsPerFoot;
        return { widthFt: 0, heightFt: 0, areaSf: 0, perimeterLf: 0, lengthLf, isLine: true, isPoint: false, hasHole: false };
      }
    }
  }

  // Check for stored Bluebeam values first - these take priority
  const hasDbItemCount = detection.item_count != null && detection.item_count > 0;
  const hasDbAreaSf = detection.area_sf != null && detection.area_sf > 0;
  const hasDbPerimeterLf = detection.perimeter_lf != null && detection.perimeter_lf > 0;

  // If we have item_count from Bluebeam (e.g., "Trim Count: 6"), treat as count item
  // This handles polygon markups that represent counts, not areas
  if (hasDbItemCount && !hasDbAreaSf) {
    return {
      widthFt: 0,
      heightFt: 0,
      areaSf: 0,
      perimeterLf: 0,
      isLine: false,
      isPoint: false,  // Not a point markup, but displays like one
      hasHole: false,
      itemCount: detection.item_count!,
      markerLabel: detection.marker_label ?? undefined,
    };
  }

  // If we have stored area_sf from Bluebeam, use it
  if (hasDbAreaSf) {
    // Calculate width/height from geometry for display, but use DB area
    let widthFt = 0;
    let heightFt = 0;

    if (detection.polygon_points && !isPolygonWithHoles(detection.polygon_points)) {
      const points = detection.polygon_points as PolygonPoint[];
      if (points.length >= 3 && pixelsPerFoot > 0) {
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        widthFt = (Math.max(...xs) - Math.min(...xs)) / pixelsPerFoot;
        heightFt = (Math.max(...ys) - Math.min(...ys)) / pixelsPerFoot;
      }
    } else {
      widthFt = (detection.pixel_width || 0) / pixelsPerFoot;
      heightFt = (detection.pixel_height || 0) / pixelsPerFoot;
    }

    return {
      widthFt,
      heightFt,
      areaSf: detection.area_sf!,
      perimeterLf: hasDbPerimeterLf ? detection.perimeter_lf! : 0,
      isLine: false,
      isPoint: false,
      hasHole: false,
      markerLabel: detection.marker_label ?? undefined,
    };
  }

  // Handle polygon with holes (from split operation)
  if (detection.polygon_points && isPolygonWithHoles(detection.polygon_points) && pixelsPerFoot > 0) {
    const polygonWithHoles = detection.polygon_points;

    // Calculate outer area
    const outerAreaPixelsSq = calculatePolygonArea(polygonWithHoles.outer);

    // Calculate holes area
    let holesAreaPixelsSq = 0;
    if (polygonWithHoles.holes) {
      for (const hole of polygonWithHoles.holes) {
        holesAreaPixelsSq += calculatePolygonArea(hole);
      }
    }

    // Net area = outer - holes
    const netAreaPixelsSq = outerAreaPixelsSq - holesAreaPixelsSq;
    const areaSf = netAreaPixelsSq / (pixelsPerFoot * pixelsPerFoot);

    // Calculate perimeter (outer perimeter + all hole perimeters)
    let totalPerimeterPixels = calculatePolygonPerimeter(polygonWithHoles.outer);
    if (polygonWithHoles.holes) {
      for (const hole of polygonWithHoles.holes) {
        totalPerimeterPixels += calculatePolygonPerimeter(hole);
      }
    }
    const perimeterLf = totalPerimeterPixels / pixelsPerFoot;

    // Calculate bounding box from outer polygon
    const xs = polygonWithHoles.outer.map(p => p.x);
    const ys = polygonWithHoles.outer.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const widthFt = (maxX - minX) / pixelsPerFoot;
    const heightFt = (maxY - minY) / pixelsPerFoot;

    return { widthFt, heightFt, areaSf, perimeterLf, isLine: false, isPoint: false, hasHole: true };
  }

  // For standard polygons - calculate LIVE from polygon_points if available
  // This ensures measurements always match the canvas display exactly
  if (detection.polygon_points && !isPolygonWithHoles(detection.polygon_points)) {
    const points = detection.polygon_points as PolygonPoint[];
    if (points.length >= 3 && pixelsPerFoot > 0) {
      // Calculate area using shoelace formula (same as canvas label)
      const areaPixelsSq = calculatePolygonArea(points);
      const areaSf = areaPixelsSq / (pixelsPerFoot * pixelsPerFoot);

      // Calculate perimeter
      const perimeterPixels = calculatePolygonPerimeter(points);
      const perimeterLf = perimeterPixels / pixelsPerFoot;

      // Calculate bounding box for width/height
      const xs = points.map(p => p.x);
      const ys = points.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const widthFt = (maxX - minX) / pixelsPerFoot;
      const heightFt = (maxY - minY) / pixelsPerFoot;

      return { widthFt, heightFt, areaSf, perimeterLf, isLine: false, isPoint: false, hasHole: false };
    }
  }

  // Fallback: calculate from pixel dimensions (bounding box approximation)
  // This is used when polygon_points aren't available
  const widthFt = (detection.pixel_width || 0) / pixelsPerFoot;
  const heightFt = (detection.pixel_height || 0) / pixelsPerFoot;
  const areaSf = widthFt * heightFt;
  const perimeterLf = 2 * (widthFt + heightFt);

  return { widthFt, heightFt, areaSf, perimeterLf, isLine: false, isPoint: false, hasHole: false };
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
      // Calculate measurements dynamically from pixel dimensions (or use DB values)
      const { widthFt, heightFt, areaSf, perimeterLf, lengthLf, isLine, isPoint, itemCount, markerLabel } = calculateMeasurementsFromPixels(
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
        isPoint,
        count: 1,
        itemCount,
        markerLabel,
        pointCount: isPoint ? 1 : 0,
      };
    }

    // Multi-selection - sum totals using dynamic calculations
    let totalArea = 0;
    let totalPerimeter = 0;
    let totalLength = 0;
    let pointCount = 0;
    let totalItemCount = 0;
    let hasLines = false;
    let hasPolygons = false;
    let hasPoints = false;
    let hasCountItems = false;  // Items with item_count (not point markers)

    for (const detection of selectedDetections) {
      const { areaSf, perimeterLf, lengthLf, isLine, isPoint, itemCount } = calculateMeasurementsFromPixels(detection, pixelsPerFoot);
      if (isPoint) {
        hasPoints = true;
        pointCount += 1;
        totalItemCount += itemCount ?? 1;
      } else if (itemCount && itemCount > 0) {
        // Count items from Bluebeam (e.g., "Trim Count: 6")
        hasCountItems = true;
        totalItemCount += itemCount;
      } else if (isLine) {
        hasLines = true;
        totalLength += lengthLf || 0;
      } else {
        hasPolygons = true;
        totalArea += areaSf;
        totalPerimeter += perimeterLf;
      }
    }

    // Determine if all selected items are count-type (points or items with itemCount)
    const isCountOnly = (hasPoints || hasCountItems) && !hasLines && !hasPolygons;

    return {
      isSingle: false,
      status: null,
      areaSf: totalArea > 0 ? totalArea : null,
      perimeterLf: totalPerimeter > 0 ? totalPerimeter : null,
      lengthLf: totalLength > 0 ? totalLength : null,
      widthFt: null,
      heightFt: null,
      isLine: hasLines && !hasPolygons && !hasPoints && !hasCountItems,
      isPoint: hasPoints && !hasLines && !hasPolygons && !hasCountItems,
      isCountOnly,  // True if all selected are count-type items
      hasMixed: (hasLines && hasPolygons) || ((hasPoints || hasCountItems) && (hasLines || hasPolygons)),
      count: selectedDetections.length,
      pointCount,
      itemCount: totalItemCount > 0 ? totalItemCount : undefined,
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

      {/* Source Label - show Bluebeam subject if available */}
      {measurements.isSingle && measurements.markerLabel && (
        <div className="space-y-1">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Source
          </span>
          <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-md px-2 py-1">
            {measurements.markerLabel}
          </div>
        </div>
      )}

      {/* Measurements */}
      <div className="space-y-1">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {measurements.isSingle
            ? measurements.isPoint || (measurements.itemCount && measurements.itemCount > 0)
              ? 'Count'
              : measurements.isLine
                ? 'Line Measurement'
                : 'Measurements'
            : measurements.isCountOnly
              ? `Count Total (${measurements.count} items)`
              : `Combined (${measurements.count} items)`}
        </span>
        <div className="space-y-1.5 bg-gray-50 dark:bg-gray-800/50 rounded-md p-2">
          {/* For count items (points or items with itemCount), show Count */}
          {measurements.isPoint || measurements.isCountOnly || (measurements.isSingle && measurements.itemCount && measurements.itemCount > 0) ? (
            <PropertyRow
              label="Count"
              value={String(measurements.itemCount ?? measurements.pointCount ?? 1)}
            />
          ) : measurements.isLine ? (
            /* For lines, show Length instead of Area/Perimeter */
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
          {/* For mixed selections, show counts and totals */}
          {measurements.hasMixed && measurements.pointCount > 0 && (
            <PropertyRow
              label="Point Count"
              value={String(measurements.pointCount)}
            />
          )}
          {measurements.hasMixed && measurements.lengthLf && (
            <PropertyRow
              label="Total Line Length"
              value={formatValue(measurements.lengthLf, ' LF')}
            />
          )}
          {measurements.isSingle && !measurements.isLine && !measurements.isPoint && !(measurements.itemCount && measurements.itemCount > 0) && (
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
