# Waste Factor Audit & Fix Plan

**Date:** 2026-07-07 · **Status:** PROPOSAL — nothing here has been applied.
**Scope:** frontend repo (`ai-estimator`) + calculation engine working tree
(`~/projects/estimatepros/exterior-estimation-api`, read-only audit).
**Why:** `organizations.settings.labor_rates.default_waste_factor_percent`
(default 12) is editable in Account settings but **never read by any
calculation**. Actual waste is applied by 13 disconnected mechanisms that
disagree with each other. For $20–25K jobs this silently mis-orders material.

---

## I. Waste Inventory — where waste actually comes from today

| # | Location | Context | Effective waste | Mechanism |
|---|----------|---------|-----------------|-----------|
| 1 | `migrations/fix_window_casing_and_artisan_tabs.sql` | Window/Door casing (5 rule variants) | 10% | `* 1.10` literal in `quantity_formula` |
| 2 | `migrations/add_trim_auto_scope_rules.sql:44` | Window/Door casing (older rule) | 10% | `* 1.10` literal |
| 3 | `migrations/add_trim_auto_scope_rules.sql:167` | Trim head flashing | 10% | `* 1.10` literal |
| 4 | `migrations/add_trim_auto_scope_rules.sql:88,127` | Trim caulk, trim fasteners | **0%** | coverage-only, no waste term |
| 5 | `migrations/add_gable_topout_and_topout_rules.sql` | Gable/top-out trim + Z-flashing (4 rules) | 10% | `* 1.10` literal |
| 6 | `migrations/migrate_stone_veneer_rules_to_siding.sql` | Stone veneer rules | unknown | needs live-DB check |
| 7 | engine `constants/siding.ts` `CONVERSION_SPECS` | Legacy v1 calculators only | siding 12%, shingle/panel 18%, trim/corners 12%, flashing 10%, housewrap 15% | hardcoded constants (dead path) |
| 8 | engine `orchestrator-v2.ts` (~1308 AND ~3253 — duplicated) | Material-assignment quantities | lap/panel/trim/flashing 10%, shingle/shake 15%, corners 12% | `pricing.waste_factor \|\| categoryWasteDefaults \|\| 1.10` — **disagrees with #7** |
| 9 | engine `orchestrator-v2.ts:~2674` | Dynamic detection classes (corbels, brackets…) | 0–12% | `detection_classes.waste_factor` DB column — the ONE already-DB-driven path |
| 10 | engine `orchestrator-v2.ts:~2330` | Whitewood corners | 5% | fully hardcoded |
| 11 | engine `orchestrator-v2.ts:~1681` | Belly band | 10% | hardcoded `WASTE_FACTOR=1.10` |
| 12 | engine `spatialContainment.ts:60,381` | Per-material containment | 10% default | reads `material_assignments[].waste_factor` — frontend never sends it |
| 13 | engine `autoscope-v2.ts` `extractWasteFromFormula()` | Calculation notes | cosmetic only | regex-parses the formula for display; never affects quantity |

**`pricing_items.waste_factor`** exists as a column and is read into the
engine — but nothing populates it, so the hardcoded maps always win.

## II. Why formulas can't be fixed by just editing SQL

`evaluateFormula()` (engine `autoscope-v2.ts:~1839`) builds
`new Function(...Object.keys(MeasurementContext))` — a formula can only
reference variables that exist on `MeasurementContext` (~35 geometry fields,
zero waste/pricing fields). A formula referencing `waste_factor` today throws
a swallowed ReferenceError and the rule silently produces quantity 0.
So the org setting cannot reach formulas until the engine injects it.

## III. The fix — minimal, follows an existing precedent

The engine ALREADY fetches org settings for overhead
(`orchestrator-v2.ts:~1151`: `organizations.settings.overhead_config` via
service client, keyed on the `organization_id` the frontend already sends in
every approve payload). Waste rides the same query:

**Engine changes (exterior-estimation-api):**
1. `types/autoscope.ts` — add `waste_factor: number` to `MeasurementContext`.
2. `orchestrator-v2.ts` — at the existing org-settings read, also read
   `settings.labor_rates.default_waste_factor_percent`; allow
   `estimate_settings.waste_factor_percent` (per-project override, add field
   to `ProjectEstimateSettings` in `configService.ts`) to take priority;
   compute `resolvedWasteFactor = 1 + (project ?? org ?? 12)/100` once.
3. `autoscope-v2.ts` — `buildMeasurementContext()` sets
   `ctx.waste_factor = resolvedWasteFactor`. `evaluateFormula` needs no
   change — the new key is automatically available to every formula.
4. Replace BOTH duplicated `categoryWasteDefaults` maps with
   `pricing.waste_factor || resolvedWasteFactor` (keep material-specific
   overrides via `pricing_items.waste_factor` where deliberate).
5. Reconcile or decommission `CONVERSION_SPECS` (legacy path) as part of the
   same change — don't leave four disagreeing waste tables.

**Rules migration (Supabase SQL Editor — manual, per your MCP-read-only rule):**
```sql
-- 1. Make effective waste queryable
ALTER TABLE siding_auto_scope_rules
ADD COLUMN IF NOT EXISTS waste_percent DECIMAL(5,2);

-- 2. Backfill from hardcoded literals (spot-check the regex results!)
UPDATE siding_auto_scope_rules
SET waste_percent = ((regexp_match(quantity_formula, '\*\s*1\.(\d+)'))[1]::text::decimal / 100 * 10)
WHERE quantity_formula ~ '\*\s*1\.\d+' AND waste_percent IS NULL;

-- 3. Rewrite literals to the injected variable — BATCH BY BATCH, with an
--    MN568 line-item diff after each batch:
UPDATE siding_auto_scope_rules
SET quantity_formula = REPLACE(quantity_formula, '* 1.10', '* waste_factor')
WHERE quantity_formula LIKE '%* 1.10%';
-- Do NOT blanket-replace deliberate non-default waste (whitewood 1.05,
-- shingle 1.15/1.18) — those become rule-level waste_percent overrides.
```

**Frontend changes (this repo):** none required — `organization_id` and
`estimate_settings` already flow in the approve payload. Optional: a waste
override field in EstimateSettingsPanel writing
`estimate_settings.waste_factor_percent` (mirrors the markup_percent pattern).

## IV. Verification protocol (before ANY deploy — engine auto-deploys on push!)

1. Run MN568 through CURRENT production code to re-confirm the baseline
   (June audit: target $19,333 vs current $18,657 — that gap is pre-existing
   and must not be conflated with waste changes).
2. Confirm the org's actual `default_waste_factor_percent`. If 12% replaces
   rules hardcoded at 10%, those quantities rise ~1.8% — decide explicitly
   whether that's the wanted correction before rewriting formulas.
3. After each change batch, diff MN568 **per line item**
   (quantity/formula_used/notes), not just the grand total — totals-level
   checks hide compensating errors.
4. Decide per category whether shingle/shake/whitewood keep their specific
   waste (as `pricing_items.waste_factor` / rule `waste_percent`) instead of
   flattening to the org default.
5. `organization_id` is optional on some webhook paths — confirm the 12%
   fallback is right for requests that omit it.
6. Run `git diff` on the engine's three uncommitted files
   (`autoscope-v2.ts`, `orchestrator-v2.ts`, `webhook.ts`) and resolve that
   June work before layering waste changes on top.

## V. Side findings from this audit

- `scripts/audit-autoscope.js` (this repo) has a **live Supabase anon key
  hardcoded** — move it to an env var.
- Engine `webhook.ts`'s two endpoints are ~180-line copy-paste drift — the
  waste change doesn't touch them, but they're a standing hazard.
- Use the repo skills when executing this plan: `/calc-engine` before edits,
  `/rule-add` for the SQL, `/takeoff-validate` for MN568 diffs,
  `/pre-deploy` before any push.
