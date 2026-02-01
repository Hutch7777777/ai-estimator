'use client';

import React, { memo, useState, useMemo, useEffect, useRef } from 'react';
import {
  FileImage,
  Calculator,
  SlidersHorizontal,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  ExtractionPage,
  ExtractionDetection,
  DetectionClass,
  DetectionStatus,
  LiveDerivedTotals,
  ExtractionJob,
  ExtractionJobTotals,
} from '@/lib/types/extraction';
import ClassSelector from './PropertiesPanel/ClassSelector';
import { ColorPicker } from './PropertiesPanel/ColorPicker';
import SelectionProperties from './PropertiesPanel/SelectionProperties';
import MaterialAssignment from './PropertiesPanel/MaterialAssignment';
import NotesField from './PropertiesPanel/NotesField';
import { getDetectionColor } from '@/lib/types/extraction';
import { getMaterialById, type MaterialItem } from '@/lib/hooks/useMaterialSearch';
import { Badge } from '@/components/ui/badge';

// =============================================================================
// Types
// =============================================================================

export interface DetectionSidebarProps {
  pages: ExtractionPage[];
  currentPageId: string | null;
  onPageSelect: (pageId: string) => void;
  detections: ExtractionDetection[];
  // Selection properties (for Properties tab)
  selectedDetections: ExtractionDetection[];
  onClassChange: (detectionIds: string[], newClass: DetectionClass) => void;
  onColorChange?: (detectionIds: string[], color: string | null) => void;
  onStatusChange: (detectionIds: string[], newStatus: DetectionStatus) => void;
  onMaterialAssign: (detectionIds: string[], materialId: string | null) => void;
  onNotesChange: (detectionIds: string[], notes: string) => void;
  /** Callback when user edits the material price */
  onPriceOverride?: (detectionIds: string[], price: number | null) => void;
  /** Callback to assign material AND set price override in one action */
  onMaterialAssignWithPrice?: (detectionIds: string[], materialId: string, priceOverride: number) => void;
  pixelsPerFoot: number;
  // Multi-select mode toggle
  multiSelectMode: boolean;
  onMultiSelectModeChange: (enabled: boolean) => void;
  // Live derived totals (calculated in parent, passed down for display)
  liveDerivedTotals: LiveDerivedTotals | null;
  // All pages totals (aggregated across all elevation pages)
  allPagesTotals?: LiveDerivedTotals | null;
  // Job and totals from intelligent analysis aggregation
  job?: ExtractionJob | null;
  jobTotals?: ExtractionJobTotals | null;
}

type TabType = 'pages' | 'properties' | 'totals';

// =============================================================================
// Constants
// =============================================================================

const TABS: { id: TabType; icon: typeof FileImage; label: string }[] = [
  { id: 'pages', icon: FileImage, label: 'Pages' },
  { id: 'properties', icon: SlidersHorizontal, label: 'Properties' },
  { id: 'totals', icon: Calculator, label: 'Totals' },
];



// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get display label for page type
 */
function getPageTypeLabel(page: ExtractionPage): string {
  // If it's an elevation with a name, use that
  if (page.page_type === 'elevation' && page.elevation_name) {
    return page.elevation_name; // "front", "rear", etc.
  }

  // Otherwise show the page type
  const typeLabels: Record<string, string> = {
    elevation: 'elevation',
    floor_plan: 'floor plan',
    framing: 'framing',
    site_plan: 'site',
    roof_plan: 'roof',
    details: 'details',
    schedule: 'schedule',
    section: 'section',
    cover: 'cover',
    electrical: 'electrical',
    plumbing: 'plumbing',
    foundation: 'foundation',
    other: 'other',
  };

  return typeLabels[page.page_type || ''] || page.page_type || 'unclassified';
}

/**
 * Get background color for page type badge
 */
function getPageTypeColor(pageType: string | null): string {
  const colors: Record<string, string> = {
    elevation: 'bg-green-600',
    floor_plan: 'bg-blue-600',
    framing: 'bg-purple-600',
    site_plan: 'bg-amber-600',
    roof_plan: 'bg-cyan-600',
    details: 'bg-gray-600',
    schedule: 'bg-orange-600',
    section: 'bg-pink-600',
    cover: 'bg-slate-600',
    electrical: 'bg-yellow-600',
    plumbing: 'bg-indigo-600',
    foundation: 'bg-stone-600',
    other: 'bg-gray-500',
  };
  return colors[pageType || ''] || 'bg-gray-500';
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative w-full aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all
        ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 dark:border-gray-700'}
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

      {/* Page type/classification badge - shown for ALL pages */}
      <div
        className={`absolute top-1 right-1 ${getPageTypeColor(page.page_type)} text-white text-xs px-1.5 py-0.5 rounded capitalize`}
      >
        {getPageTypeLabel(page)}
      </div>

      {/* Detection count */}
      {detectionCount > 0 && (
        <div className="absolute bottom-1 right-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">
          {detectionCount}
        </div>
      )}
    </button>
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
  selectedDetections,
  onClassChange,
  onColorChange,
  onStatusChange,
  onMaterialAssign,
  onNotesChange,
  onPriceOverride,
  onMaterialAssignWithPrice,
  pixelsPerFoot,
  multiSelectMode,
  onMultiSelectModeChange,
  liveDerivedTotals,
  allPagesTotals,
  job,
  jobTotals,
}: DetectionSidebarProps) {
  // Default to 'pages' tab for quick page navigation
  const [activeTab, setActiveTab] = useState<TabType>('pages');
  // Toggle between current page and all pages totals
  const [totalsScope, setTotalsScope] = useState<'current' | 'all'>('current');
  // Assigned material for display
  const [assignedMaterial, setAssignedMaterial] = useState<MaterialItem | null>(null);

  // Auto-switch to Properties tab when selection changes from empty to non-empty
  const prevSelectedCountRef = useRef(0);
  useEffect(() => {
    if (prevSelectedCountRef.current === 0 && selectedDetections.length > 0) {
      setActiveTab('properties');
    }
    prevSelectedCountRef.current = selectedDetections.length;
  }, [selectedDetections.length]);

  // Extract the material ID as a separate variable to watch directly
  // This ensures the effect triggers when assigned_material_id changes,
  // not just when the selectedDetections array reference changes
  const currentMaterialId = selectedDetections.length === 1
    ? selectedDetections[0]?.assigned_material_id
    : null;

  // Debug: Log when selectedDetections or currentMaterialId changes
  console.log('[DetectionSidebar] selectedDetections changed:', {
    count: selectedDetections.length,
    firstDetectionId: selectedDetections[0]?.id,
    assignedMaterialId: selectedDetections[0]?.assigned_material_id,
    currentMaterialId,
  });

  // Fetch assigned material when selection or material assignment changes
  useEffect(() => {
    console.log('[DetectionSidebar] useEffect triggered, currentMaterialId:', currentMaterialId);
    if (currentMaterialId) {
      getMaterialById(currentMaterialId).then((material) => {
        console.log('[DetectionSidebar] Fetched material:', material?.product_name);
        setAssignedMaterial(material);
      });
    } else {
      console.log('[DetectionSidebar] Clearing assignedMaterial');
      setAssignedMaterial(null);
    }
  }, [currentMaterialId]);

  // Group detections by page for counts (shown on page thumbnails)
  const detectionCountsByPage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const detection of detections) {
      if (detection.status !== 'deleted') {
        counts.set(detection.page_id, (counts.get(detection.page_id) || 0) + 1);
      }
    }
    return counts;
  }, [detections]);

  return (
    <div className="w-72 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={`
                flex-1 flex items-center justify-center py-3 transition-colors relative
                ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              {/* Badge for selection count on Properties tab */}
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

        {/* Properties Tab - Selection-based editing */}
        {activeTab === 'properties' && (
          <div className="p-3 space-y-4">
            {/* Multi-Select Toggle - Always visible */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {selectedDetections.length === 0
                  ? 'No Selection'
                  : selectedDetections.length === 1
                    ? '1 Detection Selected'
                    : `${selectedDetections.length} Detections Selected`}
              </span>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={multiSelectMode}
                  onChange={(e) => onMultiSelectModeChange(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                Multi-Select
              </label>
            </div>

            {selectedDetections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <SlidersHorizontal className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {multiSelectMode
                    ? 'Click detections to add to selection'
                    : 'Select a detection to view properties'}
                </p>
              </div>
            ) : (
              <>

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

                {/* Color Picker */}
                {onColorChange && (
                  <ColorPicker
                    currentColor={
                      selectedDetections.length === 1
                        ? selectedDetections[0].color_override
                        : selectedDetections.every(d => d.color_override === selectedDetections[0].color_override)
                          ? selectedDetections[0].color_override
                          : undefined
                    }
                    defaultColor={getDetectionColor(selectedDetections[0].class)}
                    detectionClass={selectedDetections[0].class}
                    onChange={(color) => {
                      const ids = selectedDetections.map((d) => d.id);
                      onColorChange(ids, color);
                    }}
                  />
                )}

                {/* Selection Properties (status, measurements) */}
                <SelectionProperties selectedDetections={selectedDetections} pixelsPerFoot={pixelsPerFoot} />

                {/* Assigned Material Display */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Assigned Material
                  </span>

                  {selectedDetections.length > 1 ? (
                    // Multi-select: Show summary
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-md p-3 border border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {selectedDetections.filter(d => d.assigned_material_id).length} of {selectedDetections.length} have materials assigned
                      </div>
                    </div>
                  ) : assignedMaterial ? (
                    // Single selection with material assigned
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-md p-3 border border-gray-200 dark:border-gray-700">
                      {/* Product Name - Full display with wrapping */}
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
                        {assignedMaterial.product_name}
                      </div>

                      {/* Manufacturer */}
                      {assignedMaterial.manufacturer && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {assignedMaterial.manufacturer}
                        </div>
                      )}

                      {/* Price and Badges Row */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-xs font-mono text-gray-700 dark:text-gray-300">
                          ${assignedMaterial.material_cost?.toFixed(2) || '0.00'}/{assignedMaterial.unit}
                        </span>

                        {assignedMaterial.is_colorplus && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30">
                            Pre-finished
                          </Badge>
                        )}
                      </div>
                    </div>
                  ) : (
                    // No material assigned
                    <div className="bg-yellow-50 dark:bg-yellow-500/10 rounded-md p-3 border border-yellow-200 dark:border-yellow-500/30">
                      <div className="text-sm text-yellow-700 dark:text-yellow-300">
                        No material assigned
                      </div>
                      <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                        Select a material below
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </span>
                  <div className="flex gap-2">
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
                  onPriceOverride={onPriceOverride ? (price) => {
                    // Pass the price override to parent with detection IDs
                    const ids = selectedDetections.map(d => d.id);
                    onPriceOverride(ids, price);
                  } : undefined}
                  onMaterialAssignWithPrice={onMaterialAssignWithPrice}
                  currentPriceOverride={
                    // Only show override for single selection
                    selectedDetections.length === 1
                      ? selectedDetections[0].material_cost_override
                      : undefined
                  }
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
            {/* Scope Toggle */}
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Live Calculations
              </h3>
              <div className="flex bg-gray-200 dark:bg-gray-700 rounded text-xs">
                <button
                  type="button"
                  onClick={() => setTotalsScope('current')}
                  className={`px-2 py-1 rounded-l transition-colors ${
                    totalsScope === 'current'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Page
                </button>
                <button
                  type="button"
                  onClick={() => setTotalsScope('all')}
                  disabled={!allPagesTotals}
                  className={`px-2 py-1 rounded-r transition-colors ${
                    totalsScope === 'all'
                      ? 'bg-blue-600 text-white'
                      : !allPagesTotals
                        ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  All
                </button>
              </div>
              {/* Show hint when All is disabled */}
              {!allPagesTotals && (
                <div className="text-[10px] text-amber-600 dark:text-amber-500">
                  Calibrate all pages to enable
                </div>
              )}
            </div>

            {/* Live Derived Measurements */}
            {(() => {
              const displayTotals = totalsScope === 'all' && allPagesTotals ? allPagesTotals : liveDerivedTotals;
              if (!displayTotals) return null;

              return (
              <div className="space-y-3">
                {/* Scope indicator */}
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {totalsScope === 'current' ? 'Current Page' : 'All Calibrated Pages'}
                </div>

                {/* Facade Summary (HOVER-style) */}
                {displayTotals.buildingAreaSf > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase">
                      Facade Summary
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      <span>Gross Area:</span>
                      <span className="text-right font-mono font-medium">{displayTotals.buildingAreaSf.toFixed(1)} SF</span>
                      <span>Net Siding:</span>
                      <span className="text-right font-mono font-medium text-green-600 dark:text-green-400">{displayTotals.sidingNetSf.toFixed(1)} SF</span>
                      <span>Perimeter:</span>
                      <span className="text-right font-mono">{displayTotals.buildingPerimeterLf.toFixed(1)} LF</span>
                      <span>Level Starter:</span>
                      <span className="text-right font-mono">{displayTotals.buildingLevelStarterLf.toFixed(1)} LF</span>
                    </div>
                  </div>
                )}

                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 space-y-3">
                  {/* Windows */}
                  {displayTotals.windowCount > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        Windows ({displayTotals.windowCount}) — {displayTotals.windowAreaSf.toFixed(1)} SF
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400 pl-2">
                        <span>Perimeter:</span>
                        <span className="text-right font-mono">{displayTotals.windowPerimeterLf.toFixed(1)} LF</span>
                        <span>Head:</span>
                        <span className="text-right font-mono">{displayTotals.windowHeadLf.toFixed(1)} LF</span>
                        <span>Jamb:</span>
                        <span className="text-right font-mono">{displayTotals.windowJambLf.toFixed(1)} LF</span>
                        <span>Sill:</span>
                        <span className="text-right font-mono">{displayTotals.windowSillLf.toFixed(1)} LF</span>
                      </div>
                    </div>
                  )}

                  {/* Doors */}
                  {displayTotals.doorCount > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-green-600 dark:text-green-400">
                        Doors ({displayTotals.doorCount}) — {displayTotals.doorAreaSf.toFixed(1)} SF
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400 pl-2">
                        <span>Perimeter:</span>
                        <span className="text-right font-mono">{displayTotals.doorPerimeterLf.toFixed(1)} LF</span>
                        <span>Head:</span>
                        <span className="text-right font-mono">{displayTotals.doorHeadLf.toFixed(1)} LF</span>
                        <span>Jamb:</span>
                        <span className="text-right font-mono">{displayTotals.doorJambLf.toFixed(1)} LF</span>
                      </div>
                    </div>
                  )}

                  {/* Garages */}
                  {displayTotals.garageCount > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-orange-600 dark:text-orange-400">
                        Garages ({displayTotals.garageCount}) — {displayTotals.garageAreaSf.toFixed(1)} SF
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400 pl-2">
                        <span>Perimeter:</span>
                        <span className="text-right font-mono">{displayTotals.garagePerimeterLf.toFixed(1)} LF</span>
                        <span>Head:</span>
                        <span className="text-right font-mono">{displayTotals.garageHeadLf.toFixed(1)} LF</span>
                        <span>Jamb:</span>
                        <span className="text-right font-mono">{displayTotals.garageJambLf.toFixed(1)} LF</span>
                      </div>
                    </div>
                  )}

                  {/* Opening Totals */}
                  {(displayTotals.windowCount > 0 || displayTotals.doorCount > 0 || displayTotals.garageCount > 0) && (
                    <div className="border-t border-green-200 dark:border-green-800 pt-2 mt-2">
                      <div className="grid grid-cols-2 gap-x-4 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">Total Opening Area:</span>
                        <span className="text-right font-mono font-medium text-gray-700 dark:text-gray-300">{(displayTotals.windowAreaSf + displayTotals.doorAreaSf + displayTotals.garageAreaSf).toFixed(1)} SF</span>
                        <span className="text-gray-500 dark:text-gray-400">Total Opening Perim:</span>
                        <span className="text-right font-mono font-medium text-gray-700 dark:text-gray-300">{(displayTotals.windowPerimeterLf + displayTotals.doorPerimeterLf + displayTotals.garagePerimeterLf).toFixed(1)} LF</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* TRIM SUMMARY */}
                {(displayTotals.windowHeadLf > 0 || displayTotals.doorHeadLf > 0 || displayTotals.garageHeadLf > 0) && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase">
                      Trim Summary
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      <span>Total Head:</span>
                      <span className="text-right font-mono">{(displayTotals.windowHeadLf + displayTotals.doorHeadLf + displayTotals.garageHeadLf).toFixed(1)} LF</span>
                      <span>Total Jamb:</span>
                      <span className="text-right font-mono">{(displayTotals.windowJambLf + displayTotals.doorJambLf + displayTotals.garageJambLf).toFixed(1)} LF</span>
                      <span>Total Sill:</span>
                      <span className="text-right font-mono">{displayTotals.windowSillLf.toFixed(1)} LF</span>
                    </div>
                    <div className="border-t border-amber-200 dark:border-amber-800 pt-2 mt-1">
                      <div className="grid grid-cols-2 gap-x-4 text-xs">
                        <span className="font-medium text-amber-700 dark:text-amber-300">Total Trim:</span>
                        <span className="text-right font-mono font-medium text-amber-700 dark:text-amber-300">{(displayTotals.windowHeadLf + displayTotals.doorHeadLf + displayTotals.garageHeadLf + displayTotals.windowJambLf + displayTotals.doorJambLf + displayTotals.garageJambLf + displayTotals.windowSillLf).toFixed(1)} LF</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Gables */}
                {displayTotals.gableCount > 0 && (
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-medium text-purple-600 dark:text-purple-400">
                      Gables ({displayTotals.gableCount}) — {displayTotals.gableAreaSf.toFixed(1)} SF
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400 pl-2">
                      <span>Rake:</span>
                      <span className="text-right font-mono">{displayTotals.gableRakeLf.toFixed(1)} LF</span>
                    </div>
                  </div>
                )}

                {/* Corners from Intelligent Analysis or Job Totals */}
                {(() => {
                  // Try aggregation data first (from intelligent analysis)
                  const aggregation = job?.results_summary?.aggregation || jobTotals?.aggregated_data;
                  const hasAggregatedCorners = aggregation?.calculated?.total_corner_lf && aggregation.calculated.total_corner_lf > 0;

                  // Fallback to direct jobTotals columns
                  const hasDirectCorners = !hasAggregatedCorners && (
                    (jobTotals?.inside_corners_count ?? 0) > 0 ||
                    (jobTotals?.outside_corners_count ?? 0) > 0 ||
                    (jobTotals?.inside_corners_lf ?? 0) > 0 ||
                    (jobTotals?.outside_corners_lf ?? 0) > 0
                  );

                  if (hasAggregatedCorners) {
                    return (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 space-y-2">
                        <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase flex items-center gap-2">
                          Corners (Building Total)
                          {aggregation?.heights?.height_source === 'fallback_9ft_per_story' && (
                            <span className="text-[10px] font-normal text-blue-500">(est. heights)</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                          {(aggregation?.corners?.inside_count ?? 0) > 0 && (
                            <>
                              <span>Inside ({aggregation?.corners?.inside_count || 0}):</span>
                              <span className="text-right font-mono">
                                {(aggregation?.calculated?.inside_corner_lf ?? 0).toFixed(1)} LF
                              </span>
                            </>
                          )}
                          {(aggregation?.corners?.outside_count ?? 0) > 0 && (
                            <>
                              <span>Outside ({aggregation?.corners?.outside_count || 0}):</span>
                              <span className="text-right font-mono">
                                {(aggregation?.calculated?.outside_corner_lf ?? 0).toFixed(1)} LF
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (hasDirectCorners) {
                    const insideCount = jobTotals?.inside_corners_count ?? 0;
                    const outsideCount = jobTotals?.outside_corners_count ?? 0;
                    const insideLf = jobTotals?.inside_corners_lf ?? 0;
                    const outsideLf = jobTotals?.outside_corners_lf ?? 0;
                    const totalLf = insideLf + outsideLf;

                    return (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 space-y-2">
                        <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase flex items-center gap-2">
                          Corners ({insideCount + outsideCount})
                          <span className="text-[10px] font-normal text-blue-500">
                            {totalLf.toFixed(1)} LF total
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                          {insideCount > 0 && (
                            <>
                              <span>Inside ({insideCount}):</span>
                              <span className="text-right font-mono">
                                {insideLf.toFixed(1)} LF
                              </span>
                            </>
                          )}
                          {outsideCount > 0 && (
                            <>
                              <span>Outside ({outsideCount}):</span>
                              <span className="text-right font-mono">
                                {outsideLf.toFixed(1)} LF
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* Soffit & Fascia */}
                {(displayTotals.soffitAreaSf > 0 || displayTotals.fasciaLf > 0) && (
                  <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-teal-700 dark:text-teal-300 uppercase">
                      Soffit & Fascia
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      {displayTotals.soffitAreaSf > 0 && (
                        <>
                          <span>Soffit ({displayTotals.soffitCount}):</span>
                          <span className="text-right font-mono">{displayTotals.soffitAreaSf.toFixed(1)} SF</span>
                        </>
                      )}
                      {displayTotals.fasciaLf > 0 && (
                        <>
                          <span>Fascia ({displayTotals.fasciaCount}):</span>
                          <span className="text-right font-mono">{displayTotals.fasciaLf.toFixed(1)} LF</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Belly Band */}
                {displayTotals.bellyBandLf > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase">
                      Belly Band ({displayTotals.bellyBandCount})
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      <span>Total Length:</span>
                      <span className="text-right font-mono">{displayTotals.bellyBandLf.toFixed(1)} LF</span>
                    </div>
                  </div>
                )}

                {/* Roofline */}
                {(displayTotals.eavesLf > 0 || displayTotals.rakesLf > 0 || displayTotals.ridgeLf > 0 || displayTotals.valleyLf > 0) && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                      Roofline
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      {displayTotals.eavesLf > 0 && (
                        <>
                          <span>Eaves ({displayTotals.eavesCount}):</span>
                          <span className="text-right font-mono">{displayTotals.eavesLf.toFixed(1)} LF</span>
                        </>
                      )}
                      {displayTotals.rakesLf > 0 && (
                        <>
                          <span>Rakes ({displayTotals.rakesCount}):</span>
                          <span className="text-right font-mono">{displayTotals.rakesLf.toFixed(1)} LF</span>
                        </>
                      )}
                      {displayTotals.ridgeLf > 0 && (
                        <>
                          <span>Ridge ({displayTotals.ridgeCount}):</span>
                          <span className="text-right font-mono">{displayTotals.ridgeLf.toFixed(1)} LF</span>
                        </>
                      )}
                      {displayTotals.valleyLf > 0 && (
                        <>
                          <span>Valley ({displayTotals.valleyCount}):</span>
                          <span className="text-right font-mono">{displayTotals.valleyLf.toFixed(1)} LF</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Gutters */}
                {(displayTotals.gutterLf > 0 || displayTotals.downspoutCount > 0) && (
                  <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 uppercase">
                      Gutters
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      {displayTotals.gutterLf > 0 && (
                        <>
                          <span>Gutters ({displayTotals.gutterCount}):</span>
                          <span className="text-right font-mono">{displayTotals.gutterLf.toFixed(1)} LF</span>
                        </>
                      )}
                      {displayTotals.downspoutCount > 0 && (
                        <>
                          <span>Downspouts:</span>
                          <span className="text-right font-mono">{displayTotals.downspoutCount}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Counts (Point Markers) */}
                {displayTotals.totalPointCount > 0 && (
                  <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-pink-700 dark:text-pink-300 uppercase">
                      Counts ({displayTotals.totalPointCount})
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                      {Object.entries(displayTotals.countsByClass)
                        .sort(([, a], [, b]) => b - a) // Sort by count descending
                        .map(([label, count]) => (
                          <React.Fragment key={label}>
                            <span className="capitalize">{label.replace(/_/g, ' ')}:</span>
                            <span className="text-right font-mono font-medium">{count} EA</span>
                          </React.Fragment>
                        ))}
                    </div>
                  </div>
                )}

                {/* Show if no applicable detections */}
                {displayTotals.buildingAreaSf === 0 &&
                  displayTotals.windowCount === 0 &&
                  displayTotals.doorCount === 0 &&
                  displayTotals.garageCount === 0 &&
                  displayTotals.gableCount === 0 &&
                  displayTotals.totalPointCount === 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                      {totalsScope === 'current' ? 'No detections on this page' : 'No detections across all pages'}
                    </div>
                  )}
              </div>
              );
            })()}

            {/* Show message if no scale is set */}
            {!liveDerivedTotals && currentPageId && (
              <div className="text-xs text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                ⚠️ Calibrate scale to see live measurements
              </div>
            )}

            {!liveDerivedTotals && !currentPageId && (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Calculator className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No calculations available</p>
                <p className="text-xs mt-1">Select a page to see measurements</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default DetectionSidebar;
