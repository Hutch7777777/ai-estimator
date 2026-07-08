/**
 * ============================================================================
 * CANONICAL ESTIMATE TOTALS ENGINE
 * ============================================================================
 * The ONE place estimate totals, markup, and item classification are
 * computed. Consumers:
 *
 *   - /api/takeoffs/[id]  (live viewer + exportTakeoffExcel)  → mode 'strict'
 *   - EstimateSummary / excelExportProfessional (legacy editor) → mode 'heuristic'
 *
 * Semantics (matching the live /api/takeoffs/[id] math):
 *   - NO L&I insurance is applied here. Labor burden (L&I, unemployment) is
 *     priced upstream by the calculation engine into labor_unit_cost, or
 *     captured in formula_used text on older rows. Display-layer math must
 *     never re-apply it (that was the legacy editor's double-count bug).
 *   - Markup is a flat percent applied to the full cost subtotal
 *     (material + paint + labor + overhead).
 *
 * Classification modes:
 *   - 'strict'    — trust the item_type column exactly, the way the live API
 *                   does: untyped rows count as material; rows with an
 *                   unrecognized item_type are EXCLUDED from totals.
 *   - 'heuristic' — for legacy data that predates item_type: fall back to
 *                   cost-shape detection (equipment-only → overhead,
 *                   labor-only → labor, paint by category/group), and count
 *                   labor carried on material rows (qty × labor_unit_cost)
 *                   in labor_cost — old HOVER-era rows priced real, payable
 *                   labor there. Strict mode excludes it (the live pipeline
 *                   uses material-row labor fields for display only).
 */

export interface CostLineItem {
  quantity?: number | null;
  material_unit_cost?: number | null;
  labor_unit_cost?: number | null;
  equipment_unit_cost?: number | null;
  material_extended?: number | null;
  labor_extended?: number | null;
  line_total?: number | null;
  item_type?: string | null;
  formula_used?: string | null;
  category?: string | null;
  presentation_group?: string | null;
}

export type ClassificationMode = "strict" | "heuristic";

export type ItemBucket = "material" | "paint" | "labor" | "overhead" | "excluded";

export interface SeparatedLineItems<T extends CostLineItem> {
  materials: T[];
  paint: T[];
  labor: T[];
  overhead: T[];
}

export interface EstimateTotals {
  material_cost: number;
  paint_cost: number;
  labor_cost: number;
  overhead_cost: number;
  subtotal: number;
  markup_percent: number;
  markup_amount: number;
  final_price: number;
}

export interface TotalsOptions {
  mode: ClassificationMode;
  /**
   * Parse a burdened labor total out of formula_used text before falling
   * back to qty × rate. Only for legacy data whose true labor total exists
   * only in that text. The live API never does this.
   */
  laborFromFormula?: boolean;
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Resolve a takeoff's markup percent. Matches the live API's `?? 15`:
 * only null/undefined (or non-numeric garbage) falls back to 15 —
 * an explicit 0% markup is honored, never silently replaced.
 */
export function resolveMarkupPercent(markupPercent: number | null | undefined): number {
  if (markupPercent === null || markupPercent === undefined) return 15;
  const n = Number(markupPercent);
  return Number.isFinite(n) ? n : 15;
}

export function classifyLineItem(item: CostLineItem, mode: ClassificationMode): ItemBucket {
  const itemType = item.item_type;

  if (itemType === "material" || itemType === "paint" || itemType === "labor" || itemType === "overhead") {
    return itemType;
  }

  if (!itemType) {
    if (mode === "strict") {
      // Live API convention: untyped rows are materials
      return "material";
    }
    // Heuristic fallback for rows that predate item_type
    const category = (item.category || "").toLowerCase();
    const presentationGroup = (item.presentation_group || "").toLowerCase();
    if (category === "paint" || presentationGroup.includes("paint")) {
      return "paint";
    }
    const hasMaterialCost = num(item.material_unit_cost) > 0;
    const hasLaborCost = num(item.labor_unit_cost) > 0;
    const hasEquipmentCost = num(item.equipment_unit_cost) > 0;
    if (!hasMaterialCost && !hasLaborCost && hasEquipmentCost) return "overhead";
    if (!hasMaterialCost && hasLaborCost) return "labor";
    return "material";
  }

  // Unrecognized non-empty item_type: the live API drops these rows from
  // every bucket; heuristic mode keeps legacy behavior (treat as material)
  return mode === "strict" ? "excluded" : "material";
}

export function separateLineItems<T extends CostLineItem>(
  items: T[],
  mode: ClassificationMode
): SeparatedLineItems<T> {
  const separated: SeparatedLineItems<T> = { materials: [], paint: [], labor: [], overhead: [] };

  for (const item of items) {
    const bucket = classifyLineItem(item, mode);
    if (bucket === "material") separated.materials.push(item);
    else if (bucket === "paint") separated.paint.push(item);
    else if (bucket === "labor") separated.labor.push(item);
    else if (bucket === "overhead") separated.overhead.push(item);
    // 'excluded' rows are dropped, matching the live API
  }

  return separated;
}

// ============================================================================
// PER-LINE TOTALS
// ============================================================================

export function materialLineTotal(item: CostLineItem): number {
  return item.material_extended != null
    ? num(item.material_extended)
    : num(item.quantity) * num(item.material_unit_cost);
}

export function paintLineTotal(item: CostLineItem): number {
  const materialPart =
    item.material_extended != null
      ? num(item.material_extended)
      : num(item.quantity) * num(item.material_unit_cost);
  const laborPart =
    item.labor_extended != null
      ? num(item.labor_extended)
      : num(item.quantity) * num(item.labor_unit_cost);
  return materialPart + laborPart;
}

export function laborLineTotal(
  item: CostLineItem,
  opts: { parseFormula?: boolean } = {}
): number {
  // Legacy rows: the true (burdened) labor total may exist only in the
  // formula_used text written by the upstream engine — respect it
  if (opts.parseFormula && typeof item.formula_used === "string") {
    const match = item.formula_used.match(/=\s*\$([0-9,]+\.?\d*)\s*$/);
    if (match) {
      const total = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(total)) return total;
    }
  }
  // NO L&I multiplier here — burden is priced upstream in labor_unit_cost
  return num(item.quantity) * num(item.labor_unit_cost);
}

export function overheadLineTotal(item: CostLineItem): number {
  return num(item.equipment_unit_cost) || num(item.line_total) || 0;
}

// ============================================================================
// MARKUP + FULL TOTALS
// ============================================================================

export function applyMarkup(
  subtotal: number,
  markupPercent: number | null | undefined
): { markup_percent: number; markup_amount: number; final_price: number } {
  const pct = resolveMarkupPercent(markupPercent);
  const markupAmount = subtotal * (pct / 100);
  return {
    markup_percent: pct,
    markup_amount: markupAmount,
    final_price: subtotal + markupAmount,
  };
}

/**
 * Compute the full totals object for a set of takeoff line items.
 * Returns the exact shape the live /api/takeoffs/[id] response exposes
 * as `totals` (plus markup_amount).
 */
export function calculateEstimateTotals(
  items: CostLineItem[],
  markupPercent: number | null | undefined,
  opts: TotalsOptions
): EstimateTotals {
  const { materials, paint, labor, overhead } = separateLineItems(items, opts.mode);

  const materialCost = materials.reduce((sum, item) => sum + materialLineTotal(item), 0);
  const paintCost = paint.reduce((sum, item) => sum + paintLineTotal(item), 0);

  let laborCost = labor.reduce(
    (sum, item) => sum + laborLineTotal(item, { parseFormula: opts.laborFromFormula }),
    0
  );
  if (opts.mode === "heuristic") {
    // Legacy convention: material rows carry real, payable labor
    laborCost += materials.reduce(
      (sum, item) => sum + num(item.quantity) * num(item.labor_unit_cost),
      0
    );
  }

  const overheadCost = overhead.reduce((sum, item) => sum + overheadLineTotal(item), 0);

  const subtotal = materialCost + paintCost + laborCost + overheadCost;
  const markup = applyMarkup(subtotal, markupPercent);

  return {
    material_cost: materialCost,
    paint_cost: paintCost,
    labor_cost: laborCost,
    overhead_cost: overheadCost,
    subtotal,
    ...markup,
  };
}
