/**
 * ============================================================================
 * ITEM HELPER UTILITIES
 * ============================================================================
 * Helper functions for working with takeoff line items (materials, labor, overhead)
 *
 * Item Types:
 * - material: Physical materials with material_unit_cost
 * - labor: Installation labor with labor_unit_cost (includes L&I insurance)
 * - overhead: Overhead costs stored in equipment_unit_cost
 *
 * V2 NOTE (Mike Skjei Methodology):
 * In V2 responses, labor is calculated separately by squares (SQ = 100 SF)
 * and returned in the `labor` section of the API response.
 * Overhead is also calculated separately and returned in the `overhead` section.
 * All line_items in V2 responses are materials only.
 */

import { LineItemWithState } from "@/lib/types/database";
import {
  LaborSection,
  LaborLineItem,
  OverheadSection,
  OverheadLineItem,
  ProjectTotals,
} from "@/lib/types/extraction";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ItemType = "material" | "labor" | "overhead" | "paint";

export interface SeparatedItems {
  materials: LineItemWithState[];
  labor: LineItemWithState[];
  overhead: LineItemWithState[];
  paint: LineItemWithState[];
}

export interface GroupedMaterials {
  [presentationGroup: string]: LineItemWithState[];
}

export interface SectionTotals {
  materialsTotal: number;
  laborTotal: number;
  overheadTotal: number;
  paintTotal: number;
  grandTotal: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// L&I Insurance Rate (Labor & Industries, Washington State)
const LI_INSURANCE_RATE = 0.1265; // 12.65%

// Presentation group display configuration
export const PRESENTATION_GROUP_CONFIG: Record<
  string,
  { title: string; color: string; order: number }
> = {
  // Siding groups
  siding: { title: "SIDING & UNDERLAYMENT", color: "E8F5E9", order: 1 },
  trim: { title: "TRIM & CORNERS", color: "E3F2FD", order: 2 },
  flashing: { title: "FLASHING & WEATHERPROOFING", color: "FFF3E0", order: 3 },
  fasteners: { title: "FASTENERS & ACCESSORIES", color: "F3E5F5", order: 4 },

  // Roofing groups
  shingles: { title: "SHINGLES", color: "FFCDD2", order: 1 },
  underlayment: { title: "UNDERLAYMENT", color: "F8BBD9", order: 2 },
  ice_water: { title: "ICE & WATER SHIELD", color: "E1BEE7", order: 3 },
  accessories: { title: "ROOFING ACCESSORIES", color: "D1C4E9", order: 4 },
  roofing: { title: "ROOFING MATERIALS", color: "FFCDD2", order: 1 },

  // Gutter groups
  gutters: { title: "GUTTERS", color: "B3E5FC", order: 1 },
  downspouts: { title: "DOWNSPOUTS", color: "B2DFDB", order: 2 },
  gutter_accessories: { title: "GUTTER ACCESSORIES", color: "C8E6C9", order: 3 },
  gutter_guards: { title: "GUTTER GUARDS", color: "FFE0B2", order: 4 },

  // Window groups
  window_unit: { title: "WINDOW UNITS", color: "BBDEFB", order: 1 },
  window_trim: { title: "WINDOW TRIM", color: "C5CAE9", order: 2 },
  flashing_tape: { title: "FLASHING & WATERPROOFING", color: "FFF3E0", order: 3 },
  sill_pan: { title: "SILL PANS", color: "E1F5FE", order: 4 },
  sealants: { title: "SEALANTS", color: "F1F8E9", order: 5 },
  hardware: { title: "HARDWARE", color: "FFF9C4", order: 6 },
  windows: { title: "WINDOWS", color: "BBDEFB", order: 1 },

  // Labor groups
  installation: { title: "INSTALLATION", color: "BBDEFB", order: 1 },
  labor: { title: "INSTALLATION LABOR", color: "BBDEFB", order: 1 },

  // Paint groups
  paint: { title: "PAINT & PRIMER", color: "F3E5F5", order: 10 },
  "paint & primer": { title: "PAINT & PRIMER", color: "F3E5F5", order: 10 },

  // Default
  other: { title: "OTHER MATERIALS", color: "E0E0E0", order: 99 },
  materials: { title: "MATERIALS", color: "E8F5E9", order: 1 },
};

// ============================================================================
// ITEM TYPE SEPARATION
// ============================================================================

/**
 * Separate line items by type (material, labor, overhead)
 *
 * @note In V2 responses (Mike Skjei methodology), all line_items are materials.
 * Labor and overhead come from separate API response sections.
 * This function is still useful for legacy responses where labor/overhead
 * items were mixed with materials.
 */
export function separateItemsByType(
  lineItems: LineItemWithState[]
): SeparatedItems {
  const materials: LineItemWithState[] = [];
  const labor: LineItemWithState[] = [];
  const overhead: LineItemWithState[] = [];
  const paint: LineItemWithState[] = [];

  lineItems.forEach((item) => {
    // Check item_type field first (if it exists)
    const itemType =
      (item as any).item_type || detectItemType(item);

    switch (itemType) {
      case "material":
        materials.push(item);
        break;
      case "labor":
        labor.push(item);
        break;
      case "overhead":
        overhead.push(item);
        break;
      case "paint":
        paint.push(item);
        break;
      default:
        // Default to material if unknown
        materials.push(item);
    }
  });

  return { materials, labor, overhead, paint };
}

/**
 * Detect item type based on cost fields and description (fallback if item_type not set)
 */
function detectItemType(item: LineItemWithState): ItemType {
  const hasMaterialCost = (item.material_unit_cost || 0) > 0;
  const hasLaborCost = (item.labor_unit_cost || 0) > 0;
  const hasEquipmentCost = (item.equipment_unit_cost || 0) > 0;

  // Check for paint items by category or presentation_group
  const category = ((item as any).category || "").toLowerCase();
  const presentationGroup = ((item as any).presentation_group || "").toLowerCase();

  if (category === "paint" || presentationGroup.includes("paint")) {
    return "paint";
  }

  // If only equipment cost, it's overhead
  if (!hasMaterialCost && !hasLaborCost && hasEquipmentCost) {
    return "overhead";
  }

  // If only labor cost (and not material), it's labor
  if (!hasMaterialCost && hasLaborCost) {
    return "labor";
  }

  // Default to material
  return "material";
}

// ============================================================================
// MATERIAL GROUPING
// ============================================================================

/**
 * Group materials by presentation_group for display
 */
export function groupMaterialsByPresentation(
  materials: LineItemWithState[]
): GroupedMaterials {
  const grouped: GroupedMaterials = {};

  materials.forEach((item) => {
    const group =
      (item as any).presentation_group || (item as any).category || "materials";

    if (!grouped[group]) {
      grouped[group] = [];
    }

    grouped[group].push(item);
  });

  return grouped;
}

/**
 * Sort presentation groups by configured order
 */
export function sortGroupKeys(groupKeys: string[]): string[] {
  return groupKeys.sort((a, b) => {
    const orderA = PRESENTATION_GROUP_CONFIG[a]?.order || 99;
    const orderB = PRESENTATION_GROUP_CONFIG[b]?.order || 99;
    return orderA - orderB;
  });
}

// ============================================================================
// TOTAL CALCULATIONS
// ============================================================================

/**
 * Calculate total for a material item
 */
export function calculateMaterialTotal(item: LineItemWithState): number {
  const quantity = item.quantity || 0;
  const unitCost = item.material_unit_cost || 0;
  return quantity * unitCost;
}

/**
 * Calculate total for a labor item (includes L&I insurance)
 *
 * Two methods:
 * 1. Parse from formula_used (more accurate, includes exact L&I)
 * 2. Calculate: quantity × labor_unit_cost × (1 + L&I rate)
 *
 * @note In V2 responses, labor is calculated by the API using squares.
 * Use getLaborSubtotal(labor) for the authoritative labor total.
 * This function is for legacy line-item-based labor calculations.
 */
export function calculateLaborTotal(item: LineItemWithState): number {
  // Method 1: Try parsing from formula_used
  const formulaUsed = (item as any).formula_used;
  if (formulaUsed && typeof formulaUsed === "string") {
    // Look for pattern: "= $X,XXX.XX" at end of formula
    const match = formulaUsed.match(/=\s*\$([0-9,]+\.?\d*)\s*$/);
    if (match) {
      const total = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(total)) {
        return total;
      }
    }
  }

  // Method 2: Calculate with L&I markup
  const quantity = item.quantity || 0;
  const laborRate = item.labor_unit_cost || 0;
  const baseLabor = quantity * laborRate;
  const totalWithLI = baseLabor * (1 + LI_INSURANCE_RATE);

  return totalWithLI;
}

/**
 * Calculate total for an overhead item
 * (equipment_unit_cost already contains the total)
 *
 * @note In V2 responses, overhead is calculated by the API.
 * Use getOverheadSubtotal(overhead) for the authoritative overhead total.
 * This function is for legacy line-item-based overhead calculations.
 */
export function calculateOverheadTotal(item: LineItemWithState): number {
  return item.equipment_unit_cost || 0;
}

/**
 * Calculate total for a paint item (materials + labor combined)
 * Paint items can have both material_unit_cost (paint gallons) and labor_unit_cost (paint labor per SF)
 */
export function calculatePaintTotal(item: LineItemWithState): number {
  const quantity = item.quantity || 0;
  const materialCost = item.material_unit_cost || 0;
  const laborCost = item.labor_unit_cost || 0;
  return quantity * (materialCost + laborCost);
}

/**
 * Calculate totals for a section (all items combined)
 */
export function calculateSectionTotals(
  materials: LineItemWithState[],
  labor: LineItemWithState[],
  overhead: LineItemWithState[],
  paint: LineItemWithState[] = []
): SectionTotals {
  const materialsTotal = materials.reduce(
    (sum, item) => sum + calculateMaterialTotal(item),
    0
  );

  const laborTotal = labor.reduce(
    (sum, item) => sum + calculateLaborTotal(item),
    0
  );

  const overheadTotal = overhead.reduce(
    (sum, item) => sum + calculateOverheadTotal(item),
    0
  );

  const paintTotal = paint.reduce(
    (sum, item) => sum + calculatePaintTotal(item),
    0
  );

  const grandTotal = materialsTotal + laborTotal + overheadTotal + paintTotal;

  return {
    materialsTotal,
    laborTotal,
    overheadTotal,
    paintTotal,
    grandTotal,
  };
}

/**
 * Calculate totals for all sections grouped by section_id
 */
export function calculateTotalsBySections(
  lineItems: LineItemWithState[]
): Record<string, SectionTotals> {
  // Group by section_id
  const itemsBySection: Record<string, LineItemWithState[]> = {};

  lineItems.forEach((item) => {
    const sectionId = item.section_id;
    if (!itemsBySection[sectionId]) {
      itemsBySection[sectionId] = [];
    }
    itemsBySection[sectionId].push(item);
  });

  // Calculate totals for each section
  const totals: Record<string, SectionTotals> = {};

  Object.keys(itemsBySection).forEach((sectionId) => {
    const sectionItems = itemsBySection[sectionId];
    const { materials, labor, overhead, paint } = separateItemsByType(sectionItems);
    totals[sectionId] = calculateSectionTotals(materials, labor, overhead, paint);
  });

  return totals;
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format currency value
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Get presentation group config with fallback
 */
export function getPresentationGroupConfig(groupKey: string): {
  title: string;
  color: string;
  order: number;
} {
  return (
    PRESENTATION_GROUP_CONFIG[groupKey] || PRESENTATION_GROUP_CONFIG["other"]
  );
}

// ============================================================================
// V2 LABOR HELPERS (Mike Skjei Methodology)
// ============================================================================

/**
 * Get labor subtotal from the V2 labor section
 * This is the authoritative source for installation labor cost
 */
export function getLaborSubtotal(labor: LaborSection | undefined): number {
  return labor?.installation_subtotal || 0;
}

/**
 * Get total labor items count
 */
export function getLaborItemsCount(labor: LaborSection | undefined): number {
  return labor?.installation_items?.length || 0;
}

/**
 * Get labor items array safely
 */
export function getLaborItems(labor: LaborSection | undefined): LaborLineItem[] {
  return labor?.installation_items || [];
}

// ============================================================================
// V2 OVERHEAD HELPERS
// ============================================================================

/**
 * Get overhead subtotal from the V2 overhead section
 */
export function getOverheadSubtotal(overhead: OverheadSection | undefined): number {
  return overhead?.subtotal || 0;
}

/**
 * Get overhead items count
 */
export function getOverheadItemsCount(overhead: OverheadSection | undefined): number {
  return overhead?.items?.length || 0;
}

/**
 * Get overhead items array safely
 */
export function getOverheadItems(overhead: OverheadSection | undefined): OverheadLineItem[] {
  return overhead?.items || [];
}

// ============================================================================
// V2 PROJECT TOTALS HELPERS
// ============================================================================

/**
 * Project insurance rate: $24.38 per $1,000
 */
export const PROJECT_INSURANCE_RATE = 24.38;

/**
 * Default markup rate: 26%
 */
export const DEFAULT_MARKUP_RATE = 0.26;

/**
 * Calculate project insurance amount
 * Formula: (subtotal / 1000) * $24.38
 */
export function calculateProjectInsurance(subtotal: number): number {
  return (subtotal / 1000) * PROJECT_INSURANCE_RATE;
}

/**
 * Display-ready totals structure
 */
export interface DisplayTotals {
  materialCost: number;
  materialMarkup: number;
  materialTotal: number;
  laborCost: number;
  overheadCost: number;
  laborSubtotal: number;
  laborMarkup: number;
  laborTotal: number;
  subtotal: number;
  projectInsurance: number;
  grandTotal: number;
}

/**
 * Get display-ready totals from projectTotals or calculate from components
 *
 * Priority:
 * 1. Use projectTotals if available (V2 response - most accurate)
 * 2. Fall back to calculating from labor/overhead sections
 * 3. Fall back to calculating from line items (legacy)
 */
export function getDisplayTotals(
  projectTotals?: ProjectTotals,
  lineItems?: LineItemWithState[],
  labor?: LaborSection,
  overhead?: OverheadSection,
  markupRate: number = DEFAULT_MARKUP_RATE
): DisplayTotals {
  // Prefer projectTotals if available (V2 response)
  if (projectTotals) {
    return {
      materialCost: projectTotals.material_cost,
      materialMarkup: projectTotals.material_markup_amount,
      materialTotal: projectTotals.material_total,
      laborCost: projectTotals.installation_labor_subtotal,
      overheadCost: projectTotals.overhead_subtotal,
      laborSubtotal: projectTotals.labor_cost_before_markup,
      laborMarkup: projectTotals.labor_markup_amount,
      laborTotal: projectTotals.labor_total,
      subtotal: projectTotals.subtotal,
      projectInsurance: projectTotals.project_insurance,
      grandTotal: projectTotals.grand_total,
    };
  }

  // Fallback calculation for legacy responses
  const materialCost = lineItems?.reduce(
    (sum, item) => sum + calculateMaterialTotal(item),
    0
  ) || 0;
  const laborCost = labor?.installation_subtotal || 0;
  const overheadCost = overhead?.subtotal || 0;

  const materialMarkup = materialCost * markupRate;
  const materialTotal = materialCost + materialMarkup;

  const laborSubtotal = laborCost + overheadCost;
  const laborMarkup = laborSubtotal * markupRate;
  const laborTotal = laborSubtotal + laborMarkup;

  const subtotal = materialTotal + laborTotal;
  const projectInsurance = calculateProjectInsurance(subtotal);
  const grandTotal = subtotal + projectInsurance;

  return {
    materialCost,
    materialMarkup,
    materialTotal,
    laborCost,
    overheadCost,
    laborSubtotal,
    laborMarkup,
    laborTotal,
    subtotal,
    projectInsurance,
    grandTotal,
  };
}

/**
 * Check if response has V2 project totals
 */
export function hasV2ProjectTotals(projectTotals?: ProjectTotals): boolean {
  return projectTotals !== undefined && projectTotals !== null;
}

// ============================================================================
// V2 FORMATTING HELPERS
// ============================================================================

/**
 * Format a number as percentage
 */
export function formatPercent(rate: number, decimals: number = 0): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}

/**
 * Format quantity with appropriate decimals based on unit
 */
export function formatQuantity(quantity: number, unit: string): string {
  // Squares (SQ) shown to 2 decimals
  if (unit === "SQ") {
    return quantity.toFixed(2);
  }
  // Linear feet (LF) shown to 1 decimal
  if (unit === "LF") {
    return quantity.toFixed(1);
  }
  // Pieces (EA, PC) shown as integers
  if (["EA", "PC", "ea", "pc"].includes(unit)) {
    return Math.round(quantity).toString();
  }
  // Default: 2 decimals
  return quantity.toFixed(2);
}

/**
 * Format labor rate ($/SQ)
 */
export function formatLaborRate(rate: number): string {
  return formatCurrency(rate) + "/SQ";
}

// ============================================================================
// DEPRECATION NOTES
// ============================================================================

/**
 * @deprecated In V2 responses, all line_items are materials.
 * Labor comes from the separate `labor` section of the API response.
 * Use getLaborSubtotal(labor) or projectTotals.installation_labor_subtotal.
 *
 * This function is kept for backward compatibility with legacy responses
 * where labor items were mixed with materials.
 */
export function calculateLaborFromLineItems(lineItems: LineItemWithState[]): number {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[DEPRECATED] calculateLaborFromLineItems: " +
      "In V2 responses, labor is calculated by the API based on squares. " +
      "Use getLaborSubtotal(labor) from the API response instead."
    );
  }
  const { labor } = separateItemsByType(lineItems);
  return labor.reduce((sum, item) => sum + calculateLaborTotal(item), 0);
}

/**
 * @deprecated In V2 responses, all line_items are materials.
 * Overhead comes from the separate `overhead` section of the API response.
 * Use getOverheadSubtotal(overhead) or projectTotals.overhead_subtotal.
 *
 * This function is kept for backward compatibility with legacy responses
 * where overhead items were mixed with materials.
 */
export function calculateOverheadFromLineItems(lineItems: LineItemWithState[]): number {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[DEPRECATED] calculateOverheadFromLineItems: " +
      "In V2 responses, overhead is calculated by the API. " +
      "Use getOverheadSubtotal(overhead) from the API response instead."
    );
  }
  const { overhead } = separateItemsByType(lineItems);
  return overhead.reduce((sum, item) => sum + calculateOverheadTotal(item), 0);
}
