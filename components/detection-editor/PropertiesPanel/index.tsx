'use client';

import React, { memo, useMemo } from 'react';
import { Layers, MousePointer2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import type {
  ExtractionDetection,
  ExtractionPage,
  DetectionClass,
} from '@/lib/types/extraction';
import ClassSelector from './ClassSelector';
import SelectionProperties from './SelectionProperties';
import PageTotals from './PageTotals';

// =============================================================================
// Types
// =============================================================================

export interface PropertiesPanelProps {
  selectedDetections: ExtractionDetection[];
  allDetections: ExtractionDetection[];
  currentPage: ExtractionPage | null;
  onClassChange: (detectionIds: string[], newClass: DetectionClass) => void;
  onMaterialChange?: (detectionIds: string[], materialId: string | null) => void;
  disabled?: boolean;
}

// =============================================================================
// Main Component
// =============================================================================

const PropertiesPanel = memo(function PropertiesPanel({
  selectedDetections,
  allDetections,
  currentPage,
  onClassChange,
  // onMaterialChange - reserved for future MaterialSearch component
  disabled = false,
}: PropertiesPanelProps) {
  const selectionCount = selectedDetections.length;
  const hasSelection = selectionCount > 0;

  // Get selection IDs for the class change callback
  const selectedIds = useMemo(
    () => selectedDetections.map((d) => d.id),
    [selectedDetections]
  );

  // Handler for class change
  const handleClassChange = (newClass: DetectionClass) => {
    if (selectedIds.length > 0) {
      onClassChange(selectedIds, newClass);
    }
  };

  return (
    <div className="w-72 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {hasSelection ? (
            <>
              <Layers className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {selectionCount === 1
                  ? '1 Detection Selected'
                  : `${selectionCount} Detections Selected`}
              </span>
            </>
          ) : (
            <>
              <MousePointer2 className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                No Selection
              </span>
            </>
          )}
        </div>
      </div>

      {/* Selection Properties Section */}
      {hasSelection && (
        <div className="px-4 py-3 space-y-4 border-b border-gray-200 dark:border-gray-700">
          {/* Class Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Class
            </label>
            <ClassSelector
              selectedDetections={selectedDetections}
              onClassChange={handleClassChange}
              disabled={disabled}
            />
          </div>

          {/* Measurements */}
          <SelectionProperties selectedDetections={selectedDetections} pixelsPerFoot={currentPage?.scale_ratio || 64} />

          {/* Future: Material Assignment
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Assigned Material
            </label>
            <MaterialSearch
              selectedDetections={selectedDetections}
              onMaterialChange={onMaterialChange}
            />
          </div>
          */}
        </div>
      )}

      {/* Page Totals Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Page Totals
            {currentPage?.elevation_name && (
              <span className="ml-1 normal-case font-normal">
                ({currentPage.elevation_name})
              </span>
            )}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PageTotals detections={allDetections} />
        </div>
      </div>
    </div>
  );
});

export default PropertiesPanel;
