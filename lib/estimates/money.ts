/**
 * Money math for the proposals domain. All amounts are INTEGER CENTS
 * (unlike the takeoff domain's float dollars) so totals are deterministic
 * and match the database RPC re-verification exactly.
 */

export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot round a non-finite value");
  }
  return Math.floor(value + 0.5);
}

export function computeLineTotalCents(
  quantity: number,
  unitCostCents: number
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("quantity must be a non-negative finite number");
  }
  if (!Number.isInteger(unitCostCents) || unitCostCents < 0) {
    throw new Error("unitCostCents must be a non-negative integer");
  }
  const total = roundHalfUp(quantity * unitCostCents);
  if (!Number.isSafeInteger(total)) {
    throw new Error("line total exceeds the safe integer range");
  }
  return total;
}

export function computeTotalCents(lineTotals: readonly number[]): number {
  return lineTotals.reduce((sum, total) => {
    const next = sum + total;
    if (!Number.isSafeInteger(next)) {
      throw new Error("total exceeds the safe integer range");
    }
    return next;
  }, 0);
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return usdFormatter.format(cents / 100);
}

export function dollarsToCents(dollars: number): number {
  return roundHalfUp(dollars * 100);
}
