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

// ============================================================================
// CONSTANTS
// ============================================================================
// NOTE: All estimate math (per-line totals, category rollups, markup, L&I
// assumptions) lives in lib/utils/estimateTotals.ts — the canonical engine
// shared by the legacy editor, the live /api/takeoffs route, and both Excel
// exporters. Nothing in this file computes money anymore.

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
// TOTAL CALCULATIONS — moved to the canonical engine
// ============================================================================
// The per-item and rollup money math that used to live here (including a
// 12.65% L&I multiplier that double-counted burden already priced upstream)
// has been replaced by lib/utils/estimateTotals.ts. Re-exported here for
// discoverability.
export {
  calculateEstimateTotals,
  separateLineItems,
  materialLineTotal,
  laborLineTotal,
  overheadLineTotal,
  paintLineTotal,
  applyMarkup,
  resolveMarkupPercent,
} from "./estimateTotals";

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
// calculateLaborFromLineItems / calculateOverheadFromLineItems removed —
// deprecated wrappers with no consumers; use calculateEstimateTotals from
// lib/utils/estimateTotals.ts instead.
