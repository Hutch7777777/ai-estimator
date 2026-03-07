/**
 * Auto-Scope Types
 * Database-driven auto-scope rules for siding calculation
 *
 * UPDATED: Added ManufacturerMeasurements and ManufacturerGroups types
 * for per-manufacturer auto-scope rule application
 *
 * UPDATED (v2.2): Added TrimSystem type for trim system toggle support
 * - hardie: Default Hardie trim products (fiber cement)
 * - whitewood: WhiteWood lumber trim with Kynar flashing, Titebond caulk
 */

// ============================================================================
// TRIM SYSTEM TYPE (NEW v2.2)
// ============================================================================

/**
 * Trim system selection from frontend
 * Controls which set of trim/flashing/caulk rules fire in auto-scope
 *
 * 'hardie' (default): Uses James Hardie fiber cement trim products
 * 'whitewood': Uses WhiteWood lumber trim, Kynar flashings, Titebond caulk
 */
export type TrimSystem = 'hardie' | 'whitewood';

// ============================================================================
// MEASUREMENT CONTEXT (flattened from various sources)
// ============================================================================

export interface MeasurementContext {
  // Primary areas
  facade_sqft: number;
  gross_wall_area_sqft: number;
  net_siding_area_sqft: number;

  // Windows
  window_count: number;
  window_area_sqft: number;
  window_perimeter_lf: number;
  window_head_lf: number;
  window_sill_lf: number;
  window_jamb_lf: number;

  // Doors
  door_count: number;
  door_area_sqft: number;
  door_perimeter_lf: number;
  door_head_lf: number;
  door_jamb_lf: number;

  // Garages
  garage_count: number;
  garage_area_sqft: number;
  garage_perimeter_lf: number;

  // Corners
  outside_corner_count: number;
  outside_corner_lf: number;
  inside_corner_count: number;
  inside_corner_lf: number;

  // Gables
  gable_count: number;
  gable_area_sqft: number;
  gable_rake_lf: number;

  // Belly Band
  belly_band_count: number;
  belly_band_lf: number;

  // Other
  level_starter_lf: number;
  avg_wall_height_ft: number;

  // Computed helpers
  total_opening_perimeter_lf: number;
  total_corner_lf: number;
  total_openings_area_sqft: number;
  total_openings_count: number;

  // =========================================================================
  // TRIM TOTALS (computed from window + door + garage trim)
  // =========================================================================
  trim_total_lf: number;
  trim_head_lf: number;
  trim_jamb_lf: number;
  trim_sill_lf: number;

  // =========================================================================
  // ALIASES for database formula compatibility
  // =========================================================================
  facade_area_sqft: number;
  openings_area_sqft: number;
  outside_corners_count: number;
  inside_corners_count: number;
  openings_perimeter_lf: number;
  openings_count: number;
  facade_perimeter_lf: number;
  facade_height_ft: number;
}

// ============================================================================
// CAD/HOVER MEASUREMENTS (from database)
// ============================================================================

export interface CadHoverMeasurements {
  id: string;
  extraction_id: string;

  // Areas
  facade_total_sqft?: number;
  facade_sqft?: number;
  gross_wall_area_sqft?: number;
  net_siding_sqft?: number;
  net_siding_area_sqft?: number;

  // Openings
  openings_area_sqft?: number;
  openings_count?: number;
  openings_total_perimeter_lf?: number;

  // Windows
  windows_count?: number;
  windows_area_sqft?: number;
  windows_perimeter_lf?: number;
  windows_head_lf?: number;
  windows_sill_lf?: number;
  windows_jamb_lf?: number;

  // Doors
  doors_count?: number;
  doors_area_sqft?: number;
  doors_perimeter_lf?: number;
  doors_head_lf?: number;
  doors_jamb_lf?: number;

  // Garages
  garages_count?: number;
  garages_area_sqft?: number;
  garages_perimeter_lf?: number;

  // Corners
  corners_outside_count?: number;
  corners_outside_lf?: number;
  corners_inside_count?: number;
  corners_inside_lf?: number;

  // Gables
  gables_count?: number;
  gables_area_sqft?: number;
  gables_rake_lf?: number;

  // Other
  level_starter_lf?: number;
  avg_wall_height_ft?: number;

  // Metadata
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// AUTO-SCOPE LINE ITEM (output)
// ============================================================================

export interface AutoScopeLineItem {
  description: string;
  sku: string;
  quantity: number;
  unit: string;
  category: string;
  presentation_group: string;

  // Pricing
  material_unit_cost: number;
  material_extended: number;
  labor_unit_cost: number;
  labor_extended: number;

  // Metadata
  calculation_source: 'auto-scope';
  rule_id: string;
  formula_used: string;
  notes?: string;
}

// ============================================================================
// V2 RESULT TYPES
// ============================================================================

export interface AutoScopeV2Result {
  line_items: AutoScopeLineItem[];
  rules_evaluated: number;
  rules_triggered: number;
  rules_skipped: string[];
  measurement_source: 'database' | 'webhook' | 'fallback';
}

// ============================================================================
// MANUFACTURER GROUPING TYPES (NEW)
// ============================================================================

/**
 * Aggregated measurements for a single manufacturer's products
 * Used to calculate manufacturer-specific auto-scope quantities
 *
 * Example: If a project has 800 SF of James Hardie and 700 SF of FastPlank,
 * there will be two ManufacturerMeasurements entries.
 */
export interface ManufacturerMeasurements {
  /** Manufacturer name (e.g., "James Hardie", "Engage Building Products") */
  manufacturer: string;
  /** Total square footage of this manufacturer's siding products */
  area_sqft: number;
  /** Total linear feet of this manufacturer's trim/linear products */
  linear_ft: number;
  /** Total piece count of this manufacturer's discrete items */
  piece_count: number;
  /** Detection IDs that contributed to this manufacturer's totals */
  detection_ids: string[];
}

/**
 * Map of manufacturer name to their aggregated measurements
 * Key is the manufacturer name from pricing_items table
 *
 * Example:
 * {
 *   "James Hardie": { area_sqft: 800, linear_ft: 120, ... },
 *   "Engage Building Products": { area_sqft: 700, linear_ft: 100, ... }
 * }
 */
export type ManufacturerGroups = Record<string, ManufacturerMeasurements>;

// ============================================================================
// ESTIMATE SETTINGS TYPES (Phase 2B)
// From frontend EstimateSettingsPanel - controls which auto-scope rules fire
// ============================================================================

export interface EstimateSettingsWindowTrim {
  include: boolean;
  material?: string;
  include_slope_sill?: boolean;
  manual_lf?: number | null;
}

export interface EstimateSettingsDoorTrim {
  include: boolean;
  material?: string;
  manual_lf?: number | null;
}

export interface EstimateSettingsTopOut {
  include: boolean;
  size_1?: string;
  size_2?: string;
  manual_lf?: number | null;
}

export interface EstimateSettingsBellyBand {
  include: boolean;
  size?: string;
  flashing_type?: string;
  manual_lf?: number | null;
}

export interface EstimateSettingsCorners {
  include_inside?: boolean;
  outside_count?: number | null;
  outside_lf?: number | null;
  inside_count?: number | null;
  inside_lf?: number | null;
  default_height?: number;
}

export interface EstimateSettingsWRB {
  product?: string | null;
  layer_mode?: 'auto' | 'single' | 'double';
  include_seam_tape?: boolean;
}

export interface EstimateSettingsFlashing {
  window_head?: 'kynar' | 'galvanized' | 'z-flashing' | 'none';
  door_head?: 'kynar' | 'galvanized' | 'z-flashing' | 'none';
  base_starter?: 'z-flashing' | 'drip-edge' | 'none';
  include_kickout?: boolean;
  include_corner_flashing?: boolean;
  include_fortiflash?: boolean;
  include_moistop?: boolean;
  include_rolled_galv?: boolean;
  include_joint_flashing?: boolean;
}

export interface EstimateSettingsConsumables {
  caulk_type?: string;
  include_paintable_caulk?: boolean;
  include_color_matched_caulk?: boolean;
  include_primer_cans?: boolean;
  include_spackle?: boolean;
  include_wood_blades?: boolean;
  include_hardie_blades?: boolean;
  include_siding_nails?: boolean;
  include_trim_nails?: boolean;
}

export interface EstimateSettingsOverhead {
  include_dumpster?: boolean;
  dumpster_cost?: number;
  include_toilet?: boolean;
  toilet_cost?: number;
  mobilization?: number;
  mobilization_note?: string;
  li_rate?: number;
  insurance_rate?: number;
  crew_size?: number;
  estimated_weeks?: number;
}

/**
 * Complete estimate settings from frontend EstimateSettingsPanel
 * Controls which auto-scope rules fire and provides measurement overrides
 */
export interface EstimateSettings {
  markup_percent?: number;
  trim_system?: TrimSystem;
  wrb_product?: string | null;
  window_trim?: EstimateSettingsWindowTrim;
  door_trim?: EstimateSettingsDoorTrim;
  top_out?: EstimateSettingsTopOut;
  belly_band?: EstimateSettingsBellyBand;
  corners?: EstimateSettingsCorners;
  wrb?: EstimateSettingsWRB;
  flashing?: EstimateSettingsFlashing;
  consumables?: EstimateSettingsConsumables;
  overhead?: EstimateSettingsOverhead;
}
