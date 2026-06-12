/**
 * Type-only extracts from `src/services/configService.ts` of the
 * exterior-estimation-api source. Byte-identical interface bodies; no logic
 * ported, no service helpers, no caching, no DB.
 *
 * Source: ~/Downloads/exterior-estimation-api-temp/src/services/configService.ts
 *   - CalculationConstants  (L19-31, exported in source)
 *   - ProjectEstimateSettings (L241-320, exported in source)
 */

export interface CalculationConstants {
  markup_rate: number;
  soc_unemployment_rate: number;
  li_hourly_rate: number;
  insurance_rate_per_thousand: number;
  default_crew_size: number;
  default_estimated_weeks: number;
  labor_rate_lap_siding: number;
  labor_rate_shingle_siding: number;
  labor_rate_panel_siding: number;
  labor_rate_board_batten: number;
  [key: string]: number;
}

export interface ProjectEstimateSettings {
  wrb?: {
    product?: string;        // "tyvek-homewrap", "henry-jumbotex", etc.
    layer_mode?: string;     // "auto", "single", "double"
    include_seam_tape?: boolean;
  };
  corners?: {
    default_height?: number;
    include_inside?: boolean;
    inside_count?: number | null;
    inside_lf?: number | null;
    outside_count?: number | null;
    outside_lf?: number | null;
  };
  top_out?: {
    include?: boolean;
    size_1?: string;         // "1x2"
    size_2?: string;         // "2x2"
    manual_lf?: number | null;
  };
  flashing?: {
    door_head?: string;      // "kynar", "galvanized", "z-flashing", "none"
    window_head?: string;
    base_starter?: string;   // "z-flashing", "drip-edge", "none"
    include_kickout?: boolean;
    include_moistop?: boolean;
    include_fortiflash?: boolean;
    include_rolled_galv?: boolean;
    include_joint_flashing?: boolean;
    include_corner_flashing?: boolean;
  };
  overhead?: {
    li_rate?: number;
    crew_size?: number;
    toilet_cost?: number;
    mobilization?: number;
    dumpster_cost?: number;
    include_toilet?: boolean;
    insurance_rate?: number;
    estimated_weeks?: number;
    include_dumpster?: boolean;
    mobilization_note?: string;
  };
  door_trim?: {
    include?: boolean;
    material?: string;       // "hardie_5/4x6"
    manual_lf?: number | null;
  };
  window_trim?: {
    include?: boolean;
    material?: string;       // "hardie_5/4x4"
    manual_lf?: number | null;
    include_slope_sill?: boolean;
  };
  belly_band?: {
    include?: boolean;
    size?: string;
    manual_lf?: number | null;
    flashing_type?: string;
  };
  consumables?: {
    caulk_type?: string;
    include_spackle?: boolean;
    include_trim_nails?: boolean;
    include_primer_cans?: boolean;
    include_wood_blades?: boolean;
    include_siding_nails?: boolean;
    include_hardie_blades?: boolean;
    include_paintable_caulk?: boolean;
    include_color_matched_caulk?: boolean;
  };
  trim_system?: string;      // "hardie" | "whitewood"
  wrb_product?: string | null;
  markup_percent?: number;
  // Trade configuration fields (from trade_configurations form)
  window_trim_width?: string;   // "3.5", "4", "5.5", "6", "7.25"
  window_trim_finish?: string;  // "colorplus", "primed"
  door_trim_width?: string;
  door_trim_finish?: string;
}
