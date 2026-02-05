'use client';

import React, { memo } from 'react';
import { SlidersHorizontal, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

export interface ConfidenceFilterProps {
  /** Minimum confidence threshold (0-1) */
  minConfidence: number;
  /** Callback when threshold changes */
  onMinConfidenceChange: (value: number) => void;
  /** Whether to show low confidence detections (dimmed) */
  showLowConfidence: boolean;
  /** Callback when show/hide toggle changes */
  onShowLowConfidenceChange: (show: boolean) => void;
  /** Callback to trigger re-detection */
  onRedetect: () => void;
  /** Whether re-detection is in progress */
  isRedetecting?: boolean;
  /** Total detection count */
  totalCount: number;
  /** Count of detections above threshold */
  aboveThresholdCount: number;
  /** Whether the filter is currently active (threshold > 0) */
  isActive?: boolean;
}

// =============================================================================
// Component
// =============================================================================

const ConfidenceFilter = memo(function ConfidenceFilter({
  minConfidence,
  onMinConfidenceChange,
  showLowConfidence,
  onShowLowConfidenceChange,
  onRedetect,
  isRedetecting = false,
  totalCount,
  aboveThresholdCount,
  isActive,
}: ConfidenceFilterProps) {
  // Determine if filter is active (either explicitly set or threshold > 0)
  const filterActive = isActive ?? minConfidence > 0;

  // Format confidence as percentage
  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  // Count of filtered out detections
  const filteredCount = totalCount - aboveThresholdCount;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'gap-2 bg-gray-700 text-white border-gray-600 hover:bg-gray-600 hover:text-white',
            filterActive && 'border-amber-500 bg-amber-700 hover:bg-amber-600'
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Confidence</span>
          {filterActive && (
            <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
              {formatPercent(minConfidence)}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 bg-gray-800 border-gray-600 text-white" align="start">
        <div className="space-y-4">
          {/* Header */}
          <div className="space-y-1">
            <h4 className="font-medium text-sm text-white">Confidence Filter</h4>
            <p className="text-xs text-gray-400">
              Filter detections by AI confidence score
            </p>
          </div>

          {/* Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">
                Minimum Confidence
              </span>
              <span className="text-sm font-medium text-white">
                {formatPercent(minConfidence)}
              </span>
            </div>

            <Slider
              value={[minConfidence]}
              onValueChange={([value]) => onMinConfidenceChange(value)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />

            <div className="flex justify-between text-xs text-gray-500">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Detection counts */}
          <div className="flex items-center justify-between py-2 px-3 bg-gray-700/50 rounded-lg">
            <div className="text-sm">
              <span className="font-medium text-white">{aboveThresholdCount}</span>
              <span className="text-gray-400"> of </span>
              <span className="font-medium text-white">{totalCount}</span>
              <span className="text-gray-400"> detections</span>
            </div>
            {filteredCount > 0 && (
              <span className="text-xs text-amber-400">
                {filteredCount} filtered
              </span>
            )}
          </div>

          {/* Show/Hide toggle */}
          <button
            type="button"
            onClick={() => onShowLowConfidenceChange(!showLowConfidence)}
            className={cn(
              'w-full flex items-center justify-between p-2 rounded-lg border transition-colors',
              showLowConfidence
                ? 'border-blue-600 bg-blue-900/30 text-white'
                : 'border-gray-600 hover:bg-gray-700/50 text-gray-300'
            )}
          >
            <div className="flex items-center gap-2">
              {showLowConfidence ? (
                <Eye className="h-4 w-4 text-blue-400" />
              ) : (
                <EyeOff className="h-4 w-4 text-gray-500" />
              )}
              <span className="text-sm">
                {showLowConfidence ? 'Showing' : 'Hiding'} low confidence
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {showLowConfidence ? 'Dimmed' : 'Hidden'}
            </span>
          </button>

          {/* Re-detect button */}
          <Button
            onClick={onRedetect}
            disabled={isRedetecting}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
            variant="secondary"
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRedetecting && 'animate-spin')} />
            {isRedetecting ? 'Re-detecting...' : 'Re-detect Page'}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            Re-run AI detection on the current page
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
});

export default ConfidenceFilter;
