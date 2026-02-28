'use client';

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, List } from 'lucide-react';
import type { ExtractionDetection, ExtractionPage, DetectionClass } from '@/lib/types/extraction';
import MarkupsList from './MarkupsList';
import BulkMaterialPicker from './BulkMaterialPicker';

// =============================================================================
// Types
// =============================================================================

export interface MarkupsListPanelProps {
  /** All detections across all pages */
  allDetections: ExtractionDetection[];
  /** All pages for page number lookup */
  pages: ExtractionPage[];
  /** Currently selected detection IDs (canvas selection) */
  selectedIds: Set<string>;
  /** Callback when a detection is clicked */
  onDetectionSelect: (detectionId: string, pageId: string) => void;
  /** Current page ID for highlighting */
  currentPageId: string | null;
  /** External collapsed state control */
  isCollapsed?: boolean;
  /** Callback when collapsed state changes */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Callback for bulk material assignment */
  onBulkMaterialAssign?: (detectionIds: string[], materialId: string | null) => void;
  /** Callback for bulk class change */
  onBulkClassChange?: (detectionIds: string[], newClass: DetectionClass) => void;
  /** Callback for bulk delete */
  onBulkDelete?: (detectionIds: string[]) => void;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_HEIGHT = 150;
const MAX_HEIGHT_RATIO = 0.5; // 50% of viewport
const DEFAULT_HEIGHT = 250;
const COLLAPSED_HEIGHT = 32;
const STORAGE_KEY = 'markups-panel-height';
const COLLAPSED_STORAGE_KEY = 'markups-panel-collapsed';

// =============================================================================
// Main Component
// =============================================================================

const MarkupsListPanel = memo(function MarkupsListPanel({
  allDetections,
  pages,
  selectedIds,
  onDetectionSelect,
  currentPageId,
  isCollapsed: externalCollapsed,
  onCollapsedChange,
  onBulkMaterialAssign,
  onBulkClassChange,
  onBulkDelete,
}: MarkupsListPanelProps) {
  // Panel height state (persisted)
  const [panelHeight, setPanelHeight] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? parseInt(stored, 10) : DEFAULT_HEIGHT;
    }
    return DEFAULT_HEIGHT;
  });

  // Checked IDs state for bulk selection (separate from canvas selection)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // Material picker popup state
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);

  // Handle individual checkbox change
  const handleCheckChange = useCallback((detectionId: string, checked: boolean) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(detectionId);
      } else {
        next.delete(detectionId);
      }
      return next;
    });
  }, []);

  // Handle multiple checkbox changes
  const handleCheckMultiple = useCallback((detectionIds: string[], checked: boolean) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      for (const id of detectionIds) {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }, []);

  // Handle bulk material assignment trigger
  const handleBulkMaterialAssign = useCallback(() => {
    if (checkedIds.size > 0) {
      setShowMaterialPicker(true);
    }
  }, [checkedIds]);

  // Handle material selected from picker
  const handleMaterialSelected = useCallback((materialId: string | null) => {
    if (onBulkMaterialAssign && checkedIds.size > 0) {
      onBulkMaterialAssign([...checkedIds], materialId);
      // Clear selection after assignment
      setCheckedIds(new Set());
    }
    setShowMaterialPicker(false);
  }, [onBulkMaterialAssign, checkedIds]);

  // Get selected detections for material picker
  const checkedDetections = React.useMemo(() => {
    return allDetections.filter(d => checkedIds.has(d.id));
  }, [allDetections, checkedIds]);

  // Collapsed state (use external if provided, otherwise local)
  const [localCollapsed, setLocalCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      return stored === 'true';
    }
    return false;
  });

  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : localCollapsed;
  const setCollapsed = useCallback((collapsed: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(collapsed);
    } else {
      setLocalCollapsed(collapsed);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
    }
  }, [onCollapsedChange]);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Persist height changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(panelHeight));
    }
  }, [panelHeight]);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = panelHeight;
  }, [panelHeight]);

  // Handle resize move
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startYRef.current - e.clientY; // Inverted because dragging up increases height
      const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
      const newHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeightRef.current + deltaY));
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Toggle collapsed state
  const toggleCollapsed = useCallback(() => {
    setCollapsed(!isCollapsed);
  }, [isCollapsed, setCollapsed]);

  // Count of detections
  const detectionCount = allDetections.filter(d => d.status !== 'deleted').length;

  return (
    <div
      ref={panelRef}
      className={`
        flex-shrink-0 bg-gray-900 border-t border-gray-700
        transition-all duration-200 ease-in-out
        ${isResizing ? 'select-none' : ''}
      `}
      style={{ height: isCollapsed ? COLLAPSED_HEIGHT : panelHeight }}
    >
      {/* Resize handle (only when expanded) */}
      {!isCollapsed && (
        <div
          onMouseDown={handleResizeStart}
          className={`
            h-1 w-full cursor-ns-resize group
            ${isResizing ? 'bg-blue-500' : 'hover:bg-gray-600'}
            transition-colors
          `}
        >
          <div className="h-full w-16 mx-auto bg-gray-600 group-hover:bg-gray-500 rounded-full" />
        </div>
      )}

      {/* Header bar */}
      <div
        className={`
          flex items-center justify-between px-3
          ${isCollapsed ? 'h-full' : 'h-8'}
          bg-gray-800 border-b border-gray-700
        `}
      >
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">
            Markups List
            <span className="text-xs text-gray-500 ml-1">(M)</span>
          </span>
          {/* Count badge */}
          <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-700 text-gray-300 rounded">
            {detectionCount}
          </span>
        </div>

        {/* Toggle button */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          title={isCollapsed ? 'Expand panel (M)' : 'Collapse panel (M)'}
        >
          {isCollapsed ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Content area (only when expanded) */}
      {!isCollapsed && (
        <div className="h-[calc(100%-36px)] overflow-hidden">
          <MarkupsList
            allDetections={allDetections}
            pages={pages}
            selectedIds={selectedIds}
            onDetectionSelect={onDetectionSelect}
            currentPageId={currentPageId}
            checkedIds={checkedIds}
            onCheckChange={handleCheckChange}
            onCheckMultiple={handleCheckMultiple}
            onBulkMaterialAssign={handleBulkMaterialAssign}
            onBulkClassChange={onBulkClassChange}
            onBulkDelete={onBulkDelete}
          />
        </div>
      )}

      {/* Bulk Material Picker Popup */}
      {showMaterialPicker && (
        <BulkMaterialPicker
          selectedDetections={checkedDetections}
          onMaterialSelect={handleMaterialSelected}
          onClose={() => setShowMaterialPicker(false)}
        />
      )}
    </div>
  );
});

export default MarkupsListPanel;
