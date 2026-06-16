/**
 * Server-only: build the SidingOrchestratorV2RefData bag the engine needs.
 *
 * Mirrors every DB read the source orchestrator + autoscope-v2 + configService
 * + pricing service did, but stitched together as one server-side helper that
 * the new `/api/estimating/calculate-siding` route invokes. The engine package
 * itself stays dependency-free; all I/O lives here.
 *
 * Auth model:
 *  - Tables the user has RLS access to (project_configurations, pricing_items,
 *    organization_pricing_overrides, siding_auto_scope_rules, labor_rates,
 *    labor_auto_scope_rules, overhead_costs, detection_class_material_mapping,
 *    calculation_constants) are read via the cookie-scoped client passed in.
 *  - `organizations.settings.overhead_config` requires service-role access
 *    (matches source's `getSupabaseServiceClient()` pattern). The service
 *    client is created lazily and only when an `organizationId` is supplied.
 *
 * Failure semantics: every fetch is independently try/catch'd. A failure
 * degrades to a safe default (empty array, null, hardcoded constants) — the
 * source did the same so the engine could still emit a takeoff when the DB
 * was unconfigured.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { loadDetectionCountPricing } from './detectionCountPricing';

import {
  applyOrgOverridesById,
  applyOrgOverridesBySku,
} from '@/packages/estimating-engine/src/pricing/applyOrganizationOverrides';
import type { SidingOrchestratorV2RefData } from '@/packages/estimating-engine/src/orchestrators/sidingOrchestratorV2';
import type { DbAutoScopeRule } from '@/packages/estimating-engine/src/autoscope/autoscopeV2';
import type { DetectionCountPricing } from '@/packages/estimating-engine/src/types/detectionCountPricing';
import type {
  CalculationConstants,
  ProjectEstimateSettings,
} from '@/packages/estimating-engine/src/types/config';
import type { PricingItem, PricingOverride } from '@/packages/estimating-engine/src/types/pricing';
import type { CadHoverMeasurements } from '@/packages/estimating-engine/src/types/autoscope';
import type {
  LaborRate,
  LaborAutoScopeRule,
  OverheadCost,
  OrgOverheadConfig,
  DetectionClassMapping,
} from '@/packages/estimating-engine/src/types/orchestrator';

// ----------------------------------------------------------------------------
// Hardcoded fallbacks. Mirrors `services/configService.ts:DEFAULT_CONSTANTS`
// (numeric values from `orchestrator-v2.ts:144-150`). Used when the
// `calculation_constants` table is missing, empty, or the read fails.
// ----------------------------------------------------------------------------

const DEFAULT_CONSTANTS: CalculationConstants = {
  markup_rate: 0.26,
  soc_unemployment_rate: 0.1265,
  li_hourly_rate: 3.56,
  insurance_rate_per_thousand: 24.38,
  default_crew_size: 4,
  default_estimated_weeks: 2,
  labor_rate_lap_siding: 0,
  labor_rate_shingle_siding: 0,
  labor_rate_panel_siding: 0,
  labor_rate_board_batten: 0,
};

// ----------------------------------------------------------------------------

export interface BuildRefDataArgs {
  /** Project UUID (used to look up `project_configurations.configuration_data`). */
  projectId?: string;
  /** Org UUID (used for the `organizations` lookup + pricing overrides). */
  organizationId?: string;
  /**
   * Extraction job UUID (== `body.job_id`). Used to pull the row the n8n
   * Approve workflow's `Store Measurements` step writes to
   * `cad_hover_measurements (extraction_id)`. Engine reads it as
   * `dbMeasurements` — without this, every facade/openings field falls
   * through `webhookMeasurements`, which the n8n V9.2 mirror emits with
   * different column names, causing `FACADE_SOURCE using: 0` and the
   * manufacturer-group fallback inflation.
   */
  extractionId?: string;
  /**
   * Pricing item UUIDs referenced by `material_assignments`. The helper
   * fetches `pricing_items` for these IDs, then joins org overrides.
   */
  pricingItemIds: string[];
}

export async function buildSidingRefData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  args: BuildRefDataArgs
): Promise<SidingOrchestratorV2RefData> {
  const { projectId, organizationId, extractionId, pricingItemIds } = args;

  // TEMP DEBUG — confirm route is passing extractionId through. Remove once
  // dbMeasurements parity is confirmed.
  console.log('[buildSidingRefData args]', {
    projectId,
    organizationId,
    extractionId,
    pricingItemIds_count: pricingItemIds?.length ?? 0,
  });

  // ---------- Parallel batch 1: independent reference tables ----------------
  const [
    calculationConstants,
    projectEstimateSettings,
    detectionClassMappings,
    laborRates,
    laborAutoScopeRules,
    overheadCosts,
    autoScopeRules,
    orgOverheadConfig,
    cadHoverMeasurements,
    detectionCountPricing,
  ] = await Promise.all([
    fetchCalculationConstants(supabase),
    fetchProjectEstimateSettings(projectId),
    fetchDetectionClassMappings(supabase),
    fetchLaborRates(supabase),
    fetchLaborAutoScopeRules(supabase),
    fetchOverheadCosts(supabase),
    fetchAutoScopeRules(supabase),
    fetchOrgOverheadConfig(organizationId),
    fetchCadHoverMeasurements(extractionId),
    // Step 1C: data availability only — engine does not yet consume this map.
    // Mirrors production's `loadDetectionCountPricing()` cache-warming call.
    // Failures are caught inside the loader and degrade to an empty map; a
    // top-level catch here covers any unexpected throw to keep the batch alive.
    loadDetectionCountPricing().catch((err) => {
      console.warn(
        '[buildSidingRefData] loadDetectionCountPricing threw:',
        err instanceof Error ? err.message : String(err)
      );
      return new Map<string, DetectionCountPricing>();
    }),
  ]);

  // ---------- Parallel batch 2: pricing (depends on rule SKUs) --------------
  const skus = uniq(autoScopeRules.map((r) => r.material_sku).filter(Boolean));
  const ids = uniq(pricingItemIds.filter(Boolean));

  const [rawPricingByIds, rawPricingBySkus, overrides, trimCatalog] = await Promise.all([
    ids.length > 0 ? fetchPricingByIds(supabase, ids) : Promise.resolve(new Map<string, PricingItem>()),
    skus.length > 0 ? fetchPricingBySkus(supabase, skus) : Promise.resolve(new Map<string, PricingItem>()),
    organizationId
      ? fetchOrgPricingOverrides(supabase, organizationId)
      : Promise.resolve(new Map<string, PricingOverride>()),
    // Step 2.5: full trim catalog (`pricing_items WHERE category='trim'`).
    // Needed by the engine's resolveHardieTrimSku DB-filter — it scans for
    // candidates by category + is_colorplus + product_name width pattern,
    // which requires more than just rule-emitted SKUs to be in the cache.
    fetchAllTrimPricing(supabase),
  ]);

  // Safe-merge trim catalog into rawPricingBySkus BEFORE overlay so that any
  // org-level pricing overrides apply to trim items too. Existing entries
  // (rule-emitted SKUs that may also be in the trim catalog) take priority —
  // we only ADD new trim SKUs, never overwrite a rule-fetched row.
  for (const [sku, item] of trimCatalog) {
    if (!rawPricingBySkus.has(sku)) {
      rawPricingBySkus.set(sku, item);
    }
  }

  const pricingByIds = applyOrgOverridesById(rawPricingByIds, overrides);
  const pricingBySkus = applyOrgOverridesBySku(rawPricingBySkus, overrides);

  return {
    calculationConstants,
    projectEstimateSettings,
    detectionClassMappings,
    laborRates,
    laborAutoScopeRules,
    overheadCosts,
    orgOverheadConfig,
    autoScopeRules,
    pricingByIds,
    pricingBySkus,
    cadHoverMeasurements,
    detectionCountPricing,
  };
}

// ============================================================================
// FETCHERS — each isolated, each failure-safe. All `as any` casts mirror the
// pattern used elsewhere in this repo (extraction_jobs etc.) where tables are
// not in `lib/types/database.ts`.
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCalculationConstants(supabase: SupabaseClient<any, any, any>): Promise<CalculationConstants> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('calculation_constants')
      .select('constant_name, constant_value, trade')
      .eq('active', true)
      .or('trade.is.null,trade.eq.siding');

    if (error || !data || data.length === 0) {
      return { ...DEFAULT_CONSTANTS };
    }

    const out: CalculationConstants = { ...DEFAULT_CONSTANTS };
    // Globals first (trade IS NULL), then siding-specific overrides — matches
    // `services/configService.ts:124-132`.
    for (const row of data.filter((r: { trade: string | null }) => r.trade === null)) {
      out[row.constant_name] = Number(row.constant_value);
    }
    for (const row of data.filter((r: { trade: string | null }) => r.trade !== null)) {
      out[row.constant_name] = Number(row.constant_value);
    }
    return out;
  } catch {
    return { ...DEFAULT_CONSTANTS };
  }
}

async function fetchProjectEstimateSettings(
  projectId: string | undefined
): Promise<ProjectEstimateSettings | null> {
  if (!projectId) return null;
  try {
    // Use the service-role client to bypass RLS — matches
    // `services/configService.ts:343-345`. Without this, the cookie-scoped
    // client returns no rows for `project_configurations` and every
    // dbEstimateSettings override is silently skipped (which masks payload
    // overhead settings and produces the wrong L&I / insurance / Porta Potty
    // / Mobilization values).
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('project_configurations')
      .select('configuration_data, trade, updated_at')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false });

    if (error || !data || data.length === 0) return null;

    type Row = { configuration_data: ProjectEstimateSettings | null; trade: string | null };

    // Source preference order (configService.ts:366-385):
    // 1. trade='siding' row, 2. row that has overhead/trim/wrb keys, 3. first row.
    const siding = (data as Row[]).find((r) => r.trade === 'siding');
    if (siding?.configuration_data) {
      // TEMP DEBUG
      console.log('[refData projectEstimateSettings]', {
        found: true,
        source: 'trade=siding row',
        rowCount: data.length,
        overhead: siding.configuration_data.overhead ?? null,
      });
      return siding.configuration_data;
    }

    for (const row of data as Row[]) {
      const cfg = row.configuration_data as ProjectEstimateSettings | null;
      if (cfg && (cfg.overhead || cfg.trim_system || cfg.wrb || cfg.window_trim)) {
        // TEMP DEBUG
        console.log('[refData projectEstimateSettings]', {
          found: true,
          source: `row trade=${row.trade} (heuristic match)`,
          rowCount: data.length,
          overhead: cfg.overhead ?? null,
        });
        return cfg;
      }
    }
    const fallback = (data as Row[])[0]?.configuration_data ?? null;
    // TEMP DEBUG
    console.log('[refData projectEstimateSettings]', {
      found: !!fallback,
      source: fallback ? 'first-row fallback' : 'no rows after filter',
      rowCount: data.length,
      overhead: fallback?.overhead ?? null,
    });
    return fallback;
  } catch (err) {
    // TEMP DEBUG
    console.log('[refData projectEstimateSettings]', {
      found: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function fetchDetectionClassMappings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<DetectionClassMapping[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('detection_class_material_mapping')
      .select('class_name, display_name, measurement_type, unit_of_measure, waste_factor, trade, default_product_sku, presentation_group')
      .eq('active', true);

    if (error || !data) return [];
    return data as DetectionClassMapping[];
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchLaborRates(supabase: SupabaseClient<any, any, any>): Promise<LaborRate[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('labor_rates')
      .select('*')
      .eq('active', true)
      .eq('trade', 'siding');

    if (error || !data) return [];
    return data as LaborRate[];
  } catch {
    return [];
  }
}

async function fetchLaborAutoScopeRules(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<LaborAutoScopeRule[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('labor_auto_scope_rules')
      .select(`
        *,
        labor_rates (
          id,
          rate_name,
          description,
          unit,
          base_rate,
          difficulty_multiplier,
          min_charge,
          notes
        )
      `)
      .eq('active', true)
      .eq('trade', 'siding')
      .order('priority');

    if (error || !data) return [];
    return data as LaborAutoScopeRule[];
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOverheadCosts(supabase: SupabaseClient<any, any, any>): Promise<OverheadCost[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('overhead_costs')
      .select('*')
      .eq('active', true);

    if (error || !data) return [];
    return data as OverheadCost[];
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAutoScopeRules(supabase: SupabaseClient<any, any, any>): Promise<DbAutoScopeRule[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('siding_auto_scope_rules')
      .select('*')
      .eq('active', true)
      .order('group_order', { ascending: true })
      .order('item_order', { ascending: true });

    if (error || !data) return [];
    return data as DbAutoScopeRule[];
  } catch {
    return [];
  }
}

/**
 * Service-role read. The cookie-scoped client cannot resolve
 * `organizations.settings` because of RLS; the source documents this
 * explicitly ("API isn't authenticated as a user"). We import the service
 * client lazily so a missing `SUPABASE_SERVICE_ROLE_KEY` only fails the
 * org-overhead lookup, not the entire takeoff.
 */
async function fetchOrgOverheadConfig(
  organizationId: string | undefined
): Promise<OrgOverheadConfig | null> {
  if (!organizationId) {
    // TEMP DEBUG
    console.log('[refData orgOverheadConfig]', { found: false, reason: 'no organizationId' });
    return null;
  }
  try {
    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (svc as any)
      .from('organizations')
      .select('settings')
      .eq('id', organizationId)
      .maybeSingle();

    if (error || !data) {
      // TEMP DEBUG
      console.log('[refData orgOverheadConfig]', {
        found: false,
        error: error ? error.message : 'no row',
        organizationId,
      });
      return null;
    }
    const settings = data.settings as {
      overhead_config?: OrgOverheadConfig;
      estimate_defaults_v1?: {
        overhead?: {
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
        };
      };
    } | null;
    const estimateOverhead = settings?.estimate_defaults_v1?.overhead;
    const cfg = settings?.overhead_config ?? (estimateOverhead ? {
      include_dumpster: estimateOverhead.include_dumpster ?? true,
      dumpster_rate: estimateOverhead.dumpster_cost ?? 1340,
      include_toilet: estimateOverhead.include_toilet ?? true,
      toilet_rate: estimateOverhead.toilet_cost ?? 400,
      mobilization_total: estimateOverhead.mobilization ?? 500,
      mobilization_note: estimateOverhead.mobilization_note ?? 'Field Walks/Fuel',
      li_hourly_rate: estimateOverhead.li_rate ?? 4.68,
      insurance_rate_per_thousand: estimateOverhead.insurance_rate ?? 16.5,
      crew_size: estimateOverhead.crew_size,
      estimated_weeks: estimateOverhead.estimated_weeks,
    } : null);
    // TEMP DEBUG
    console.log('[refData orgOverheadConfig]', {
      found: !!cfg,
      organizationId,
      value: cfg ?? null,
    });
    return cfg ?? null;
  } catch (err) {
    // TEMP DEBUG
    console.log('[refData orgOverheadConfig]', {
      found: false,
      error: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    return null;
  }
}

/**
 * Service-role read of `cad_hover_measurements WHERE extraction_id = job_id`.
 * Production's V9.2 Approve workflow `INSERT … ON CONFLICT (extraction_id) DO
 * UPDATE`s this row before the Multi-Trade Coordinator dispatch, so the
 * siding-estimator's `fetchMeasurementsFromDatabase(extractionId)` always
 * finds it. The engine's `buildMeasurementContext` reads `facade_total_sqft`,
 * `openings_area_sqft`, `corners_outside_count`, etc. — exact column names
 * the Approve workflow writes.
 *
 * If no row exists (engine-only path that bypasses the n8n approve step),
 * this returns null — the orchestrator then degrades to webhookMeasurements
 * + manufacturer-group reconstruction, the same fallback behavior the source
 * uses when `fetchMeasurementsFromDatabase` returns null.
 */
async function fetchCadHoverMeasurements(
  extractionId: string | undefined
): Promise<CadHoverMeasurements | null> {
  // TEMP DEBUG — surface the exact reason this read returns null. Remove
  // once dbMeasurements parity is confirmed.
  if (!extractionId) {
    console.log('[refData cadHoverMeasurements query]', {
      extractionId,
      found: false,
      error: 'extractionId is empty/undefined — no fetch attempted',
    });
    return null;
  }
  try {
    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (svc as any)
      .from('cad_hover_measurements')
      .select('*')
      .eq('extraction_id', extractionId)
      .maybeSingle();

    console.log('[refData cadHoverMeasurements query]', {
      extractionId,
      found: !!data,
      error: error ? error.message : null,
    });

    if (error || !data) return null;
    return data as CadHoverMeasurements;
  } catch (err) {
    console.log('[refData cadHoverMeasurements query]', {
      extractionId,
      found: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function fetchPricingByIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  ids: string[]
): Promise<Map<string, PricingItem>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pricing_items')
      .select('*')
      .in('id', ids);

    const out = new Map<string, PricingItem>();
    if (error || !data) return out;
    for (const row of data as PricingItem[]) {
      if (row.id) out.set(row.id, row);
    }
    return out;
  } catch {
    return new Map();
  }
}

async function fetchPricingBySkus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  skus: string[]
): Promise<Map<string, PricingItem>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pricing_items')
      .select('*')
      .in('sku', skus);

    const out = new Map<string, PricingItem>();
    if (error || !data) return out;
    for (const row of data as PricingItem[]) {
      out.set(row.sku, row);
    }
    return out;
  } catch {
    return new Map();
  }
}

/**
 * Fetch the FULL trim catalog (`pricing_items WHERE category='trim'`).
 *
 * The engine's `resolveHardieTrimSku` (autoscope-v2.ts:259-310, ported in
 * Step 2) scans for candidates by `category='trim'` + `is_colorplus` + a
 * width pattern in `product_name`. Without this fetcher, only rule-emitted
 * SKUs would be in `pricingBySkus` and the DB-filter path would always miss
 * → fall through to the static fallback map → wrong SKU
 * (`CASING-5/4X4X12` instead of `JH-TRIM-BB-10-PR`).
 *
 * Fetched separately from `fetchPricingBySkus` so the rule-emitted entries
 * keep priority during the safe-merge in `buildSidingRefData`.
 */
async function fetchAllTrimPricing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<Map<string, PricingItem>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pricing_items')
      .select('*')
      .eq('category', 'trim');

    const out = new Map<string, PricingItem>();
    if (error || !data) return out;
    for (const row of data as PricingItem[]) {
      if (row.sku) out.set(row.sku, row);
    }
    return out;
  } catch {
    return new Map();
  }
}

async function fetchOrgPricingOverrides(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  organizationId: string
): Promise<Map<string, PricingOverride>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('organization_pricing_overrides')
      .select('pricing_item_id, material_cost_override, labor_rate_override, markup_percent_override')
      .eq('organization_id', organizationId);

    const out = new Map<string, PricingOverride>();
    if (error || !data) return out;
    for (const row of data as Array<{ pricing_item_id: string } & PricingOverride>) {
      out.set(row.pricing_item_id, {
        material_cost_override: row.material_cost_override,
        labor_rate_override: row.labor_rate_override,
        markup_percent_override: row.markup_percent_override,
      });
    }
    return out;
  } catch {
    return new Map();
  }
}

// ----------------------------------------------------------------------------

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
