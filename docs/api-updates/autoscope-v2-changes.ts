/**
 * Auto-Scope V2 - Changes for Manufacturer-Aware Rules
 *
 * This file contains the CHANGES to apply to autoscope-v2.ts
 * to support per-manufacturer auto-scope rules.
 *
 * INSTRUCTIONS:
 * 1. Add manufacturer_filter to DbAutoScopeRule interface
 * 2. Add the new buildManufacturerGroups() function
 * 3. Add the new buildManufacturerContext() function
 * 4. Replace the generateAutoScopeItemsV2() function
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
} from '../../types/autoscope';

// ============================================================================
// CHANGE 1: Update DbAutoScopeRule interface
// Add this field to the existing interface (around line 28)
// ============================================================================

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

  const totalContext = buildMeasurementContext(dbMeasurements, webhookMeasurements);
  const manufacturerGroups = options?.manufacturerGroups || {};
  const hasManufacturerGroups = Object.keys(manufacturerGroups).length > 0;

  // 2. Fetch auto-scope rules
  const rules = await fetchAutoScopeRules();
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

        const { applies, reason } = shouldApplyRule(rule, mfrContext);

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

      const { applies, reason } = shouldApplyRule(rule, totalContext);

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
// NOTE: The following functions are unchanged from the original file:
// - fetchAutoScopeRules()
// - fetchMeasurementsFromDatabase()
// - buildMeasurementContext()
// - shouldApplyRule()
// - evaluateFormula()
// - getFallbackRules()
// - clearAutoScopeRulesCache()
//
// Just add the manufacturer_filter field handling, and the new functions above.
// ============================================================================
