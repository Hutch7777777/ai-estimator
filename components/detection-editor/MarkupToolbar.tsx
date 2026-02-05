'use client';

import React, { memo, useState, useRef, useCallback } from 'react';
import { MousePointer2, Pentagon, Hand, Ruler, Minus, MapPin, ChevronRight, Download, Loader2, Scissors, ScanSearch, Wand2 } from 'lucide-react';
import type { ToolMode, DetectionClass } from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS, getClassDisplayLabel } from '@/lib/types/extraction';
import ToolClassSelector from './ToolClassSelector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// =============================================================================
// Types
// =============================================================================

interface MarkupToolbarProps {
  activeMode: ToolMode;
  onModeChange: (mode: ToolMode) => void;
  disabled?: boolean;
  /** Currently selected class for polygon/area creation */
  createClass?: DetectionClass;
  /** Currently selected class for line creation */
  lineClass?: DetectionClass;
  /** Currently selected class for point creation */
  pointClass?: DetectionClass;
  /** Callback when user selects a class from the dropdown */
  onClassSelect?: (cls: DetectionClass, toolMode: ToolMode) => void;
  /** Download markup plans callback */
  onDownloadMarkupPlans?: () => void;
  /** Whether markup plans are currently downloading */
  isDownloadingMarkup?: boolean;
  /** Number of currently selected detections (for split tool enable state) */
  selectedCount?: number;
}

interface ToolDefinition {
  id: ToolMode | 'divider';
  icon?: typeof MousePointer2;
  label?: string;
  shortcut?: string;
  /** If true, this tool has a class selector dropdown */
  hasClassSelector?: boolean;
  /** The measurement type for class filtering */
  measurementType?: 'area' | 'linear' | 'count';
  /** If true, this tool requires exactly 1 selection to be active */
  requiresSingleSelection?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const TOOLS: ToolDefinition[] = [
  { id: 'select', icon: MousePointer2, label: 'Select & Edit', shortcut: 'V' },
  { id: 'create', icon: Pentagon, label: 'Draw Detection', shortcut: 'D', hasClassSelector: true, measurementType: 'area' },
  { id: 'line', icon: Minus, label: 'Draw Line (LF)', shortcut: 'L', hasClassSelector: true, measurementType: 'linear' },
  { id: 'point', icon: MapPin, label: 'Place Marker (Count)', shortcut: 'P', hasClassSelector: true, measurementType: 'count' },
  { id: 'split', icon: Scissors, label: 'Split Detection', shortcut: 'S', requiresSingleSelection: true },
  { id: 'region_detect', icon: ScanSearch, label: 'Region AI Detect', shortcut: 'R' },
  { id: 'sam_select', icon: Wand2, label: 'Magic Select (Preview)', shortcut: 'M' },
  { id: 'pan', icon: Hand, label: 'Pan Canvas', shortcut: 'H' },
  { id: 'divider' },
  { id: 'calibrate', icon: Ruler, label: 'Calibrate Scale', shortcut: 'C' },
];

// =============================================================================
// Helper
// =============================================================================

function formatClassName(cls: DetectionClass): string {
  // Use centralized display label function (returns 'Unclassified' for empty)
  const label = getClassDisplayLabel(cls);
  return label === 'Unclassified' ? '' : label;
}

// =============================================================================
// Component
// =============================================================================

const MarkupToolbar = memo(function MarkupToolbar({
  activeMode,
  onModeChange,
  disabled = false,
  createClass = 'siding',
  lineClass = 'eave',
  pointClass = 'vent',
  onClassSelect,
  onDownloadMarkupPlans,
  isDownloadingMarkup = false,
  selectedCount = 0,
}: MarkupToolbarProps) {
  // Track which tool's class selector is open
  const [openSelector, setOpenSelector] = useState<'create' | 'line' | 'point' | null>(null);
  // Refs for positioning the popover
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const getSelectedClass = useCallback(
    (toolId: ToolMode): DetectionClass => {
      switch (toolId) {
        case 'create':
          return createClass;
        case 'line':
          return lineClass;
        case 'point':
          return pointClass;
        default:
          return '';
      }
    },
    [createClass, lineClass, pointClass]
  );

  const handleToolClick = useCallback(
    (tool: ToolDefinition) => {
      // If tool has class selector, toggle the dropdown
      if (tool.hasClassSelector && (tool.id === 'create' || tool.id === 'line' || tool.id === 'point')) {
        // If already in this mode, just show the selector
        if (activeMode === tool.id) {
          setOpenSelector(openSelector === tool.id ? null : tool.id);
        } else {
          // Show selector when switching to this tool
          setOpenSelector(tool.id);
        }
      } else {
        // For other tools, just switch mode
        onModeChange(tool.id as ToolMode);
        setOpenSelector(null);
      }
    },
    [activeMode, onModeChange, openSelector]
  );

  const handleClassSelect = useCallback(
    (cls: DetectionClass, toolMode: ToolMode) => {
      // Notify parent of class selection
      onClassSelect?.(cls, toolMode);
      // Switch to the tool mode
      onModeChange(toolMode);
      // Close the selector
      setOpenSelector(null);
    },
    [onClassSelect, onModeChange]
  );

  const handleCloseSelector = useCallback(() => {
    setOpenSelector(null);
  }, []);

  return (
      <div className="flex flex-col w-14 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 py-2 relative overflow-hidden">
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
          const selectedClass = getSelectedClass(tool.id as ToolMode);
          const classColor = selectedClass ? DETECTION_CLASS_COLORS[selectedClass] : undefined;
          const hasSelector = tool.hasClassSelector;

          // Check if tool requires single selection
          const requiresSingleSelection = tool.requiresSingleSelection === true;
          const isToolDisabled = disabled || (requiresSingleSelection && selectedCount !== 1);

          const tooltipText = requiresSingleSelection && selectedCount !== 1
            ? `${tool.label} (select exactly 1 detection)`
            : `${tool.label} (${tool.shortcut})`;

          return (
            <div key={tool.id} className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    ref={(el) => {
                      if (el) buttonRefs.current.set(tool.id as string, el);
                    }}
                    type="button"
                    onClick={() => handleToolClick(tool)}
                    disabled={isToolDisabled}
                    className={`
                      w-12 h-10 flex items-center justify-center relative transition-colors
                      ${isToolDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      ${
                        isActive
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-l-2 border-blue-600'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border-l-2 border-transparent'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />

                    {/* Class color indicator for drawing tools */}
                    {hasSelector && classColor && (
                      <span
                        className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border border-white dark:border-gray-900"
                        style={{ backgroundColor: classColor }}
                      />
                    )}

                    {/* Dropdown indicator */}
                    {hasSelector && (
                      <ChevronRight className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {tooltipText}
                </TooltipContent>
              </Tooltip>

              {/* Class selector popover */}
              {hasSelector && (tool.id === 'create' || tool.id === 'line' || tool.id === 'point') && (
                <ToolClassSelector
                  toolMode={tool.id}
                  selectedClass={selectedClass}
                  onSelectClass={handleClassSelect}
                  isOpen={openSelector === tool.id}
                  onClose={handleCloseSelector}
                  anchorEl={buttonRefs.current.get(tool.id) || null}
                />
              )}
            </div>
          );
        })}

        {/* Download Markup Plans */}
        {onDownloadMarkupPlans && (
          <>
            <div className="my-2 mx-2 border-t border-gray-200 dark:border-gray-700" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onDownloadMarkupPlans}
                  disabled={disabled || isDownloadingMarkup}
                  className={`
                    w-12 h-10 flex items-center justify-center relative transition-colors
                    ${disabled || isDownloadingMarkup ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border-l-2 border-transparent
                  `}
                >
                  {isDownloadingMarkup ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Download Markup Plans (ZIP)
              </TooltipContent>
            </Tooltip>
          </>
        )}

      {/* Active mode indicator - compact version */}
      {(activeMode === 'create' || activeMode === 'line' || activeMode === 'point') && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="mt-2 mx-1 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded flex flex-col items-center gap-1">
              {/* Color indicator */}
              <span
                className="w-4 h-4 rounded-full border-2 border-blue-400 dark:border-blue-500"
                style={{
                  backgroundColor:
                    DETECTION_CLASS_COLORS[getSelectedClass(activeMode)] || '#6B7280',
                }}
              />
              {/* Compact label */}
              <span className="text-[9px] text-blue-600 dark:text-blue-400 font-medium leading-tight text-center">
                {activeMode === 'create' && 'Area'}
                {activeMode === 'line' && 'Line'}
                {activeMode === 'point' && 'Point'}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <div className="text-xs">
              <div className="font-medium">
                {activeMode === 'create' && 'Polygon Mode'}
                {activeMode === 'line' && 'Line Mode'}
                {activeMode === 'point' && 'Point Mode'}
              </div>
              <div className="text-muted-foreground">
                Class: {formatClassName(getSelectedClass(activeMode)) || 'Select class'}
              </div>
              {activeMode === 'create' && (
                <div className="text-muted-foreground mt-1">Click to draw polygon, drag for rectangle</div>
              )}
              <div className="text-muted-foreground">Esc to exit</div>
            </div>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Split mode indicator - compact version */}
      {activeMode === 'split' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="mt-2 mx-1 py-1.5 bg-red-50 dark:bg-red-900/20 rounded flex flex-col items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-400" />
              <span className="text-[9px] text-red-600 dark:text-red-400 font-medium leading-tight">
                Split
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <div className="text-xs">
              <div className="font-medium">Split Mode</div>
              <div className="text-muted-foreground">Click to draw, drag for rectangle</div>
              <div className="text-muted-foreground">Right-click to finish, Esc to cancel</div>
            </div>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Region detect mode indicator - compact version */}
      {activeMode === 'region_detect' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="mt-2 mx-1 py-1.5 bg-purple-50 dark:bg-purple-900/20 rounded flex flex-col items-center gap-1">
              <ScanSearch className="w-4 h-4 text-purple-500" />
              <span className="text-[9px] text-purple-600 dark:text-purple-400 font-medium leading-tight text-center">
                Region
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <div className="text-xs">
              <div className="font-medium">Region AI Detect</div>
              <div className="text-muted-foreground">Draw rectangle to detect objects</div>
              <div className="text-muted-foreground">Esc to cancel</div>
            </div>
          </TooltipContent>
        </Tooltip>
      )}

      {/* SAM Magic Select mode indicator - compact version */}
      {activeMode === 'sam_select' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="mt-2 mx-1 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded flex flex-col items-center gap-1 border border-amber-200 dark:border-amber-700">
              <Wand2 className="w-4 h-4 text-amber-500" />
              <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium leading-tight text-center">
                Preview
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <div className="text-xs">
              <div className="font-medium text-amber-600">Magic Select (Coming Soon)</div>
              <div className="text-muted-foreground">Click-to-segment is not yet available.</div>
              <div className="text-muted-foreground">Use P for polygon, R for rectangle,</div>
              <div className="text-muted-foreground">or D for AI region detect.</div>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
      </div>
  );
});

export default MarkupToolbar;
