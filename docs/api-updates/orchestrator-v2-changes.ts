/**
 * Orchestrator V2 - Changes for Manufacturer-Aware Auto-Scope
 *
 * This file contains the CHANGES to apply to orchestrator-v2.ts
 * to pass manufacturer groups to the auto-scope system.
 *
 * INSTRUCTIONS:
 * 1. Add import for buildManufacturerGroups
 * 2. Update the calculateWithAutoScopeV2 function to build manufacturer groups
 * 3. Pass manufacturerGroups to generateAutoScopeItemsV2
 *
 * TRIM SYSTEM SUPPORT (v2.2):
 * 4. Extract trim_system from payload (payload.trim_system or payload.products.trim_system)
 * 5. Pass trimSystem option to generateAutoScopeItemsV2
 */

// ============================================================================
// CHANGE 1: Update imports (add buildManufacturerGroups)
// At the top of the file, update the import from autoscope-v2:
// ============================================================================

import {
  generateAutoScopeItemsV2,
  buildMeasurementContext,
  buildManufacturerGroups,  // NEW
} from './autoscope-v2';

import type { EstimateSettings } from '../../types/autoscope';

// ============================================================================
// CHANGE 2: In calculateWithAutoScopeV2 function
// After processing material assignments, add manufacturer grouping
//
// Find the section where generateAutoScopeItemsV2 is called and update it:
// ============================================================================

/**
 * Example of where to insert the manufacturer grouping code
 * in the calculateWithAutoScopeV2 function.
 *
 * Look for the section that processes materialAssignments and calls
 * generateAutoScopeItemsV2. The changes should be inserted as shown below.
 */
async function calculateWithAutoScopeV2_UPDATED_SECTION(
  // ... existing parameters
  payload: {
    // Standard payload fields
    trim_system?: 'hardie' | 'whitewood';
    products?: {
      trim_system?: 'hardie' | 'whitewood';
      [key: string]: unknown;
    };
    // Phase 2B: Full estimate settings from frontend
    estimate_settings?: EstimateSettings;
    [key: string]: unknown;
  },
  materialAssignments: Array<{
    pricing_item_id: string;
    quantity: number;
    unit: string;
    area_sqft?: number;
    perimeter_lf?: number;
    detection_id?: string;
  }>,
  webhookMeasurements: Record<string, unknown>,
  extractionId?: string,
  organizationId?: string,
) {
  // ... existing code for processing material assignments ...

  // =========================================================================
  // NEW (v2.2): Extract trim system from payload
  // Frontend sends this via: payload.trim_system or payload.products.trim_system
  // Defaults to 'hardie' if not specified
  // =========================================================================

  const trimSystem = payload.trim_system ||
                     payload.products?.trim_system ||
                     'hardie';

  console.log(`🪵 Trim system: ${trimSystem}`);
  if (trimSystem === 'whitewood') {
    console.log('   → Using WhiteWood lumber trim rules');
    console.log('   → Skipping default Hardie trim rules');
  }

  // =========================================================================
  // NEW (Phase 2B): Extract estimate_settings from payload
  // This contains section toggles and manual LF overrides from frontend
  // =========================================================================

  const estimateSettings: EstimateSettings | null = payload.estimate_settings || null;

  if (estimateSettings) {
    console.log('⚙️ estimate_settings received:', JSON.stringify({
      sections: {
        window_trim: estimateSettings.window_trim?.include,
        door_trim: estimateSettings.door_trim?.include,
        top_out: estimateSettings.top_out?.include,
        belly_band: estimateSettings.belly_band?.include,
        flashing: estimateSettings.flashing ? 'configured' : 'default',
        consumables: estimateSettings.consumables ? 'configured' : 'default',
        overhead: estimateSettings.overhead ? 'configured' : 'default',
      },
      overrides: {
        window_lf: estimateSettings.window_trim?.manual_lf,
        door_lf: estimateSettings.door_trim?.manual_lf,
        belly_band_lf: estimateSettings.belly_band?.manual_lf,
        corner_count: estimateSettings.corners?.outside_count,
      },
    }));
  } else {
    console.log('⚙️ No estimate_settings in payload (using defaults)');
  }

  // =========================================================================
  // NEW: Build manufacturer groups from material assignments
  // This aggregates SF/LF by manufacturer for per-manufacturer auto-scope
  // =========================================================================

  console.log('🏭 Building manufacturer groups from material assignments...');

  const manufacturerGroups = await buildManufacturerGroups(
    materialAssignments.map(a => ({
      pricing_item_id: a.pricing_item_id,
      quantity: a.quantity,
      unit: a.unit,
      area_sqft: a.area_sqft,
      perimeter_lf: a.perimeter_lf,
      detection_id: a.detection_id,
    })),
    organizationId
  );

  console.log(`🏭 Built ${Object.keys(manufacturerGroups).length} manufacturer groups`);
  for (const [mfr, data] of Object.entries(manufacturerGroups)) {
    console.log(`   ${mfr}: ${data.area_sqft.toFixed(0)} SF, ${data.linear_ft.toFixed(0)} LF`);
  }

  // =========================================================================
  // UPDATED: Pass manufacturer groups AND trim system to auto-scope
  // =========================================================================

  const autoScopeResult = await generateAutoScopeItemsV2(
    extractionId,
    webhookMeasurements,
    organizationId,
    {
      skipSidingPanels: materialAssignments.length > 0,
      manufacturerGroups,  // Pass manufacturer groups for per-manufacturer rules
      trimSystem,          // NEW (v2.2): Pass trim system for rule filtering
      estimateSettings,    // NEW (Phase 2B): Pass estimate settings for section toggles
    }
  );

  // ... rest of existing code ...
}

// ============================================================================
// FULL CONTEXT: Where this fits in the existing function
//
// The calculateWithAutoScopeV2 function typically has this structure:
// 1. Validate inputs
// 2. Process material assignments (ID-based pricing)
// 3. Generate auto-scope items (SKU-based)  <-- CHANGES GO HERE
// 4. Calculate labor
// 5. Calculate overhead
// 6. Compute totals
//
// The manufacturer grouping should happen AFTER processing material
// assignments but BEFORE generating auto-scope items.
// ============================================================================

/**
 * BEFORE (existing code):
 *
 * ```typescript
 * // Process material assignments...
 * const materialLineItems = await processMaterialAssignments(...);
 *
 * // Generate auto-scope items
 * const autoScopeResult = await generateAutoScopeItemsV2(
 *   extractionId,
 *   webhookMeasurements,
 *   organizationId,
 *   { skipSidingPanels: materialAssignments.length > 0 }
 * );
 * ```
 *
 * AFTER (with manufacturer grouping + trim system):
 *
 * ```typescript
 * // Process material assignments...
 * const materialLineItems = await processMaterialAssignments(...);
 *
 * // NEW (v2.2): Extract trim system from payload
 * const trimSystem = payload.trim_system ||
 *                    payload.products?.trim_system ||
 *                    'hardie';
 *
 * // NEW: Build manufacturer groups
 * const manufacturerGroups = await buildManufacturerGroups(
 *   materialAssignments,
 *   organizationId
 * );
 *
 * // Generate auto-scope items (now with manufacturer + trim system awareness)
 * const autoScopeResult = await generateAutoScopeItemsV2(
 *   extractionId,
 *   webhookMeasurements,
 *   organizationId,
 *   {
 *     skipSidingPanels: materialAssignments.length > 0,
 *     manufacturerGroups,  // Per-manufacturer rule application
 *     trimSystem,          // NEW (v2.2): Trim system toggling
 *   }
 * );
 * ```
 *
 * TRIM SYSTEM BEHAVIOR:
 *
 * When trimSystem='hardie' (default):
 * - Uses existing active rules (no change from current behavior)
 * - Hardie Starter Strip, Frieze Board, J-Channel, Window/Door Casing fire
 *
 * When trimSystem='whitewood':
 * - Loads inactive WhiteWood rules (rule_ids 178-198 with trigger_condition.trim_system='whitewood')
 * - Skips Hardie trim categories: starter_strip, frieze_board, j_channel, etc.
 * - WhiteWood rules fire: WW Window Trim, Slope Sill, Door Trim, O/S/I/S Corners,
 *   Top-Out, Belly Band, Kynar Flashings, FortiFlash, Moistop, Titebond Caulk,
 *   Primer, Spackle, Blades
 *
 * Non-trim rules (fasteners, WRB, siding panels, etc.) fire in both modes.
 */

// ============================================================================
// CHANGE 3 (Phase 2B): Overhead Settings Override
// After fetching org overhead config, merge estimate_settings.overhead
// ============================================================================

/**
 * Apply estimate_settings.overhead overrides to organization overhead config
 *
 * LOCATION: Find where overheadConfig is fetched from organizations.settings.overhead_config
 * INSERT AFTER: The org config fetch, BEFORE overhead calculations
 *
 * This allows per-project overrides from the Estimate Settings Panel
 */
function applyOverheadOverrides_EXAMPLE(
  overheadConfig: {
    include_dumpster?: boolean;
    dumpster_cost?: number;
    include_toilet?: boolean;
    toilet_cost?: number;
    mobilization_total?: number;
    li_hourly_rate?: number;
    insurance_rate_per_thousand?: number;
    crew_size?: number;
    estimated_weeks?: number;
  },
  estimateSettings: EstimateSettings | null
): void {
  if (!estimateSettings?.overhead) return;

  const oh = estimateSettings.overhead;

  if (oh.include_dumpster !== undefined) {
    overheadConfig.include_dumpster = oh.include_dumpster;
  }
  if (oh.dumpster_cost !== undefined) {
    overheadConfig.dumpster_cost = oh.dumpster_cost;
  }
  if (oh.include_toilet !== undefined) {
    overheadConfig.include_toilet = oh.include_toilet;
  }
  if (oh.toilet_cost !== undefined) {
    overheadConfig.toilet_cost = oh.toilet_cost;
  }
  if (oh.mobilization !== undefined) {
    overheadConfig.mobilization_total = oh.mobilization;
  }
  if (oh.li_rate !== undefined) {
    overheadConfig.li_hourly_rate = oh.li_rate;
  }
  if (oh.insurance_rate !== undefined) {
    overheadConfig.insurance_rate_per_thousand = oh.insurance_rate;
  }
  if (oh.crew_size !== undefined) {
    overheadConfig.crew_size = oh.crew_size;
  }
  if (oh.estimated_weeks !== undefined) {
    overheadConfig.estimated_weeks = oh.estimated_weeks;
  }

  console.log('⚙️ Overhead overridden from estimate_settings:', {
    dumpster: overheadConfig.include_dumpster,
    toilet: overheadConfig.include_toilet,
    mobilization: overheadConfig.mobilization_total,
    crew_size: overheadConfig.crew_size,
    weeks: overheadConfig.estimated_weeks,
  });
}

export { };
