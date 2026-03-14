/**
 * Auto-Scope V2 - Changes for Manufacturer-Aware Rules + SKU Pattern Matching
 *
 * This file contains the CHANGES to apply to autoscope-v2.ts
 * to support per-manufacturer auto-scope rules AND material-based trigger conditions.
 *
 * INSTRUCTIONS:
 * 1. Add DbTriggerCondition interface with material_category/sku_pattern
 * 2. Add AssignedMaterial and TriggerContext interfaces
 * 3. Add manufacturer_filter to DbAutoScopeRule interface
 * 4. Add the new buildManufacturerGroups() function
 * 5. Add the new buildManufacturerContext() function
 * 6. Replace shouldApplyRule() with new version supporting material triggers
 * 7. Add buildAssignedMaterialsFromPricing() helper function
 * 8. Replace the generateAutoScopeItemsV2() function with assignedMaterials support
 *
 * NEW TRIGGER CONDITIONS (v2.1):
 * - material_category: Matches against assigned material's category (e.g., "board_batten")
 * - sku_pattern: Substring match against assigned material's SKU (e.g., "16OC-CP")
 *
 * These enable rules that only fire for specific product types:
 * - Board & Batten specific accessories
 * - ColorPlus specific touch-up kits
 * - 16" OC vs 12" OC specific fasteners
 *
 * TRIM SYSTEM SUPPORT (v2.2):
 * - trim_system: 'hardie' | 'whitewood' - toggles which trim/flashing rules fire
 * - WhiteWood rules have trigger_condition.trim_system = 'whitewood' and active=false
 * - When trim_system='whitewood', we load inactive WhiteWood rules and skip Hardie trim rules
 * - When trim_system='hardie' (default), existing behavior unchanged
 *
 * ESTIMATE SETTINGS SUPPORT (Phase 2B):
 * - estimate_settings: Full config from frontend EstimateSettingsPanel
 * - Section toggles: window_trim.include, door_trim.include, belly_band.include, etc.
 * - Manual LF overrides: window_trim.manual_lf, door_trim.manual_lf, corners.outside_count
 * - Flashing/consumables toggles: flashing.include_kickout, consumables.include_siding_nails
 * - When section.include=false, skip ALL rules for that section
 * - When manual_lf is set, override the detected LF in measurement context
 */

import { getSupabaseClient, isDatabaseConfigured } from '../../services/database';
import { getPricingByIds, getPricingBySkus, calculateTotalLabor, PricingItem } from '../../services/pricing';
import {
  MeasurementContext,
  AutoScopeLineItem,
  AutoScopeV2Result,
  CadHoverMeasurements,
  ManufacturerGroups,
  ManufacturerMeasurements,
  EstimateSettings,  // Phase 2B
} from '../../types/autoscope';

// ============================================================================
// CHANGE 1: Update DbAutoScopeRule interface
// Add this field to the existing interface (around line 28)
// ============================================================================

// ============================================================================
// CHANGE 1a: Add DbTriggerCondition interface
// This defines all supported trigger condition types
// ============================================================================

interface DbTriggerCondition {
  // Existing measurement-based triggers
  always?: boolean;
  min_corners?: number;
  min_openings?: number;
  min_net_area?: number;
  min_facade_area?: number;
  min_belly_band_lf?: number;
  min_gable_topout_lf?: number;
  min_topout_lf?: number;
  min_trim_total_lf?: number;
  trim_total_lf_gt?: number;

  // NEW: Material-based triggers for SKU pattern matching
  // Matches against assigned materials from the Detection Editor
  material_category?: string;  // e.g., "board_batten" - matches pricing_items.category
  sku_pattern?: string;        // e.g., "16OC-CP" - substring match against pricing_items.sku

  // NEW (v2.2): Trim system trigger - used to identify WhiteWood-specific rules
  // When present in a rule's trigger_condition, the rule only fires if
  // the payload's trim_system matches this value
  trim_system?: 'hardie' | 'whitewood';

  // NEW (v2.3): Config match for string equality checks against estimateSettings
  // Similar to config_toggle but for string values instead of booleans
  // Used to conditionally fire rules based on dropdown/select values
  config_match?: {
    path: string;   // Dot-notation path into estimateSettings (e.g., "flashing.window_head")
    value: string;  // Expected value for the rule to fire (e.g., "z_flashing")
  };
}

// ============================================================================
// CHANGE 1b: Add AssignedMaterial interface for trigger context
// Contains material info needed for category/SKU matching in trigger conditions
// ============================================================================

export interface AssignedMaterial {
  /** SKU from pricing_items table (e.g., "JH-BBCP-16OC-CP-AW") */
  sku: string;
  /** Category from pricing_items table (e.g., "board_batten", "lap_siding") */
  category: string;
  /** Manufacturer name (e.g., "James Hardie") */
  manufacturer: string;
  /** Optional: pricing item ID for traceability */
  pricing_item_id?: string;
}

// ============================================================================
// CHANGE 1c: Add TriggerContext interface
// Extended context for evaluating trigger conditions with material info
// ============================================================================

export interface TriggerContext {
  /** Measurement data for measurement-based triggers */
  measurements: MeasurementContext;
  /** Material context for category/SKU matching triggers */
  assignedMaterials?: AssignedMaterial[];
}

interface DbAutoScopeRule {
  rule_id: number;
  rule_name: string;
  description: string | null;
  material_category: string;
  material_sku: string;
  quantity_formula: string;
  unit: string;
  output_unit: string | null;
  size_description: string | null;
  trigger_condition: DbTriggerCondition | null;
  presentation_group: string;
  group_order: number;
  item_order: number;
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  // NEW: Manufacturer filter for per-manufacturer rules
  // null = generic rule (applies to all manufacturers using total project area)
  // ['James Hardie'] = only applies to James Hardie products using Hardie SF
  // ['Engage Building Products'] = only applies to FastPlank using FastPlank SF
  manufacturer_filter: string[] | null;
}

// ============================================================================
// CHANGE 2: Add material assignment interface (for typing)
// ============================================================================

export interface MaterialAssignmentForGrouping {
  pricing_item_id: string;
  quantity: number;
  unit: string;
  area_sqft?: number;
  perimeter_lf?: number;
  detection_id?: string;
}

// ============================================================================
// CHANGE 3: Add buildManufacturerGroups() function
// Add this after buildMeasurementContext() function
// ============================================================================

/**
 * Group material assignments by manufacturer
 * Enriches assignments with manufacturer info from pricing_items table
 *
 * @param materialAssignments - Array of material assignments from Detection Editor
 * @param organizationId - Optional org ID for pricing overrides
 * @returns ManufacturerGroups map with aggregated measurements per manufacturer
 */
export async function buildManufacturerGroups(
  materialAssignments: MaterialAssignmentForGrouping[],
  organizationId?: string
): Promise<ManufacturerGroups> {
  const groups: ManufacturerGroups = {};

  if (!materialAssignments || materialAssignments.length === 0) {
    console.log('[AutoScope] No material assignments to group by manufacturer');
    return groups;
  }

  // Get unique pricing item IDs
  const pricingItemIds = [...new Set(
    materialAssignments
      .map(a => a.pricing_item_id)
      .filter(Boolean)
  )];

  if (pricingItemIds.length === 0) {
    console.log('[AutoScope] No pricing item IDs found in assignments');
    return groups;
  }

  // Fetch pricing with manufacturer info
  const pricingMap = await getPricingByIds(pricingItemIds, organizationId);

  console.log(`[AutoScope] Fetched pricing for ${pricingMap.size}/${pricingItemIds.length} items`);

  // Group assignments by manufacturer
  for (const assignment of materialAssignments) {
    const pricing = pricingMap.get(assignment.pricing_item_id);

    if (!pricing) {
      console.warn(`[AutoScope] No pricing found for ID: ${assignment.pricing_item_id}`);
      continue;
    }

    const manufacturer = pricing.manufacturer || 'Unknown';

    // Initialize group if needed
    if (!groups[manufacturer]) {
      groups[manufacturer] = {
        manufacturer,
        area_sqft: 0,
        linear_ft: 0,
        piece_count: 0,
        detection_ids: [],
      };
    }

    // Aggregate measurements based on unit
    const unit = (assignment.unit || 'EA').toUpperCase();

    if (unit === 'SF') {
      groups[manufacturer].area_sqft += assignment.quantity;
    } else if (unit === 'LF') {
      groups[manufacturer].linear_ft += assignment.quantity;
    } else {
      groups[manufacturer].piece_count += assignment.quantity;
    }

    // Also add explicit area/perimeter if provided
    if (assignment.area_sqft) {
      // Only add if not already counted via quantity
      if (unit !== 'SF') {
        groups[manufacturer].area_sqft += assignment.area_sqft;
      }
    }
    if (assignment.perimeter_lf) {
      // Only add if not already counted via quantity
      if (unit !== 'LF') {
        groups[manufacturer].linear_ft += assignment.perimeter_lf;
      }
    }

    // Track detection IDs
    if (assignment.detection_id) {
      groups[manufacturer].detection_ids.push(assignment.detection_id);
    }
  }

  // Log summary
  console.log(`[AutoScope] Built ${Object.keys(groups).length} manufacturer groups:`);
  for (const [mfr, data] of Object.entries(groups)) {
    console.log(`  ${mfr}:`);
    console.log(`    - Area: ${data.area_sqft.toFixed(2)} SF`);
    console.log(`    - Linear: ${data.linear_ft.toFixed(2)} LF`);
    console.log(`    - Pieces: ${data.piece_count}`);
    console.log(`    - Detections: ${data.detection_ids.length}`);
  }

  return groups;
}

// ============================================================================
// CHANGE 4: Add buildManufacturerContext() function
// Creates a MeasurementContext for a specific manufacturer's products
// ============================================================================

/**
 * Build a measurement context for a specific manufacturer's products
 * Uses the manufacturer's area/LF as the primary measurements,
 * while keeping other measurements (openings, corners) from total context
 *
 * @param mfrMeasurements - Aggregated measurements for one manufacturer
 * @param totalContext - Full project measurement context
 * @returns MeasurementContext with manufacturer-specific area values
 */
function buildManufacturerContext(
  mfrMeasurements: ManufacturerMeasurements,
  totalContext: MeasurementContext
): MeasurementContext {
  // Calculate perimeter from area using wall height
  const wallHeight = totalContext.avg_wall_height_ft || 10;
  const estimatedPerimeter = mfrMeasurements.area_sqft / wallHeight;

  // Start with total context (for things like openings, corners, etc.)
  // but override area measurements with manufacturer-specific values
  return {
    ...totalContext,

    // Override with manufacturer-specific measurements
    facade_sqft: mfrMeasurements.area_sqft,
    facade_area_sqft: mfrMeasurements.area_sqft,
    gross_wall_area_sqft: mfrMeasurements.area_sqft,
    net_siding_area_sqft: mfrMeasurements.area_sqft,

    // Linear measurements for this manufacturer
    facade_perimeter_lf: mfrMeasurements.linear_ft || estimatedPerimeter,
    level_starter_lf: mfrMeasurements.linear_ft || estimatedPerimeter,
  };
}

// ============================================================================
// CHANGE 4b (Phase 2B): Add applyEstimateSettingsOverrides() function
// Applies manual LF/count overrides from frontend to measurement context
// ============================================================================

/**
 * Apply estimate settings overrides to measurement context
 * Called AFTER building the measurement context but BEFORE evaluating rules
 *
 * @param context - Original measurement context
 * @param estimateSettings - Estimate settings from frontend (may be null)
 * @returns Modified measurement context with overrides applied
 */
function applyEstimateSettingsOverrides(
  context: MeasurementContext,
  estimateSettings: EstimateSettings | null
): MeasurementContext {
  if (!estimateSettings) return context;

  const overridden = { ...context };

  // Window trim LF override
  if (estimateSettings.window_trim?.manual_lf != null) {
    overridden.window_perimeter_lf = estimateSettings.window_trim.manual_lf;
    console.log('📐 Override window_perimeter_lf:', overridden.window_perimeter_lf);
  }

  // Door trim LF override
  if (estimateSettings.door_trim?.manual_lf != null) {
    overridden.door_perimeter_lf = estimateSettings.door_trim.manual_lf;
    console.log('📐 Override door_perimeter_lf:', overridden.door_perimeter_lf);
  }

  // Belly band LF override
  if (estimateSettings.belly_band?.manual_lf != null) {
    overridden.belly_band_lf = estimateSettings.belly_band.manual_lf;
    console.log('📐 Override belly_band_lf:', overridden.belly_band_lf);
  }

  // Gable top-out LF override
  if (estimateSettings.gable_topout?.manual_lf != null) {
    overridden.gable_topout_lf = estimateSettings.gable_topout.manual_lf;
    console.log('📐 Override gable_topout_lf:', overridden.gable_topout_lf);
  }

  // Top-out LF override
  if (estimateSettings.topout?.manual_lf != null) {
    overridden.topout_lf = estimateSettings.topout.manual_lf;
    console.log('📐 Override topout_lf:', overridden.topout_lf);
  }

  // Corner count overrides
  if (estimateSettings.corners?.outside_count != null) {
    overridden.outside_corners_count = estimateSettings.corners.outside_count;
    overridden.outside_corner_count = estimateSettings.corners.outside_count;
    console.log('📐 Override outside_corners_count:', overridden.outside_corners_count);
  }
  if (estimateSettings.corners?.inside_count != null) {
    overridden.inside_corners_count = estimateSettings.corners.inside_count;
    overridden.inside_corner_count = estimateSettings.corners.inside_count;
    console.log('📐 Override inside_corners_count:', overridden.inside_corners_count);
  }

  // Corner LF overrides
  if (estimateSettings.corners?.outside_lf != null) {
    overridden.outside_corner_lf = estimateSettings.corners.outside_lf;
    console.log('📐 Override outside_corner_lf:', overridden.outside_corner_lf);
  }
  if (estimateSettings.corners?.inside_lf != null) {
    overridden.inside_corner_lf = estimateSettings.corners.inside_lf;
    console.log('📐 Override inside_corner_lf:', overridden.inside_corner_lf);
  }

  // Recalculate totals if needed
  overridden.total_opening_perimeter_lf =
    overridden.window_perimeter_lf +
    overridden.door_perimeter_lf +
    overridden.garage_perimeter_lf;

  overridden.total_corner_lf =
    overridden.outside_corner_lf +
    overridden.inside_corner_lf;

  return overridden;
}

// ============================================================================
// CHANGE 5: Replace generateAutoScopeItemsV2() function
// Updated to support manufacturer-aware rule application
// ============================================================================

/**
 * Generate auto-scope line items using database-driven rules
 *
 * UPDATED: Now supports manufacturer-specific rules via manufacturer_filter column
 * - Rules with manufacturer_filter = null → apply to total project area
 * - Rules with manufacturer_filter = ['X'] → apply only to manufacturer X's area
 *
 * @param extractionId - Optional extraction ID for database measurements
 * @param webhookMeasurements - Optional webhook payload measurements
 * @param organizationId - Optional org ID for pricing overrides
 * @param options - Additional options including manufacturerGroups
 */
export async function generateAutoScopeItemsV2(
  extractionId?: string,
  webhookMeasurements?: Record<string, unknown>,
  organizationId?: string,
  options?: {
    skipSidingPanels?: boolean;
    manufacturerGroups?: ManufacturerGroups;
    /** NEW: Assigned materials for material_category/sku_pattern trigger conditions */
    assignedMaterials?: AssignedMaterial[];
    /** NEW (v2.2): Trim system selection - 'hardie' (default) or 'whitewood' */
    trimSystem?: 'hardie' | 'whitewood';
    /** NEW (Phase 2B): Full estimate settings for section toggles and overrides */
    estimateSettings?: EstimateSettings | null;
  }
): Promise<AutoScopeV2Result> {
  const result: AutoScopeV2Result = {
    line_items: [],
    rules_evaluated: 0,
    rules_triggered: 0,
    rules_skipped: [],
    measurement_source: 'fallback',
  };

  // 1. Build measurement context (for generic rules using total project measurements)
  let dbMeasurements: CadHoverMeasurements | null = null;

  if (extractionId) {
    dbMeasurements = await fetchMeasurementsFromDatabase(extractionId);
    if (dbMeasurements) {
      result.measurement_source = 'database';
    }
  }

  if (!dbMeasurements && webhookMeasurements) {
    result.measurement_source = 'webhook';
  }

  let totalContext = buildMeasurementContext(dbMeasurements, webhookMeasurements);
  const manufacturerGroups = options?.manufacturerGroups || {};
  const hasManufacturerGroups = Object.keys(manufacturerGroups).length > 0;

  // NEW: Extract assigned materials for material-based trigger conditions
  const assignedMaterials = options?.assignedMaterials || [];
  const hasAssignedMaterials = assignedMaterials.length > 0;

  if (hasAssignedMaterials) {
    console.log(`   Assigned materials: ${assignedMaterials.map(m => m.sku).join(', ')}`);
  }

  // NEW (v2.2): Extract trim system - controls which trim/flashing rules fire
  const trimSystem = options?.trimSystem || 'hardie';
  console.log(`   Trim system: ${trimSystem}`);

  // NEW (Phase 2B): Extract estimate settings and apply measurement overrides
  const estimateSettings = options?.estimateSettings || null;
  if (estimateSettings) {
    totalContext = applyEstimateSettingsOverrides(totalContext, estimateSettings);
  }

  // 2. Fetch auto-scope rules
  // UPDATED (v2.2): Pass trim system to fetch WhiteWood rules when needed
  const rules = await fetchAutoScopeRulesWithTrimSystem(trimSystem);
  result.rules_evaluated = rules.length;

  console.log(`📋 Evaluating ${rules.length} auto-scope rules...`);
  console.log(`   Total project area: ${totalContext.facade_area_sqft.toFixed(2)} SF`);
  console.log(`   Manufacturer groups: ${Object.keys(manufacturerGroups).join(', ') || 'none'}`);

  // 3. Evaluate each rule
  const triggeredRules: Array<{
    rule: DbAutoScopeRule;
    quantity: number;
    manufacturerApplied?: string;
  }> = [];

  const SIDING_MATERIAL_CATEGORIES = [
    'siding', 'siding_panels', 'lap_siding', 'shingle_siding',
    'panel_siding', 'vertical_siding'
  ];

  for (const rule of rules) {
    // Skip siding panel rules if user has siding assignments
    const isSidingCategory = SIDING_MATERIAL_CATEGORIES.includes(
      rule.material_category?.toLowerCase() || ''
    );
    if (options?.skipSidingPanels && isSidingCategory) {
      console.log(`  ⏭️ Rule ${rule.rule_id}: ${rule.rule_name} → SKIPPED (user has siding assignments)`);
      result.rules_skipped.push(`${rule.material_sku}: skipped - user has siding assignments`);
      continue;
    }

    // Check if this is a manufacturer-specific rule
    const isManufacturerSpecific = rule.manufacturer_filter && rule.manufacturer_filter.length > 0;

    if (isManufacturerSpecific) {
      // =====================================================================
      // MANUFACTURER-SPECIFIC RULE
      // Apply to each matching manufacturer group using their area only
      // =====================================================================

      if (!hasManufacturerGroups) {
        // No manufacturer groups - skip manufacturer-specific rules
        console.log(`  ⏭️ Rule ${rule.rule_id}: ${rule.rule_name} → SKIPPED (no manufacturer groups, requires: ${rule.manufacturer_filter!.join(', ')})`);
        result.rules_skipped.push(`${rule.material_sku}: no matching manufacturer groups`);
        continue;
      }

      for (const [manufacturer, groupMeasurements] of Object.entries(manufacturerGroups)) {
        // Check if this manufacturer matches the filter
        const matches = rule.manufacturer_filter!.some(filter =>
          manufacturer.toLowerCase().includes(filter.toLowerCase()) ||
          filter.toLowerCase().includes(manufacturer.toLowerCase())
        );

        if (!matches) {
          continue; // Skip this manufacturer for this rule
        }

        // Build manufacturer-specific context
        const mfrContext = buildManufacturerContext(groupMeasurements, totalContext);

        // Pass assigned materials for material_category/sku_pattern trigger checks
        // Phase 2B: Also pass estimateSettings for section toggles
        const { applies, reason } = shouldApplyRule(rule, mfrContext, assignedMaterials, estimateSettings);

        if (applies) {
          const { result: quantity, error } = evaluateFormula(rule.quantity_formula, mfrContext);

          if (error) {
            console.warn(`  ⚠️ Rule ${rule.rule_id} (${rule.rule_name}) for ${manufacturer}: Formula error - ${error}`);
            result.rules_skipped.push(`${rule.material_sku} (${manufacturer}): formula error - ${error}`);
            continue;
          }

          if (quantity > 0) {
            triggeredRules.push({
              rule,
              quantity,
              manufacturerApplied: manufacturer
            });
            result.rules_triggered++;
            console.log(`  ✓ Rule ${rule.rule_id}: ${rule.rule_name} [${manufacturer}: ${groupMeasurements.area_sqft.toFixed(0)} SF] → ${Math.ceil(quantity)} ${rule.unit} (${reason})`);
          } else {
            result.rules_skipped.push(`${rule.material_sku} (${manufacturer}): quantity=0`);
          }
        } else {
          result.rules_skipped.push(`${rule.material_sku} (${manufacturer}): ${reason}`);
        }
      }

    } else {
      // =====================================================================
      // GENERIC RULE (manufacturer_filter = null)
      // Apply to total project measurements
      // =====================================================================

      // Pass assigned materials for material_category/sku_pattern trigger checks
      // Phase 2B: Also pass estimateSettings for section toggles
      const { applies, reason } = shouldApplyRule(rule, totalContext, assignedMaterials, estimateSettings);

      if (applies) {
        const { result: quantity, error } = evaluateFormula(rule.quantity_formula, totalContext);

        if (error) {
          console.warn(`  ⚠️ Rule ${rule.rule_id} (${rule.rule_name}): Formula error - ${error}`);
          result.rules_skipped.push(`${rule.material_sku}: formula error - ${error}`);
          continue;
        }

        if (quantity > 0) {
          triggeredRules.push({ rule, quantity });
          result.rules_triggered++;
          console.log(`  ✓ Rule ${rule.rule_id}: ${rule.rule_name} [GENERIC: ${totalContext.facade_area_sqft.toFixed(0)} SF] → ${Math.ceil(quantity)} ${rule.unit} (${reason})`);
        } else {
          result.rules_skipped.push(`${rule.material_sku}: quantity=0`);
          console.log(`  ○ Rule ${rule.rule_id}: ${rule.rule_name} → 0 (formula returned 0)`);
        }
      } else {
        result.rules_skipped.push(`${rule.material_sku}: ${reason}`);
        console.log(`  ✗ Rule ${rule.rule_id}: ${rule.rule_name} → skipped (${reason})`);
      }
    }
  }

  // 4. Fetch pricing for triggered SKUs
  const skus = [...new Set(triggeredRules.map(tr => tr.rule.material_sku))];
  const pricingMap = await getPricingBySkus(skus, organizationId);

  // 5. Build line items with pricing
  for (const { rule, quantity, manufacturerApplied } of triggeredRules) {
    const pricing = pricingMap.get(rule.material_sku);

    const materialUnitCost = Number(pricing?.material_cost || 0);
    const laborUnitCost = Number(pricing?.base_labor_cost || 0);
    const totalLaborRate = pricing?.total_labor_cost || calculateTotalLabor(laborUnitCost);
    const finalQuantity = Math.ceil(quantity);

    // Add manufacturer to description if this is a manufacturer-specific item
    const description = manufacturerApplied
      ? `${rule.rule_name} (${manufacturerApplied})`
      : rule.rule_name;

    const lineItem: AutoScopeLineItem = {
      description,
      sku: rule.material_sku,
      quantity: finalQuantity,
      unit: rule.output_unit || rule.unit,
      category: rule.material_category,
      presentation_group: rule.presentation_group,

      material_unit_cost: materialUnitCost,
      material_extended: Math.round(finalQuantity * materialUnitCost * 100) / 100,
      labor_unit_cost: laborUnitCost,
      labor_extended: Math.round(finalQuantity * totalLaborRate * 100) / 100,

      calculation_source: 'auto-scope',
      rule_id: String(rule.rule_id),
      formula_used: rule.quantity_formula,
      notes: manufacturerApplied
        ? `Applied for ${manufacturerApplied} products (filter: ${rule.manufacturer_filter?.join(', ')})`
        : rule.description || undefined,
    };

    result.line_items.push(lineItem);
  }

  console.log(`✅ Auto-scope V2 complete: ${result.rules_triggered}/${result.rules_evaluated} rules triggered, ${result.line_items.length} line items`);

  return result;
}

// ============================================================================
// CHANGE 5b: Add resolveConfigValue() helper for config_match
// Walks a dot-notation path and returns the raw value (not coerced to boolean)
// ============================================================================

/**
 * Resolve a dot-notation path against an object and return the raw value.
 * Used by config_match to check string equality against estimateSettings.
 *
 * @param obj - The object to traverse (e.g., estimateSettings)
 * @param path - Dot-notation path (e.g., "flashing.window_head")
 * @returns The raw value at the path, or undefined if not found
 *
 * @example
 * resolveConfigValue({ flashing: { window_head: 'z_flashing' } }, 'flashing.window_head')
 * // Returns: 'z_flashing'
 */
function resolveConfigValue(obj: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!obj || !path) return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ============================================================================
// CHANGE 6: Replace shouldApplyRule() function
// Updated to support material_category and sku_pattern trigger conditions
// ============================================================================

/**
 * Evaluate whether a rule should apply based on its trigger_condition
 *
 * UPDATED: Now supports material-based triggers:
 * - material_category: matches against assigned material's category
 * - sku_pattern: substring match against assigned material's SKU
 *
 * UPDATED (Phase 2B): Now supports estimate_settings section toggles:
 * - window_trim.include, door_trim.include, belly_band.include, etc.
 * - When section.include=false, skip ALL rules for that section
 *
 * @param rule - The auto-scope rule to evaluate
 * @param context - Measurement context OR full trigger context with materials
 * @param assignedMaterials - Optional array of assigned materials (if not in context)
 * @param estimateSettings - Optional estimate settings for section toggles
 * @returns Object with applies boolean and reason string
 */
function shouldApplyRule(
  rule: DbAutoScopeRule,
  context: MeasurementContext | TriggerContext,
  assignedMaterials?: AssignedMaterial[],
  estimateSettings?: EstimateSettings | null
): { applies: boolean; reason: string } {
  const condition = rule.trigger_condition;

  // No condition = always apply
  if (!condition) {
    return { applies: true, reason: 'no trigger condition' };
  }

  // Extract measurements and materials from context
  const measurements: MeasurementContext = 'measurements' in context
    ? context.measurements
    : context;
  const materials: AssignedMaterial[] = 'assignedMaterials' in context
    ? (context.assignedMaterials || [])
    : (assignedMaterials || []);

  // =========================================================================
  // Check "always" condition first
  // =========================================================================
  if (condition.always === true) {
    return { applies: true, reason: 'always=true' };
  }

  // =========================================================================
  // Phase 2B: Check estimate_settings section toggles
  // These override ALL rules for a section when include=false
  // =========================================================================
  if (estimateSettings) {
    const cat = rule.material_category?.toLowerCase() || '';
    const ruleId = rule.rule_id;

    // Window trim section toggle
    if (estimateSettings.window_trim?.include === false && (cat === 'window_trim' || cat === 'casing')) {
      return { applies: false, reason: 'window_trim disabled' };
    }

    // Door trim section toggle
    if (estimateSettings.door_trim?.include === false && cat === 'door_trim') {
      return { applies: false, reason: 'door_trim disabled' };
    }

    // Top-out section toggle (rule_ids 184-185)
    if (estimateSettings.top_out?.include === false && (ruleId === 184 || ruleId === 185)) {
      return { applies: false, reason: 'top_out disabled' };
    }

    // Belly band section toggle
    if (estimateSettings.belly_band?.include === false) {
      const bellyBandCats = ['belly_band', 'belly_band_flashing', 'belly_band_caulk', 'belly_band_fastener'];
      const bellyBandRuleIds = [22, 23, 24, 25, 26, 27, 186, 187];
      if (bellyBandCats.includes(cat) || bellyBandRuleIds.includes(ruleId)) {
        return { applies: false, reason: 'belly_band disabled' };
      }
    }

    // Gable top-out section toggle
    if (estimateSettings.gable_topout?.include === false) {
      const gableTopoutCats = ['gable_topout', 'gable_topout_trim', 'gable_topout_flashing'];
      if (gableTopoutCats.includes(cat)) {
        return { applies: false, reason: 'gable_topout disabled' };
      }
    }

    // Top-out section toggle (eave/soffit termination)
    if (estimateSettings.topout?.include === false) {
      const topoutCats = ['topout', 'topout_trim', 'topout_flashing'];
      if (topoutCats.includes(cat)) {
        return { applies: false, reason: 'topout disabled' };
      }
    }

    // Flashing section toggles
    const fl = estimateSettings.flashing;
    if (fl) {
      if (fl.include_kickout === false && ruleId === 14) {
        return { applies: false, reason: 'kickout disabled' };
      }
      if (fl.include_corner_flashing === false && ruleId === 15) {
        return { applies: false, reason: 'corner flashing disabled' };
      }
      if (fl.include_fortiflash === false && ruleId === 192) {
        return { applies: false, reason: 'fortiflash disabled' };
      }
      if (fl.include_moistop === false && ruleId === 193) {
        return { applies: false, reason: 'moistop disabled' };
      }
      if (fl.include_rolled_galv === false && ruleId === 191) {
        return { applies: false, reason: 'rolled galv disabled' };
      }
      if (fl.include_joint_flashing === false && ruleId === 20) {
        return { applies: false, reason: 'joint flashing disabled' };
      }
      if (fl.window_head === 'none' && (ruleId === 19 || ruleId === 188)) {
        return { applies: false, reason: 'window head = none' };
      }
      if (fl.door_head === 'none' && (ruleId === 189 || ruleId === 190)) {
        return { applies: false, reason: 'door head = none' };
      }
      if (fl.base_starter === 'none' && ruleId === 13) {
        return { applies: false, reason: 'base starter = none' };
      }
    }

    // Consumables section toggles
    // V9.2.1: WhiteWood trim system defaults all consumables ON
    // (frontend settings panel isn't reliably passing these yet)
    const isWhiteWood = estimateSettings.trim_system === 'whitewood';
    const cs = estimateSettings.consumables || {};

    // Compute effective toggles with WhiteWood defaults
    const includePaintableCaulk = cs.include_paintable_caulk ?? true;
    const includeColorMatchedCaulk = cs.include_color_matched_caulk ?? true;
    const includePrimerCans = cs.include_primer_cans ?? isWhiteWood;
    const includeSpackle = cs.include_spackle ?? isWhiteWood;
    const includeWoodBlades = cs.include_wood_blades ?? isWhiteWood;
    const includeHardieBlades = cs.include_hardie_blades ?? true;
    const includeTitebondCaulk = cs.include_titebond_caulk ?? isWhiteWood; // Rule 194
    const includeSidingNails = cs.include_siding_nails ?? true;
    const includeTrimNails = cs.include_trim_nails ?? true;

    // Apply consumable toggles
    if (!includePaintableCaulk && ruleId === 17) {
      return { applies: false, reason: 'paintable caulk disabled' };
    }
    if (!includeColorMatchedCaulk && ruleId === 21) {
      return { applies: false, reason: 'color-matched caulk disabled' };
    }
    if (!includeTitebondCaulk && ruleId === 194) {
      return { applies: false, reason: 'titebond caulk disabled' };
    }
    if (!includePrimerCans && ruleId === 195) {
      return { applies: false, reason: 'primer cans disabled' };
    }
    if (!includeSpackle && ruleId === 196) {
      return { applies: false, reason: 'spackle disabled' };
    }
    if (!includeWoodBlades && ruleId === 197) {
      return { applies: false, reason: 'wood blades disabled' };
    }
    if (!includeHardieBlades && ruleId === 198) {
      return { applies: false, reason: 'hardie blades disabled' };
    }
    if (!includeSidingNails && ruleId === 8) {
      return { applies: false, reason: 'siding nails disabled' };
    }
    if (!includeTrimNails && ruleId === 16) {
      return { applies: false, reason: 'trim nails disabled' };
    }
  }

  // =========================================================================
  // Check material-based conditions (NEW)
  // These conditions check against assigned materials from Detection Editor
  // =========================================================================

  // Check material_category - must have at least one material with matching category
  if (condition.material_category) {
    const requiredCategory = condition.material_category.toLowerCase();
    const hasMatchingCategory = materials.some(
      m => m.category?.toLowerCase() === requiredCategory
    );

    if (!hasMatchingCategory) {
      return {
        applies: false,
        reason: `no material with category '${condition.material_category}'`
      };
    }
    // If we get here, material_category check passed - continue to other checks
  }

  // Check sku_pattern - must have at least one material with SKU containing pattern
  // V9.1 FIX: When material_category is also specified, only check sku_pattern
  // against products in that category, not ALL assigned products
  if (condition.sku_pattern) {
    const pattern = condition.sku_pattern.toLowerCase();

    // Filter to category-specific products when material_category is specified
    const productsToCheck = condition.material_category
      ? materials.filter(m => m.category?.toLowerCase() === condition.material_category.toLowerCase())
      : materials;

    console.log(`🔍 Rule ${rule.rule_id} sku_pattern check: "${condition.sku_pattern}" against ${productsToCheck.length} products (category: ${condition.material_category || 'all'})`);

    const hasMatchingSku = productsToCheck.some(
      m => m.sku?.toLowerCase().includes(pattern)
    );

    if (!hasMatchingSku) {
      console.log(`[AutoScope] Rule ${rule.rule_id} skipped: sku_pattern "${condition.sku_pattern}" not found in ${condition.material_category || 'all'} products`);
      return {
        applies: false,
        reason: `no material SKU matching pattern '${condition.sku_pattern}' in ${condition.material_category || 'all'} products`
      };
    }
    // If we get here, sku_pattern check passed - continue to other checks
  }

  // =========================================================================
  // Check config_match condition (NEW v2.3)
  // String equality check against estimateSettings values
  // =========================================================================
  if (condition.config_match) {
    const { path, value } = condition.config_match;
    const actualValue = resolveConfigValue(estimateSettings as Record<string, unknown>, path);

    // If path resolves to undefined/null, let the rule fire (backwards compatible)
    if (actualValue !== undefined && actualValue !== null) {
      if (String(actualValue) !== value) {
        console.log(`🔀 Rule ${rule.rule_id}: ${rule.name || rule.rule_name} — SKIPPED (config match failed: ${path}=${actualValue}, expected ${value})`);
        return {
          applies: false,
          reason: `config_match failed: ${path}=${actualValue}, expected ${value}`
        };
      }
    }
    // If actualValue is undefined/null, continue (don't skip rule)
  }

  // =========================================================================
  // Check measurement-based conditions (existing logic)
  // =========================================================================

  // min_corners check
  if (condition.min_corners !== undefined) {
    const cornerCount = measurements.outside_corners_count || measurements.outside_corner_count || 0;
    if (cornerCount < condition.min_corners) {
      return { applies: false, reason: `corners ${cornerCount} < ${condition.min_corners}` };
    }
  }

  // min_openings check
  if (condition.min_openings !== undefined) {
    const openingsCount = measurements.openings_count || measurements.total_openings_count || 0;
    if (openingsCount < condition.min_openings) {
      return { applies: false, reason: `openings ${openingsCount} < ${condition.min_openings}` };
    }
  }

  // min_net_area check
  if (condition.min_net_area !== undefined) {
    const netArea = measurements.net_siding_area_sqft || 0;
    if (netArea < condition.min_net_area) {
      return { applies: false, reason: `net area ${netArea.toFixed(0)} < ${condition.min_net_area}` };
    }
  }

  // min_facade_area check
  if (condition.min_facade_area !== undefined) {
    const facadeArea = measurements.facade_area_sqft || measurements.facade_sqft || 0;
    if (facadeArea < condition.min_facade_area) {
      return { applies: false, reason: `facade area ${facadeArea.toFixed(0)} < ${condition.min_facade_area}` };
    }
  }

  // min_belly_band_lf check
  if (condition.min_belly_band_lf !== undefined) {
    const bellyBandLf = measurements.belly_band_lf || 0;
    if (bellyBandLf < condition.min_belly_band_lf) {
      return { applies: false, reason: `belly band ${bellyBandLf.toFixed(0)} LF < ${condition.min_belly_band_lf}` };
    }
  }

  // min_gable_topout_lf check
  if (condition.min_gable_topout_lf !== undefined) {
    const gableTopoutLf = measurements.gable_topout_lf || 0;
    if (gableTopoutLf < condition.min_gable_topout_lf) {
      return { applies: false, reason: `gable topout ${gableTopoutLf.toFixed(0)} LF < ${condition.min_gable_topout_lf}` };
    }
  }

  // min_topout_lf check
  if (condition.min_topout_lf !== undefined) {
    const topoutLf = measurements.topout_lf || 0;
    if (topoutLf < condition.min_topout_lf) {
      return { applies: false, reason: `topout ${topoutLf.toFixed(0)} LF < ${condition.min_topout_lf}` };
    }
  }

  // min_trim_total_lf check
  if (condition.min_trim_total_lf !== undefined) {
    const trimTotalLf = measurements.trim_total_lf || 0;
    if (trimTotalLf < condition.min_trim_total_lf) {
      return { applies: false, reason: `trim total ${trimTotalLf.toFixed(0)} LF < ${condition.min_trim_total_lf}` };
    }
  }

  // trim_total_lf_gt check (alternative syntax: greater than)
  if (condition.trim_total_lf_gt !== undefined) {
    const trimTotalLf = measurements.trim_total_lf || 0;
    if (trimTotalLf <= condition.trim_total_lf_gt) {
      return { applies: false, reason: `trim total ${trimTotalLf.toFixed(0)} LF <= ${condition.trim_total_lf_gt}` };
    }
  }

  // =========================================================================
  // All conditions passed
  // =========================================================================

  // Build reason string showing which conditions matched
  const matchedConditions: string[] = [];

  if (condition.material_category) {
    matchedConditions.push(`category=${condition.material_category}`);
  }
  if (condition.sku_pattern) {
    matchedConditions.push(`sku~${condition.sku_pattern}`);
  }
  if (condition.min_corners !== undefined) {
    matchedConditions.push(`corners>=${condition.min_corners}`);
  }
  if (condition.min_openings !== undefined) {
    matchedConditions.push(`openings>=${condition.min_openings}`);
  }
  if (condition.min_net_area !== undefined) {
    matchedConditions.push(`netArea>=${condition.min_net_area}`);
  }
  if (condition.min_facade_area !== undefined) {
    matchedConditions.push(`facadeArea>=${condition.min_facade_area}`);
  }
  if (condition.min_belly_band_lf !== undefined) {
    matchedConditions.push(`bellyBand>=${condition.min_belly_band_lf}`);
  }
  if (condition.min_gable_topout_lf !== undefined) {
    matchedConditions.push(`gableTopout>=${condition.min_gable_topout_lf}`);
  }
  if (condition.min_topout_lf !== undefined) {
    matchedConditions.push(`topout>=${condition.min_topout_lf}`);
  }
  if (condition.min_trim_total_lf !== undefined) {
    matchedConditions.push(`trimTotal>=${condition.min_trim_total_lf}`);
  }
  if (condition.trim_total_lf_gt !== undefined) {
    matchedConditions.push(`trimTotal>${condition.trim_total_lf_gt}`);
  }

  return {
    applies: true,
    reason: matchedConditions.length > 0 ? matchedConditions.join(', ') : 'all conditions met'
  };
}

// ============================================================================
// CHANGE 7: Add buildAssignedMaterialsFromGroups() helper
// Extracts AssignedMaterial[] from ManufacturerGroups + pricing data
// ============================================================================

/**
 * Build AssignedMaterial array from material assignments and pricing data
 * This is called by the orchestrator to prepare material context for trigger evaluation
 *
 * @param materialAssignments - Material assignments from Detection Editor
 * @param pricingMap - Map of pricing item ID to PricingItem
 * @returns Array of AssignedMaterial for trigger condition evaluation
 */
export function buildAssignedMaterialsFromPricing(
  materialAssignments: MaterialAssignmentForGrouping[],
  pricingMap: Map<string, PricingItem>
): AssignedMaterial[] {
  const materials: AssignedMaterial[] = [];
  const seenSkus = new Set<string>();

  for (const assignment of materialAssignments) {
    const pricing = pricingMap.get(assignment.pricing_item_id);

    if (!pricing || !pricing.sku) {
      continue;
    }

    // Deduplicate by SKU - we only need one entry per SKU for trigger matching
    if (seenSkus.has(pricing.sku)) {
      continue;
    }
    seenSkus.add(pricing.sku);

    materials.push({
      sku: pricing.sku,
      category: pricing.category || 'unknown',
      manufacturer: pricing.manufacturer || 'Unknown',
      pricing_item_id: assignment.pricing_item_id,
    });
  }

  console.log(`[AutoScope] Built ${materials.length} unique assigned materials for trigger evaluation:`);
  for (const m of materials) {
    console.log(`  - ${m.sku} (${m.category}) [${m.manufacturer}]`);
  }

  return materials;
}

// ============================================================================
// CHANGE 8 (v2.2): Add fetchAutoScopeRulesWithTrimSystem() function
// This replaces fetchAutoScopeRules() to handle trim_system toggling
// ============================================================================

/**
 * Hardie trim material categories that should be skipped when WhiteWood is selected
 * These are the DEFAULT Hardie trim rules that would conflict with WhiteWood rules
 */
const HARDIE_TRIM_CATEGORIES = [
  'starter_strip',
  'frieze_board',
  'j_channel',
  'z_flashing',
  'window_trim',
  'door_trim',
  'outside_corner_trim',
  'inside_corner_trim',
  'head_casing',
  'jamb_casing',
  'sill_casing',
];

/**
 * Fetch auto-scope rules with trim system awareness
 *
 * - When trimSystem='hardie' (default): Load only active=true rules (existing behavior)
 * - When trimSystem='whitewood':
 *   1. Load active=true rules
 *   2. ALSO load inactive rules where trigger_condition.trim_system='whitewood'
 *   3. FILTER OUT conflicting Hardie trim rules
 *
 * @param trimSystem - 'hardie' or 'whitewood'
 * @returns Filtered array of auto-scope rules
 */
async function fetchAutoScopeRulesWithTrimSystem(
  trimSystem: 'hardie' | 'whitewood'
): Promise<DbAutoScopeRule[]> {
  const supabase = getSupabaseClient();

  if (!isDatabaseConfigured()) {
    console.log('[AutoScope] Database not configured, using fallback rules');
    return getFallbackRules();
  }

  // Build the query based on trim system
  let query = supabase
    .from('siding_auto_scope_rules')
    .select('*')
    .order('priority', { ascending: false })
    .order('group_order', { ascending: true })
    .order('item_order', { ascending: true });

  if (trimSystem === 'whitewood') {
    // For WhiteWood: Load active rules OR inactive WhiteWood-specific rules
    // We use OR logic: active=true OR (trigger_condition->>'trim_system' = 'whitewood')
    query = query.or('active.eq.true,trigger_condition->>trim_system.eq.whitewood');
  } else {
    // For Hardie (default): Only load active rules
    query = query.eq('active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[AutoScope] Error fetching rules:', error);
    return getFallbackRules();
  }

  let rules = (data || []) as DbAutoScopeRule[];
  console.log(`[AutoScope] Fetched ${rules.length} rules from database (trimSystem=${trimSystem})`);

  // Apply trim system filtering
  if (trimSystem === 'whitewood') {
    rules = filterRulesForWhiteWood(rules);
  } else {
    rules = filterRulesForHardie(rules);
  }

  console.log(`[AutoScope] After trim system filtering: ${rules.length} rules`);

  return rules;
}

/**
 * Filter rules for WhiteWood trim system
 * - Keep rules that have trigger_condition.trim_system='whitewood'
 * - Keep generic rules (no trim_system in trigger_condition) that are NOT Hardie trim
 * - Skip Hardie-specific trim rules (conflicting categories)
 */
function filterRulesForWhiteWood(rules: DbAutoScopeRule[]): DbAutoScopeRule[] {
  return rules.filter(rule => {
    const triggerCondition = rule.trigger_condition || {};

    // If rule explicitly requires whitewood, include it
    if (triggerCondition.trim_system === 'whitewood') {
      console.log(`  ✓ Rule ${rule.rule_id} (${rule.rule_name}): included (whitewood-specific)`);
      return true;
    }

    // If rule explicitly requires hardie, skip it
    if (triggerCondition.trim_system === 'hardie') {
      console.log(`  ✗ Rule ${rule.rule_id} (${rule.rule_name}): skipped (hardie-specific)`);
      return false;
    }

    // For rules without trim_system in trigger:
    // Skip if it's a generic Hardie trim category that conflicts with WhiteWood
    const category = rule.material_category?.toLowerCase() || '';
    const isHardieTrimCategory = HARDIE_TRIM_CATEGORIES.includes(category);

    // Check if the rule has a manufacturer filter
    const isGenericOrHardie = !rule.manufacturer_filter ||
      rule.manufacturer_filter.some(f =>
        f.toLowerCase().includes('hardie') || f.toLowerCase().includes('james')
      );

    if (isHardieTrimCategory && isGenericOrHardie) {
      console.log(`  ✗ Rule ${rule.rule_id} (${rule.rule_name}): skipped (hardie trim category: ${category})`);
      return false;
    }

    // Include all other rules (fasteners, WRB, siding panels, etc.)
    return true;
  });
}

/**
 * Filter rules for Hardie trim system (default)
 * - Skip rules that have trigger_condition.trim_system='whitewood'
 * - Include all other active rules
 */
function filterRulesForHardie(rules: DbAutoScopeRule[]): DbAutoScopeRule[] {
  return rules.filter(rule => {
    const triggerCondition = rule.trigger_condition || {};

    // Skip WhiteWood-specific rules
    if (triggerCondition.trim_system === 'whitewood') {
      console.log(`  ✗ Rule ${rule.rule_id} (${rule.rule_name}): skipped (whitewood-specific)`);
      return false;
    }

    // Include all other active rules
    return true;
  });
}

// ============================================================================
// CHANGE 8: Update buildMeasurementContext() to extract gable_topout and topout
// Add these lines where detection_counts are processed (similar to belly_band_lf)
// ============================================================================

/**
 * In buildMeasurementContext(), add extraction of gable_topout and topout from detection_counts:
 *
 * // Existing belly_band extraction (reference):
 * belly_band_lf: detectionCounts?.belly_band?.total_lf || webhookMeasurements?.belly_band_lf || 0,
 * belly_band_count: detectionCounts?.belly_band?.count || 0,
 *
 * // ADD: Gable top-out extraction
 * gable_topout_lf: detectionCounts?.gable_topout?.total_lf || webhookMeasurements?.gable_topout_lf || 0,
 * gable_topout_count: detectionCounts?.gable_topout?.count || 0,
 *
 * // ADD: Top-out extraction
 * topout_lf: detectionCounts?.topout?.total_lf || webhookMeasurements?.topout_lf || 0,
 * topout_count: detectionCounts?.topout?.count || 0,
 */

// ============================================================================
// NOTE: The following functions are unchanged from the original file:
// - fetchAutoScopeRules()  <-- NOW REPLACED by fetchAutoScopeRulesWithTrimSystem()
// - fetchMeasurementsFromDatabase()
// - buildMeasurementContext()  <-- NEEDS UPDATE per CHANGE 8 above
// - evaluateFormula()
// - getFallbackRules()
// - clearAutoScopeRulesCache()
//
// The shouldApplyRule() function has been REPLACED with the new version above.
// ============================================================================
