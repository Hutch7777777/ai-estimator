'use client';

import React, { memo, useMemo } from 'react';
import { Check, X, Loader2, AlertTriangle, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DetectionClass } from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS, getClassDisplayLabel } from '@/lib/types/extraction';
import type { SAMAlternative } from '@/lib/hooks/useSAMSegment';

// =============================================================================
// Types
// =============================================================================

interface SAMClassPickerProps {
  /** Whether SAM is currently processing */
  isLoading?: boolean;
  /** Number of polygon points in the current result */
  polygonPointCount?: number;
  /** Callback when user selects a class */
  onSelectClass: (cls: DetectionClass) => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Position to display the picker */
  position?: { x: number; y: number };
  /** Whether to show the picker */
  isVisible: boolean;
  /** Whether the feature is disabled */
  isFeatureDisabled?: boolean;
  /** Error message to display */
  errorMessage?: string | null;
  /** Alternative tools when SAM is unavailable */
  alternatives?: SAMAlternative[];
}

// Group classes by measurement type for organized display
// Using only valid DetectionClass values from extraction.ts
const CLASS_GROUPS: { label: string; classes: DetectionClass[] }[] = [
  {
    label: 'Area (sq ft)',
    classes: ['siding', 'roof', 'soffit', 'window', 'door'],
  },
  {
    label: 'Linear (ft)',
    classes: ['eave', 'rake', 'ridge', 'valley', 'fascia', 'trim', 'gutter', 'downspout', 'flashing'],
  },
  {
    label: 'Count (ea)',
    classes: ['vent', 'outlet', 'hose_bib', 'light_fixture', 'gable_vent'],
  },
];

// =============================================================================
// Component
// =============================================================================

const SAMClassPicker = memo(function SAMClassPicker({
  isLoading = false,
  polygonPointCount = 0,
  onSelectClass,
  onCancel,
  position,
  isVisible,
  isFeatureDisabled = false,
  errorMessage = null,
  alternatives = [],
}: SAMClassPickerProps) {
  if (!isVisible) return null;

  // Calculate position style
  const positionStyle = useMemo(() => {
    if (!position) return {};
    return {
      left: `${position.x}px`,
      top: `${position.y}px`,
    };
  }, [position]);

  // Show unavailable state
  if (isFeatureDisabled || errorMessage) {
    return (
      <div
        className="absolute z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-amber-300 dark:border-amber-600 p-3 min-w-[300px] max-w-[360px]"
        style={positionStyle}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              SAM Magic Select
            </span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Unavailable message */}
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {errorMessage || 'Click-to-segment is temporarily unavailable.'}
        </div>

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Use these tools instead:
            </div>
            <div className="space-y-1.5">
              {alternatives.map((alt) => (
                <div
                  key={alt.key}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono font-semibold">
                    {alt.key}
                  </kbd>
                  <span>{alt.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Close button */}
        <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="w-full"
          >
            Close (Esc)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 min-w-[280px]"
      style={positionStyle}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Segmenting...
              </span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Select Class
              </span>
              {polygonPointCount > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({polygonPointCount} points)
                </span>
              )}
            </>
          )}
        </div>
        <button
          onClick={onCancel}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Class Selection */}
      {!isLoading && (
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {CLASS_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {group.classes.map((cls) => (
                  <button
                    key={cls}
                    onClick={() => onSelectClass(cls)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: DETECTION_CLASS_COLORS[cls] || '#6B7280' }}
                    />
                    <span className="truncate text-gray-700 dark:text-gray-300">
                      {getClassDisplayLabel(cls)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading state message */}
      {isLoading && (
        <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
          Click on the object to segment it.
          <br />
          SAM will detect the boundaries.
        </div>
      )}

      {/* Cancel button */}
      <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="w-full"
        >
          Cancel (Esc)
        </Button>
      </div>
    </div>
  );
});

export default SAMClassPicker;
