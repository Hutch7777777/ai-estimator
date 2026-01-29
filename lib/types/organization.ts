/**
 * Organization Settings Types
 * Stored in organizations.settings JSONB column
 *
 * These settings control organization-level defaults for:
 * - Labor rates and insurance calculations
 * - Default materials for takeoff generation
 * - Business information for proposals and contracts
 */

// =============================================================================
// LABOR RATES
// =============================================================================

export interface LaborRates {
  /** L&I Insurance rate - Washington State Labor & Industries (default: 12.65%) */
  li_insurance_rate_percent: number;

  /** Unemployment tax rate (default: 6.60%) */
  unemployment_rate_percent: number;

  /** Default waste factor for material calculations (default: 12%) */
  default_waste_factor_percent: number;

  /** Overhead multiplier for labor costs (default: 1.0 = no additional overhead) */
  overhead_multiplier: number;

  /** Base hourly labor rate for installation (optional) */
  base_labor_rate_hourly?: number | null;

  /** Default crew size for productivity calculations (optional) */
  default_crew_size?: number | null;
}

// =============================================================================
// MATERIAL DEFAULTS
// =============================================================================

export interface MaterialDefaults {
  /** Default trim SKU (e.g., 'HT-55-12-CP' for HardieTrim 1x6 ColorPlus) */
  default_trim_sku?: string | null;

  /** Default WRB/housewrap SKU */
  default_wrb_sku?: string | null;

  /** Default flashing SKU (e.g., 'ZFLASH-10') */
  default_flashing_sku?: string | null;

  /** Default caulk/sealant SKU (e.g., 'CAULK-JH-COLORMATCH') */
  default_caulk_sku?: string | null;

  /** Default fastener SKU (e.g., 'TRIM-NAILS-SS-1LB') */
  default_fastener_sku?: string | null;

  /** Default siding SKU (e.g., 'HP-825-CM-CP') */
  default_siding_sku?: string | null;

  /** Default soffit SKU */
  default_soffit_sku?: string | null;

  /** Default corner trim SKU */
  default_corner_sku?: string | null;
}

// =============================================================================
// BUSINESS INFORMATION
// =============================================================================

export interface BusinessInfo {
  /** Company license number (displayed on proposals) */
  license_number?: string | null;

  /** Insurance policy number */
  insurance_policy_number?: string | null;

  /** Insurance expiration date (ISO string: YYYY-MM-DD) */
  insurance_expiration?: string | null;

  /** Default payment terms (e.g., "Net 30", "50% deposit, 50% completion") */
  default_payment_terms?: string | null;

  /** Default warranty period (e.g., "2 years labor, 30 years material") */
  default_warranty_period?: string | null;

  /** Company tagline/slogan for proposals */
  company_tagline?: string | null;

  /** Primary contact phone for estimates */
  estimate_contact_phone?: string | null;

  /** Primary contact email for estimates */
  estimate_contact_email?: string | null;
}

// =============================================================================
// COMPLETE ORGANIZATION SETTINGS
// =============================================================================

export interface OrganizationSettings {
  /** Currency code (default: 'USD') */
  currency: string;

  /** Timezone identifier (default: 'America/Los_Angeles') */
  timezone: string;

  /** Default markup percentage for estimates (default: 35) */
  default_markup_percent: number;

  /** Labor rates and insurance configuration */
  labor_rates?: LaborRates;

  /** Default materials for auto-scope */
  material_defaults?: MaterialDefaults;

  /** Business information for proposals */
  business_info?: BusinessInfo;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

export const DEFAULT_LABOR_RATES: LaborRates = {
  li_insurance_rate_percent: 12.65,
  unemployment_rate_percent: 6.60,
  default_waste_factor_percent: 12,
  overhead_multiplier: 1.0,
  base_labor_rate_hourly: null,
  default_crew_size: null,
};

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  currency: 'USD',
  timezone: 'America/Los_Angeles',
  default_markup_percent: 35,
  labor_rates: DEFAULT_LABOR_RATES,
  material_defaults: {},
  business_info: {},
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Resolve partial settings with defaults
 * Ensures all required fields have values even if organization has minimal settings
 *
 * @param partial - Partial settings from database (may be Record<string, unknown>)
 * @returns Complete OrganizationSettings with all fields populated
 */
export function resolveSettings(
  partial: Partial<OrganizationSettings> | Record<string, unknown> | null | undefined
): OrganizationSettings {
  const p = (partial || {}) as Partial<OrganizationSettings>;

  return {
    currency: p.currency ?? 'USD',
    timezone: p.timezone ?? 'America/Los_Angeles',
    default_markup_percent: p.default_markup_percent ?? 35,

    labor_rates: {
      li_insurance_rate_percent: p.labor_rates?.li_insurance_rate_percent ?? 12.65,
      unemployment_rate_percent: p.labor_rates?.unemployment_rate_percent ?? 6.60,
      default_waste_factor_percent: p.labor_rates?.default_waste_factor_percent ?? 12,
      overhead_multiplier: p.labor_rates?.overhead_multiplier ?? 1.0,
      base_labor_rate_hourly: p.labor_rates?.base_labor_rate_hourly ?? null,
      default_crew_size: p.labor_rates?.default_crew_size ?? null,
    },

    material_defaults: p.material_defaults ?? {},
    business_info: p.business_info ?? {},
  };
}

/**
 * Calculate total labor burden rate
 * @param laborRates - Labor rates configuration
 * @returns Total burden rate as percentage
 */
export function calculateTotalBurdenRate(laborRates: LaborRates): number {
  return laborRates.li_insurance_rate_percent + laborRates.unemployment_rate_percent;
}

/**
 * Calculate burdened labor cost
 * @param baseLaborCost - Base labor cost before burden
 * @param laborRates - Labor rates configuration
 * @returns Labor cost with L&I and unemployment applied
 */
export function calculateBurdenedLaborCost(
  baseLaborCost: number,
  laborRates: LaborRates
): number {
  const burdenRate = calculateTotalBurdenRate(laborRates) / 100;
  return baseLaborCost * (1 + burdenRate);
}

/**
 * Apply waste factor to material quantity
 * @param baseQuantity - Base material quantity
 * @param laborRates - Labor rates configuration (contains waste factor)
 * @returns Quantity with waste factor applied
 */
export function applyWasteFactor(
  baseQuantity: number,
  laborRates: LaborRates
): number {
  const wasteFactor = laborRates.default_waste_factor_percent / 100;
  return baseQuantity * (1 + wasteFactor);
}
