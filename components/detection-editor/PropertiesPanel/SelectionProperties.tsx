'use client';

import React, { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import type { ExtractionDetection, DetectionStatus } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

interface SelectionPropertiesProps {
  selectedDetections: ExtractionDetection[];
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatValue(value: number | null | undefined, suffix: string = ''): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(1)}${suffix}`;
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
}: SelectionPropertiesProps) {
  // Calculate totals for multi-selection
  const measurements = useMemo(() => {
    if (selectedDetections.length === 0) {
      return null;
    }

    if (selectedDetections.length === 1) {
      const detection = selectedDetections[0];
      return {
        isSingle: true,
        status: detection.status,
        areaSf: detection.area_sf,
        perimeterLf: detection.perimeter_lf,
        widthFt: detection.real_width_ft,
        heightFt: detection.real_height_ft,
        count: 1,
      };
    }

    // Multi-selection - sum totals
    let totalArea = 0;
    let totalPerimeter = 0;

    for (const detection of selectedDetections) {
      if (detection.area_sf) totalArea += detection.area_sf;
      if (detection.perimeter_lf) totalPerimeter += detection.perimeter_lf;
    }

    return {
      isSingle: false,
      status: null,
      areaSf: totalArea > 0 ? totalArea : null,
      perimeterLf: totalPerimeter > 0 ? totalPerimeter : null,
      widthFt: null,
      heightFt: null,
      count: selectedDetections.length,
    };
  }, [selectedDetections]);

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
          {measurements.isSingle ? 'Measurements' : `Combined (${measurements.count} items)`}
        </span>
        <div className="space-y-1.5 bg-gray-50 dark:bg-gray-800/50 rounded-md p-2">
          <PropertyRow
            label="Area"
            value={formatValue(measurements.areaSf, ' SF')}
          />
          <PropertyRow
            label="Perimeter"
            value={formatValue(measurements.perimeterLf, ' LF')}
          />
          {measurements.isSingle && (
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
