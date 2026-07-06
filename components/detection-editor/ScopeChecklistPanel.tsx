'use client';

import React, { memo, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardCheck,
  Eye,
  Hash,
  Ruler,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react';
import type { ExtractionDetection, ExtractionPage, ToolMode, DetectionClass } from '@/lib/types/extraction';
import type { EstimateConfig } from './EstimateSettingsPanel';
import { DEFAULT_ESTIMATE_CONFIG } from './EstimateSettingsPanel/defaults';

export type ScopeChecklistKey =
  | 'scale'
  | 'main_siding'
  | 'gable_siding'
  | 'stone_veneer'
  | 'window_trim'
  | 'door_trim'
  | 'garage_trim'
  | 'outside_corners'
  | 'inside_corners'
  | 'trim_lines'
  | 'penetrations'
  | 'wrb_flashing'
  | 'consumables'
  | 'waste_factor';

type ScopeChecklistKind = 'markup_focus' | 'assumption_form' | 'hybrid' | 'calibration';
type ChecklistStatus = 'complete' | 'inferred' | 'needs_user_answer' | 'not_applicable' | 'blocked';
type MeasurementUnit = 'SF' | 'LF' | 'EA';

export interface ScopeChecklistItem {
  key: ScopeChecklistKey;
  title: string;
  description: string;
  group: 'Geometry' | 'Openings' | 'Accessories' | 'Assumptions';
  kind: ScopeChecklistKind;
  targetClasses: string[];
  unit: MeasurementUnit;
  preferredTool?: ToolMode;
  preferredClass?: DetectionClass;
}

interface ScopeChecklistSummary {
  count: number;
  areaSf: number;
  linearLf: number;
  assignedCount: number;
  pageCount: number;
  primaryLabel: string;
  status: ChecklistStatus;
}

interface DetailMetric {
  label: string;
  value: string;
  icon: React.ElementType;
}

interface ScopeChecklistPanelProps {
  isOpen: boolean;
  onClose: () => void;
  detections: ExtractionDetection[];
  pages: ExtractionPage[];
  currentPageId: string | null;
  activeItemKey: ScopeChecklistKey | null;
  estimateConfig: Partial<EstimateConfig>;
  currentPageScaleRatio?: number | null;
  onFocusItem: (item: ScopeChecklistItem | null) => void;
  onEstimateConfigChange: (config: Partial<EstimateConfig>) => void;
}

export const SCOPE_CHECKLIST_ITEMS: ScopeChecklistItem[] = [
  {
    key: 'scale',
    title: 'Scale Calibration',
    description: 'Confirm page scale before trusting area and linear quantities.',
    group: 'Geometry',
    kind: 'calibration',
    targetClasses: [],
    unit: 'EA',
    preferredTool: 'calibrate',
  },
  {
    key: 'main_siding',
    title: 'Main Siding Facades',
    description: 'Review visible wall polygons used for siding area.',
    group: 'Geometry',
    kind: 'markup_focus',
    targetClasses: ['siding', 'exterior_wall', 'exterior_walls', 'building', 'wall'],
    unit: 'SF',
    preferredTool: 'select',
    preferredClass: 'siding',
  },
  {
    key: 'gable_siding',
    title: 'Gable Siding',
    description: 'Review gable polygons and triangle conversions.',
    group: 'Geometry',
    kind: 'markup_focus',
    targetClasses: ['gable'],
    unit: 'SF',
    preferredTool: 'select',
    preferredClass: 'gable',
  },
  {
    key: 'stone_veneer',
    title: 'Stone / Brick Veneer',
    description: 'Review masonry veneer surfaces and material assignment.',
    group: 'Geometry',
    kind: 'markup_focus',
    targetClasses: ['stone_veneer', 'stone', 'brick', 'masonry'],
    unit: 'SF',
    preferredTool: 'select',
    preferredClass: 'siding',
  },
  {
    key: 'window_trim',
    title: 'Window Treatment',
    description: 'Focus windows and confirm trim, flashing, and caulk assumptions.',
    group: 'Openings',
    kind: 'hybrid',
    targetClasses: ['window'],
    unit: 'EA',
    preferredTool: 'select',
  },
  {
    key: 'door_trim',
    title: 'Door Treatment',
    description: 'Focus doors and confirm casing, head flashing, and caulk.',
    group: 'Openings',
    kind: 'hybrid',
    targetClasses: ['door'],
    unit: 'EA',
    preferredTool: 'select',
  },
  {
    key: 'garage_trim',
    title: 'Garage Door Treatment',
    description: 'Focus garage openings and confirm trim or exclusion.',
    group: 'Openings',
    kind: 'hybrid',
    targetClasses: ['garage', 'garage_door'],
    unit: 'EA',
    preferredTool: 'select',
  },
  {
    key: 'outside_corners',
    title: 'Outside Corners',
    description: 'Review corner markers or add missing outside corners.',
    group: 'Accessories',
    kind: 'hybrid',
    targetClasses: ['corner_outside', 'outside_corner'],
    unit: 'LF',
    preferredTool: 'point',
    preferredClass: 'corner_outside',
  },
  {
    key: 'inside_corners',
    title: 'Inside Corners',
    description: 'Review inside corner markers and include/exclude assumption.',
    group: 'Accessories',
    kind: 'hybrid',
    targetClasses: ['corner_inside', 'inside_corner'],
    unit: 'LF',
    preferredTool: 'point',
    preferredClass: 'corner_inside',
  },
  {
    key: 'trim_lines',
    title: 'Trim / Boards',
    description: 'Review linear trim, belly band, fascia, top-out, eave, and rake markups.',
    group: 'Accessories',
    kind: 'markup_focus',
    targetClasses: ['trim', 'fascia', 'belly_band', 'topout', 'eave', 'rake'],
    unit: 'LF',
    preferredTool: 'line',
    preferredClass: 'trim',
  },
  {
    key: 'penetrations',
    title: 'Penetrations',
    description: 'Review vents, outlets, hose bibs, light fixtures, downspouts, and flashing points.',
    group: 'Accessories',
    kind: 'markup_focus',
    targetClasses: ['vent', 'gable_vent', 'outlet', 'hose_bib', 'light_fixture', 'downspout', 'flashing'],
    unit: 'EA',
    preferredTool: 'point',
    preferredClass: 'vent',
  },
  {
    key: 'wrb_flashing',
    title: 'WRB / Flashing',
    description: 'Confirm housewrap, seam tape, joint flashing, FortiFlash, and kickout assumptions.',
    group: 'Assumptions',
    kind: 'assumption_form',
    targetClasses: [],
    unit: 'EA',
  },
  {
    key: 'consumables',
    title: 'Caulk / Fasteners',
    description: 'Confirm caulk, blades, nails, primer, and spackle assumptions.',
    group: 'Assumptions',
    kind: 'assumption_form',
    targetClasses: [],
    unit: 'EA',
  },
  {
    key: 'waste_factor',
    title: 'Waste Factors',
    description: 'Review waste assumptions used by pricing rules and material categories.',
    group: 'Assumptions',
    kind: 'assumption_form',
    targetClasses: [],
    unit: 'EA',
  },
];

const GROUPS: ScopeChecklistItem['group'][] = ['Geometry', 'Openings', 'Accessories', 'Assumptions'];
const DEFAULT_UNCALIBRATED_SCALE = 48;

function normalizeClass(value: string | null | undefined): string {
  return (value || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
}

export function getScopeChecklistItem(key: ScopeChecklistKey | null): ScopeChecklistItem | null {
  if (!key) return null;
  return SCOPE_CHECKLIST_ITEMS.find((item) => item.key === key) || null;
}

export function getScopeTargetClasses(key: ScopeChecklistKey | null): string[] {
  return getScopeChecklistItem(key)?.targetClasses || [];
}

export function detectionMatchesScope(detection: ExtractionDetection, item: ScopeChecklistItem): boolean {
  const cls = normalizeClass(detection.class);
  return item.targetClasses.some((target) => normalizeClass(target) === cls);
}

function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return value.toFixed(digits);
}

function formatPrimary(summary: Pick<ScopeChecklistSummary, 'count' | 'areaSf' | 'linearLf'>, unit: MeasurementUnit): string {
  if (unit === 'SF') return `${formatNumber(summary.areaSf)} SF`;
  if (unit === 'LF') return `${formatNumber(summary.linearLf)} LF`;
  return `${Math.round(summary.count)} EA`;
}

function isAssumptionOnly(item: ScopeChecklistItem): boolean {
  return item.kind === 'assumption_form';
}

function usesMaterialAssignment(item: ScopeChecklistItem): boolean {
  return ['main_siding', 'gable_siding', 'stone_veneer'].includes(item.key);
}

function resolvedEstimateConfig(config: Partial<EstimateConfig>): EstimateConfig {
  return {
    ...DEFAULT_ESTIMATE_CONFIG,
    ...config,
    window_trim: { ...DEFAULT_ESTIMATE_CONFIG.window_trim, ...config.window_trim },
    door_trim: { ...DEFAULT_ESTIMATE_CONFIG.door_trim, ...config.door_trim },
    top_out: { ...DEFAULT_ESTIMATE_CONFIG.top_out, ...config.top_out },
    belly_band: { ...DEFAULT_ESTIMATE_CONFIG.belly_band, ...config.belly_band },
    corners: { ...DEFAULT_ESTIMATE_CONFIG.corners, ...config.corners },
    wrb: { ...DEFAULT_ESTIMATE_CONFIG.wrb, ...config.wrb },
    flashing: { ...DEFAULT_ESTIMATE_CONFIG.flashing, ...config.flashing },
    consumables: { ...DEFAULT_ESTIMATE_CONFIG.consumables, ...config.consumables },
    overhead: { ...DEFAULT_ESTIMATE_CONFIG.overhead, ...config.overhead },
  };
}

function summarizeItem(
  item: ScopeChecklistItem,
  detections: ExtractionDetection[],
  pages: ExtractionPage[],
  config: EstimateConfig,
  currentPageScaleRatio?: number | null
): ScopeChecklistSummary {
  const activeDetections = detections.filter((detection) => {
    if (detection.status === 'deleted') return false;
    if (item.targetClasses.length > 0) return detectionMatchesScope(detection, item);

    // Assumption-only rows still need helpful context, but they do not own markups.
    // Use visible cladding/gable surfaces as the context for WRB, consumables, and waste.
    const cls = normalizeClass(detection.class);
    return ['siding', 'exterior_wall', 'exterior_walls', 'building', 'wall', 'gable', 'stone_veneer'].includes(cls);
  });

  const pageIds = item.key === 'scale'
    ? new Set(pages.filter((page) => page.page_type === 'elevation').map((page) => page.id))
    : new Set(activeDetections.map((detection) => detection.page_id));
  const count = activeDetections.reduce((total, detection) => total + Number(detection.item_count || 1), 0);
  const areaSf = activeDetections.reduce((total, detection) => total + Number(detection.area_sf || 0), 0);
  const rawLinearLf = activeDetections.reduce((total, detection) => {
    if (detection.markup_type === 'point') return total;
    return total + Number(detection.perimeter_lf || 0);
  }, 0);
  const assignedCount = activeDetections.filter((detection) => detection.assigned_material_id).length;

  let linearLf = rawLinearLf;
  if ((item.key === 'outside_corners' || item.key === 'inside_corners') && linearLf === 0) {
    linearLf = count * Number(config.corners.default_height || 9);
  }

  let status: ChecklistStatus = 'not_applicable';
  if (item.key === 'scale') {
    const calibratedPages = pages.filter(
      (page) => page.page_type === 'elevation' &&
        page.scale_ratio &&
        page.scale_ratio > 0 &&
        page.scale_ratio !== DEFAULT_UNCALIBRATED_SCALE
    );
    status = calibratedPages.length > 0 || (currentPageScaleRatio && currentPageScaleRatio !== DEFAULT_UNCALIBRATED_SCALE)
      ? 'complete'
      : 'blocked';
  } else if (item.kind === 'assumption_form') {
    status = item.key === 'waste_factor' ? 'inferred' : 'complete';
  } else if (activeDetections.length === 0) {
    status = item.key === 'stone_veneer' ? 'not_applicable' : 'needs_user_answer';
  } else if (assignedCount < activeDetections.length && ['main_siding', 'gable_siding', 'stone_veneer'].includes(item.key)) {
    status = 'needs_user_answer';
  } else {
    status = item.kind === 'hybrid' ? 'inferred' : 'complete';
  }

  return {
    count,
    areaSf,
    linearLf,
    assignedCount,
    pageCount: pageIds.size,
    primaryLabel: item.key === 'scale'
      ? status === 'complete' ? 'Scale set' : 'Set scale'
      : item.kind === 'assumption_form'
        ? areaSf > 0 ? `${formatNumber(areaSf)} SF scope` : 'No markup needed'
        : formatPrimary({ count, areaSf, linearLf }, item.unit),
    status,
  };
}

function statusLabel(status: ChecklistStatus): string {
  if (status === 'complete') return 'Complete';
  if (status === 'inferred') return 'Inferred';
  if (status === 'blocked') return 'Blocked';
  if (status === 'not_applicable') return 'N/A';
  return 'Needs check';
}

function statusClass(status: ChecklistStatus): string {
  if (status === 'complete') return 'bg-emerald-50 text-emerald-700';
  if (status === 'inferred') return 'bg-blue-50 text-blue-700';
  if (status === 'blocked') return 'bg-red-50 text-red-700';
  if (status === 'not_applicable') return 'bg-gray-100 text-gray-600';
  return 'bg-amber-50 text-amber-700';
}

function isReadyStatus(status: ChecklistStatus): boolean {
  return status === 'complete' || status === 'inferred' || status === 'not_applicable';
}

function statusIconClass(status: ChecklistStatus): string {
  if (status === 'complete') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'inferred') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'not_applicable') return 'border-gray-200 bg-gray-100 text-gray-500';
  if (status === 'blocked') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function statusRailClass(status: ChecklistStatus): string {
  if (status === 'complete') return 'bg-emerald-400';
  if (status === 'inferred') return 'bg-blue-400';
  if (status === 'not_applicable') return 'bg-gray-600';
  if (status === 'blocked') return 'bg-red-400';
  return 'bg-amber-400';
}

function rowHelperText(item: ScopeChecklistItem, summary: ScopeChecklistSummary): string {
  if (item.key === 'scale') {
    return summary.status === 'complete'
      ? 'Measured quantities can be trusted for calibrated pages.'
      : 'Required before final quantities and export are reliable.';
  }

  if (isAssumptionOnly(item)) {
    if (item.key === 'waste_factor') return 'Pricing rules currently drive waste; project overrides are staged.';
    return 'No markup drawing required. Confirm the scope assumption.';
  }

  if (item.key === 'window_trim' || item.key === 'door_trim' || item.key === 'garage_trim') {
    return `${Math.round(summary.count)} opening${Math.round(summary.count) !== 1 ? 's' : ''} · ${formatNumber(summary.areaSf)} SF`;
  }

  if (item.key === 'inside_corners' || item.key === 'outside_corners') {
    return `${Math.round(summary.count)} marker${Math.round(summary.count) !== 1 ? 's' : ''} · ${formatNumber(summary.linearLf)} LF`;
  }

  if (usesMaterialAssignment(item)) {
    return `${Math.round(summary.count)} markup${Math.round(summary.count) !== 1 ? 's' : ''} · ${summary.assignedCount}/${Math.round(summary.count)} assigned`;
  }

  return `${Math.round(summary.count)} markup${Math.round(summary.count) !== 1 ? 's' : ''} · ${summary.pageCount || 0} page${summary.pageCount === 1 ? '' : 's'}`;
}

function detailMetrics(item: ScopeChecklistItem, summary: ScopeChecklistSummary): DetailMetric[] {
  if (item.key === 'scale') {
    return [
      { label: 'Status', value: summary.status === 'complete' ? 'Calibrated' : 'Needs Scale', icon: Ruler },
      { label: 'Scope', value: summary.pageCount > 0 ? `${summary.pageCount} pages` : 'Elevation pages', icon: ClipboardCheck },
    ];
  }

  if (isAssumptionOnly(item)) {
    return [
      { label: 'Surface Context', value: summary.areaSf > 0 ? `${formatNumber(summary.areaSf)} SF` : 'Not detected', icon: Square },
      { label: 'Pages', value: `${summary.pageCount || 0}`, icon: ClipboardCheck },
    ];
  }

  if (item.key === 'window_trim' || item.key === 'door_trim' || item.key === 'garage_trim') {
    return [
      { label: 'Openings', value: `${Math.round(summary.count)}`, icon: Hash },
      { label: 'Opening Area', value: `${formatNumber(summary.areaSf)} SF`, icon: Square },
      { label: 'Perimeter', value: `${formatNumber(summary.linearLf)} LF`, icon: Ruler },
    ];
  }

  if (item.key === 'inside_corners' || item.key === 'outside_corners') {
    return [
      { label: 'Corners', value: `${Math.round(summary.count)}`, icon: Hash },
      { label: 'Estimated LF', value: `${formatNumber(summary.linearLf)} LF`, icon: Ruler },
    ];
  }

  if (item.unit === 'SF') {
    return [
      { label: 'Area', value: `${formatNumber(summary.areaSf)} SF`, icon: Square },
      { label: 'Markups', value: `${Math.round(summary.count)}`, icon: Hash },
      ...(usesMaterialAssignment(item)
        ? [{ label: 'Assigned', value: `${summary.assignedCount}/${Math.round(summary.count)}`, icon: ClipboardCheck }]
        : []),
    ];
  }

  if (item.unit === 'LF') {
    return [
      { label: 'Length', value: `${formatNumber(summary.linearLf)} LF`, icon: Ruler },
      { label: 'Markups', value: `${Math.round(summary.count)}`, icon: Hash },
    ];
  }

  return [
    { label: 'Count', value: `${Math.round(summary.count)}`, icon: Hash },
    { label: 'Pages', value: `${summary.pageCount || 0}`, icon: ClipboardCheck },
  ];
}

function DetailMetricCard({ icon: Icon, label, value }: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-950">{value}</div>
    </div>
  );
}

function AssumptionForm({
  item,
  config,
  onChange,
}: {
  item: ScopeChecklistItem;
  config: EstimateConfig;
  onChange: (config: EstimateConfig) => void;
}) {
  const [localWaste, setLocalWaste] = useState({
    main: 10,
    gable: 15,
    trim: 10,
  });

  if (item.key === 'window_trim') {
    return (
      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <ToggleRow
          label="Include window trim"
          checked={config.window_trim.include}
          onChange={(checked) => onChange({ ...config, window_trim: { ...config.window_trim, include: checked } })}
        />
        <ToggleRow
          label="Include slope sill"
          checked={config.window_trim.include_slope_sill}
          onChange={(checked) => onChange({ ...config, window_trim: { ...config.window_trim, include_slope_sill: checked } })}
        />
        <NumberRow
          label="Manual trim LF"
          value={config.window_trim.manual_lf}
          placeholder="Use detected LF"
          onChange={(value) => onChange({ ...config, window_trim: { ...config.window_trim, manual_lf: value } })}
        />
      </div>
    );
  }

  if (item.key === 'door_trim' || item.key === 'garage_trim') {
    return (
      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <ToggleRow
          label={item.key === 'garage_trim' ? 'Include garage trim' : 'Include door trim'}
          checked={config.door_trim.include}
          onChange={(checked) => onChange({ ...config, door_trim: { ...config.door_trim, include: checked } })}
        />
        <NumberRow
          label="Manual trim LF"
          value={config.door_trim.manual_lf}
          placeholder="Use detected LF"
          onChange={(value) => onChange({ ...config, door_trim: { ...config.door_trim, manual_lf: value } })}
        />
        {item.key === 'garage_trim' && (
          <p className="text-xs text-gray-500">Garage trim uses the door trim assumption until a separate garage trim schema is added.</p>
        )}
      </div>
    );
  }

  if (item.key === 'outside_corners' || item.key === 'inside_corners') {
    return (
      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <NumberRow
          label="Default corner height"
          value={config.corners.default_height}
          placeholder="9"
          suffix="ft"
          onChange={(value) => onChange({ ...config, corners: { ...config.corners, default_height: value ?? 9 } })}
        />
        {item.key === 'inside_corners' && (
          <ToggleRow
            label="Include inside corners"
            checked={config.corners.include_inside}
            onChange={(checked) => onChange({ ...config, corners: { ...config.corners, include_inside: checked } })}
          />
        )}
        <NumberRow
          label={item.key === 'outside_corners' ? 'Manual outside count' : 'Manual inside count'}
          value={item.key === 'outside_corners' ? config.corners.outside_count : config.corners.inside_count}
          placeholder="Use detected count"
          onChange={(value) => onChange({
            ...config,
            corners: item.key === 'outside_corners'
              ? { ...config.corners, outside_count: value }
              : { ...config.corners, inside_count: value },
          })}
        />
        <NumberRow
          label={item.key === 'outside_corners' ? 'Manual outside LF' : 'Manual inside LF'}
          value={item.key === 'outside_corners' ? config.corners.outside_lf : config.corners.inside_lf}
          placeholder="count × height"
          suffix="LF"
          onChange={(value) => onChange({
            ...config,
            corners: item.key === 'outside_corners'
              ? { ...config.corners, outside_lf: value }
              : { ...config.corners, inside_lf: value },
          })}
        />
      </div>
    );
  }

  if (item.key === 'waste_factor') {
    return (
      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500">
          Waste is currently driven by pricing rules and material categories. These values are staged for the future project-level waste schema.
        </p>
        {[
          ['Main siding', 'main'],
          ['Gable/shingle', 'gable'],
          ['Trim/boards', 'trim'],
        ].map(([label, key]) => (
          <label key={key} className="flex items-center justify-between gap-3 text-xs text-gray-700">
            <span>{label}</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={localWaste[key as keyof typeof localWaste]}
                onChange={(event) => setLocalWaste((prev) => ({
                  ...prev,
                  [key]: Number(event.target.value || 0),
                }))}
                className="h-8 w-20 rounded-md border border-gray-300 bg-white px-2 text-right font-medium text-gray-950 outline-none transition-colors focus:border-blue-500"
                min={0}
                max={50}
              />
              <span className="text-gray-500">%</span>
            </div>
          </label>
        ))}
      </div>
    );
  }

  if (item.key === 'wrb_flashing') {
    return (
      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <ToggleRow
          label="Seam tape"
          checked={config.wrb.include_seam_tape}
          onChange={(checked) => onChange({ ...config, wrb: { ...config.wrb, include_seam_tape: checked } })}
        />
        <ToggleRow
          label="Kickout flashing"
          checked={config.flashing.include_kickout}
          onChange={(checked) => onChange({ ...config, flashing: { ...config.flashing, include_kickout: checked } })}
        />
        <ToggleRow
          label="Corner flashing"
          checked={config.flashing.include_corner_flashing}
          onChange={(checked) => onChange({ ...config, flashing: { ...config.flashing, include_corner_flashing: checked } })}
        />
        <ToggleRow
          label="FortiFlash at penetrations"
          checked={config.flashing.include_fortiflash}
          onChange={(checked) => onChange({ ...config, flashing: { ...config.flashing, include_fortiflash: checked } })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <ToggleRow
        label="Paintable caulk"
        checked={config.consumables.include_paintable_caulk}
        onChange={(checked) => onChange({ ...config, consumables: { ...config.consumables, include_paintable_caulk: checked } })}
      />
      <ToggleRow
        label="Color-matched caulk"
        checked={config.consumables.include_color_matched_caulk}
        onChange={(checked) => onChange({ ...config, consumables: { ...config.consumables, include_color_matched_caulk: checked } })}
      />
      <ToggleRow
        label="Siding nails"
        checked={config.consumables.include_siding_nails}
        onChange={(checked) => onChange({ ...config, consumables: { ...config.consumables, include_siding_nails: checked } })}
      />
      <ToggleRow
        label="Trim nails"
        checked={config.consumables.include_trim_nails}
        onChange={(checked) => onChange({ ...config, consumables: { ...config.consumables, include_trim_nails: checked } })}
      />
      <ToggleRow
        label="Hardie blades"
        checked={config.consumables.include_hardie_blades}
        onChange={(checked) => onChange({ ...config, consumables: { ...config.consumables, include_hardie_blades: checked } })}
      />
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5 text-xs text-gray-700">
      <span className="font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </label>
  );
}

function NumberRow({ label, value, placeholder, suffix, onChange }: {
  label: string;
  value: number | null;
  placeholder?: string;
  suffix?: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5 text-xs text-gray-700">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next === '' ? null : Number(next));
          }}
          className="h-8 w-28 rounded-md border border-gray-300 bg-white px-2 text-right font-medium text-gray-950 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500"
          min={0}
        />
        {suffix && <span className="text-gray-500">{suffix}</span>}
      </div>
    </label>
  );
}

const ChecklistRow = memo(function ChecklistRow({
  item,
  summary,
  isActive,
  isFormOpen,
  onFocus,
  onOpenForm,
}: {
  item: ScopeChecklistItem;
  summary: ScopeChecklistSummary;
  isActive: boolean;
  isFormOpen: boolean;
  onFocus: (item: ScopeChecklistItem) => void;
  onOpenForm: (item: ScopeChecklistItem) => void;
}) {
  const canFocus = item.kind === 'markup_focus' || item.kind === 'hybrid' || item.kind === 'calibration';
  const canOpenForm = item.kind === 'assumption_form' || item.kind === 'hybrid';
  const helperText = rowHelperText(item, summary);

  return (
    <div className={`group relative overflow-hidden rounded-lg border transition-colors ${
      isActive
        ? 'border-blue-300 bg-blue-50 shadow-[0_0_0_1px_rgba(59,130,246,0.12)]'
        : 'border-transparent bg-transparent hover:border-gray-200 hover:bg-gray-50'
    }`}>
      <div className={`absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full ${statusRailClass(summary.status)}`} />
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${statusIconClass(summary.status)}`}>
          {isReadyStatus(summary.status) ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
        </div>
        <button
          type="button"
          onClick={() => (canFocus ? onFocus(item) : onOpenForm(item))}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-950">{item.title}</h3>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(summary.status)}`}>
              {statusLabel(summary.status)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">{helperText}</p>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-md border border-gray-200 bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-950">
            {summary.primaryLabel}
          </span>
          {canFocus && (
            <button
              type="button"
              onClick={() => onFocus(item)}
              title={item.kind === 'calibration' ? 'Calibrate scale' : 'Focus canvas on this scope'}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
          {canOpenForm && (
            <button
              type="button"
              onClick={() => onOpenForm(item)}
              title="Open checklist settings"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                isFormOpen ? 'bg-emerald-600 text-white' : 'border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default function ScopeChecklistPanel({
  isOpen,
  onClose,
  detections,
  pages,
  currentPageId,
  activeItemKey,
  estimateConfig,
  currentPageScaleRatio,
  onFocusItem,
  onEstimateConfigChange,
}: ScopeChecklistPanelProps) {
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [openFormKey, setOpenFormKey] = useState<ScopeChecklistKey | null>(null);

  const config = useMemo(() => resolvedEstimateConfig(estimateConfig), [estimateConfig]);

  const scopedDetections = useMemo(() => {
    if (scope === 'all') return detections;
    return detections.filter((detection) => detection.page_id === currentPageId);
  }, [currentPageId, detections, scope]);

  const summaries = useMemo(() => {
    return new Map(SCOPE_CHECKLIST_ITEMS.map((item) => [
      item.key,
      summarizeItem(item, scopedDetections, pages, config, currentPageScaleRatio),
    ]));
  }, [config, currentPageScaleRatio, pages, scopedDetections]);

  const activeItem = getScopeChecklistItem(activeItemKey);
  const activeSummary = activeItem ? summaries.get(activeItem.key) : null;
  const readyCount = useMemo(() => {
    return SCOPE_CHECKLIST_ITEMS.filter((item) => {
      const summary = summaries.get(item.key);
      return summary ? isReadyStatus(summary.status) : false;
    }).length;
  }, [summaries]);
  const attentionCount = SCOPE_CHECKLIST_ITEMS.length - readyCount;
  const progressPercent = Math.round((readyCount / SCOPE_CHECKLIST_ITEMS.length) * 100);

  const handleFocus = (item: ScopeChecklistItem) => {
    if (item.kind === 'assumption_form') {
      setOpenFormKey(item.key);
      return;
    }
    onFocusItem(item);
  };

  const handleForm = (item: ScopeChecklistItem) => {
    setOpenFormKey((prev) => (prev === item.key ? null : item.key));
  };

  if (!isOpen) return null;

  return (
    <div className="absolute left-3 top-14 z-50 flex max-h-[calc(100%-5rem)] w-[430px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
      <header className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600">
            <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-950">Takeoff Checklist</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {readyCount} ready · {attentionCount} need review
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-gray-500">
            <span>Readiness</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setScope('current')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              scope === 'current' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Current Page
          </button>
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              scope === 'all' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            All Pages
          </button>
        </div>
        {activeItem && (
          <button
            type="button"
            onClick={() => onFocusItem(null)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-3.5 w-3.5" />
            Clear Focus
          </button>
        )}
      </div>

      {activeItem && activeSummary && (
        <div className="border-b border-gray-200 bg-blue-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                {activeItem.kind === 'assumption_form' ? 'Editing Assumption' : 'Focused Markups'}
              </div>
              <div className="text-sm font-semibold text-gray-950">{activeItem.title}</div>
              <div className="mt-0.5 max-w-[300px] text-xs leading-5 text-blue-900/70">
                {activeItem.description}
              </div>
            </div>
            <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${statusClass(activeSummary.status)}`}>
              {statusLabel(activeSummary.status)}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {detailMetrics(activeItem, activeSummary).map((metric) => (
              <DetailMetricCard
                key={`${metric.label}-${metric.value}`}
                icon={metric.icon}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </div>
        </div>
      )}

      <main className="space-y-3 overflow-y-auto p-3">
        {GROUPS.map((group) => {
          const items = SCOPE_CHECKLIST_ITEMS.filter((item) => item.group === group);
          const readyInGroup = items.filter((item) => {
            const summary = summaries.get(item.key);
            return summary ? isReadyStatus(summary.status) : false;
          }).length;
          return (
            <section key={group} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{group}</h3>
                <span className="text-[11px] font-medium text-gray-500">
                  {readyInGroup}/{items.length}
                </span>
              </div>
              <div className="space-y-1 p-1.5">
              {items.map((item) => {
                const summary = summaries.get(item.key);
                if (!summary) return null;
                const isFormOpen = openFormKey === item.key;
                return (
                  <div key={item.key} className="space-y-2">
                    <ChecklistRow
                      item={item}
                      summary={summary}
                      isActive={activeItemKey === item.key}
                      isFormOpen={isFormOpen}
                      onFocus={handleFocus}
                      onOpenForm={handleForm}
                    />
                    {isFormOpen && (
                      <AssumptionForm
                        item={item}
                        config={config}
                        onChange={onEstimateConfigChange}
                      />
                    )}
                  </div>
                );
              })}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
