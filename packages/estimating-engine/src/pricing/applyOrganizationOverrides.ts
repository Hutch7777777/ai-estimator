/**
 * Pure pricing-override overlay helpers.
 *
 * Source: ~/Downloads/exterior-estimation-api-temp/src/services/pricing.ts
 *   - SKU overlay logic at L173-223 (`applyOrganizationOverridesToSkus`)
 *   - ID overlay logic at L325-339  (inside `getPricingByIds`)
 *
 * Behavior preserved 1:1: same field-merge semantics, same `calculateTotalLabor`
 * formula re-application, same nullish-coalescing precedence.
 *
 * Deviation from source: the original functions took an `organizationId` and
 * fetched overrides from `organization_pricing_overrides` via Supabase. Here
 * the caller supplies an `overrides` Map keyed by `pricing_item_id`. Net effect
 * for the pricing map is identical.
 */

import type { PricingItem, PricingOverride } from '../types/pricing';

/**
 * Mike Skjei's labor formula: Base + L&I (12.65%) + Unemployment (1.3%).
 * Inlined byte-identical from `services/pricing.ts:354-358`.
 */
function calculateTotalLabor(baseLaborCost: number): number {
  const liRate = 0.1265;
  const unemploymentRate = 0.013;
  return baseLaborCost * (1 + liRate + unemploymentRate);
}

/**
 * Apply per-organization pricing overrides onto a Map keyed by `pricing_items.id`.
 * Mirrors `getPricingByIds`'s overlay (services/pricing.ts:325-339):
 *   - `material_cost` ← override.material_cost_override ?? base
 *   - `base_labor_cost` ← override.labor_rate_override ?? base
 *   - `total_labor_cost` ← recomputed via calculateTotalLabor() ONLY if override.labor_rate_override is present
 *
 * Returns a NEW map (does not mutate the input).
 */
export function applyOrgOverridesById(
  pricingByIds: Map<string, PricingItem>,
  overridesByPricingItemId: Map<string, PricingOverride>
): Map<string, PricingItem> {
  const out = new Map<string, PricingItem>();
  for (const [id, base] of pricingByIds) {
    const override = overridesByPricingItemId.get(id);
    const merged: PricingItem = {
      ...base,
      material_cost: Number(override?.material_cost_override ?? base.material_cost),
      base_labor_cost: Number(override?.labor_rate_override ?? base.base_labor_cost),
    };
    if (override?.labor_rate_override !== undefined && override.labor_rate_override !== null) {
      merged.total_labor_cost = calculateTotalLabor(Number(override.labor_rate_override));
    }
    out.set(id, merged);
  }
  return out;
}

/**
 * Apply per-organization pricing overrides onto a Map keyed by SKU.
 * Mirrors `applyOrganizationOverridesToSkus` (services/pricing.ts:173-223):
 *   - looks up override by the item's `id` (must be present on the PricingItem)
 *   - `material_cost` ← override.material_cost_override ?? base
 *   - `base_labor_cost` ← override.labor_rate_override ?? base
 *   - `total_labor_cost` ← recomputed via calculateTotalLabor() if override.labor_rate_override is present, otherwise base.total_labor_cost preserved
 *
 * Returns a NEW map (does not mutate the input).
 */
export function applyOrgOverridesBySku(
  pricingBySkus: Map<string, PricingItem>,
  overridesByPricingItemId: Map<string, PricingOverride>
): Map<string, PricingItem> {
  const out = new Map<string, PricingItem>();
  for (const [sku, base] of pricingBySkus) {
    if (!base.id) {
      out.set(sku, base);
      continue;
    }
    const override = overridesByPricingItemId.get(base.id);
    if (!override) {
      out.set(sku, base);
      continue;
    }
    out.set(sku, {
      ...base,
      material_cost: override.material_cost_override ?? base.material_cost,
      base_labor_cost: override.labor_rate_override ?? base.base_labor_cost,
      total_labor_cost: override.labor_rate_override !== undefined && override.labor_rate_override !== null
        ? calculateTotalLabor(override.labor_rate_override)
        : base.total_labor_cost,
    });
  }
  return out;
}
