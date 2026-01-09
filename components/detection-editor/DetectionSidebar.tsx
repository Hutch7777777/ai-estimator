'use client';

import React, { memo, useState, useMemo, useEffect, useRef } from 'react';
import {
  FileImage,
  Layers,
  Calculator,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  Trash2,
  Pencil,
  Building2,
  CornerDownRight,
  Ruler,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  ExtractionPage,
  ExtractionDetection,
  ExtractionElevationCalcs,
  ExtractionJobTotals,
  DetectionClass,
  AllDetectionClasses,
  DetectionStatus,
  Phase4Data,
} from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS, CONFIDENCE_THRESHOLDS } from '@/lib/types/extraction';
import { getPhase4Data, calculateLinearElements } from '@/lib/api/extractionApi';
import ClassSelector from './PropertiesPanel/ClassSelector';
import SelectionProperties from './PropertiesPanel/SelectionProperties';

// =============================================================================
// Types
// =============================================================================

export interface DetectionSidebarProps {
  pages: ExtractionPage[];
  currentPageId: string | null;
  onPageSelect: (pageId: string) => void;
  detections: ExtractionDetection[];
  selectedIds: Set<string>;
  onDetectionSelect: (id: string, addToSelection: boolean) => void;
  onDetectionHover: (id: string | null) => void;
  elevationCalcs: ExtractionElevationCalcs | null;
  jobTotals: ExtractionJobTotals | null;
  showDeleted: boolean;
  onShowDeletedChange: (show: boolean) => void;
  jobId: string; // For Phase 4 data fetching
  // Selection properties section
  selectedDetections: ExtractionDetection[];
  onClassChange: (detectionIds: string[], newClass: DetectionClass) => void;
}

type TabType = 'pages' | 'detections' | 'properties' | 'totals';

// =============================================================================
// Constants
// =============================================================================

const TABS: { id: TabType; icon: typeof FileImage; label: string }[] = [
  { id: 'pages', icon: FileImage, label: 'Pages' },
  { id: 'detections', icon: Layers, label: 'Detections' },
  { id: 'properties', icon: SlidersHorizontal, label: 'Properties' },
  { id: 'totals', icon: Calculator, label: 'Totals' },
];

const STATUS_OPTIONS: { value: DetectionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'auto', label: 'Auto' },
  { value: 'verified', label: 'Verified' },
  { value: 'edited', label: 'Edited' },
  { value: 'deleted', label: 'Deleted' },
];

// Note: Uses AllDetectionClasses to support legacy 'exterior_wall'/'building' from DB
const CLASS_ORDER: AllDetectionClasses[] = [
  'siding',
  'window',
  'door',
  'garage',
  'exterior_wall', // Legacy - kept for backward compatibility
  'building',      // Internal class for gross facade
  'roof',
  'gable',
];

// =============================================================================
// Helper Functions
// =============================================================================

function formatClassName(cls: AllDetectionClasses | ''): string {
  if (!cls) return 'Unknown';
  return cls
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDimension(feet: number | null): string {
  if (feet === null) return '-';
  return `${feet.toFixed(1)}'`;
}

function formatArea(sf: number | null): string {
  if (sf === null) return '-';
  return `${sf.toFixed(1)} SF`;
}

function formatLinearFeet(lf: number | null): string {
  if (lf === null || lf === 0) return '-';
  return `${lf.toFixed(1)} LF`;
}

// =============================================================================
// Sub-Components
// =============================================================================

interface PageThumbnailProps {
  page: ExtractionPage;
  isSelected: boolean;
  detectionCount: number;
  onClick: () => void;
}

const PageThumbnail = memo(function PageThumbnail({
  page,
  isSelected,
  detectionCount,
  onClick,
}: PageThumbnailProps) {
  const isElevation = page.page_type === 'elevation';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative w-full aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all
        ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 dark:border-gray-700'}
        ${isElevation ? 'opacity-100' : 'opacity-60'}
        hover:border-blue-400
      `}
    >
      {/* Thumbnail image */}
      {page.thumbnail_url ? (
        <img
          src={page.thumbnail_url}
          alt={`Page ${page.page_number}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <FileImage className="w-8 h-8 text-gray-400" />
        </div>
      )}

      {/* Page number */}
      <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
        {page.page_number}
      </div>

      {/* Elevation name badge */}
      {page.elevation_name && (
        <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded capitalize">
          {page.elevation_name}
        </div>
      )}

      {/* Detection count */}
      {detectionCount > 0 && (
        <div className="absolute bottom-1 right-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">
          {detectionCount}
        </div>
      )}
    </button>
  );
});

interface DetectionItemProps {
  detection: ExtractionDetection;
  index: number;
  isSelected: boolean;
  onSelect: (addToSelection: boolean) => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

const DetectionItem = memo(function DetectionItem({
  detection,
  index,
  isSelected,
  onSelect,
  onHoverStart,
  onHoverEnd,
}: DetectionItemProps) {
  const color = DETECTION_CLASS_COLORS[detection.class] || DETECTION_CLASS_COLORS[''];
  const isLowConfidence = detection.confidence < CONFIDENCE_THRESHOLDS.medium;
  const isDeleted = detection.status === 'deleted';

  return (
    <button
      type="button"
      onClick={(e) => onSelect(e.shiftKey)}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={`
        w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors
        ${isSelected ? 'bg-blue-100 dark:bg-blue-900/50' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}
        ${isDeleted ? 'opacity-50' : ''}
      `}
    >
      {/* Color bar */}
      <div
        className="w-1 h-8 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Index */}
      <span className="text-xs text-gray-500 dark:text-gray-400 w-6">
        #{index + 1}
      </span>

      {/* Dimensions */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-gray-100 truncate">
          {formatDimension(detection.real_width_ft)} × {formatDimension(detection.real_height_ft)}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {formatArea(detection.area_sf)}
        </div>
      </div>

      {/* Status icon */}
      <div className="flex-shrink-0">
        {detection.status === 'verified' && (
          <Check className="w-4 h-4 text-green-500" />
        )}
        {detection.status === 'auto' && isLowConfidence && (
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
        )}
        {detection.status === 'edited' && (
          <Pencil className="w-4 h-4 text-blue-500" />
        )}
        {detection.status === 'deleted' && (
          <Trash2 className="w-4 h-4 text-red-500" />
        )}
      </div>
    </button>
  );
});

interface DetectionGroupProps {
  detectionClass: AllDetectionClasses;
  detections: ExtractionDetection[];
  isExpanded: boolean;
  onToggle: () => void;
  selectedIds: Set<string>;
  onDetectionSelect: (id: string, addToSelection: boolean) => void;
  onDetectionHover: (id: string | null) => void;
}

const DetectionGroup = memo(function DetectionGroup({
  detectionClass,
  detections,
  isExpanded,
  onToggle,
  selectedIds,
  onDetectionSelect,
  onDetectionHover,
}: DetectionGroupProps) {
  const color = DETECTION_CLASS_COLORS[detectionClass] || DETECTION_CLASS_COLORS[''];
  const verifiedCount = detections.filter((d) => d.status === 'verified').length;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      {/* Group header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
        <span
          className="w-3 h-3 rounded-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100 text-left">
          {formatClassName(detectionClass)}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {verifiedCount}/{detections.length}
        </span>
      </button>

      {/* Detection items */}
      {isExpanded && (
        <div className="pl-6">
          {detections.map((detection, index) => (
            <DetectionItem
              key={detection.id}
              detection={detection}
              index={index}
              isSelected={selectedIds.has(detection.id)}
              onSelect={(add) => onDetectionSelect(detection.id, add)}
              onHoverStart={() => onDetectionHover(detection.id)}
              onHoverEnd={() => onDetectionHover(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

interface TotalsRowProps {
  label: string;
  value: string | number;
  unit?: string;
  indent?: boolean;
  highlight?: boolean;
}

const TotalsRow = memo(function TotalsRow({
  label,
  value,
  unit,
  indent = false,
  highlight = false,
}: TotalsRowProps) {
  return (
    <div
      className={`
        flex items-center justify-between py-1.5
        ${indent ? 'pl-4' : ''}
        ${highlight ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}
      `}
    >
      <span className="text-sm">{label}</span>
      <span className="text-sm font-mono">
        {typeof value === 'number' ? value.toFixed(1) : value}
        {unit && <span className="text-gray-400 ml-1">{unit}</span>}
      </span>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

const DetectionSidebar = memo(function DetectionSidebar({
  pages,
  currentPageId,
  onPageSelect,
  detections,
  selectedIds,
  onDetectionSelect,
  onDetectionHover,
  elevationCalcs,
  jobTotals,
  showDeleted,
  onShowDeletedChange,
  jobId,
  selectedDetections,
  onClassChange,
}: DetectionSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('detections');
  const [expandedClasses, setExpandedClasses] = useState<Set<AllDetectionClasses>>(
    new Set(CLASS_ORDER)
  );
  const [filterStatus, setFilterStatus] = useState<DetectionStatus | 'all'>('all');

  // Phase 4 Enhanced Data state
  const [phase4Data, setPhase4Data] = useState<Phase4Data | null>(null);
  const [phase4Loading, setPhase4Loading] = useState(false);
  const [phase4Expanded, setPhase4Expanded] = useState(true);

  // Auto-switch to Properties tab when selection changes from empty to non-empty
  const prevSelectedCountRef = useRef(0);
  useEffect(() => {
    if (prevSelectedCountRef.current === 0 && selectedDetections.length > 0) {
      setActiveTab('properties');
    }
    prevSelectedCountRef.current = selectedDetections.length;
  }, [selectedDetections.length]);

  // Load Phase 4 data when jobId changes or tab switches to totals
  useEffect(() => {
    if (!jobId || activeTab !== 'totals') return;

    const loadPhase4 = async () => {
      setPhase4Loading(true);
      try {
        const data = await getPhase4Data(jobId);
        setPhase4Data(data);
      } catch (err) {
        console.error('DetectionSidebar: Error loading Phase 4 data:', err);
      } finally {
        setPhase4Loading(false);
      }
    };

    // Only load if we don't have data yet
    if (!phase4Data) {
      loadPhase4();
    }
  }, [jobId, activeTab, phase4Data]);

  // Handler to manually trigger Phase 4 calculation
  const handleCalculatePhase4 = async () => {
    if (!jobId) return;

    setPhase4Loading(true);
    try {
      const data = await calculateLinearElements(jobId);
      setPhase4Data(data);
    } catch (err) {
      console.error('DetectionSidebar: Error calculating Phase 4 data:', err);
    } finally {
      setPhase4Loading(false);
    }
  };

  // Group detections by page for counts
  const detectionCountsByPage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const detection of detections) {
      if (detection.status !== 'deleted') {
        counts.set(detection.page_id, (counts.get(detection.page_id) || 0) + 1);
      }
    }
    return counts;
  }, [detections]);

  // Filter and group detections for current page
  const filteredDetections = useMemo(() => {
    let filtered = detections.filter((d) => d.page_id === currentPageId);

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter((d) => d.status === filterStatus);
    } else if (!showDeleted) {
      filtered = filtered.filter((d) => d.status !== 'deleted');
    }

    return filtered;
  }, [detections, currentPageId, filterStatus, showDeleted]);

  // Group by class
  const groupedDetections = useMemo(() => {
    const groups = new Map<AllDetectionClasses, ExtractionDetection[]>();

    for (const cls of CLASS_ORDER) {
      groups.set(cls, []);
    }

    for (const detection of filteredDetections) {
      // Cast to handle legacy 'exterior_wall'/'building' values from DB
      const cls = (detection.class || '') as AllDetectionClasses;
      if (!groups.has(cls)) {
        groups.set(cls, []);
      }
      groups.get(cls)!.push(detection);
    }

    // Sort by detection_index within each group
    for (const [, dets] of groups) {
      dets.sort((a, b) => a.detection_index - b.detection_index);
    }

    // Remove empty groups
    for (const [cls, dets] of groups) {
      if (dets.length === 0) {
        groups.delete(cls);
      }
    }

    return groups;
  }, [filteredDetections]);

  const toggleClassExpanded = (cls: AllDetectionClasses) => {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) {
        next.delete(cls);
      } else {
        next.add(cls);
      }
      return next;
    });
  };

  const totalDetections = detections.filter(
    (d) => d.page_id === currentPageId && d.status !== 'deleted'
  ).length;

  return (
    <div className="w-72 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isPropertiesDisabled = tab.id === 'properties' && selectedDetections.length === 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={`
                flex-1 flex items-center justify-center py-3 transition-colors relative
                ${isPropertiesDisabled ? 'opacity-50' : ''}
                ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              {/* Badge for detection count */}
              {tab.id === 'detections' && totalDetections > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-gray-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center px-1">
                  {totalDetections > 99 ? '99+' : totalDetections}
                </span>
              )}
              {/* Badge for selection count */}
              {tab.id === 'properties' && selectedDetections.length > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-blue-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center px-1">
                  {selectedDetections.length > 99 ? '99+' : selectedDetections.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Pages Tab */}
        {activeTab === 'pages' && (
          <div className="p-3">
            <div className="grid grid-cols-2 gap-2">
              {pages.map((page) => (
                <PageThumbnail
                  key={page.id}
                  page={page}
                  isSelected={page.id === currentPageId}
                  detectionCount={detectionCountsByPage.get(page.id) || 0}
                  onClick={() => onPageSelect(page.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Detections Tab */}
        {activeTab === 'detections' && (
          <div className="flex flex-col h-full">
            {/* Filter Bar */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as DetectionStatus | 'all')}
                  className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onShowDeletedChange(!showDeleted)}
                  className={`
                    p-1.5 rounded transition-colors
                    ${showDeleted ? 'bg-gray-200 dark:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}
                  `}
                  title={showDeleted ? 'Hide deleted' : 'Show deleted'}
                >
                  {showDeleted ? (
                    <Eye className="w-4 h-4" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Detection Groups */}
            <div className="flex-1 overflow-y-auto">
              {Array.from(groupedDetections.entries()).map(([cls, dets]) => (
                <DetectionGroup
                  key={cls}
                  detectionClass={cls}
                  detections={dets}
                  isExpanded={expandedClasses.has(cls)}
                  onToggle={() => toggleClassExpanded(cls)}
                  selectedIds={selectedIds}
                  onDetectionSelect={onDetectionSelect}
                  onDetectionHover={onDetectionHover}
                />
              ))}
              {groupedDetections.size === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No detections</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Properties Tab */}
        {activeTab === 'properties' && (
          <div className="p-3 space-y-4">
            {selectedDetections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <SlidersHorizontal className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Select a detection to view properties
                </p>
              </div>
            ) : (
              <>
                {/* Selection Header */}
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {selectedDetections.length === 1
                    ? '1 Detection Selected'
                    : `${selectedDetections.length} Detections Selected`}
                </div>

                {/* Class Selector */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Class
                  </span>
                  <ClassSelector
                    selectedDetections={selectedDetections}
                    onClassChange={(newClass) => {
                      const ids = selectedDetections.map((d) => d.id);
                      onClassChange(ids, newClass);
                    }}
                  />
                </div>

                {/* Selection Properties (status, measurements) */}
                <SelectionProperties selectedDetections={selectedDetections} />

                {/* Selected Items List (for multi-select context) */}
                {selectedDetections.length > 1 && (
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Selected Items
                    </span>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {selectedDetections.map((d, idx) => (
                        <div
                          key={d.id}
                          className="text-xs text-gray-600 dark:text-gray-300 flex justify-between"
                        >
                          <span className="capitalize">{d.class || 'Unknown'} #{idx + 1}</span>
                          <span>{d.area_sf?.toFixed(1)} SF</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Totals Tab */}
        {activeTab === 'totals' && (
          <div className="p-3 space-y-4">
            {/* Elevation Totals */}
            {elevationCalcs && (
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Current Elevation
                </h3>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-1">
                  <TotalsRow label="Gross Facade" value={elevationCalcs.gross_facade_sf} unit="SF" highlight />
                  <TotalsRow label="Total Openings" value={elevationCalcs.total_openings_sf} unit="SF" indent />
                  <TotalsRow label="Net Siding" value={elevationCalcs.net_siding_sf} unit="SF" highlight />

                  <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

                  <TotalsRow label="Windows" value={elevationCalcs.window_count} />
                  <TotalsRow label="Window Area" value={elevationCalcs.window_area_sf} unit="SF" indent />
                  <TotalsRow label="Window Perimeter" value={formatLinearFeet(elevationCalcs.window_perimeter_lf)} indent />

                  <TotalsRow label="Doors" value={elevationCalcs.door_count} />
                  <TotalsRow label="Door Area" value={elevationCalcs.door_area_sf} unit="SF" indent />

                  <TotalsRow label="Garages" value={elevationCalcs.garage_count} />
                  <TotalsRow label="Garage Area" value={elevationCalcs.garage_area_sf} unit="SF" indent />

                  <TotalsRow label="Gables" value={elevationCalcs.gable_count} />
                  <TotalsRow label="Gable Rake" value={formatLinearFeet(elevationCalcs.gable_rake_lf)} indent />
                </div>
              </div>
            )}

            {/* Job Totals */}
            {jobTotals && (
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  All Elevations
                </h3>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 space-y-1">
                  <TotalsRow label="Total Gross Facade" value={jobTotals.total_gross_facade_sf} unit="SF" highlight />
                  <TotalsRow label="Total Openings" value={jobTotals.total_openings_sf} unit="SF" indent />
                  <TotalsRow label="Total Net Siding" value={jobTotals.total_net_siding_sf} unit="SF" highlight />
                  <TotalsRow label="Siding Squares" value={jobTotals.siding_squares} unit="SQ" highlight />

                  <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

                  <TotalsRow label="Total Windows" value={jobTotals.total_windows} />
                  <TotalsRow label="Window Head" value={formatLinearFeet(jobTotals.total_window_head_lf)} indent />
                  <TotalsRow label="Window Jamb" value={formatLinearFeet(jobTotals.total_window_jamb_lf)} indent />
                  <TotalsRow label="Window Sill" value={formatLinearFeet(jobTotals.total_window_sill_lf)} indent />

                  <TotalsRow label="Total Doors" value={jobTotals.total_doors} />
                  <TotalsRow label="Door Head" value={formatLinearFeet(jobTotals.total_door_head_lf)} indent />
                  <TotalsRow label="Door Jamb" value={formatLinearFeet(jobTotals.total_door_jamb_lf)} indent />

                  <TotalsRow label="Total Garages" value={jobTotals.total_garages} />
                  <TotalsRow label="Garage Head" value={formatLinearFeet(jobTotals.total_garage_head_lf)} indent />

                  <TotalsRow label="Total Gables" value={jobTotals.total_gables} />
                  <TotalsRow label="Gable Rake" value={formatLinearFeet(jobTotals.total_gable_rake_lf)} indent />

                  <TotalsRow label="Roof Eave" value={formatLinearFeet(jobTotals.total_roof_eave_lf)} />
                </div>
              </div>
            )}

            {!elevationCalcs && !jobTotals && (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Calculator className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No calculations available</p>
                <p className="text-xs mt-1">Verify detections to generate totals</p>
              </div>
            )}

            {/* Phase 4 Enhanced Calculations */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setPhase4Expanded(!phase4Expanded)}
                className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <span className="flex items-center gap-2">
                  Enhanced Calculations (Phase 4)
                  {phase4Data?.wall_heights && (
                    <span
                      className={`
                        text-[10px] px-1.5 py-0.5 rounded font-medium normal-case
                        ${phase4Data.wall_heights.source === 'ocr'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }
                      `}
                    >
                      {phase4Data.wall_heights.source === 'ocr' ? 'OCR' : 'Estimated'}
                    </span>
                  )}
                </span>
                {phase4Expanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              {phase4Expanded && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 space-y-3">
                  {phase4Loading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin mr-2 text-purple-600" />
                      <span className="text-sm text-gray-500">Loading...</span>
                    </div>
                  ) : phase4Data ? (
                    <>
                      {/* Wall Heights */}
                      {phase4Data.wall_heights && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400">
                            <Building2 className="w-3 h-3" />
                            Wall Heights
                          </div>
                          <div className="space-y-0.5 pl-4">
                            <TotalsRow label="1st Floor" value={phase4Data.wall_heights.first_floor_ft} unit="ft" />
                            {phase4Data.wall_heights.second_floor_ft !== null && (
                              <TotalsRow label="2nd Floor" value={phase4Data.wall_heights.second_floor_ft} unit="ft" />
                            )}
                            <TotalsRow label="Total Height" value={phase4Data.wall_heights.total_wall_height_ft} unit="ft" highlight />
                            <TotalsRow label="Stories" value={phase4Data.wall_heights.story_count} />
                          </div>
                        </div>
                      )}

                      {/* Corner Calculations */}
                      {phase4Data.corners && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400">
                            <CornerDownRight className="w-3 h-3" />
                            Corner Details
                          </div>
                          <div className="space-y-0.5 pl-4">
                            <TotalsRow
                              label="Outside Corners"
                              value={`${phase4Data.corners.outside_corners_count} (${phase4Data.corners.outside_corners_lf.toFixed(0)} LF)`}
                            />
                            <TotalsRow
                              label="Inside Corners"
                              value={`${phase4Data.corners.inside_corners_count} (${phase4Data.corners.inside_corners_lf.toFixed(0)} LF)`}
                            />
                            <TotalsRow label="Total Corner LF" value={phase4Data.corners.total_corner_lf} unit="LF" highlight />
                            <TotalsRow label="Corner Posts" value={`${phase4Data.corners.corner_posts_needed} pcs`} />
                            <TotalsRow label="J-Channel" value={`${phase4Data.corners.j_channel_pieces_needed} pcs`} />
                          </div>
                        </div>
                      )}

                      {/* Perimeter Elements */}
                      {phase4Data.perimeter && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400">
                            <Ruler className="w-3 h-3" />
                            Perimeter Elements
                          </div>
                          <div className="space-y-0.5 pl-4">
                            <TotalsRow label="Building Perimeter" value={phase4Data.perimeter.building_perimeter_lf} unit="LF" highlight />
                            <TotalsRow
                              label="Starter Strip"
                              value={`${phase4Data.perimeter.starter_strip_lf.toFixed(0)} LF (${phase4Data.perimeter.starter_strip_pieces} pcs)`}
                            />
                            {phase4Data.perimeter.water_table_lf > 0 && (
                              <TotalsRow label="Water Table" value={phase4Data.perimeter.water_table_lf} unit="LF" />
                            )}
                            {phase4Data.perimeter.band_board_lf > 0 && (
                              <TotalsRow label="Band Board" value={phase4Data.perimeter.band_board_lf} unit="LF" />
                            )}
                            {phase4Data.perimeter.frieze_board_lf > 0 && (
                              <TotalsRow label="Frieze Board" value={phase4Data.perimeter.frieze_board_lf} unit="LF" />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Trim Totals */}
                      {phase4Data.trim_totals && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-purple-700 dark:text-purple-400">
                            Trim Perimeters
                          </div>
                          <div className="space-y-0.5 pl-4">
                            <TotalsRow label="Window Perimeter" value={phase4Data.trim_totals.window_perimeter_lf} unit="LF" />
                            <TotalsRow label="Door Perimeter" value={phase4Data.trim_totals.door_perimeter_lf} unit="LF" />
                            {phase4Data.trim_totals.gable_rake_lf > 0 && (
                              <TotalsRow label="Gable Rake" value={phase4Data.trim_totals.gable_rake_lf} unit="LF" />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Show message if phase4Data exists but has no sections */}
                      {!phase4Data.wall_heights && !phase4Data.corners && !phase4Data.perimeter && !phase4Data.trim_totals && (
                        <div className="text-center py-2">
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            No enhanced calculation data available yet.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                        Enhanced calculations not yet generated.
                      </p>
                      <button
                        type="button"
                        onClick={handleCalculatePhase4}
                        disabled={phase4Loading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 rounded-md hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50"
                      >
                        {phase4Loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Calculating...
                          </>
                        ) : (
                          <>
                            <Calculator className="w-4 h-4" />
                            Calculate Now
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default DetectionSidebar;
