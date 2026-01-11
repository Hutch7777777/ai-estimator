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
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import type {
  ExtractionPage,
  ExtractionDetection,
  ExtractionElevationCalcs,
  ExtractionJobTotals,
  DetectionClass,
  AllDetectionClasses,
  DetectionStatus,
} from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS, CONFIDENCE_THRESHOLDS } from '@/lib/types/extraction';
import ClassSelector from './PropertiesPanel/ClassSelector';
import SelectionProperties from './PropertiesPanel/SelectionProperties';
import MaterialAssignment from './PropertiesPanel/MaterialAssignment';
import NotesField from './PropertiesPanel/NotesField';
import {
  getClassDerivedMeasurements,
  rectToPolygonPoints,
  calculateBuildingMeasurements,
  calculateLineMeasurements,
  calculateAreaMeasurements,
} from '@/lib/utils/polygonUtils';

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
  onStatusChange: (detectionIds: string[], newStatus: DetectionStatus) => void;
  onMaterialAssign: (detectionIds: string[], materialId: string | null) => void;
  onNotesChange: (detectionIds: string[], notes: string) => void;
  // Scale for dynamic measurement calculation
  pixelsPerFoot: number;
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

/**
 * Calculate real-world measurements from pixel dimensions using scale ratio.
 * This ensures measurements update dynamically when scale is recalibrated.
 */
function calculateMeasurementsFromPixels(
  detection: ExtractionDetection,
  pixelsPerFoot: number
): { widthFt: number; heightFt: number; areaSf: number; perimeterLf: number } {
  const widthFt = (detection.pixel_width || 0) / pixelsPerFoot;
  const heightFt = (detection.pixel_height || 0) / pixelsPerFoot;
  const areaSf = widthFt * heightFt;
  const perimeterLf = 2 * (widthFt + heightFt);
  return { widthFt, heightFt, areaSf, perimeterLf };
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
  pixelsPerFoot: number;
}

const DetectionItem = memo(function DetectionItem({
  detection,
  index,
  isSelected,
  onSelect,
  onHoverStart,
  onHoverEnd,
  pixelsPerFoot,
}: DetectionItemProps) {
  const color = DETECTION_CLASS_COLORS[detection.class] || DETECTION_CLASS_COLORS[''];
  const isLowConfidence = detection.confidence < CONFIDENCE_THRESHOLDS.medium;
  const isDeleted = detection.status === 'deleted';

  // Calculate measurements dynamically from pixel dimensions
  const { widthFt, heightFt, areaSf } = calculateMeasurementsFromPixels(detection, pixelsPerFoot);

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

      {/* Dimensions - calculated from pixel dimensions and current scale */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-gray-100 truncate">
          {formatDimension(widthFt)} × {formatDimension(heightFt)}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {formatArea(areaSf)}
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
  pixelsPerFoot: number;
}

const DetectionGroup = memo(function DetectionGroup({
  detectionClass,
  detections,
  isExpanded,
  onToggle,
  selectedIds,
  onDetectionSelect,
  onDetectionHover,
  pixelsPerFoot,
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
              pixelsPerFoot={pixelsPerFoot}
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
  onStatusChange,
  onMaterialAssign,
  onNotesChange,
  pixelsPerFoot,
}: DetectionSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('detections');
  const [expandedClasses, setExpandedClasses] = useState<Set<AllDetectionClasses>>(
    new Set(CLASS_ORDER)
  );
  const [filterStatus, setFilterStatus] = useState<DetectionStatus | 'all'>('all');

  // Auto-switch to Properties tab when selection changes from empty to non-empty
  const prevSelectedCountRef = useRef(0);
  useEffect(() => {
    if (prevSelectedCountRef.current === 0 && selectedDetections.length > 0) {
      setActiveTab('properties');
    }
    prevSelectedCountRef.current = selectedDetections.length;
  }, [selectedDetections.length]);

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

  // Get current page for scale ratio
  const currentPage = useMemo(() => {
    return pages.find((p) => p.id === currentPageId) || null;
  }, [pages, currentPageId]);

  // Calculate live derived measurements from current page detections (HOVER-style)
  const liveDerivedTotals = useMemo(() => {
    if (!currentPage?.scale_ratio || currentPage.scale_ratio <= 0) {
      return null;
    }

    const scaleRatio = currentPage.scale_ratio;
    // Filter out roof detections - they belong on roof plans, not elevations
    const pageDetections = detections.filter(
      (d) => d.page_id === currentPage.id && d.status !== 'deleted' && d.class !== 'roof'
    );

    const totals = {
      // FACADE (building/exterior wall)
      buildingCount: 0,
      buildingAreaSf: 0,
      buildingPerimeterLf: 0,
      buildingLevelStarterLf: 0,
      // WINDOWS
      windowCount: 0,
      windowAreaSf: 0,
      windowPerimeterLf: 0,
      windowHeadLf: 0,
      windowJambLf: 0,
      windowSillLf: 0,
      // DOORS
      doorCount: 0,
      doorAreaSf: 0,
      doorPerimeterLf: 0,
      doorHeadLf: 0,
      doorJambLf: 0,
      // GARAGES
      garageCount: 0,
      garageAreaSf: 0,
      garagePerimeterLf: 0,
      garageHeadLf: 0,
      garageJambLf: 0,
      // GABLES
      gableCount: 0,
      gableAreaSf: 0,
      gableRakeLf: 0,
      // CORNERS
      insideCornerCount: 0,
      insideCornerLf: 0,
      outsideCornerCount: 0,
      outsideCornerLf: 0,
      // ROOFLINE (line-type measurements)
      eavesCount: 0,
      eavesLf: 0,
      rakesCount: 0,
      rakesLf: 0,
      ridgeCount: 0,
      ridgeLf: 0,
      valleyCount: 0,
      valleyLf: 0,
      // SOFFIT (area)
      soffitCount: 0,
      soffitAreaSf: 0,
      // FASCIA (line)
      fasciaCount: 0,
      fasciaLf: 0,
      // GUTTERS
      gutterCount: 0,
      gutterLf: 0,
      downspoutCount: 0,
      // SIDING (net area = building - openings)
      sidingNetSf: 0,
    };

    // Track total openings for net siding calculation
    let totalOpeningsSf = 0;

    for (const detection of pageDetections) {
      // Cast to string for comparison with classes that may not be in DetectionClass type
      const cls = detection.class as string;

      // Get polygon points (use existing or convert from bounding box)
      const points = detection.polygon_points && detection.polygon_points.length > 0
        ? detection.polygon_points
        : rectToPolygonPoints({
            pixel_x: detection.pixel_x,
            pixel_y: detection.pixel_y,
            pixel_width: detection.pixel_width,
            pixel_height: detection.pixel_height,
          });

      // Building/Facade class (handle both underscore and space versions)
      if (cls === 'building' || cls === 'exterior_wall' || cls === 'exterior wall') {
        const buildingMeasurements = calculateBuildingMeasurements(points, scaleRatio);
        totals.buildingCount++;
        totals.buildingAreaSf += buildingMeasurements.area_sf;
        totals.buildingPerimeterLf += buildingMeasurements.perimeter_lf;
        totals.buildingLevelStarterLf += buildingMeasurements.level_starter_lf;
        continue;
      }

      // Window/Door/Garage/Gable derived measurements
      const derived = getClassDerivedMeasurements(cls, points, scaleRatio);
      const areaMeasurement = calculateAreaMeasurements(points, scaleRatio);

      if (cls === 'window' && derived && 'head_lf' in derived) {
        totals.windowCount++;
        totals.windowAreaSf += areaMeasurement.area_sf;
        totals.windowPerimeterLf += areaMeasurement.perimeter_lf;
        totals.windowHeadLf += derived.head_lf;
        totals.windowJambLf += derived.jamb_lf;
        totals.windowSillLf += (derived as { sill_lf?: number }).sill_lf || 0;
        totalOpeningsSf += areaMeasurement.area_sf;
      } else if (cls === 'door' && derived && 'head_lf' in derived) {
        totals.doorCount++;
        totals.doorAreaSf += areaMeasurement.area_sf;
        totals.doorPerimeterLf += areaMeasurement.perimeter_lf;
        totals.doorHeadLf += derived.head_lf;
        totals.doorJambLf += derived.jamb_lf;
        totalOpeningsSf += areaMeasurement.area_sf;
      } else if (cls === 'garage' && derived && 'head_lf' in derived) {
        totals.garageCount++;
        totals.garageAreaSf += areaMeasurement.area_sf;
        totals.garagePerimeterLf += areaMeasurement.perimeter_lf;
        totals.garageHeadLf += derived.head_lf;
        totals.garageJambLf += derived.jamb_lf;
        totalOpeningsSf += areaMeasurement.area_sf;
      } else if (cls === 'gable' && derived && 'rake_lf' in derived) {
        totals.gableCount++;
        totals.gableAreaSf += areaMeasurement.area_sf;
        totals.gableRakeLf += derived.rake_lf;
      } else if (cls === 'siding') {
        // Siding zones are handled by the overlay, not individual totals
      } else if (cls === 'soffit') {
        totals.soffitCount++;
        totals.soffitAreaSf += areaMeasurement.area_sf;
      } else if (cls === 'inside_corner' || cls === 'inside corner') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.insideCornerCount++;
        totals.insideCornerLf += lineMeasurement.length_lf;
      } else if (cls === 'outside_corner' || cls === 'outside corner') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.outsideCornerCount++;
        totals.outsideCornerLf += lineMeasurement.length_lf;
      } else if (cls === 'fascia') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.fasciaCount++;
        totals.fasciaLf += lineMeasurement.length_lf;
      } else if (cls === 'gutter') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.gutterCount++;
        totals.gutterLf += lineMeasurement.length_lf;
      } else if (cls === 'downspout') {
        totals.downspoutCount++;
      }

      // Line-type detections (roof elements)
      if (cls === 'eave' || cls === 'roof_eave') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.eavesCount++;
        totals.eavesLf += lineMeasurement.length_lf;
      } else if (cls === 'rake' || cls === 'roof_rake') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.rakesCount++;
        totals.rakesLf += lineMeasurement.length_lf;
      } else if (cls === 'ridge' || cls === 'roof_ridge') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.ridgeCount++;
        totals.ridgeLf += lineMeasurement.length_lf;
      } else if (cls === 'valley' || cls === 'roof_valley') {
        const lineMeasurement = calculateLineMeasurements(points, scaleRatio);
        totals.valleyCount++;
        totals.valleyLf += lineMeasurement.length_lf;
      }
    }

    // Calculate net siding (building area minus openings)
    totals.sidingNetSf = Math.max(0, totals.buildingAreaSf - totalOpeningsSf);

    return totals;
  }, [detections, currentPage]);

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
                  pixelsPerFoot={pixelsPerFoot}
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
                <SelectionProperties selectedDetections={selectedDetections} pixelsPerFoot={pixelsPerFoot} />

                {/* Quick Actions */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </span>
                  <div className="flex gap-2">
                    {/* Verify Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const ids = selectedDetections.map((d) => d.id);
                        onStatusChange(ids, 'verified');
                      }}
                      disabled={selectedDetections.every((d) => d.status === 'verified')}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Verify
                    </button>

                    {/* Reset Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const ids = selectedDetections.map((d) => d.id);
                        onStatusChange(ids, 'auto');
                      }}
                      disabled={selectedDetections.every((d) => d.status === 'auto')}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const ids = selectedDetections.map((d) => d.id);
                        onStatusChange(ids, 'deleted');
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

                {/* Material Assignment */}
                <MaterialAssignment
                  selectedDetections={selectedDetections}
                  onMaterialAssign={onMaterialAssign}
                />

                {/* Notes Field */}
                <NotesField
                  selectedDetections={selectedDetections}
                  onNotesChange={onNotesChange}
                />

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
            {/* Live Derived Measurements (calculated from current detections - HOVER style) */}
            {liveDerivedTotals && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Live Calculations
                  </h3>
                  <span className="text-xs text-gray-400 dark:text-gray-500">(Current Page)</span>
                </div>

                {/* Facade Summary (HOVER-style) */}
                {liveDerivedTotals.buildingAreaSf > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase">
                      Facade Summary
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      <span>Gross Area:</span>
                      <span className="text-right font-mono font-medium">{liveDerivedTotals.buildingAreaSf.toFixed(1)} SF</span>
                      <span>Net Siding:</span>
                      <span className="text-right font-mono font-medium text-green-600 dark:text-green-400">{liveDerivedTotals.sidingNetSf.toFixed(1)} SF</span>
                      <span>Perimeter:</span>
                      <span className="text-right font-mono">{liveDerivedTotals.buildingPerimeterLf.toFixed(1)} LF</span>
                      <span>Level Starter:</span>
                      <span className="text-right font-mono">{liveDerivedTotals.buildingLevelStarterLf.toFixed(1)} LF</span>
                    </div>
                  </div>
                )}

                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 space-y-3">
                  {/* Windows */}
                  {liveDerivedTotals.windowCount > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        Windows ({liveDerivedTotals.windowCount}) — {liveDerivedTotals.windowAreaSf.toFixed(1)} SF
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400 pl-2">
                        <span>Perimeter:</span>
                        <span className="text-right font-mono">{liveDerivedTotals.windowPerimeterLf.toFixed(1)} LF</span>
                        <span>Head:</span>
                        <span className="text-right font-mono">{liveDerivedTotals.windowHeadLf.toFixed(1)} LF</span>
                        <span>Jamb:</span>
                        <span className="text-right font-mono">{liveDerivedTotals.windowJambLf.toFixed(1)} LF</span>
                        <span>Sill:</span>
                        <span className="text-right font-mono">{liveDerivedTotals.windowSillLf.toFixed(1)} LF</span>
                      </div>
                    </div>
                  )}

                  {/* Doors */}
                  {liveDerivedTotals.doorCount > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-green-600 dark:text-green-400">
                        Doors ({liveDerivedTotals.doorCount}) — {liveDerivedTotals.doorAreaSf.toFixed(1)} SF
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400 pl-2">
                        <span>Perimeter:</span>
                        <span className="text-right font-mono">{liveDerivedTotals.doorPerimeterLf.toFixed(1)} LF</span>
                        <span>Head:</span>
                        <span className="text-right font-mono">{liveDerivedTotals.doorHeadLf.toFixed(1)} LF</span>
                        <span>Jamb:</span>
                        <span className="text-right font-mono">{liveDerivedTotals.doorJambLf.toFixed(1)} LF</span>
                      </div>
                    </div>
                  )}

                  {/* Garages */}
                  {liveDerivedTotals.garageCount > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-orange-600 dark:text-orange-400">
                        Garages ({liveDerivedTotals.garageCount}) — {liveDerivedTotals.garageAreaSf.toFixed(1)} SF
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400 pl-2">
                        <span>Perimeter:</span>
                        <span className="text-right font-mono">{liveDerivedTotals.garagePerimeterLf.toFixed(1)} LF</span>
                        <span>Head:</span>
                        <span className="text-right font-mono">{liveDerivedTotals.garageHeadLf.toFixed(1)} LF</span>
                        <span>Jamb:</span>
                        <span className="text-right font-mono">{liveDerivedTotals.garageJambLf.toFixed(1)} LF</span>
                      </div>
                    </div>
                  )}

                  {/* Opening Totals */}
                  {(liveDerivedTotals.windowCount > 0 || liveDerivedTotals.doorCount > 0 || liveDerivedTotals.garageCount > 0) && (
                    <div className="border-t border-green-200 dark:border-green-800 pt-2 mt-2">
                      <div className="grid grid-cols-2 gap-x-4 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">Total Opening Area:</span>
                        <span className="text-right font-mono font-medium text-gray-700 dark:text-gray-300">{(liveDerivedTotals.windowAreaSf + liveDerivedTotals.doorAreaSf + liveDerivedTotals.garageAreaSf).toFixed(1)} SF</span>
                        <span className="text-gray-500 dark:text-gray-400">Total Opening Perim:</span>
                        <span className="text-right font-mono font-medium text-gray-700 dark:text-gray-300">{(liveDerivedTotals.windowPerimeterLf + liveDerivedTotals.doorPerimeterLf + liveDerivedTotals.garagePerimeterLf).toFixed(1)} LF</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* TRIM SUMMARY */}
                {(liveDerivedTotals.windowHeadLf > 0 || liveDerivedTotals.doorHeadLf > 0 || liveDerivedTotals.garageHeadLf > 0) && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase">
                      Trim Summary
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      <span>Total Head:</span>
                      <span className="text-right font-mono">{(liveDerivedTotals.windowHeadLf + liveDerivedTotals.doorHeadLf + liveDerivedTotals.garageHeadLf).toFixed(1)} LF</span>
                      <span>Total Jamb:</span>
                      <span className="text-right font-mono">{(liveDerivedTotals.windowJambLf + liveDerivedTotals.doorJambLf + liveDerivedTotals.garageJambLf).toFixed(1)} LF</span>
                      <span>Total Sill:</span>
                      <span className="text-right font-mono">{liveDerivedTotals.windowSillLf.toFixed(1)} LF</span>
                    </div>
                    <div className="border-t border-amber-200 dark:border-amber-800 pt-2 mt-1">
                      <div className="grid grid-cols-2 gap-x-4 text-xs">
                        <span className="font-medium text-amber-700 dark:text-amber-300">Total Trim:</span>
                        <span className="text-right font-mono font-medium text-amber-700 dark:text-amber-300">{(liveDerivedTotals.windowHeadLf + liveDerivedTotals.doorHeadLf + liveDerivedTotals.garageHeadLf + liveDerivedTotals.windowJambLf + liveDerivedTotals.doorJambLf + liveDerivedTotals.garageJambLf + liveDerivedTotals.windowSillLf).toFixed(1)} LF</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Gables */}
                {liveDerivedTotals.gableCount > 0 && (
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-medium text-purple-600 dark:text-purple-400">
                      Gables ({liveDerivedTotals.gableCount}) — {liveDerivedTotals.gableAreaSf.toFixed(1)} SF
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400 pl-2">
                      <span>Rake:</span>
                      <span className="text-right font-mono">{liveDerivedTotals.gableRakeLf.toFixed(1)} LF</span>
                    </div>
                  </div>
                )}

                {/* Corners */}
                {(liveDerivedTotals.insideCornerCount > 0 || liveDerivedTotals.outsideCornerCount > 0) && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      Corners
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      {liveDerivedTotals.insideCornerCount > 0 && (
                        <>
                          <span>Inside ({liveDerivedTotals.insideCornerCount}):</span>
                          <span className="text-right font-mono">{liveDerivedTotals.insideCornerLf.toFixed(1)} LF</span>
                        </>
                      )}
                      {liveDerivedTotals.outsideCornerCount > 0 && (
                        <>
                          <span>Outside ({liveDerivedTotals.outsideCornerCount}):</span>
                          <span className="text-right font-mono">{liveDerivedTotals.outsideCornerLf.toFixed(1)} LF</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Soffit & Fascia */}
                {(liveDerivedTotals.soffitAreaSf > 0 || liveDerivedTotals.fasciaLf > 0) && (
                  <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-teal-700 dark:text-teal-300 uppercase">
                      Soffit & Fascia
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      {liveDerivedTotals.soffitAreaSf > 0 && (
                        <>
                          <span>Soffit ({liveDerivedTotals.soffitCount}):</span>
                          <span className="text-right font-mono">{liveDerivedTotals.soffitAreaSf.toFixed(1)} SF</span>
                        </>
                      )}
                      {liveDerivedTotals.fasciaLf > 0 && (
                        <>
                          <span>Fascia ({liveDerivedTotals.fasciaCount}):</span>
                          <span className="text-right font-mono">{liveDerivedTotals.fasciaLf.toFixed(1)} LF</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Roofline */}
                {(liveDerivedTotals.eavesLf > 0 || liveDerivedTotals.rakesLf > 0 || liveDerivedTotals.ridgeLf > 0 || liveDerivedTotals.valleyLf > 0) && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                      Roofline
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      {liveDerivedTotals.eavesLf > 0 && (
                        <>
                          <span>Eaves ({liveDerivedTotals.eavesCount}):</span>
                          <span className="text-right font-mono">{liveDerivedTotals.eavesLf.toFixed(1)} LF</span>
                        </>
                      )}
                      {liveDerivedTotals.rakesLf > 0 && (
                        <>
                          <span>Rakes ({liveDerivedTotals.rakesCount}):</span>
                          <span className="text-right font-mono">{liveDerivedTotals.rakesLf.toFixed(1)} LF</span>
                        </>
                      )}
                      {liveDerivedTotals.ridgeLf > 0 && (
                        <>
                          <span>Ridge ({liveDerivedTotals.ridgeCount}):</span>
                          <span className="text-right font-mono">{liveDerivedTotals.ridgeLf.toFixed(1)} LF</span>
                        </>
                      )}
                      {liveDerivedTotals.valleyLf > 0 && (
                        <>
                          <span>Valley ({liveDerivedTotals.valleyCount}):</span>
                          <span className="text-right font-mono">{liveDerivedTotals.valleyLf.toFixed(1)} LF</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Gutters */}
                {(liveDerivedTotals.gutterLf > 0 || liveDerivedTotals.downspoutCount > 0) && (
                  <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 uppercase">
                      Gutters
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      {liveDerivedTotals.gutterLf > 0 && (
                        <>
                          <span>Gutters ({liveDerivedTotals.gutterCount}):</span>
                          <span className="text-right font-mono">{liveDerivedTotals.gutterLf.toFixed(1)} LF</span>
                        </>
                      )}
                      {liveDerivedTotals.downspoutCount > 0 && (
                        <>
                          <span>Downspouts:</span>
                          <span className="text-right font-mono">{liveDerivedTotals.downspoutCount}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Show if no applicable detections */}
                {liveDerivedTotals.buildingAreaSf === 0 &&
                  liveDerivedTotals.windowCount === 0 &&
                  liveDerivedTotals.doorCount === 0 &&
                  liveDerivedTotals.garageCount === 0 &&
                  liveDerivedTotals.gableCount === 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                      No detections on this page
                    </div>
                  )}
              </div>
            )}

            {/* Show message if no scale is set */}
            {!liveDerivedTotals && currentPage && (
              <div className="text-xs text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                ⚠️ Calibrate scale to see live measurements
              </div>
            )}

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
          </div>
        )}
      </div>
    </div>
  );
});

export default DetectionSidebar;
