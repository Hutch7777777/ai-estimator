'use client';

import React, { memo, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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
  /** Currently selected detection IDs */
  selectedIds: Set<string>;
  /** Callback when a detection is clicked */
  onDetectionSelect: (detectionId: string, pageId: string) => void;
  /** Current page ID for highlighting */
  currentPageId: string | null;
}

interface GroupedDetections {
  class: DetectionClass;
  detections: ExtractionDetection[];
  totalSf: number;
  totalLf: number;
  totalCount: number;
  assignedCount: number;
}

type SortField = 'index' | 'class' | 'source' | 'page' | 'value' | 'material';
type SortDirection = 'asc' | 'desc';

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
  onClick: () => void;
  rowRef?: React.RefObject<HTMLTableRowElement | null>;
}

const MarkupRow = memo(function MarkupRow({
  detection,
  index,
  pageNumber,
  isSelected,
  onClick,
  rowRef,
}: MarkupRowProps) {
  const hasNoMaterial = !detection.assigned_material_id && detection.status !== 'deleted';
  const color = detection.color_override || getDetectionColor(detection.class);

  return (
    <tr
      ref={rowRef}
      onClick={onClick}
      className={`
        h-8 cursor-pointer transition-colors text-xs
        ${isSelected
          ? 'bg-emerald-600/20 dark:bg-emerald-500/20'
          : hasNoMaterial
            ? 'bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-100/50 dark:hover:bg-amber-900/20'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        }
        ${detection.status === 'deleted' ? 'opacity-40 line-through' : ''}
      `}
    >
      {/* Index */}
      <td className="px-2 py-1 text-gray-500 dark:text-gray-400 text-center w-10">
        {index}
      </td>

      {/* Class with color dot */}
      <td className="px-2 py-1 w-24">
        <div className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="truncate capitalize text-gray-700 dark:text-gray-300">
            {getClassLabel(detection.class)}
          </span>
        </div>
      </td>

      {/* Source (marker_label) */}
      <td
        className="px-2 py-1 text-gray-600 dark:text-gray-400 max-w-[160px] truncate"
        title={detection.marker_label || '—'}
      >
        {detection.marker_label || '—'}
      </td>

      {/* Page */}
      <td className="px-2 py-1 text-center text-gray-500 dark:text-gray-400 w-12">
        {pageNumber}
      </td>

      {/* Value */}
      <td className="px-2 py-1 text-right font-mono text-gray-700 dark:text-gray-300 w-20">
        {formatValue(detection)}
      </td>

      {/* Material */}
      <td
        className={`px-2 py-1 max-w-[120px] truncate ${
          hasNoMaterial ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'
        }`}
        title={detection.assigned_material_id ? 'Assigned' : 'Unassigned'}
      >
        {detection.assigned_material_id ? 'Assigned' : '—'}
      </td>
    </tr>
  );
});

interface GroupHeaderProps {
  group: GroupedDetections;
  isExpanded: boolean;
  onToggle: () => void;
}

const GroupHeader = memo(function GroupHeader({
  group,
  isExpanded,
  onToggle,
}: GroupHeaderProps) {
  const color = getDetectionColor(group.class);
  const total = formatGroupTotal(group);

  return (
    <tr
      onClick={onToggle}
      className="h-9 bg-gray-100 dark:bg-gray-800 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
    >
      <td colSpan={6} className="px-2 py-1">
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium text-sm text-gray-800 dark:text-gray-200 capitalize">
            {getClassLabel(group.class)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({group.detections.length})
          </span>
          {total && (
            <>
              <span className="text-gray-400 dark:text-gray-500">—</span>
              <span className="text-xs font-mono text-gray-600 dark:text-gray-300">
                {total}
              </span>
            </>
          )}
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            {group.assignedCount}/{group.detections.length} assigned
          </span>
        </div>
      </td>
    </tr>
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
}: MarkupsListProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState<DetectionClass | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('class');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(true);

  // Refs for scrolling to selected row
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Stats
  const totalDetections = filteredDetections.length;
  const assignedCount = filteredDetections.filter(d => d.assigned_material_id).length;

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
      {/* Header with stats */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
        {/* Stats row */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400">
            {totalDetections} markups
          </span>
          <span className={assignedCount === totalDetections ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            {assignedCount}/{totalDetections} assigned
          </span>
        </div>

        {/* Search and filter row */}
        <div className="flex gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-7 pl-7 pr-2 text-xs bg-gray-100 dark:bg-gray-800 border-0 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>

          {/* Class filter */}
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as DetectionClass | 'all')}
            className="h-7 text-xs bg-gray-100 dark:bg-gray-800 border-0 rounded px-2 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-blue-500"
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
            className="h-7 px-2 text-xs bg-gray-100 dark:bg-gray-800 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
            title={allExpanded ? 'Collapse all' : 'Expand all'}
          >
            {allExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Table */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th
                className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 w-10"
                onClick={() => handleSort('index')}
              >
                <div className="flex items-center justify-center gap-1">
                  #
                  <SortIcon field="index" />
                </div>
              </th>
              <th
                className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 w-24"
                onClick={() => handleSort('class')}
              >
                <div className="flex items-center gap-1">
                  Class
                  <SortIcon field="class" />
                </div>
              </th>
              <th
                className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
                onClick={() => handleSort('source')}
              >
                <div className="flex items-center gap-1">
                  Source
                  <SortIcon field="source" />
                </div>
              </th>
              <th
                className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 w-12"
                onClick={() => handleSort('page')}
              >
                <div className="flex items-center justify-center gap-1">
                  Pg
                  <SortIcon field="page" />
                </div>
              </th>
              <th
                className="px-2 py-2 text-right font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 w-20"
                onClick={() => handleSort('value')}
              >
                <div className="flex items-center justify-end gap-1">
                  Value
                  <SortIcon field="value" />
                </div>
              </th>
              <th
                className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 w-24"
                onClick={() => handleSort('material')}
              >
                <div className="flex items-center gap-1">
                  Material
                  <SortIcon field="material" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {groupedDetections.map(group => {
              const isExpanded = expandedGroups.has(group.class);
              return (
                <React.Fragment key={group.class}>
                  <GroupHeader
                    group={group}
                    isExpanded={isExpanded}
                    onToggle={() => toggleGroup(group.class)}
                  />
                  {isExpanded && group.detections.map(detection => {
                    globalIndex++;
                    const isSelected = selectedIds.has(detection.id);
                    return (
                      <MarkupRow
                        key={detection.id}
                        detection={detection}
                        index={globalIndex}
                        pageNumber={pageNumberMap.get(detection.page_id) || 0}
                        isSelected={isSelected}
                        onClick={() => onDetectionSelect(detection.id, detection.page_id)}
                        rowRef={isSelected && selectedIds.size === 1 ? selectedRowRef : undefined}
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
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <Search className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No markups found</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-blue-500 hover:text-blue-600"
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
