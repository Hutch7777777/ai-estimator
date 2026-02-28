'use client';

import React, { memo, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Check,
  Minus,
  X,
  Trash2,
  Package,
} from 'lucide-react';
import type {
  ExtractionDetection,
  ExtractionPage,
  DetectionClass,
} from '@/lib/types/extraction';
import {
  getDetectionColor,
  getClassDisplayLabel,
  USER_SELECTABLE_CLASSES,
} from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

export interface MarkupsListProps {
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
  /** Checked detection IDs (bulk selection) */
  checkedIds: Set<string>;
  /** Callback when checkbox state changes */
  onCheckChange: (detectionId: string, checked: boolean) => void;
  /** Callback to check multiple detections */
  onCheckMultiple: (detectionIds: string[], checked: boolean) => void;
  /** Callback to trigger bulk material assignment (shows picker) */
  onBulkMaterialAssign?: () => void;
  /** Callback for bulk class change */
  onBulkClassChange?: (detectionIds: string[], newClass: DetectionClass) => void;
  /** Callback for bulk delete */
  onBulkDelete?: (detectionIds: string[]) => void;
}

interface GroupedDetections {
  class: DetectionClass;
  detections: ExtractionDetection[];
  totalSf: number;
  totalLf: number;
  totalCount: number;
  assignedCount: number;
}

type SortField = 'index' | 'class' | 'source' | 'page' | 'value' | 'material' | 'status';
type SortDirection = 'asc' | 'desc';

// Column configuration type
type ColumnId = 'index' | 'class' | 'source' | 'page' | 'value' | 'material' | 'status';

interface ColumnConfig {
  id: ColumnId;
  label: string;
  shortLabel?: string;
  defaultWidth: number;
  minWidth: number;
  align: 'left' | 'center' | 'right';
}

// Default column configuration
const COLUMN_CONFIGS: Record<ColumnId, ColumnConfig> = {
  index: { id: 'index', label: '#', defaultWidth: 40, minWidth: 30, align: 'center' },
  class: { id: 'class', label: 'Class', defaultWidth: 100, minWidth: 60, align: 'left' },
  source: { id: 'source', label: 'Source', defaultWidth: 120, minWidth: 60, align: 'left' },
  page: { id: 'page', label: 'Pg', shortLabel: 'Page', defaultWidth: 48, minWidth: 36, align: 'center' },
  value: { id: 'value', label: 'Value', defaultWidth: 80, minWidth: 50, align: 'right' },
  material: { id: 'material', label: 'Material', defaultWidth: 96, minWidth: 60, align: 'left' },
  status: { id: 'status', label: 'Status', defaultWidth: 64, minWidth: 50, align: 'left' },
};

const DEFAULT_COLUMN_ORDER: ColumnId[] = ['index', 'class', 'source', 'page', 'value', 'material', 'status'];
const COLUMN_ORDER_STORAGE_KEY = 'markups-list-column-order';
const COLUMN_WIDTHS_STORAGE_KEY = 'markups-list-column-widths';

const STATUS_LABELS: Record<string, string> = {
  auto: 'Auto',
  verified: 'Verified',
  edited: 'Edited',
  deleted: 'Deleted',
};

const STATUS_COLORS: Record<string, string> = {
  auto: 'text-gray-500 dark:text-gray-400',
  verified: 'text-emerald-600 dark:text-emerald-400',
  edited: 'text-amber-600 dark:text-amber-400',
  deleted: 'text-red-500 dark:text-red-400',
};

// =============================================================================
// Column State Helpers
// =============================================================================

function loadColumnOrder(): ColumnId[] {
  if (typeof window === 'undefined') return DEFAULT_COLUMN_ORDER;
  try {
    const stored = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ColumnId[];
      // Validate that all columns are present
      if (parsed.length === DEFAULT_COLUMN_ORDER.length &&
          DEFAULT_COLUMN_ORDER.every(col => parsed.includes(col))) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_COLUMN_ORDER;
}

function saveColumnOrder(order: ColumnId[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(order));
}

function loadColumnWidths(): Record<ColumnId, number> {
  if (typeof window === 'undefined') {
    return Object.fromEntries(
      Object.entries(COLUMN_CONFIGS).map(([id, config]) => [id, config.defaultWidth])
    ) as Record<ColumnId, number>;
  }
  try {
    const stored = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<ColumnId, number>;
      // Fill in any missing columns with defaults
      const result = { ...parsed };
      for (const [id, config] of Object.entries(COLUMN_CONFIGS)) {
        if (!(id in result)) {
          result[id as ColumnId] = config.defaultWidth;
        }
      }
      return result as Record<ColumnId, number>;
    }
  } catch {
    // Ignore parse errors
  }
  return Object.fromEntries(
    Object.entries(COLUMN_CONFIGS).map(([id, config]) => [id, config.defaultWidth])
  ) as Record<ColumnId, number>;
}

function saveColumnWidths(widths: Record<ColumnId, number>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatValue(detection: ExtractionDetection): string {
  if (detection.item_count && detection.item_count > 0) {
    return `${detection.item_count} ct`;
  }
  if (detection.area_sf && detection.area_sf > 0) {
    return `${detection.area_sf.toFixed(1)} SF`;
  }
  if (detection.perimeter_lf && detection.perimeter_lf > 0) {
    return `${detection.perimeter_lf.toFixed(1)} LF`;
  }
  return '—';
}

function getClassLabel(cls: DetectionClass): string {
  return getClassDisplayLabel(cls) || cls.replace(/_/g, ' ');
}

function formatGroupTotal(group: GroupedDetections): string {
  if (group.totalCount > 0) {
    return `${group.totalCount} ct`;
  }
  if (group.totalSf > 0) {
    return `${group.totalSf.toFixed(1)} SF`;
  }
  if (group.totalLf > 0) {
    return `${group.totalLf.toFixed(1)} LF`;
  }
  return '';
}

// =============================================================================
// Sub-Components
// =============================================================================

interface MarkupRowProps {
  detection: ExtractionDetection;
  index: number;
  pageNumber: number;
  isSelected: boolean;
  isChecked: boolean;
  onClick: () => void;
  onCheckChange: (checked: boolean) => void;
  rowRef?: React.RefObject<HTMLTableRowElement | null>;
  columnOrder: ColumnId[];
  columnWidths: Record<ColumnId, number>;
}

const MarkupRow = memo(function MarkupRow({
  detection,
  index,
  pageNumber,
  isSelected,
  isChecked,
  onClick,
  onCheckChange,
  rowRef,
  columnOrder,
  columnWidths,
}: MarkupRowProps) {
  const hasNoMaterial = !detection.assigned_material_id && detection.status !== 'deleted';
  const color = detection.color_override || getDetectionColor(detection.class);

  // Handle checkbox click - don't propagate to row click
  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onCheckChange(!isChecked);
  }, [isChecked, onCheckChange]);

  // Render cell content based on column ID
  const renderCell = (colId: ColumnId) => {
    const config = COLUMN_CONFIGS[colId];
    const width = columnWidths[colId];
    const baseClass = `px-2 py-1 truncate`;
    const alignClass = config.align === 'center' ? 'text-center' : config.align === 'right' ? 'text-right' : 'text-left';

    switch (colId) {
      case 'index':
        return (
          <td key={colId} className={`${baseClass} ${alignClass} text-gray-500`} style={{ width }}>
            {index}
          </td>
        );
      case 'class':
        return (
          <td key={colId} className={`${baseClass}`} style={{ width }}>
            <div className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="truncate capitalize text-gray-300">
                {getClassLabel(detection.class)}
              </span>
            </div>
          </td>
        );
      case 'source':
        return (
          <td key={colId} className={`${baseClass} ${alignClass} text-gray-400`} style={{ width }} title={detection.marker_label || '—'}>
            {detection.marker_label || '—'}
          </td>
        );
      case 'page':
        return (
          <td key={colId} className={`${baseClass} ${alignClass} text-gray-500`} style={{ width }}>
            {pageNumber}
          </td>
        );
      case 'value':
        return (
          <td key={colId} className={`${baseClass} ${alignClass} font-mono text-gray-300`} style={{ width }}>
            {formatValue(detection)}
          </td>
        );
      case 'material':
        return (
          <td
            key={colId}
            className={`${baseClass} ${alignClass} ${hasNoMaterial ? 'text-amber-400' : 'text-gray-400'}`}
            style={{ width }}
            title={detection.assigned_material_id ? 'Assigned' : 'Unassigned'}
          >
            {detection.assigned_material_id ? 'Assigned' : '—'}
          </td>
        );
      case 'status':
        return (
          <td key={colId} className={`${baseClass} ${alignClass} ${STATUS_COLORS[detection.status] || 'text-gray-500'}`} style={{ width }}>
            {STATUS_LABELS[detection.status] || detection.status}
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <tr
      ref={rowRef}
      onClick={onClick}
      className={`
        h-7 cursor-pointer transition-colors text-xs
        ${isSelected
          ? 'bg-emerald-500/20'
          : isChecked
            ? 'bg-blue-500/15'
            : hasNoMaterial
              ? 'bg-amber-900/10 hover:bg-amber-900/20'
              : 'hover:bg-gray-800'
        }
        ${detection.status === 'deleted' ? 'opacity-40 line-through' : ''}
      `}
    >
      {/* Checkbox cell */}
      <td className="px-2 py-1 w-8" onClick={handleCheckboxClick}>
        <div
          className={`
            w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors
            ${isChecked
              ? 'bg-blue-500 border-blue-500'
              : 'border-gray-500 hover:border-gray-400'
            }
          `}
        >
          {isChecked && <Check className="w-3 h-3 text-white" />}
        </div>
      </td>
      {columnOrder.map(colId => renderCell(colId))}
    </tr>
  );
});

interface GroupHeaderProps {
  group: GroupedDetections;
  isExpanded: boolean;
  onToggle: () => void;
  columnCount: number;
  checkedCount: number;
  onCheckAll: (checked: boolean) => void;
  onSelectUnassigned: () => void;
}

const GroupHeader = memo(function GroupHeader({
  group,
  isExpanded,
  onToggle,
  columnCount,
  checkedCount,
  onCheckAll,
  onSelectUnassigned,
}: GroupHeaderProps) {
  const color = getDetectionColor(group.class);
  const total = formatGroupTotal(group);
  const allChecked = checkedCount === group.detections.length && checkedCount > 0;
  const someChecked = checkedCount > 0 && checkedCount < group.detections.length;
  const unassignedCount = group.detections.length - group.assignedCount;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCheckAll(!allChecked);
  };

  const handleSelectUnassigned = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectUnassigned();
  };

  return (
    <tr
      onClick={onToggle}
      className="h-8 bg-gray-800 cursor-pointer hover:bg-gray-700 transition-colors"
    >
      {/* Checkbox cell - +1 for the checkbox column */}
      <td colSpan={columnCount + 1} className="px-2 py-1">
        <div className="flex items-center gap-2">
          {/* Group checkbox */}
          <div
            onClick={handleCheckboxClick}
            className={`
              w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors flex-shrink-0
              ${allChecked
                ? 'bg-blue-500 border-blue-500'
                : someChecked
                  ? 'bg-blue-500/50 border-blue-500'
                  : 'border-gray-500 hover:border-gray-400'
              }
            `}
          >
            {allChecked ? (
              <Check className="w-3 h-3 text-white" />
            ) : someChecked ? (
              <Minus className="w-3 h-3 text-white" />
            ) : null}
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium text-sm text-gray-200 capitalize">
            {getClassLabel(group.class)}
          </span>
          <span className="text-xs text-gray-400">
            ({group.detections.length})
          </span>
          {total && (
            <>
              <span className="text-gray-500">—</span>
              <span className="text-xs font-mono text-gray-300">
                {total}
              </span>
            </>
          )}
          <div className="ml-auto flex items-center gap-3">
            {/* Select unassigned link */}
            {unassignedCount > 0 && (
              <button
                type="button"
                onClick={handleSelectUnassigned}
                className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
              >
                Select {unassignedCount} unassigned
              </button>
            )}
            <span className="text-xs text-gray-400">
              {group.assignedCount}/{group.detections.length} assigned
            </span>
          </div>
        </div>
      </td>
    </tr>
  );
});

// =============================================================================
// Main Component
// =============================================================================

// =============================================================================
// Selection Action Bar Component
// =============================================================================

interface SelectionActionBarProps {
  checkedCount: number;
  onClearSelection: () => void;
  onAssignMaterial: () => void;
  onChangeClass: (newClass: DetectionClass) => void;
  onDelete: () => void;
  availableClasses: DetectionClass[];
}

const SelectionActionBar = memo(function SelectionActionBar({
  checkedCount,
  onClearSelection,
  onAssignMaterial,
  onChangeClass,
  onDelete,
  availableClasses,
}: SelectionActionBarProps) {
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleClassSelect = (cls: DetectionClass) => {
    onChangeClass(cls);
    setShowClassDropdown(false);
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      // Auto-reset after 3 seconds
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/30 border-b border-blue-700">
      {/* Selection count */}
      <span className="text-sm font-medium text-blue-300">
        {checkedCount} item{checkedCount !== 1 ? 's' : ''} selected
      </span>

      <div className="flex-1" />

      {/* Assign Material button */}
      <button
        type="button"
        onClick={onAssignMaterial}
        className="h-7 px-3 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors flex items-center gap-1.5"
      >
        <Package className="w-3.5 h-3.5" />
        Assign Material
      </button>

      {/* Change Class dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowClassDropdown(!showClassDropdown)}
          className="h-7 px-3 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors flex items-center gap-1.5"
        >
          Change Class
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {showClassDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowClassDropdown(false)}
            />
            <div className="absolute top-full left-0 mt-1 w-48 max-h-64 overflow-y-auto bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50">
              {availableClasses.map(cls => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => handleClassSelect(cls)}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 capitalize flex items-center gap-2"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: getDetectionColor(cls) }}
                  />
                  {getClassLabel(cls)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Clear Selection button */}
      <button
        type="button"
        onClick={onClearSelection}
        className="h-7 px-3 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center gap-1.5"
      >
        <X className="w-3.5 h-3.5" />
        Clear
      </button>

      {/* Delete button */}
      <button
        type="button"
        onClick={handleDelete}
        className={`h-7 px-3 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
          showDeleteConfirm
            ? 'bg-red-600 hover:bg-red-500 text-white'
            : 'bg-gray-700 hover:bg-red-600/80 text-gray-300 hover:text-white'
        }`}
      >
        <Trash2 className="w-3.5 h-3.5" />
        {showDeleteConfirm ? 'Confirm Delete' : 'Delete'}
      </button>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

const MarkupsList = memo(function MarkupsList({
  allDetections,
  pages,
  selectedIds,
  onDetectionSelect,
  currentPageId,
  checkedIds,
  onCheckChange,
  onCheckMultiple,
  onBulkMaterialAssign,
  onBulkClassChange,
  onBulkDelete,
}: MarkupsListProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState<DetectionClass | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('class');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(true);

  // Column order and width state
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(loadColumnOrder);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(loadColumnWidths);

  // Drag state for column reordering
  const [draggedColumn, setDraggedColumn] = useState<ColumnId | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null);
  const [dropPosition, setDropPosition] = useState<'left' | 'right' | null>(null);

  // Resize state for column widths
  const [resizingColumn, setResizingColumn] = useState<ColumnId | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Refs for scrolling to selected row
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Create page number lookup
  const pageNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    pages.forEach(p => map.set(p.id, p.page_number));
    return map;
  }, [pages]);

  // Filter detections (exclude deleted unless they're the only ones)
  const filteredDetections = useMemo(() => {
    let filtered = allDetections.filter(d => d.status !== 'deleted');

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        (d.marker_label?.toLowerCase().includes(query)) ||
        (d.class?.toLowerCase().includes(query)) ||
        (d.notes?.toLowerCase().includes(query))
      );
    }

    // Class filter
    if (classFilter !== 'all') {
      filtered = filtered.filter(d => d.class === classFilter);
    }

    return filtered;
  }, [allDetections, searchQuery, classFilter]);

  // Group detections by class
  const groupedDetections = useMemo(() => {
    const groups = new Map<DetectionClass, GroupedDetections>();

    for (const detection of filteredDetections) {
      const cls = detection.class;
      if (!groups.has(cls)) {
        groups.set(cls, {
          class: cls,
          detections: [],
          totalSf: 0,
          totalLf: 0,
          totalCount: 0,
          assignedCount: 0,
        });
      }

      const group = groups.get(cls)!;
      group.detections.push(detection);

      if (detection.item_count && detection.item_count > 0) {
        group.totalCount += detection.item_count;
      } else if (detection.area_sf && detection.area_sf > 0) {
        group.totalSf += detection.area_sf;
      } else if (detection.perimeter_lf && detection.perimeter_lf > 0) {
        group.totalLf += detection.perimeter_lf;
      }

      if (detection.assigned_material_id) {
        group.assignedCount++;
      }
    }

    // Sort groups by class name
    const sortedGroups = Array.from(groups.values()).sort((a, b) =>
      getClassLabel(a.class).localeCompare(getClassLabel(b.class))
    );

    // Sort detections within each group
    for (const group of sortedGroups) {
      group.detections.sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'index':
            comparison = 0; // Keep original order
            break;
          case 'source':
            comparison = (a.marker_label || '').localeCompare(b.marker_label || '');
            break;
          case 'page':
            comparison = (pageNumberMap.get(a.page_id) || 0) - (pageNumberMap.get(b.page_id) || 0);
            break;
          case 'value':
            const aVal = a.area_sf || a.perimeter_lf || a.item_count || 0;
            const bVal = b.area_sf || b.perimeter_lf || b.item_count || 0;
            comparison = aVal - bVal;
            break;
          case 'material':
            comparison = (a.assigned_material_id ? 1 : 0) - (b.assigned_material_id ? 1 : 0);
            break;
          case 'status':
            comparison = (a.status || '').localeCompare(b.status || '');
            break;
          default:
            comparison = 0;
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });
    }

    return sortedGroups;
  }, [filteredDetections, sortField, sortDirection, pageNumberMap]);

  // Initialize expanded groups
  useEffect(() => {
    if (allExpanded) {
      setExpandedGroups(new Set(groupedDetections.map(g => g.class)));
    }
  }, [groupedDetections, allExpanded]);

  // Scroll to selected row when selection changes from canvas
  useEffect(() => {
    if (selectedIds.size === 1 && selectedRowRef.current && containerRef.current) {
      const row = selectedRowRef.current;
      const container = containerRef.current;

      const rowTop = row.offsetTop;
      const rowBottom = rowTop + row.offsetHeight;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;

      // Only scroll if row is not visible
      if (rowTop < containerTop || rowBottom > containerBottom) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedIds]);

  // Handlers
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const toggleGroup = useCallback((cls: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(cls)) {
        next.delete(cls);
      } else {
        next.add(cls);
      }
      return next;
    });
    setAllExpanded(false);
  }, []);

  const toggleAllGroups = useCallback(() => {
    if (allExpanded) {
      setExpandedGroups(new Set());
      setAllExpanded(false);
    } else {
      setExpandedGroups(new Set(groupedDetections.map(g => g.class)));
      setAllExpanded(true);
    }
  }, [allExpanded, groupedDetections]);

  // Column drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, colId: ColumnId) => {
    setDraggedColumn(colId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colId);
    // Add a custom drag image (optional)
    const target = e.target as HTMLElement;
    if (target) {
      e.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colId: ColumnId) => {
    e.preventDefault();
    if (draggedColumn && draggedColumn !== colId) {
      setDragOverColumn(colId);
      // Determine if drop should be on left or right side
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      setDropPosition(e.clientX < midpoint ? 'left' : 'right');
    }
  }, [draggedColumn]);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetColId: ColumnId) => {
    e.preventDefault();
    if (draggedColumn && draggedColumn !== targetColId) {
      const newOrder = [...columnOrder];
      const draggedIndex = newOrder.indexOf(draggedColumn);
      const targetIndex = newOrder.indexOf(targetColId);

      // Remove dragged column
      newOrder.splice(draggedIndex, 1);

      // Calculate new insert position
      let insertIndex = targetIndex;
      if (dropPosition === 'right') {
        insertIndex = draggedIndex < targetIndex ? targetIndex : targetIndex + 1;
      } else {
        insertIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
      }

      // Insert at new position
      newOrder.splice(insertIndex, 0, draggedColumn);

      setColumnOrder(newOrder);
      saveColumnOrder(newOrder);
    }
    setDraggedColumn(null);
    setDragOverColumn(null);
    setDropPosition(null);
  }, [draggedColumn, columnOrder, dropPosition]);

  const handleDragEnd = useCallback(() => {
    setDraggedColumn(null);
    setDragOverColumn(null);
    setDropPosition(null);
  }, []);

  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, colId: ColumnId) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(colId);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[colId];
  }, [columnWidths]);

  // Handle resize move and end with useEffect
  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const minWidth = COLUMN_CONFIGS[resizingColumn].minWidth;
      const newWidth = Math.max(minWidth, resizeStartWidth.current + delta);
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      if (resizingColumn) {
        saveColumnWidths(columnWidths);
      }
      setResizingColumn(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, columnWidths]);

  // Stats
  const totalDetections = filteredDetections.length;
  const assignedCount = filteredDetections.filter(d => d.assigned_material_id).length;
  const checkedCount = checkedIds.size;

  // Get unique classes for filter dropdown
  const availableClasses = useMemo(() => {
    const classes = new Set<DetectionClass>();
    allDetections.forEach(d => {
      if (d.status !== 'deleted') {
        classes.add(d.class);
      }
    });
    return Array.from(classes).sort((a, b) =>
      getClassLabel(a).localeCompare(getClassLabel(b))
    );
  }, [allDetections]);

  // Compute checked counts per group
  const groupCheckedCounts = useMemo(() => {
    const counts = new Map<DetectionClass, number>();
    for (const group of groupedDetections) {
      let count = 0;
      for (const d of group.detections) {
        if (checkedIds.has(d.id)) {
          count++;
        }
      }
      counts.set(group.class, count);
    }
    return counts;
  }, [groupedDetections, checkedIds]);

  // Check if all visible detections are checked
  const allVisibleChecked = useMemo(() => {
    return filteredDetections.length > 0 && filteredDetections.every(d => checkedIds.has(d.id));
  }, [filteredDetections, checkedIds]);

  const someVisibleChecked = useMemo(() => {
    return filteredDetections.some(d => checkedIds.has(d.id)) && !allVisibleChecked;
  }, [filteredDetections, checkedIds, allVisibleChecked]);

  // Selection action bar handlers
  const handleSelectAllVisible = useCallback(() => {
    const ids = filteredDetections.map(d => d.id);
    onCheckMultiple(ids, !allVisibleChecked);
  }, [filteredDetections, allVisibleChecked, onCheckMultiple]);

  const handleClearSelection = useCallback(() => {
    onCheckMultiple([...checkedIds], false);
  }, [checkedIds, onCheckMultiple]);

  const handleGroupCheckAll = useCallback((group: GroupedDetections, checked: boolean) => {
    const ids = group.detections.map(d => d.id);
    onCheckMultiple(ids, checked);
  }, [onCheckMultiple]);

  const handleGroupSelectUnassigned = useCallback((group: GroupedDetections) => {
    const unassignedIds = group.detections
      .filter(d => !d.assigned_material_id)
      .map(d => d.id);
    onCheckMultiple(unassignedIds, true);
  }, [onCheckMultiple]);

  // Handle assign material click - triggers the parent's material picker
  const handleAssignMaterialClick = useCallback(() => {
    onBulkMaterialAssign?.();
  }, [onBulkMaterialAssign]);

  const handleBulkClassChange = useCallback((newClass: DetectionClass) => {
    if (onBulkClassChange && checkedIds.size > 0) {
      onBulkClassChange([...checkedIds], newClass);
    }
  }, [checkedIds, onBulkClassChange]);

  const handleBulkDelete = useCallback(() => {
    if (onBulkDelete && checkedIds.size > 0) {
      onBulkDelete([...checkedIds]);
      handleClearSelection();
    }
  }, [checkedIds, onBulkDelete, handleClearSelection]);

  // Render sort icon
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3" />
    ) : (
      <ArrowDown className="w-3 h-3" />
    );
  };

  // Track detection index across groups
  let globalIndex = 0;

  return (
    <div className="h-full flex flex-col">
      {/* Selection Action Bar - shown when items are checked */}
      {checkedCount > 0 && (
        <SelectionActionBar
          checkedCount={checkedCount}
          onClearSelection={handleClearSelection}
          onAssignMaterial={handleAssignMaterialClick}
          onChangeClass={handleBulkClassChange}
          onDelete={handleBulkDelete}
          availableClasses={USER_SELECTABLE_CLASSES}
        />
      )}

      {/* Header with stats */}
      <div className="px-3 py-2 border-b border-gray-700 bg-gray-900">
        {/* Search and filter row */}
        <div className="flex gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-7 pl-7 pr-2 text-xs bg-gray-800 border border-gray-700 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-100 placeholder-gray-500"
            />
          </div>

          {/* Class filter */}
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as DetectionClass | 'all')}
            className="h-7 text-xs bg-gray-800 border border-gray-700 rounded px-2 text-gray-300 focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Classes</option>
            {availableClasses.map(cls => (
              <option key={cls} value={cls}>
                {getClassLabel(cls)}
              </option>
            ))}
          </select>

          {/* Expand/collapse all */}
          <button
            type="button"
            onClick={toggleAllGroups}
            className="h-7 px-2 text-xs bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 text-gray-400 transition-colors"
            title={allExpanded ? 'Collapse all' : 'Expand all'}
          >
            {allExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          {/* Stats */}
          <div className="flex items-center gap-3 ml-auto text-xs">
            <span className="text-gray-400">
              {totalDetections} markups
            </span>
            <span className={assignedCount === totalDetections ? 'text-emerald-400' : 'text-amber-400'}>
              {assignedCount}/{totalDetections} assigned
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div ref={containerRef} className={`flex-1 overflow-y-auto bg-gray-900 ${resizingColumn ? 'select-none' : ''}`}>
        <table ref={tableRef} className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="border-b border-gray-700">
              {/* Checkbox column header */}
              <th className="px-2 py-2 w-8">
                <div
                  onClick={handleSelectAllVisible}
                  className={`
                    w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors mx-auto
                    ${allVisibleChecked
                      ? 'bg-blue-500 border-blue-500'
                      : someVisibleChecked
                        ? 'bg-blue-500/50 border-blue-500'
                        : 'border-gray-500 hover:border-gray-400'
                    }
                  `}
                  title={allVisibleChecked ? 'Deselect all' : 'Select all visible'}
                >
                  {allVisibleChecked ? (
                    <Check className="w-3 h-3 text-white" />
                  ) : someVisibleChecked ? (
                    <Minus className="w-3 h-3 text-white" />
                  ) : null}
                </div>
              </th>
              {columnOrder.map((colId, colIndex) => {
                const config = COLUMN_CONFIGS[colId];
                const width = columnWidths[colId];
                const alignClass = config.align === 'center' ? 'justify-center' : config.align === 'right' ? 'justify-end' : 'justify-start';
                const isBeingDragged = draggedColumn === colId;
                const isDropTarget = dragOverColumn === colId;
                const isLast = colIndex === columnOrder.length - 1;

                return (
                  <th
                    key={colId}
                    draggable
                    onDragStart={(e) => handleDragStart(e, colId)}
                    onDragOver={(e) => handleDragOver(e, colId)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, colId)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleSort(colId as SortField)}
                    className={`
                      relative px-2 py-2 font-medium cursor-grab select-none
                      text-gray-500 hover:text-gray-200 transition-colors
                      ${isBeingDragged ? 'opacity-50 bg-gray-800' : ''}
                      ${isDropTarget && dropPosition === 'left' ? 'border-l-2 border-blue-500' : ''}
                      ${isDropTarget && dropPosition === 'right' ? 'border-r-2 border-blue-500' : ''}
                    `}
                    style={{ width }}
                  >
                    <div className={`flex items-center gap-1 ${alignClass}`}>
                      <GripVertical className="w-3 h-3 opacity-30 flex-shrink-0" />
                      <span>{config.label}</span>
                      <SortIcon field={colId as SortField} />
                    </div>

                    {/* Resize handle */}
                    {!isLast && (
                      <div
                        onMouseDown={(e) => handleResizeStart(e, colId)}
                        onClick={(e) => e.stopPropagation()}
                        className={`
                          absolute top-0 right-0 w-1 h-full cursor-col-resize
                          hover:bg-blue-500 transition-colors z-20
                          ${resizingColumn === colId ? 'bg-blue-500' : 'bg-transparent'}
                        `}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {groupedDetections.map(group => {
              const isExpanded = expandedGroups.has(group.class);
              const groupCheckedCount = groupCheckedCounts.get(group.class) || 0;
              return (
                <React.Fragment key={group.class}>
                  <GroupHeader
                    group={group}
                    isExpanded={isExpanded}
                    onToggle={() => toggleGroup(group.class)}
                    columnCount={columnOrder.length}
                    checkedCount={groupCheckedCount}
                    onCheckAll={(checked) => handleGroupCheckAll(group, checked)}
                    onSelectUnassigned={() => handleGroupSelectUnassigned(group)}
                  />
                  {isExpanded && group.detections.map(detection => {
                    globalIndex++;
                    const isSelected = selectedIds.has(detection.id);
                    const isChecked = checkedIds.has(detection.id);
                    return (
                      <MarkupRow
                        key={detection.id}
                        detection={detection}
                        index={globalIndex}
                        pageNumber={pageNumberMap.get(detection.page_id) || 0}
                        isSelected={isSelected}
                        isChecked={isChecked}
                        onClick={() => onDetectionSelect(detection.id, detection.page_id)}
                        onCheckChange={(checked) => onCheckChange(detection.id, checked)}
                        rowRef={isSelected && selectedIds.size === 1 ? selectedRowRef : undefined}
                        columnOrder={columnOrder}
                        columnWidths={columnWidths}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {/* Empty state */}
        {filteredDetections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Search className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No markups found</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default MarkupsList;
