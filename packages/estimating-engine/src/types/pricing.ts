/**
 * Type-only extracts from `src/services/pricing.ts` of the
 * exterior-estimation-api source. Byte-identical interface bodies; no logic
 * ported, no service helpers, no caching, no DB.
 *
 * Source: ~/Downloads/exterior-estimation-api-temp/src/services/pricing.ts
 *   - PricingItem      (L8-34, exported in source)
 *   - PricingOverride  (L36-40, NOT exported in source)
 *
 * Note on naming: the user's brief listed "OrgPricingOverride" — the actual
 * source name is `PricingOverride`. Preserved verbatim per the byte-identical
 * rule. The `PricingOverride` body is read from the
 * `organization_pricing_overrides` table (see `services/pricing.ts:195-263`),
 * which is what the user's "OrgPricingOverride" name was pointing at.
 *
 * Note on `export`: in source, `PricingOverride` is module-private (no
 * `export`). Adding `export` is the only deviation from byte-identical so
 * downstream port steps can import it. Body unchanged.
 */

export interface PricingItem {
  id?: string;  // UUID primary key
  sku: string;
  product_name: string;
  manufacturer: string;
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
  // Additional fields from pricing_items table
  reveal_inches?: number;
  pieces_per_square?: number;
  coverage_value?: number;
  coverage_unit?: string;
  waste_factor?: number;  // Material-specific waste multiplier (e.g., 1.10 = 10% waste)
  // Labor classification - matches rate_name in labor_rates table
  labor_class?: string;
  // Whether this is a ColorPlus (pre-finished) product
  is_colorplus?: boolean;
}

export interface PricingOverride {
  material_cost_override?: number;
  labor_rate_override?: number;
  markup_percent_override?: number;
}
