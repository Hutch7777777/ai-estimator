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

// =============================================================================
// Types
// =============================================================================

interface PageTotalsProps {
  detections: ExtractionDetection[];
}

interface ClassTotal {
  cls: DetectionClass;
  count: number;
  areaSf: number;
  perimeterLf: number;
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
}

const ClassTotalRow = memo(function ClassTotalRow({
  cls,
  count,
  areaSf,
  perimeterLf,
}: ClassTotalRowProps) {
  const color = DETECTION_CLASS_COLORS[cls] || DETECTION_CLASS_COLORS[''];

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
}

const GrandTotalRow = memo(function GrandTotalRow({
  totalCount,
  totalAreaSf,
  totalPerimeterLf,
}: GrandTotalRowProps) {
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
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

const PageTotals = memo(function PageTotals({ detections }: PageTotalsProps) {
  // Calculate totals grouped by class
  const { classTotals, grandTotal } = useMemo(() => {
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
      totalsMap.set(cls, { cls, count: 0, areaSf: 0, perimeterLf: 0 });
    }

    // Aggregate
    for (const detection of validDetections) {
      const cls = detection.class as DetectionClass;
      const existing = totalsMap.get(cls);

      if (existing) {
        existing.count++;
        existing.areaSf += detection.area_sf || 0;
        existing.perimeterLf += detection.perimeter_lf || 0;
      } else {
        // Handle any classes not in USER_SELECTABLE_CLASSES
        totalsMap.set(cls, {
          cls,
          count: 1,
          areaSf: detection.area_sf || 0,
          perimeterLf: detection.perimeter_lf || 0,
        });
      }
    }

    // Filter to only classes with detections
    const classTotals: ClassTotal[] = [];
    let totalCount = 0;
    let totalAreaSf = 0;
    let totalPerimeterLf = 0;

    for (const total of totalsMap.values()) {
      if (total.count > 0) {
        classTotals.push(total);
        totalCount += total.count;
        totalAreaSf += total.areaSf;
        totalPerimeterLf += total.perimeterLf;
      }
    }

    return {
      classTotals,
      grandTotal: { totalCount, totalAreaSf, totalPerimeterLf },
    };
  }, [detections]);

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
        />
      ))}

      {/* Grand total */}
      <GrandTotalRow
        totalCount={grandTotal.totalCount}
        totalAreaSf={grandTotal.totalAreaSf}
        totalPerimeterLf={grandTotal.totalPerimeterLf}
      />
    </div>
  );
});

export default PageTotals;
