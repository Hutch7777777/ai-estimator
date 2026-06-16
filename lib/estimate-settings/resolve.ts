import {
  DEFAULT_ESTIMATE_CONFIG,
  DEFAULT_ESTIMATE_DEFAULTS_V1,
  DEFAULT_OVERHEAD,
} from './defaults';
import type {
  EstimateConfig,
  EstimateDefaultsSources,
  EstimateDefaultsV1,
  EstimateDefaultSource,
  OverheadSettings,
  WRBProductId,
} from './types';

type SettingsBag = Record<string, unknown> | null | undefined;

export interface ResolveEstimateDefaultsInput {
  organizationSettings?: SettingsBag;
  projectConfig?: Partial<EstimateDefaultsV1> | Record<string, unknown> | null;
  projectMarkupPercent?: number | string | null;
}

export interface ResolvedEstimateDefaults {
  defaults: EstimateDefaultsV1;
  sources: EstimateDefaultsSources;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeEstimateConfig(...configs: Array<Partial<EstimateConfig> | undefined | null>): EstimateConfig {
  const merged = configs.reduce<Partial<EstimateConfig>>(
    (acc, cfg) => ({ ...acc, ...(cfg || {}) }),
    {}
  );

  return {
    ...DEFAULT_ESTIMATE_CONFIG,
    ...merged,
    window_trim: { ...DEFAULT_ESTIMATE_CONFIG.window_trim, ...configs[0]?.window_trim, ...configs[1]?.window_trim, ...configs[2]?.window_trim },
    door_trim: { ...DEFAULT_ESTIMATE_CONFIG.door_trim, ...configs[0]?.door_trim, ...configs[1]?.door_trim, ...configs[2]?.door_trim },
    top_out: { ...DEFAULT_ESTIMATE_CONFIG.top_out, ...configs[0]?.top_out, ...configs[1]?.top_out, ...configs[2]?.top_out },
    belly_band: { ...DEFAULT_ESTIMATE_CONFIG.belly_band, ...configs[0]?.belly_band, ...configs[1]?.belly_band, ...configs[2]?.belly_band },
    corners: { ...DEFAULT_ESTIMATE_CONFIG.corners, ...configs[0]?.corners, ...configs[1]?.corners, ...configs[2]?.corners },
    wrb: { ...DEFAULT_ESTIMATE_CONFIG.wrb, ...configs[0]?.wrb, ...configs[1]?.wrb, ...configs[2]?.wrb },
    flashing: { ...DEFAULT_ESTIMATE_CONFIG.flashing, ...configs[0]?.flashing, ...configs[1]?.flashing, ...configs[2]?.flashing },
    consumables: { ...DEFAULT_ESTIMATE_CONFIG.consumables, ...configs[0]?.consumables, ...configs[1]?.consumables, ...configs[2]?.consumables },
    overhead: { ...DEFAULT_OVERHEAD, ...configs[0]?.overhead, ...configs[1]?.overhead, ...configs[2]?.overhead },
  };
}

function asEstimateDefaults(value: unknown): Partial<EstimateDefaultsV1> | null {
  return isObject(value) ? (value as Partial<EstimateDefaultsV1>) : null;
}

function legacyOrgEstimateDefaults(settings: SettingsBag): Partial<EstimateDefaultsV1> {
  if (!isObject(settings)) return {};

  const overheadConfig = isObject(settings.overhead_config) ? settings.overhead_config : {};
  const laborRates = isObject(settings.labor_rates) ? settings.labor_rates : {};

  const overhead: Partial<OverheadSettings> = {
    include_dumpster: typeof overheadConfig.include_dumpster === 'boolean'
      ? overheadConfig.include_dumpster
      : undefined,
    dumpster_cost: toNumber(overheadConfig.dumpster_rate) ?? undefined,
    include_toilet: typeof overheadConfig.include_toilet === 'boolean'
      ? overheadConfig.include_toilet
      : undefined,
    toilet_cost: toNumber(overheadConfig.toilet_rate) ?? undefined,
    mobilization: toNumber(overheadConfig.mobilization_total) ?? undefined,
    mobilization_note: typeof overheadConfig.mobilization_note === 'string'
      ? overheadConfig.mobilization_note
      : undefined,
    li_rate: toNumber(overheadConfig.li_hourly_rate) ?? undefined,
    insurance_rate: toNumber(overheadConfig.insurance_rate_per_thousand) ?? undefined,
    crew_size: toNumber(laborRates.default_crew_size) ?? undefined,
  };

  return {
    markup_percent: toNumber(settings.default_markup_percent) ?? undefined,
    overhead,
  } as Partial<EstimateDefaultsV1>;
}

export function resolveOrganizationEstimateDefaults(settings: SettingsBag): EstimateDefaultsV1 {
  const orgDefaults = asEstimateDefaults(isObject(settings) ? settings.estimate_defaults_v1 : null);
  const legacyDefaults = legacyOrgEstimateDefaults(settings);
  const config = mergeEstimateConfig(legacyDefaults, orgDefaults);
  const wrbProduct = (orgDefaults?.wrb?.product ?? orgDefaults?.wrb_product ?? config.wrb.product ?? config.wrb_product ?? null) as WRBProductId;

  return {
    ...config,
    markup_percent:
      toNumber(orgDefaults?.markup_percent) ??
      toNumber(legacyDefaults.markup_percent) ??
      DEFAULT_ESTIMATE_DEFAULTS_V1.markup_percent,
    wrb_product: wrbProduct,
    wrb: {
      ...config.wrb,
      product: wrbProduct,
    },
  };
}

export function resolveEstimateDefaults({
  organizationSettings,
  projectConfig,
  projectMarkupPercent,
}: ResolveEstimateDefaultsInput): ResolvedEstimateDefaults {
  const orgDefaults = resolveOrganizationEstimateDefaults(organizationSettings);
  const projectDefaults = asEstimateDefaults(projectConfig);
  const projectMarkup = toNumber(projectMarkupPercent ?? projectDefaults?.markup_percent);

  const defaults: EstimateDefaultsV1 = {
    ...mergeEstimateConfig(orgDefaults, projectDefaults),
    markup_percent: projectMarkup ?? orgDefaults.markup_percent,
  };

  const configSource: EstimateDefaultSource = projectDefaults ? 'project' : 'organization';

  return {
    defaults: {
      ...defaults,
      wrb_product: (defaults.wrb_product ?? defaults.wrb.product ?? null) as WRBProductId,
      wrb: {
        ...defaults.wrb,
        product: (defaults.wrb.product ?? defaults.wrb_product ?? null) as WRBProductId,
      },
    },
    sources: {
      markup_percent: projectMarkup !== null ? 'project' : 'organization',
      trim_system: projectDefaults?.trim_system ? 'project' : configSource,
      wrb_product: projectDefaults?.wrb_product || projectDefaults?.wrb?.product ? 'project' : configSource,
      estimate_config: configSource,
    },
  };
}

export function estimateDefaultsToConfig(defaults: EstimateDefaultsV1): EstimateConfig {
  const { markup_percent, ...config } = defaults;
  void markup_percent;
  return config;
}

export function estimateDefaultsToProjectConfig(defaults: EstimateDefaultsV1): EstimateDefaultsV1 {
  return {
    ...defaults,
    estimate_defaults_version: 'estimate_defaults_v1',
  } as EstimateDefaultsV1;
}
