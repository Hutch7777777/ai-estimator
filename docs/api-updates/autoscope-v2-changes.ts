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
  min_trim_total_lf?: number;
  trim_total_lf_gt?: number;

  // NEW: Material-based triggers for SKU pattern matching
  // Matches against assigned materials from the Detection Editor
  material_category?: string;  // e.g., "board_batten" - matches pricing_items.category
  sku_pattern?: string;        // e.g., "16OC-CP" - substring match against pricing_items.sku
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

  // NEW: Extract assigned materials for material-based trigger conditions
  const assignedMaterials = options?.assignedMaterials || [];
  const hasAssignedMaterials = assignedMaterials.length > 0;

  if (hasAssignedMaterials) {
    console.log(`   Assigned materials: ${assignedMaterials.map(m => m.sku).join(', ')}`);
  }

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

        // Pass assigned materials for material_category/sku_pattern trigger checks
        const { applies, reason } = shouldApplyRule(rule, mfrContext, assignedMaterials);

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
      const { applies, reason } = shouldApplyRule(rule, totalContext, assignedMaterials);

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
 * @param rule - The auto-scope rule to evaluate
 * @param context - Measurement context OR full trigger context with materials
 * @param assignedMaterials - Optional array of assigned materials (if not in context)
 * @returns Object with applies boolean and reason string
 */
function shouldApplyRule(
  rule: DbAutoScopeRule,
  context: MeasurementContext | TriggerContext,
  assignedMaterials?: AssignedMaterial[]
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
  if (condition.sku_pattern) {
    const pattern = condition.sku_pattern.toLowerCase();
    const hasMatchingSku = materials.some(
      m => m.sku?.toLowerCase().includes(pattern)
    );

    if (!hasMatchingSku) {
      return {
        applies: false,
        reason: `no material SKU matching pattern '${condition.sku_pattern}'`
      };
    }
    // If we get here, sku_pattern check passed - continue to other checks
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
// NOTE: The following functions are unchanged from the original file:
// - fetchAutoScopeRules()
// - fetchMeasurementsFromDatabase()
// - buildMeasurementContext()
// - evaluateFormula()
// - getFallbackRules()
// - clearAutoScopeRulesCache()
//
// The shouldApplyRule() function has been REPLACED with the new version above.
// ============================================================================
