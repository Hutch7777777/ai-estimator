/**
 * Pricing Service - Changes for Manufacturer Support
 *
 * This file contains the CHANGES to apply to src/services/pricing.ts
 * to ensure manufacturer is returned in pricing lookups.
 *
 * The existing PricingItem interface already includes manufacturer,
 * but we need to ensure it's being fetched in the queries.
 */

// ============================================================================
// VERIFY: PricingItem interface includes manufacturer
// This should already exist - just verify it's there:
// ============================================================================

export interface PricingItem {
  id?: string;
  sku: string;
  product_name: string;
  manufacturer: string;  // <-- MUST BE PRESENT
  category: string;
  trade: string;
  unit: string;
  material_cost: number;
  base_labor_cost: number;
  li_insurance_cost: number;
  unemployment_cost: number;
  total_labor_cost: number;
  equipment_cost: number;
  total_cost: number;
  snapshot_name?: string;
  effective_date?: string;
  vendor_name?: string;
  reveal_inches?: number;
  pieces_per_square?: number;
  coverage_value?: number;
  coverage_unit?: string;
}

// ============================================================================
// VERIFY: getPricingByIds includes manufacturer in the select
// The query should select manufacturer from the pricing_items table
// ============================================================================

/**
 * Batch lookup for multiple pricing IDs
 * VERIFY this query includes manufacturer in the select list
 */
export async function getPricingByIds(
  pricingItemIds: string[],
  organizationId?: string
): Promise<Map<string, PricingItem>> {
  const results = new Map<string, PricingItem>();

  if (!isDatabaseConfigured() || pricingItemIds.length === 0) {
    return results;
  }

  try {
    const client = getSupabaseClient();

    // IMPORTANT: Ensure 'manufacturer' is included in the select
    // Either use '*' (which includes all columns) or explicitly list manufacturer
    const { data: basePrices, error } = await client
      .from('pricing_items')
      .select('*')  // <-- This includes manufacturer
      // OR explicitly:
      // .select('id, sku, product_name, manufacturer, category, trade, unit, material_cost, base_labor_cost, ...')
      .in('id', pricingItemIds);

    if (error || !basePrices) {
      console.error('❌ Failed to fetch pricing by IDs:', error?.message);
      return results;
    }

    // The basePrices will now include manufacturer for each item
    // This is used by buildManufacturerGroups to group by manufacturer

    // ... rest of the function ...

    return results;
  } catch (err) {
    console.error('❌ Error in batch pricing lookup:', err);
    return results;
  }
}

// ============================================================================
// VERIFY: The pricing_items table has a manufacturer column
// Run this SQL to check:
//
// SELECT column_name, data_type
// FROM information_schema.columns
// WHERE table_name = 'pricing_items'
// AND column_name = 'manufacturer';
//
// If it doesn't exist, add it:
//
// ALTER TABLE pricing_items
// ADD COLUMN IF NOT EXISTS manufacturer TEXT;
//
// Then populate it from your product data.
// ============================================================================

// ============================================================================
// TEST: Verify manufacturer is returned
// Add this temporary log to getPricingByIds to verify:
// ============================================================================

function verifyManufacturerInResults(results: Map<string, PricingItem>): void {
  console.log('[Pricing] Verifying manufacturer data in results:');
  let hasManufacturer = 0;
  let missingManufacturer = 0;

  for (const [id, item] of results) {
    if (item.manufacturer && item.manufacturer.trim() !== '') {
      hasManufacturer++;
      console.log(`  ✓ ${item.sku}: ${item.manufacturer}`);
    } else {
      missingManufacturer++;
      console.log(`  ✗ ${item.sku}: no manufacturer`);
    }
  }

  console.log(`[Pricing] ${hasManufacturer} items have manufacturer, ${missingManufacturer} missing`);
}

export { };
