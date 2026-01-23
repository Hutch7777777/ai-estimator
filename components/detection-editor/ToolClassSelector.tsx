'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { DetectionClass, ToolMode } from '@/lib/types/extraction';
import {
  DETECTION_CLASS_COLORS,
  getClassesByMeasurementType,
  getClassDisplayLabel,
} from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

interface ToolClassSelectorProps {
  /** Which tool this selector is for */
  toolMode: 'create' | 'line' | 'point';
  /** Currently selected class for this tool */
  selectedClass: DetectionClass;
  /** Callback when a class is selected - also activates the tool */
  onSelectClass: (cls: DetectionClass, toolMode: ToolMode) => void;
  /** Whether the popover is open */
  isOpen: boolean;
  /** Callback to close the popover */
  onClose: () => void;
  /** Position reference element (the button) */
  anchorEl: HTMLElement | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatClassName(cls: DetectionClass): string {
  // Use centralized display label function
  return getClassDisplayLabel(cls);
}

function getMeasurementTypeForTool(toolMode: 'create' | 'line' | 'point'): 'area' | 'linear' | 'count' {
  switch (toolMode) {
    case 'create':
      return 'area';
    case 'line':
      return 'linear';
    case 'point':
      return 'count';
  }
}

function getToolLabel(toolMode: 'create' | 'line' | 'point'): string {
  switch (toolMode) {
    case 'create':
      return 'Area Classes (SF)';
    case 'line':
      return 'Linear Classes (LF)';
    case 'point':
      return 'Count Classes (EA)';
  }
}

// =============================================================================
// Component
// =============================================================================

export default function ToolClassSelector({
  toolMode,
  selectedClass,
  onSelectClass,
  isOpen,
  onClose,
  anchorEl,
}: ToolClassSelectorProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Get classes for this tool type
  const measurementType = getMeasurementTypeForTool(toolMode);
  const classes = getClassesByMeasurementType(measurementType);

  // Calculate position relative to anchor element
  useEffect(() => {
    if (isOpen && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      // Position to the right of the button
      setPosition({
        top: rect.top,
        left: rect.right + 8,
      });
    }
  }, [isOpen, anchorEl]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    // Delay to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorEl]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleClassClick = useCallback(
    (cls: DetectionClass) => {
      onSelectClass(cls, toolMode);
      onClose();
    },
    [onSelectClass, toolMode, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2 min-w-[180px] max-h-[400px] overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 mb-1">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {getToolLabel(toolMode)}
        </div>
      </div>

      {/* Class options */}
      {classes.map((cls) => {
        const color = DETECTION_CLASS_COLORS[cls];
        const isSelected = cls === selectedClass;

        return (
          <button
            key={cls}
            type="button"
            onClick={() => handleClassClick(cls)}
            className={`
              w-full px-3 py-2 flex items-center gap-3 text-left transition-colors
              ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }
            `}
          >
            {/* Color indicator */}
            <span
              className="w-4 h-4 rounded-full flex-shrink-0 border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: color }}
            />
            {/* Class name */}
            <span
              className={`text-sm ${
                isSelected
                  ? 'font-medium text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {formatClassName(cls)}
            </span>
            {/* Selected checkmark */}
            {isSelected && (
              <svg
                className="w-4 h-4 ml-auto text-blue-600 dark:text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        );
      })}

      {/* Footer hint */}
      <div className="px-3 py-1.5 mt-1 border-t border-gray-200 dark:border-gray-700">
        <div className="text-[10px] text-gray-400 dark:text-gray-500">
          Click to select class and start drawing
        </div>
      </div>
    </div>
  );
}
