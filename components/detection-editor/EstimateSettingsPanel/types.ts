// EstimateSettingsPanel/types.ts
export type TrimSystem = 'hardie' | 'whitewood';
export type CaulkType = 'titebond' | 'hardie' | 'osi-quad' | 'other';
export type FlashingHeadType = 'kynar' | 'galvanized' | 'z-flashing' | 'none';
export type FlashingBaseType = 'z-flashing' | 'drip-edge' | 'none';
export type WRBProductId = 'henry-jumbotex' | 'henry-hydrotex' | 'tyvek-homewrap' | 'hardiewrap' | null;
export type LayerMode = 'auto' | 'single' | 'double';

export interface WindowTrimSettings {
  include: boolean;
  material: string;
  include_slope_sill: boolean;
  manual_lf: number | null;
}

export interface DoorTrimSettings {
  include: boolean;
  material: string;
  manual_lf: number | null;
}

export interface TopOutSettings {
  include: boolean;
  size_1: string;
  size_2: string;
  manual_lf: number | null;
}

export interface BellyBandSettings {
  include: boolean;
  size: string;
  flashing_type: FlashingHeadType;
  manual_lf: number | null;
}

export interface CornersSettings {
  include_inside: boolean;
  outside_count: number | null;
  outside_lf: number | null;
  inside_count: number | null;
  inside_lf: number | null;
  default_height: number;
}

export interface WRBSettings {
  product: WRBProductId;
  layer_mode: LayerMode;
  include_seam_tape: boolean;
}

export interface FlashingSettings {
  window_head: FlashingHeadType;
  door_head: FlashingHeadType;
  base_starter: FlashingBaseType;
  include_kickout: boolean;
  include_corner_flashing: boolean;
  include_fortiflash: boolean;
  include_moistop: boolean;
  include_rolled_galv: boolean;
  include_joint_flashing: boolean;
}

export interface ConsumablesSettings {
  caulk_type: CaulkType;
  include_paintable_caulk: boolean;
  include_color_matched_caulk: boolean;
  include_titebond_caulk: boolean;  // WhiteWood: Titebond III caulk (rule 194)
  include_primer_cans: boolean;     // WhiteWood: Primer spray cans (rule 195)
  include_spackle: boolean;         // WhiteWood: Spackle (rule 196)
  include_wood_blades: boolean;     // WhiteWood: Wood saw blades (rule 197)
  include_hardie_blades: boolean;   // Hardie: Fiber cement blades (rule 198)
  include_siding_nails: boolean;
  include_trim_nails: boolean;
}

export interface OverheadSettings {
  include_dumpster: boolean;
  dumpster_cost: number;
  include_toilet: boolean;
  toilet_cost: number;
  mobilization: number;
  mobilization_note: string;
  li_rate: number;
  insurance_rate: number;
  crew_size: number;
  estimated_weeks: number;
}

export interface EstimateConfig {
  trim_system: TrimSystem;
  wrb_product: WRBProductId;
  window_trim: WindowTrimSettings;
  door_trim: DoorTrimSettings;
  top_out: TopOutSettings;
  belly_band: BellyBandSettings;
  corners: CornersSettings;
  wrb: WRBSettings;
  flashing: FlashingSettings;
  consumables: ConsumablesSettings;
  overhead: OverheadSettings;
}

export interface CalculatedMeasurements {
  window_trim_lf: number;
  door_trim_lf: number;
  belly_band_lf: number;
  facade_sf: number;
  facade_perimeter_lf: number;
  outside_corner_count: number;
  inside_corner_count: number;
}

export interface EstimateSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  markupPercent: number;
  onMarkupChange: (value: number) => void;
  onMarkupSave: (value: number) => void;
  trimSystem: TrimSystem;
  onTrimSystemChange: (value: TrimSystem) => void;
  wrbProduct: string | null;
  onWrbProductChange: (value: string | null) => void;
  estimateConfig?: Partial<EstimateConfig>;
  onEstimateConfigChange?: (config: Partial<EstimateConfig>) => void;
  calculatedValues?: CalculatedMeasurements;
  overheadDefaults?: Partial<OverheadSettings>;
}
