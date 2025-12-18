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
 */

import { LineItemWithState } from "@/lib/types/database";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ItemType = "material" | "labor" | "overhead";

export interface SeparatedItems {
  materials: LineItemWithState[];
  labor: LineItemWithState[];
  overhead: LineItemWithState[];
}

export interface GroupedMaterials {
  [presentationGroup: string]: LineItemWithState[];
}

export interface SectionTotals {
  materialsTotal: number;
  laborTotal: number;
  overheadTotal: number;
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

  // Default
  other: { title: "OTHER MATERIALS", color: "E0E0E0", order: 99 },
  materials: { title: "MATERIALS", color: "E8F5E9", order: 1 },
};

// ============================================================================
// ITEM TYPE SEPARATION
// ============================================================================

/**
 * Separate line items by type (material, labor, overhead)
 */
export function separateItemsByType(
  lineItems: LineItemWithState[]
): SeparatedItems {
  const materials: LineItemWithState[] = [];
  const labor: LineItemWithState[] = [];
  const overhead: LineItemWithState[] = [];

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
      default:
        // Default to material if unknown
        materials.push(item);
    }
  });

  return { materials, labor, overhead };
}

/**
 * Detect item type based on cost fields (fallback if item_type not set)
 */
function detectItemType(item: LineItemWithState): ItemType {
  const hasMaterialCost = (item.material_unit_cost || 0) > 0;
  const hasLaborCost = (item.labor_unit_cost || 0) > 0;
  const hasEquipmentCost = (item.equipment_unit_cost || 0) > 0;

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
 */
export function calculateOverheadTotal(item: LineItemWithState): number {
  return item.equipment_unit_cost || 0;
}

/**
 * Calculate totals for a section (all items combined)
 */
export function calculateSectionTotals(
  materials: LineItemWithState[],
  labor: LineItemWithState[],
  overhead: LineItemWithState[]
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

  const grandTotal = materialsTotal + laborTotal + overheadTotal;

  return {
    materialsTotal,
    laborTotal,
    overheadTotal,
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
    const { materials, labor, overhead } = separateItemsByType(sectionItems);
    totals[sectionId] = calculateSectionTotals(materials, labor, overhead);
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
