import type {
  EstimateConfig,
  OverheadSettings,
  TrimSystem,
} from '@/lib/estimate-settings/types';

export type {
  BellyBandSettings,
  CaulkType,
  ConsumablesSettings,
  CornersSettings,
  DoorTrimSettings,
  EstimateConfig,
  EstimateDefaultsV1,
  FlashingBaseType,
  FlashingHeadType,
  FlashingSettings,
  LayerMode,
  OverheadSettings,
  TopOutSettings,
  TrimSystem,
  WindowTrimSettings,
  WRBProductId,
  WRBSettings,
} from '@/lib/estimate-settings/types';

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
