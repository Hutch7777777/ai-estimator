'use client';

import React, { memo } from 'react';
import { MousePointer2, Pentagon, Hand, Ruler, Minus } from 'lucide-react';
import type { ToolMode } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

interface MarkupToolbarProps {
  activeMode: ToolMode;
  onModeChange: (mode: ToolMode) => void;
  disabled?: boolean;
}

interface ToolDefinition {
  id: ToolMode | 'divider';
  icon?: typeof MousePointer2;
  label?: string;
  shortcut?: string;
}

// =============================================================================
// Constants
// =============================================================================

const TOOLS: ToolDefinition[] = [
  { id: 'select', icon: MousePointer2, label: 'Select & Edit', shortcut: 'V' },
  { id: 'create', icon: Pentagon, label: 'Draw Detection', shortcut: 'D' },
  { id: 'line', icon: Minus, label: 'Draw Line (LF)', shortcut: 'L' },
  { id: 'pan', icon: Hand, label: 'Pan Canvas', shortcut: 'H' },
  { id: 'divider' },
  { id: 'calibrate', icon: Ruler, label: 'Calibrate Scale', shortcut: 'C' },
];

// =============================================================================
// Component
// =============================================================================

const MarkupToolbar = memo(function MarkupToolbar({
  activeMode,
  onModeChange,
  disabled = false,
}: MarkupToolbarProps) {
  return (
    <div className="flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 py-2">
      {TOOLS.map((tool, index) => {
        // Render divider
        if (tool.id === 'divider') {
          return (
            <div
              key={`divider-${index}`}
              className="my-2 mx-2 border-t border-gray-200 dark:border-gray-700"
            />
          );
        }

        const Icon = tool.icon!;
        const isActive = activeMode === tool.id;

        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onModeChange(tool.id as ToolMode)}
            disabled={disabled}
            title={`${tool.label} (${tool.shortcut})`}
            className={`
              w-12 h-10 flex items-center justify-center relative transition-colors
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${
                isActive
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-l-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border-l-2 border-transparent'
              }
            `}
          >
            <Icon className="w-5 h-5" />
          </button>
        );
      })}
    </div>
  );
});

export default MarkupToolbar;
