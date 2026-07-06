import {
  computeLineTotalCents,
  computeTotalCents,
  roundHalfUp,
} from "@/lib/estimates/money";
import type {
  EstimateContentInput,
  EstimateItemInput,
  EstimatePricingInput,
  EstimateTotals,
} from "@/lib/estimates/types";

/**
 * Deterministic proposal pricing. All money is integer cents; all
 * percentages are basis points (100 bps = 1%). Calculation order:
 *
 *   subtotal      = Σ item totals where kind ≠ alternate
 *   markup        = roundHalfUp(subtotal × markupBps / 10000)
 *   overhead      = roundHalfUp(subtotal × overheadBps / 10000)
 *   contingency   = roundHalfUp(subtotal × contingencyBps / 10000)
 *   taxable       = Σ item totals where kind ≠ alternate and taxable
 *   tax           = roundHalfUp(taxable × taxBps / 10000)
 *   total         = subtotal + markup + overhead + contingency + tax
 *
 * Alternates are priced and reported separately but never enter the total.
 * Each percentage line rounds independently. The create/update database
 * RPCs re-verify every one of these numbers before persisting.
 */

export const MAX_BPS = 50000; // 500%

function applyBps(baseCents: number, bps: number): number {
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_BPS) {
    throw new Error(`basis points must be an integer in 0..${MAX_BPS}`);
  }
  const result = roundHalfUp((baseCents * bps) / 10000);
  if (!Number.isSafeInteger(result)) {
    throw new Error("percentage line exceeds the safe integer range");
  }
  return result;
}

export function computeItemTotalCents(item: EstimateItemInput): number {
  return computeLineTotalCents(item.quantity, item.unitCostCents);
}

export function computeEstimateTotals(
  items: readonly EstimateItemInput[],
  pricing: EstimatePricingInput
): EstimateTotals {
  let subtotalCents = 0;
  let taxableCents = 0;
  let allowanceCents = 0;
  let alternateCents = 0;

  for (const item of items) {
    const total = computeItemTotalCents(item);
    if (item.kind === "alternate") {
      alternateCents += total;
      continue;
    }
    subtotalCents += total;
    if (item.taxable) taxableCents += total;
    if (item.kind === "allowance") allowanceCents += total;
  }
  computeTotalCents([subtotalCents, alternateCents]); // safe-range check

  const markupCents = applyBps(subtotalCents, pricing.markupBps);
  const overheadCents = applyBps(subtotalCents, pricing.overheadBps);
  const contingencyCents = applyBps(subtotalCents, pricing.contingencyBps);
  const taxCents = applyBps(taxableCents, pricing.taxBps);
  const totalCents = computeTotalCents([
    subtotalCents,
    markupCents,
    overheadCents,
    contingencyCents,
    taxCents,
  ]);

  return {
    subtotalCents,
    markupCents,
    overheadCents,
    contingencyCents,
    taxableCents,
    taxCents,
    totalCents,
    allowanceCents,
    alternateCents,
  };
}

/** Content plus server-verifiable totals — the unit the RPCs accept. */
export interface PreparedEstimateContent {
  content: EstimateContentInput;
  totals: EstimateTotals;
}

export function prepareEstimateContent(
  content: EstimateContentInput
): PreparedEstimateContent {
  const items = content.sections.flatMap((section) => section.items);
  return { content, totals: computeEstimateTotals(items, content.pricing) };
}

/** Formats basis points as a human percentage, e.g. 1250 → "12.5%". */
export function formatBps(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, "")}%`;
}
