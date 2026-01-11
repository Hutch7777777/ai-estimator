'use client';

import React, { memo } from 'react';
import Link from 'next/link';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Loader2,
  AlertCircle,
  Check,
  CheckCircle,
  X,
  Camera,
  Undo2,
  Redo2,
  Save,
  ArrowLeft,
} from 'lucide-react';
import type { ToolMode, DetectionClass } from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS } from '@/lib/types/extraction';
import { UserMenu } from '@/components/layout/UserMenu';

// =============================================================================
// Types
// =============================================================================

export interface DetectionToolbarProps {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  createClass: DetectionClass;
  onCreateClassChange: (cls: DetectionClass) => void;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  isSyncing: boolean;
  pendingEdits: number;
  lastError: Error | null;
  onClearError: () => void;
  reviewProgress: {
    total: number;
    reviewed: number;
    pending: number;
    percentComplete: number;
  };
  onApprove?: () => void;
  isApproving?: boolean;
  onGenerateMarkup?: () => void;
  isGeneratingMarkup?: boolean;
  // Local-first editing props
  hasUnsavedChanges?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onValidate?: () => void;
  onReset?: () => void;
  isValidating?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DETECTION_CLASSES: { value: DetectionClass; label: string }[] = [
  { value: 'siding', label: 'Siding' },
  { value: 'window', label: 'Window' },
  { value: 'door', label: 'Door' },
  { value: 'garage', label: 'Garage' },
  { value: 'roof', label: 'Roof' },
  { value: 'gable', label: 'Gable' },
];

// =============================================================================
// Helper Components
// =============================================================================

interface ClassSelectorProps {
  value: DetectionClass;
  onChange: (cls: DetectionClass) => void;
}

const ClassSelector = memo(function ClassSelector({ value, onChange }: ClassSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Class:</span>
      <div className="flex items-center gap-1">
        {DETECTION_CLASSES.map(({ value: cls, label }) => {
          const color = DETECTION_CLASS_COLORS[cls] || DETECTION_CLASS_COLORS[''];
          const isActive = value === cls;
          return (
            <button
              key={cls}
              type="button"
              onClick={() => onChange(cls)}
              className={`
                flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors
                ${
                  isActive
                    ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }
              `}
              title={label}
            >
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="hidden lg:inline">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

const DetectionToolbar = memo(function DetectionToolbar({
  toolMode,
  onToolModeChange,
  createClass,
  onCreateClassChange,
  scale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  isSyncing,
  pendingEdits,
  lastError,
  onClearError,
  reviewProgress,
  onApprove,
  isApproving = false,
  onGenerateMarkup,
  isGeneratingMarkup = false,
  // Local-first editing props
  hasUnsavedChanges = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onValidate,
  onReset,
  isValidating = false,
}: DetectionToolbarProps) {
  const zoomPercentage = Math.round(scale * 100);
  const { total, reviewed, percentComplete } = reviewProgress;

  // Progress bar color
  const progressColor =
    percentComplete >= 100
      ? 'bg-green-500'
      : percentComplete > 50
        ? 'bg-yellow-500'
        : 'bg-gray-400';

  return (
    <div className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-4">
      {/* Dashboard Link */}
      <Link
        href="/project"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-r border-gray-200 dark:border-gray-700 pr-4 mr-0"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Dashboard</span>
      </Link>

      {/* Class Selector (only in create mode) */}
      {toolMode === 'create' && (
        <div className="border-r border-gray-200 dark:border-gray-700 pr-4">
          <ClassSelector value={createClass} onChange={onCreateClassChange} />
        </div>
      )}

      {/* Zoom Controls */}
      <div className="flex items-center gap-2 border-r border-gray-200 dark:border-gray-700 pr-4">
        <button
          type="button"
          onClick={onZoomOut}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-sm font-mono text-gray-700 dark:text-gray-300 w-14 text-center">
          {zoomPercentage}%
        </span>
        <button
          type="button"
          onClick={onZoomIn}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onZoomReset}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          title="Reset Zoom (0)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Undo/Redo Controls */}
      {(onUndo || onRedo) && (
        <div className="flex items-center gap-1 border-r border-gray-200 dark:border-gray-700 pr-4">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-2 rounded transition-colors ${
              canUndo
                ? 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-2 rounded transition-colors ${
              canRedo
                ? 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            }`}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Unsaved Changes Indicator & Actions */}
      {hasUnsavedChanges && (
        <div className="flex items-center gap-2 border-r border-gray-200 dark:border-gray-700 pr-4">
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <span className="text-sm font-medium">Unsaved changes</span>
          </div>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
              title="Discard all changes"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Validate & Save Button */}
      {onValidate && (
        <div className="border-r border-gray-200 dark:border-gray-700 pr-4">
          <button
            type="button"
            onClick={onValidate}
            disabled={!hasUnsavedChanges || isValidating}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
              ${
                !hasUnsavedChanges || isValidating
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }
            `}
            title="Save all changes (Ctrl+S)"
          >
            {isValidating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Sync Status (Legacy - now shows saved state) */}
      <div className="flex items-center gap-2 border-r border-gray-200 dark:border-gray-700 pr-4">
        {lastError && (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm max-w-[200px] truncate" title={lastError.message}>
              {lastError.message}
            </span>
            <button
              type="button"
              onClick={onClearError}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {!lastError && !hasUnsavedChanges && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <Check className="w-4 h-4" />
            <span className="text-sm">Saved</span>
          </div>
        )}
      </div>

      {/* Review Progress */}
      <div className="flex items-center gap-3 border-r border-gray-200 dark:border-gray-700 pr-4">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {reviewed}/{total} reviewed ({percentComplete}%)
          </div>
          <div className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${progressColor} transition-all duration-300`}
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>
      </div>

      {/* Generate Markup Button */}
      {onGenerateMarkup && (
        <button
          type="button"
          onClick={onGenerateMarkup}
          disabled={isGeneratingMarkup}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors
            ${
              isGeneratingMarkup
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }
          `}
          title="Generate facade markup image with measurements"
        >
          {isGeneratingMarkup ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              <span>Generate Markup</span>
            </>
          )}
        </button>
      )}

      {/* Approve Button */}
      {onApprove && (
        <button
          type="button"
          onClick={onApprove}
          // TODO: Restore review requirement for production: disabled={reviewProgress.pending > 0 || isApproving}
          disabled={isApproving}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors
            ${
              isApproving
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }
          `}
          title="Approve all detections and calculate totals"
        >
          {isApproving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Approving...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              <span>Approve & Calculate</span>
            </>
          )}
        </button>
      )}

      {/* User Menu */}
      <div className="ml-2 pl-4 border-l border-gray-200 dark:border-gray-700">
        <UserMenu />
      </div>
    </div>
  );
});

export default DetectionToolbar;
