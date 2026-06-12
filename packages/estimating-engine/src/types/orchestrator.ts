/**
 * Type-only extracts from `src/calculations/siding/orchestrator-v2.ts` of the
 * exterior-estimation-api source. Byte-identical interface bodies; no logic
 * ported, no service helpers, no DB.
 *
 * Source: ~/Downloads/exterior-estimation-api-temp/src/calculations/siding/orchestrator-v2.ts
 *   - LaborRate              (L45-56, NOT exported in source)
 *   - OverheadCost           (L59-73, NOT exported in source)
 *   - LaborAutoScopeRule     (L76-93, NOT exported in source)
 *   - OrgOverheadConfig      (L153-165, NOT exported in source)
 *   - DetectionClassMapping  (L876-885, declared INSIDE the function body in source)
 *
 * Note on naming: the user's brief listed "OrganizationRow". There is no
 * such interface in the source. What's actually consumed from the
 * `organizations` table is `settings.overhead_config` cast to
 * `OrgOverheadConfig` (orchestrator-v2.ts:1099–1100). `OrgOverheadConfig` is
 * therefore the type the caller of the pure orchestrator will need to
 * supply for the org overhead refData slot.
 *
 * Note on `export`: in source, all five interfaces are module-private (no
 * `export`); `DetectionClassMapping` is even nested inside a function. Adding
 * `export` here is the only deviation from byte-identical so the upcoming
 * orchestrator port can import them as shared types. Bodies unchanged.
 */

// Labor rate from database
export interface LaborRate {
  id: string;
  rate_name: string;
  description: string;
  trade: string;
  presentation_group: string;
  unit: string;
  base_rate: string;
  difficulty_multiplier: string;
  min_charge: string | null;
  notes: string;
}

// Overhead cost from database
export interface OverheadCost {
  id: string;
  cost_name: string;
  description: string;
  category: string;
  cost_type: string;
  unit: string | null;
  base_rate: string | null;
  calculation_formula: string | null;
  default_quantity: string;
  applies_to_trade: string[] | null;
  required: boolean;
  display_order: number;
  notes: string;
}

// Labor auto-scope rule from database
export interface LaborAutoScopeRule {
  id: number;
  rule_id: string;
  rule_name: string;
  description: string | null;
  trade: string;
  trigger_type: 'always' | 'material_category' | 'material_sku_pattern' | 'detection_class';
  trigger_value: string | null;
  trigger_condition: Record<string, any> | null;
  labor_rate_id: number | null;
  quantity_source: 'facade_sqft' | 'material_sqft' | 'material_count' | 'detection_count' | 'material_lf';
  quantity_formula: string | null;
  quantity_unit: string;
  priority: number;
  active: boolean;
  // Joined labor_rates data
  labor_rates?: LaborRate;
}

// Organization-specific overhead config (from organizations.settings.overhead_config)
export interface OrgOverheadConfig {
  crew_size?: number;
  estimated_weeks?: number;
  li_hourly_rate?: number;
  insurance_rate_per_thousand?: number;
  include_dumpster?: boolean;
  dumpster_rate?: number;
  include_toilet?: boolean;
  toilet_rate?: number;
  mobilization_total?: number;
  mobilization_type?: string;
  mobilization_note?: string;
}

// Detection class mapping (from detection_class_material_mapping table)
export interface DetectionClassMapping {
  class_name: string;
  display_name: string;
  measurement_type: 'count' | 'linear' | 'area';
  unit_of_measure: string;
  waste_factor: number;
  trade: string;
  default_product_sku: string | null;
  presentation_group: string | null;
}
