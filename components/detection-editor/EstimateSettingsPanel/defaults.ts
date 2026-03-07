// EstimateSettingsPanel/defaults.ts
import type {
  TrimSystem, EstimateConfig, WindowTrimSettings, DoorTrimSettings,
  TopOutSettings, BellyBandSettings, CornersSettings, WRBSettings,
  FlashingSettings, ConsumablesSettings, OverheadSettings,
} from './types';

export const DEFAULT_WINDOW_TRIM: WindowTrimSettings = {
  include: true, material: 'hardie_5/4x4', include_slope_sill: false, manual_lf: null,
};

export const DEFAULT_DOOR_TRIM: DoorTrimSettings = {
  include: true, material: 'hardie_5/4x4', manual_lf: null,
};

export const DEFAULT_TOP_OUT: TopOutSettings = {
  include: true, size_1: '1x2', size_2: '2x2', manual_lf: null,
};

export const DEFAULT_BELLY_BAND: BellyBandSettings = {
  include: false, size: '2x12', flashing_type: 'z-flashing', manual_lf: null,
};

export const DEFAULT_CORNERS: CornersSettings = {
  include_inside: true, outside_count: null, outside_lf: null,
  inside_count: null, inside_lf: null, default_height: 9,
};

export const DEFAULT_WRB: WRBSettings = {
  product: 'tyvek-homewrap', layer_mode: 'auto', include_seam_tape: true,
};

export const DEFAULT_FLASHING: FlashingSettings = {
  window_head: 'z-flashing', door_head: 'z-flashing', base_starter: 'z-flashing',
  include_kickout: true, include_corner_flashing: true, include_fortiflash: true,
  include_moistop: true, include_rolled_galv: false, include_joint_flashing: true,
};

export const DEFAULT_CONSUMABLES: ConsumablesSettings = {
  caulk_type: 'osi-quad', include_paintable_caulk: true, include_color_matched_caulk: true,
  include_primer_cans: false, include_spackle: false, include_wood_blades: false,
  include_hardie_blades: true, include_siding_nails: true, include_trim_nails: true,
};

export const DEFAULT_OVERHEAD: OverheadSettings = {
  include_dumpster: true, dumpster_cost: 1340, include_toilet: true, toilet_cost: 400,
  mobilization: 500, mobilization_note: 'Field Walks/Fuel', li_rate: 4.68,
  insurance_rate: 16.5, crew_size: 4, estimated_weeks: 2,
};

export const DEFAULT_ESTIMATE_CONFIG: EstimateConfig = {
  trim_system: 'hardie', wrb_product: 'tyvek-homewrap',
  window_trim: DEFAULT_WINDOW_TRIM, door_trim: DEFAULT_DOOR_TRIM,
  top_out: DEFAULT_TOP_OUT, belly_band: DEFAULT_BELLY_BAND,
  corners: DEFAULT_CORNERS, wrb: DEFAULT_WRB, flashing: DEFAULT_FLASHING,
  consumables: DEFAULT_CONSUMABLES, overhead: DEFAULT_OVERHEAD,
};

export const TRIM_SYSTEM_CASCADES: Record<TrimSystem, {
  window_trim: Partial<WindowTrimSettings>;
  door_trim: Partial<DoorTrimSettings>;
  flashing: Partial<FlashingSettings>;
  consumables: Partial<ConsumablesSettings>;
}> = {
  hardie: {
    window_trim: { material: 'hardie_5/4x4', include_slope_sill: false },
    door_trim: { material: 'hardie_5/4x4' },
    flashing: {
      window_head: 'z-flashing', door_head: 'z-flashing',
      include_fortiflash: true, include_moistop: true, include_rolled_galv: false,
    },
    consumables: {
      caulk_type: 'osi-quad', include_paintable_caulk: true, include_color_matched_caulk: true,
      include_primer_cans: false, include_spackle: false,
      include_wood_blades: false, include_hardie_blades: true,
    },
  },
  whitewood: {
    window_trim: { material: 'whitewood_1x6', include_slope_sill: true },
    door_trim: { material: 'whitewood_2x6' },
    flashing: {
      window_head: 'kynar', door_head: 'kynar',
      include_fortiflash: true, include_moistop: true, include_rolled_galv: true,
    },
    consumables: {
      caulk_type: 'titebond', include_paintable_caulk: false, include_color_matched_caulk: false,
      include_primer_cans: true, include_spackle: true,
      include_wood_blades: true, include_hardie_blades: true,
    },
  },
};

export const TRIM_SYSTEM_INFO: Record<TrimSystem, { label: string; hint: string }> = {
  hardie: { label: 'James Hardie', hint: 'Fiber cement trim (5/4), J-Channel, Z-Flashing' },
  whitewood: { label: 'WhiteWood', hint: 'Wood trim (1x/2x), Kynar flashing, Titebond caulk' },
};

export const WINDOW_TRIM_MATERIALS: Record<TrimSystem, { value: string; label: string }[]> = {
  hardie: [
    { value: 'hardie_5/4x4', label: 'Hardie 5/4 x 4' },
    { value: 'hardie_5/4x6', label: 'Hardie 5/4 x 6' },
  ],
  whitewood: [
    { value: 'whitewood_1x4', label: '1x4 WhiteWood' },
    { value: 'whitewood_1x6', label: '1x6 WhiteWood' },
    { value: 'whitewood_1x8', label: '1x8 WhiteWood' },
  ],
};

export const DOOR_TRIM_MATERIALS: Record<TrimSystem, { value: string; label: string }[]> = {
  hardie: [
    { value: 'hardie_5/4x4', label: 'Hardie 5/4 x 4' },
    { value: 'hardie_5/4x6', label: 'Hardie 5/4 x 6' },
  ],
  whitewood: [
    { value: 'whitewood_2x6', label: '2x6 WhiteWood' },
    { value: 'whitewood_2x8', label: '2x8 WhiteWood' },
  ],
};

export const TOP_OUT_SIZE_1_OPTIONS = [
  { value: '1x2', label: '1x2 (16\')' },
  { value: '1x3', label: '1x3 (16\')' },
  { value: '1x4', label: '1x4 (16\')' },
];

export const TOP_OUT_SIZE_2_OPTIONS = [
  { value: '2x2', label: '2x2 (20\')' },
  { value: '2x4', label: '2x4 (20\')' },
];

export const BELLY_BAND_SIZE_OPTIONS = [
  { value: '1x8', label: '1x8' },
  { value: '2x10', label: '2x10' },
  { value: '2x12', label: '2x12' },
];

export const WRB_PRODUCTS = [
  { value: 'henry-jumbotex', label: 'Henry JumboTex', hint: 'Double-layer for lap areas' },
  { value: 'henry-hydrotex', label: 'Henry HydroTex', hint: 'Single layer' },
  { value: 'tyvek-homewrap', label: 'Tyvek HomeWrap', hint: 'Single layer standard' },
  { value: 'hardiewrap', label: 'HardieWrap', hint: 'Hardie weather barrier' },
];

export const FLASHING_HEAD_OPTIONS = [
  { value: 'kynar', label: 'Kynar' },
  { value: 'galvanized', label: 'Galvanized' },
  { value: 'z-flashing', label: 'Z-Flashing' },
  { value: 'none', label: 'None' },
];

export const FLASHING_BASE_OPTIONS = [
  { value: 'z-flashing', label: 'Z-Flashing' },
  { value: 'drip-edge', label: 'Drip Edge' },
  { value: 'none', label: 'None' },
];

export const CAULK_TYPE_OPTIONS: Record<TrimSystem, { value: string; label: string }[]> = {
  hardie: [
    { value: 'osi-quad', label: 'OSI Quad Maxx' },
    { value: 'hardie', label: 'Hardie Caulk' },
    { value: 'other', label: 'Other' },
  ],
  whitewood: [
    { value: 'titebond', label: 'Titebond White' },
    { value: 'osi-quad', label: 'OSI Quad Maxx' },
    { value: 'other', label: 'Other' },
  ],
};
