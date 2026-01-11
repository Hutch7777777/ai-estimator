'use client';

import React, { memo, useMemo } from 'react';
import type {
  ExtractionDetection,
  DetectionClass,
  AllDetectionClasses,
} from '@/lib/types/extraction';
import {
  DETECTION_CLASS_COLORS,
  USER_SELECTABLE_CLASSES,
} from '@/lib/types/extraction';
import {
  getClassDerivedMeasurements,
  rectToPolygonPoints,
} from '@/lib/utils/polygonUtils';

// =============================================================================
// Types
// =============================================================================

interface PageTotalsProps {
  detections: ExtractionDetection[];
  scaleRatio?: number | null;
}

interface ClassTotal {
  cls: DetectionClass;
  count: number;
  areaSf: number;
  perimeterLf: number;
  // Derived measurements
  headLf: number;
  jambLf: number;
  sillLf: number;  // Only for windows
  rakeLf: number;  // Only for gables
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatClassName(cls: DetectionClass): string {
  if (!cls) return 'Unknown';
  return cls
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatValue(value: number, suffix: string = ''): string {
  if (value === 0) return '—';
  return `${value.toFixed(1)}${suffix}`;
}

// =============================================================================
// Class Total Row Component
// =============================================================================

interface ClassTotalRowProps {
  cls: DetectionClass;
  count: number;
  areaSf: number;
  perimeterLf: number;
  headLf: number;
  jambLf: number;
  sillLf: number;
  rakeLf: number;
}

const ClassTotalRow = memo(function ClassTotalRow({
  cls,
  count,
  areaSf,
  perimeterLf,
  headLf,
  jambLf,
  sillLf,
  rakeLf,
}: ClassTotalRowProps) {
  const color = DETECTION_CLASS_COLORS[cls] || DETECTION_CLASS_COLORS[''];

  // Determine which derived measurements to show based on class
  const showWindowDerived = cls === 'window' && (headLf > 0 || jambLf > 0 || sillLf > 0);
  const showDoorDerived = (cls === 'door' || cls === 'garage') && (headLf > 0 || jambLf > 0);
  const showGableDerived = cls === 'gable' && rakeLf > 0;

  return (
    <div className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-3 h-3 rounded-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {formatClassName(cls)}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
          {count}
        </span>
      </div>
      <div className="ml-5 grid grid-cols-2 gap-x-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Area</span>
          <span className="font-mono text-gray-700 dark:text-gray-300">
            {formatValue(areaSf, ' SF')}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Perim</span>
          <span className="font-mono text-gray-700 dark:text-gray-300">
            {formatValue(perimeterLf, ' LF')}
          </span>
        </div>
      </div>

      {/* Window derived measurements */}
      {showWindowDerived && (
        <div className="ml-5 mt-1 grid grid-cols-3 gap-x-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400 dark:text-gray-500">Head</span>
            <span className="font-mono text-gray-600 dark:text-gray-400">
              {formatValue(headLf, '')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 dark:text-gray-500">Jamb</span>
            <span className="font-mono text-gray-600 dark:text-gray-400">
              {formatValue(jambLf, '')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 dark:text-gray-500">Sill</span>
            <span className="font-mono text-gray-600 dark:text-gray-400">
              {formatValue(sillLf, '')}
            </span>
          </div>
        </div>
      )}

      {/* Door/Garage derived measurements */}
      {showDoorDerived && (
        <div className="ml-5 mt-1 grid grid-cols-2 gap-x-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400 dark:text-gray-500">Head</span>
            <span className="font-mono text-gray-600 dark:text-gray-400">
              {formatValue(headLf, ' LF')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 dark:text-gray-500">Jamb</span>
            <span className="font-mono text-gray-600 dark:text-gray-400">
              {formatValue(jambLf, ' LF')}
            </span>
          </div>
        </div>
      )}

      {/* Gable derived measurements */}
      {showGableDerived && (
        <div className="ml-5 mt-1 text-xs">
          <div className="flex justify-between w-1/2">
            <span className="text-gray-400 dark:text-gray-500">Rake</span>
            <span className="font-mono text-gray-600 dark:text-gray-400">
              {formatValue(rakeLf, ' LF')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Grand Total Row Component
// =============================================================================

interface GrandTotalRowProps {
  totalCount: number;
  totalAreaSf: number;
  totalPerimeterLf: number;
  totalHeadLf: number;
  totalJambLf: number;
  totalSillLf: number;
  totalRakeLf: number;
}

const GrandTotalRow = memo(function GrandTotalRow({
  totalCount,
  totalAreaSf,
  totalPerimeterLf,
  totalHeadLf,
  totalJambLf,
  totalSillLf,
  totalRakeLf,
}: GrandTotalRowProps) {
  const hasDerivedTotals = totalHeadLf > 0 || totalJambLf > 0 || totalSillLf > 0 || totalRakeLf > 0;

  return (
    <div className="py-2 bg-gray-50 dark:bg-gray-800/50 rounded-md mt-2">
      <div className="flex items-center gap-2 mb-1 px-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Total
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
          {totalCount}
        </span>
      </div>
      <div className="ml-2 px-2 grid grid-cols-2 gap-x-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Area</span>
          <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
            {formatValue(totalAreaSf, ' SF')}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Perim</span>
          <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
            {formatValue(totalPerimeterLf, ' LF')}
          </span>
        </div>
      </div>

      {/* Derived totals summary */}
      {hasDerivedTotals && (
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 mx-2">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Trim Breakdown
          </div>
          <div className="grid grid-cols-2 gap-x-2 text-xs">
            {totalHeadLf > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400 dark:text-gray-500">Head</span>
                <span className="font-mono text-gray-600 dark:text-gray-400">
                  {formatValue(totalHeadLf, ' LF')}
                </span>
              </div>
            )}
            {totalJambLf > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400 dark:text-gray-500">Jamb</span>
                <span className="font-mono text-gray-600 dark:text-gray-400">
                  {formatValue(totalJambLf, ' LF')}
                </span>
              </div>
            )}
            {totalSillLf > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400 dark:text-gray-500">Sill</span>
                <span className="font-mono text-gray-600 dark:text-gray-400">
                  {formatValue(totalSillLf, ' LF')}
                </span>
              </div>
            )}
            {totalRakeLf > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400 dark:text-gray-500">Rake</span>
                <span className="font-mono text-gray-600 dark:text-gray-400">
                  {formatValue(totalRakeLf, ' LF')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

const PageTotals = memo(function PageTotals({ detections, scaleRatio }: PageTotalsProps) {
  // Calculate totals grouped by class
  const { classTotals, grandTotal } = useMemo(() => {
    // Debug logging to diagnose derived measurement calculations
    console.log('[PageTotals Debug]', {
      totalDetections: detections.length,
      scaleRatio,
      detectionsWithPolygonPoints: detections.filter(d => d.polygon_points && d.polygon_points.length > 0).length,
      sampleDetection: detections[0] ? {
        class: detections[0].class,
        hasPolygonPoints: !!detections[0].polygon_points,
        polygonPointsLength: detections[0].polygon_points?.length || 0,
        status: detections[0].status,
      } : null,
    });

    // Filter out deleted detections and internal classes
    const validDetections = detections.filter((d) => {
      if (d.status === 'deleted') return false;
      // Cast to check for internal classes
      const cls = d.class as AllDetectionClasses;
      if (cls === 'building' || cls === 'exterior_wall') return false;
      return true;
    });

    // Group by class
    const totalsMap = new Map<DetectionClass, ClassTotal>();

    // Initialize with user-selectable classes in order
    for (const cls of USER_SELECTABLE_CLASSES) {
      totalsMap.set(cls, {
        cls,
        count: 0,
        areaSf: 0,
        perimeterLf: 0,
        headLf: 0,
        jambLf: 0,
        sillLf: 0,
        rakeLf: 0,
      });
    }

    // Aggregate
    for (const detection of validDetections) {
      const cls = detection.class as DetectionClass;
      let existing = totalsMap.get(cls);

      if (!existing) {
        // Handle any classes not in USER_SELECTABLE_CLASSES
        existing = {
          cls,
          count: 0,
          areaSf: 0,
          perimeterLf: 0,
          headLf: 0,
          jambLf: 0,
          sillLf: 0,
          rakeLf: 0,
        };
        totalsMap.set(cls, existing);
      }

      existing.count++;
      existing.areaSf += detection.area_sf || 0;
      existing.perimeterLf += detection.perimeter_lf || 0;

      // Calculate derived measurements from polygon points or bounding box fallback
      if (scaleRatio && scaleRatio > 0) {
        // Use polygon_points if available, otherwise convert bounding box to polygon
        const points = detection.polygon_points && detection.polygon_points.length > 0
          ? detection.polygon_points
          : rectToPolygonPoints({
              pixel_x: detection.pixel_x,
              pixel_y: detection.pixel_y,
              pixel_width: detection.pixel_width,
              pixel_height: detection.pixel_height,
            });

        const derived = getClassDerivedMeasurements(
          cls,
          points,
          scaleRatio
        );

        if (derived) {
          if ('head_lf' in derived) {
            existing.headLf += derived.head_lf;
          }
          if ('jamb_lf' in derived) {
            existing.jambLf += derived.jamb_lf;
          }
          if ('sill_lf' in derived) {
            existing.sillLf += derived.sill_lf;
          }
          if ('rake_lf' in derived) {
            existing.rakeLf += derived.rake_lf;
          }
        }
      }
    }

    // Filter to only classes with detections
    const classTotals: ClassTotal[] = [];
    let totalCount = 0;
    let totalAreaSf = 0;
    let totalPerimeterLf = 0;
    let totalHeadLf = 0;
    let totalJambLf = 0;
    let totalSillLf = 0;
    let totalRakeLf = 0;

    for (const total of totalsMap.values()) {
      if (total.count > 0) {
        classTotals.push(total);
        totalCount += total.count;
        totalAreaSf += total.areaSf;
        totalPerimeterLf += total.perimeterLf;
        totalHeadLf += total.headLf;
        totalJambLf += total.jambLf;
        totalSillLf += total.sillLf;
        totalRakeLf += total.rakeLf;
      }
    }

    return {
      classTotals,
      grandTotal: {
        totalCount,
        totalAreaSf,
        totalPerimeterLf,
        totalHeadLf,
        totalJambLf,
        totalSillLf,
        totalRakeLf,
      },
    };
  }, [detections, scaleRatio]);

  if (classTotals.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
        <p className="text-sm">No detections on this page</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-2">
      {/* Per-class totals */}
      {classTotals.map((total) => (
        <ClassTotalRow
          key={total.cls}
          cls={total.cls}
          count={total.count}
          areaSf={total.areaSf}
          perimeterLf={total.perimeterLf}
          headLf={total.headLf}
          jambLf={total.jambLf}
          sillLf={total.sillLf}
          rakeLf={total.rakeLf}
        />
      ))}

      {/* Grand total */}
      <GrandTotalRow
        totalCount={grandTotal.totalCount}
        totalAreaSf={grandTotal.totalAreaSf}
        totalPerimeterLf={grandTotal.totalPerimeterLf}
        totalHeadLf={grandTotal.totalHeadLf}
        totalJambLf={grandTotal.totalJambLf}
        totalSillLf={grandTotal.totalSillLf}
        totalRakeLf={grandTotal.totalRakeLf}
      />
    </div>
  );
});

export default PageTotals;
