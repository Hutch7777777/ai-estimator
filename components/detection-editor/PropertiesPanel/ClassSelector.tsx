'use client';

import React, { memo, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ExtractionDetection, DetectionClass } from '@/lib/types/extraction';
import {
  USER_SELECTABLE_CLASSES,
  DETECTION_CLASS_COLORS,
  normalizeClass,
  getClassDisplayLabel,
} from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

interface ClassSelectorProps {
  selectedDetections: ExtractionDetection[];
  onClassChange: (newClass: DetectionClass) => void;
  disabled?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatClassName(cls: DetectionClass | string): string {
  // Use the centralized display label function which handles normalization
  return getClassDisplayLabel(cls) || 'Unknown';
}

// =============================================================================
// Color Swatch Component
// =============================================================================

interface ColorSwatchProps {
  color: string;
  className?: string;
}

const ColorSwatch = memo(function ColorSwatch({ color, className = '' }: ColorSwatchProps) {
  return (
    <span
      className={`w-3 h-3 rounded-sm flex-shrink-0 ${className}`}
      style={{ backgroundColor: color }}
    />
  );
});

// =============================================================================
// Main Component
// =============================================================================

const ClassSelector = memo(function ClassSelector({
  selectedDetections,
  onClassChange,
  disabled = false,
}: ClassSelectorProps) {
  // Determine current class state (normalizing classes for comparison)
  const classState = useMemo(() => {
    if (selectedDetections.length === 0) {
      return { isMixed: false, currentClass: '' as DetectionClass };
    }

    // Normalize all classes before comparing
    const classes = new Set(selectedDetections.map((d) => normalizeClass(d.class)));

    if (classes.size === 1) {
      // Return the normalized class
      const currentClass = normalizeClass(selectedDetections[0].class);
      return { isMixed: false, currentClass };
    }

    return { isMixed: true, currentClass: '' as DetectionClass };
  }, [selectedDetections]);

  const { isMixed, currentClass } = classState;

  // Get color for current class or gray for mixed
  const currentColor = isMixed
    ? '#6B7280' // Gray for mixed
    : DETECTION_CLASS_COLORS[currentClass] || DETECTION_CLASS_COLORS[''];

  return (
    <Select
      value={isMixed ? '' : currentClass}
      onValueChange={(value) => onClassChange(value as DetectionClass)}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue>
          <div className="flex items-center gap-2">
            <ColorSwatch color={currentColor} />
            <span>
              {isMixed ? 'Mixed classes' : formatClassName(currentClass) || 'Select class'}
            </span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {USER_SELECTABLE_CLASSES.map((cls) => {
          const color = DETECTION_CLASS_COLORS[cls] || DETECTION_CLASS_COLORS[''];
          return (
            <SelectItem key={cls} value={cls}>
              <div className="flex items-center gap-2">
                <ColorSwatch color={color} />
                <span>{formatClassName(cls)}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
});

export default ClassSelector;
