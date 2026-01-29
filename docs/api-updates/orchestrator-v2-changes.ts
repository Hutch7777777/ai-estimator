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
  // UPDATED: Pass manufacturer groups to auto-scope
  // =========================================================================

  const autoScopeResult = await generateAutoScopeItemsV2(
    extractionId,
    webhookMeasurements,
    organizationId,
    {
      skipSidingPanels: materialAssignments.length > 0,
      manufacturerGroups,  // NEW: Pass manufacturer groups for per-manufacturer rules
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
 * AFTER (with manufacturer grouping):
 *
 * ```typescript
 * // Process material assignments...
 * const materialLineItems = await processMaterialAssignments(...);
 *
 * // NEW: Build manufacturer groups
 * const manufacturerGroups = await buildManufacturerGroups(
 *   materialAssignments,
 *   organizationId
 * );
 *
 * // Generate auto-scope items (now with manufacturer awareness)
 * const autoScopeResult = await generateAutoScopeItemsV2(
 *   extractionId,
 *   webhookMeasurements,
 *   organizationId,
 *   {
 *     skipSidingPanels: materialAssignments.length > 0,
 *     manufacturerGroups,  // NEW
 *   }
 * );
 * ```
 */

export { };
