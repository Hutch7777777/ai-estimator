# Phase 1.1 — Database Truth Audit

**Status:** ✅ COMPLETE — operator-side SQL run 2026-04-27; findings recorded below; Phase 1.2 recommended.
**Audience:** Phase 1 sub-PR authors and reviewers; future operators refreshing the audit.
**Purpose:** establish a precise, evidence-backed picture of the current `pricing_items`, `calculation_constants`, `presentation_group`, and rule-table state before any Phase 1 seed/insert work begins.

---

## Why this exists

`docs/strategy/04-known-risks-and-debt.md` lists six Tier-1 risks that Phase 1 is meant to close (1.1, 1.2, 1.3, 1.6, 1.7, 1.8). Several of those risks were inventoried from `ARCHITECTURE_VIOLATION_REPORT.md`, which dates from 2026-03-03. The repo has shipped DB-driven detection pricing and trim resolution since then (Phase 1A–3 of the engine port; commits visible in `lib/estimating/detectionCountPricing.ts` and `packages/estimating-engine/src/autoscope/autoscopeV2.ts`). So the violation report's hardcoded-pricing claims may be partially stale.

Without this audit, Phase 1 risks duplicate-seeding rows that already exist or re-asserting tables that were already created.

---

## Scope (what this audit does, what it doesn't)

**Does:**
- Inventory hardcoded values still living in source (read-only file inspection).
- Produce read-only SQL audits to enumerate live DB state for pricing items, constants, presentation groups, and rule tables.
- Identify sources of truth where two candidates exist (e.g. canonical rule table).
- Recommend the Phase 1.2 next step.

**Does not:**
- Execute SQL against production. Queries are produced; the operator runs them and pastes findings into this doc's "Findings" sections.
- Insert, update, or delete any data.
- Propose schema changes (those belong in `docs/strategy/03-target-architecture.md` and Phase 1 sub-PRs).
- Modify n8n workflows (out of repo).

---

## Source-side inventory (read-only file inspection — already done)

### Calculation constants

Hardcoded as **fallback values** at:

| Constant | Value | Location |
|---|---|---|
| `MARKUP_RATE` | `0.26` | `packages/estimating-engine/src/orchestrators/sidingOrchestratorV2.ts:179` |
| `SOC_UNEMPLOYMENT_RATE` | `0.1265` | `packages/estimating-engine/src/orchestrators/sidingOrchestratorV2.ts:180` |
| `LI_HOURLY_RATE` | `3.56` | `packages/estimating-engine/src/orchestrators/sidingOrchestratorV2.ts:181` |
| `INSURANCE_RATE_PER_THOUSAND` | `24.38` | `packages/estimating-engine/src/orchestrators/sidingOrchestratorV2.ts:182` |
| `DEFAULT_CREW_SIZE` | `4` | `packages/estimating-engine/src/orchestrators/sidingOrchestratorV2.ts:183` |
| `DEFAULT_ESTIMATED_WEEKS` | `2` | `packages/estimating-engine/src/orchestrators/sidingOrchestratorV2.ts:184` |

The orchestrator preferentially reads DB values:

```ts
// packages/estimating-engine/src/orchestrators/sidingOrchestratorV2.ts:1000-1006
const CALC_MARKUP_RATE                = dbConstants.markup_rate;
const CALC_SOC_UNEMPLOYMENT_RATE      = dbConstants.soc_unemployment_rate;
const CALC_LI_HOURLY_RATE             = dbConstants.li_hourly_rate;
const CALC_INSURANCE_RATE_PER_THOUSAND = dbConstants.insurance_rate_per_thousand;
```

`dbConstants` flows from `lib/estimating/refData.ts:fetchCalculationConstants` which reads `calculation_constants` rows where `active = true` and `trade IS NULL OR trade = 'siding'`. Globals applied first, siding-specific overrides applied second. **Conclusion: the table is wired; the audit needs to confirm rows exist.**

Same fallback pattern in production Python API at `~/Downloads/exterior-estimation-api-current/src/calculations/siding/orchestrator-v2.ts:146-151` and `:863-866`.

### Pricing items (detection-driven)

The local engine no longer hardcodes detection pricing — it goes through `lib/estimating/detectionCountPricing.ts:loadDetectionCountPricing()`, which reads `detection_class_material_mapping` joined to `pricing_items` (verified in Phase 0.7 work). **`DET-CORBEL` was confirmed live at $147 material + $28.66 total_labor.**

Whether `DET-BRACKET`, `DET-SHUTTER`, and the belly-band SKUs are present is unknown from source — needs the SQL audit.

### Trim SKU resolution

`packages/estimating-engine/src/autoscope/autoscopeV2.ts:239` records: *"HARDIE_TRIM_SKU_MAP removed — resolved via pricing_items cache using is_colorplus + width matching."* A `HARDIE_TRIM_FALLBACK_SKU` map remains at line 241 as a fallback when DB lookup misses.

### Rule tables

Source files reference `siding_auto_scope_rules` and `labor_auto_scope_rules`. **Zero references** to `auto_scope_rules_v2` across `packages/`, `lib/`, `app/`, `migrations/`. The migration `migrations/migrate_stone_veneer_rules_to_siding.sql` confirms a previous consolidation pattern — stone-veneer rules merged into the siding table.

### Presentation group

No `presentation_group_config` table is referenced in source. Group resolution flows through:
1. `siding_auto_scope_rules.presentation_group` — emitted by rules at insert-time.
2. `lib/estimating/detectionCountPricing.ts:resolvePresentationGroup()` — has a `PRESENTATION_GROUP_DEFAULTS` constant table (not DB-backed). Falls back to `'Other Materials'` for unknown classes.
3. `lib/estimating/detectionCountPricing.ts:deriveBluebeamPresentationGroup()` — code-side derivation for Bluebeam subjects.

The MN568 baseline `_meta.notes` records that "Architectural Details" gets remapped into "trims" at presentation time — confirming non-canonical values exist somewhere upstream.

---

## SQL audit queries (read-only, ready to run)

Located under `docs/sql-audits/`. Each file is self-contained — copy-paste a single file into Supabase SQL editor.

| File | Audits |
|---|---|
| `01-pricing-items.sql` | DET-CORBEL, DET-BRACKET, DET-SHUTTER presence + values; belly-band SKU enumeration; detection-class → SKU resolution gaps; expected-class coverage |
| `02-calculation-constants.sql` | All active rows; presence of the six fallback constants; drift between DB and source-fallback values; surface unexpected constants |
| `03-presentation-groups.sql` | Distinct values in `takeoff_line_items` and `siding_auto_scope_rules`; non-canonical drift; canonical groups with no rows |
| `04-rule-tables.sql` | All tables matching `%auto_scope%`; row counts + last-updated for `siding_auto_scope_rules` and `labor_auto_scope_rules`; confirm `auto_scope_rules_v2` does not exist; trade coverage |

See `docs/sql-audits/README.md` for run order and constraints.

---

## Findings (TO BE FILLED after operator runs the audit)

The four sections below are placeholders. The operator runs the audit, pastes the relevant rows or summary, and the section transitions from "PENDING" to a recorded finding.

### 1. Pricing items

**Status:** ✅ RECORDED 2026-04-27.

- **`pricing_items` table** exists with the expected schema.
- **DET-CORBEL, DET-BRACKET, DET-SHUTTER**: all three FOUND in `pricing_items`. The n8n-side hardcoded values flagged by `ARCHITECTURE_VIOLATION_REPORT.md` ($45 / $35 / $120) are out-of-repo concerns (Phase 4 territory, not Phase 1).
- **Belly-band SKUs in current MN568 use:** `JH-TRIM-BB-8-CP` and `WW-2X12-20` — both FOUND. These are the SKUs the live rules emit and the live takeoff references.
- **Legacy belly-band SKUs `HARDIE-BELLYBAND-4X12` and `HARDIE-BELLYBAND-6X12`:** MISSING. **Active belly-band rules do not reference these SKUs.** They appear to be planning placeholders or obsolete catalog entries. **Conclusion: do not seed.** A future cleanup pass can remove the placeholder names from any documentation that still references them, but no DB action is required while they're not used by any active rule.
- **Detection class → SKU resolution:** the 16-class coverage check (query 1d) confirms every active detection class has a SKU and that SKU resolves to a `pricing_items` row. (No status-`SKU_MISSING_IN_PRICING_ITEMS` or `NO_SKU_MAPPED` rows surfaced in the audit run.)

**Phase 1 implications for pricing:** **no seed work required**. The pricing layer is already consistent with current live behavior. The historical violation-report claim that detection-driven SKUs were missing has been resolved by prior work (Phase 1A–3 of the engine port).

### 2. Calculation constants

**Status:** ✅ RECORDED 2026-04-27.

- **`calculation_constants` table** exists.
- **Five of six fallback constants match the source-side hardcoded values exactly** (`soc_unemployment_rate`, `li_hourly_rate`, `insurance_rate_per_thousand`, `default_crew_size`, `default_estimated_weeks`).
- **`markup_rate` diverges:** source-side fallback is `0.26`; DB has `0.10`. Recent takeoff history shows **10% is current behavior from 2026-03-06 through the latest MN568 capture**; 26% appears to be older behavior that predates the policy change. The MN568 baseline `_meta` records `markup_percent: 10`, consistent with this.

**Important framing (per `feedback_baseline_framing.md` and user instruction):** treat **0.10 as current DB truth**, not a drift to fix. The orchestrator's source-side `MARKUP_RATE = 0.26` constant is a stale hardcoded fallback — it never fires under normal operation because `calculation_constants.markup_rate = 0.10` wins the DB-read-then-fallback ordering. Removing or updating the source-side `0.26` is **not** a Phase 1 action; the current behavior is correct and the regression baseline locks it in.

**Phase 1 implications for constants:** **no seed work required**. All six constants resolve to live values that produce the captured MN568 baseline. The 0.26 vs 0.10 discrepancy is recorded as a Tier-3 source hygiene item (the dead fallback can be cleaned up alongside the broader source-side hardcode drain in Phase 3, not now).

### 3. Presentation groups

**Status:** ✅ RECORDED 2026-04-27 — significant taxonomy drift surfaced. **This is the primary Phase 1.2 candidate.**

- **Historical `takeoff_line_items` show major taxonomy drift** across many distinct `presentation_group` values that do not match the canonical 7 (`cladding`, `trims`, `metals_flashings`, `waterproofing`, `accessories`, `soffit`, `gutters`).
- **Current MN568 baseline** uses near-canonical groups, with code remapping `Architectural Details → trims` at presentation time (recorded in `test-data/baselines/MN568.expected.json` `_meta.notes`).
- **Active belly-band rules in `siding_auto_scope_rules`** emit non-canonical values including `Belly Band`, `Flashing`, `Horizontal Trims` — these become non-canonical rows in `takeoff_line_items` unless the presentation layer remaps them.

**Two distinct surfaces drifting:**
1. **Source surface (rules):** rules write non-canonical `presentation_group` strings into `takeoff_line_items` at takeoff-creation time.
2. **Render surface (code):** `lib/estimating/detectionCountPricing.ts:resolvePresentationGroup()` and `:deriveBluebeamPresentationGroup()` apply a code-side remap, but only for detection-count items — rule-emitted values pass through unmapped.

**Why this is the load-bearing finding:** the canonical 7-group spec in `docs/strategy/01-product-output-spec.md` and `04-estimating-business-rules.md` is **aspirational, not actual**. Live data has many more values. Any Phase 1 work that "seeds the canonical groups" without first reconciling this would either (a) fail to match live behavior, or (b) require rewriting historical takeoffs — which violates the regression-baseline contract.

**Phase 1 implications for presentation groups:** documentation/config design first; runtime changes later. Specifically, the next task is to author an explicit mapping table from observed non-canonical values to canonical targets — without rewriting any data, without changing any rule, without changing any render code. Phase 1.2 owns this. See "Recommended Phase 1.2" below.

### 4. Rule tables

**Status:** ✅ RECORDED 2026-04-27.

- **`siding_auto_scope_rules`** is the canonical rule table — confirmed by both source-side reference inventory (only this table is read by `autoscope-v2.ts` and `refData.ts`) and the audit run.
- **`labor_auto_scope_rules`** is a distinct, separate-purpose table for labor scope (read by `refData.ts`'s `fetchLaborAutoScopeRules`). Coexists with siding rules; not a competitor.
- **`auto_scope_rules_v2`** does NOT exist — Tier-1 contradiction 1.3 from `04-known-risks-and-debt.md` is closed. The reference in `ARCHITECTURE_VIOLATION_REPORT.md` was either anticipated future work that never landed, or referred to a table in a separate environment we don't have.

**Phase 1 implications for rule tables:** **no consolidation work required**. The "multiple competing rule tables" Tier-1 risk does not apply to our current setup.

---

## Path selection: **Path B-lite**

The audit eliminated 3 of the 4 candidate Tier-1 risks Phase 1 was originally meant to close:

| Risk | Audit result | Status |
|---|---|---|
| 1.3 multiple competing rule tables | `auto_scope_rules_v2` does not exist; canonical = `siding_auto_scope_rules` | **Closed** |
| 1.6 hardcoded calculation constants | DB has 5/6 matching; `markup_rate=0.10` is current truth, not a drift | **Closed** (live behavior is correct; source-side `0.26` is dead fallback, Phase 3 hygiene) |
| 1.7 hardcoded labor/overhead/SKU rates | Detection-driven SKUs all present (DET-CORBEL/BRACKET/SHUTTER + current belly-band SKUs); legacy SKU placeholders not referenced by any active rule | **Closed for Phase 1** (any source-side `LABOR_RATES`/`OVERHEAD_RATES`/`TRIM_SKUS` arrays remaining in code are Phase 3 source hygiene, not Phase 1 data work) |
| 1.8 hardcoded presentation_group mappings | Major taxonomy drift between live data, rules, and the canonical 7-group spec | **OPEN** — the only remaining Phase 1 deliverable |

This reduces Phase 1 to a single sub-phase that is documentation/config first, runtime later — hence "Path B-lite" (Path B from the original plan, scoped to one sub-item instead of three).

## Recommended Phase 1.2 — Presentation Group Contract Audit & Mapping Plan

**Goal:** produce an explicit, evidence-backed mapping between every observed `presentation_group` value (across `takeoff_line_items` history and `siding_auto_scope_rules`) and the canonical 7-group taxonomy. Documentation and config design only. **No runtime changes, no schema changes, no data rewrites in Phase 1.2.**

**Scope (Phase 1.2 deliverables):**
1. **Authoritative drift inventory** — a markdown table in this audit doc (or a new `docs/strategy/phase-1-presentation-group-mapping.md`) listing every observed non-canonical value with its row counts, originating tables, and which canonical group it should map to.
2. **Mapping policy decision** — for each non-canonical value, choose one of: (a) remap to a canonical group, (b) promote the value to canonical (extend the spec from 7 to N groups), or (c) leave as historical-only — never emitted by future rules. Each decision is made by Anthony Hutchinson per the regression-protection framing in `feedback_baseline_framing.md`.
3. **Forward-only enforcement strategy** — pick a mechanism that normalizes future output without rewriting historical takeoffs. Three candidates to evaluate (no implementation in 1.2):
   - **Code-side remap** at line-item insert (extend the existing `resolvePresentationGroup` pattern to cover rule-emitted values).
   - **Database `presentation_group_config` table** with from-value/to-value mapping rows; orchestrator reads it at insert time.
   - **Rule-author convention only** (update active rules in place to emit canonical values; historical untouched). This requires a baseline refresh per `feedback_baseline_framing.md`.
4. **Updated `01-product-output-spec.md`** — explicitly distinguish "canonical-spec groups" from "live-data groups," reference the mapping doc, and clarify that Phase 1.2 does NOT propose rewriting historical takeoffs.
5. **Phase 1.3 prerequisites** — what evidence Phase 1.3 (the actual implementation of the chosen mechanism, when it happens) needs before it can start: which active rules get edited, which code path gets the remap, what the baseline-refresh procedure looks like.

**Phase 1.2 does NOT:**
- Edit any auto-scope rule
- Add a `presentation_group_config` table or any other schema
- Change `lib/estimating/detectionCountPricing.ts` or any runtime
- Refresh `MN568.expected.json` (refresh is a future Phase 1.3+ action gated by a deliberate rule/data change)
- Rewrite any historical `takeoff_line_items` rows

**Files Phase 1.2 may create or modify:**
- `docs/strategy/phase-1-presentation-group-mapping.md` (new — the mapping deliverable)
- `docs/strategy/phase-1-database-audit.md` (this file — recording the mapping outcomes)
- `docs/strategy/01-product-output-spec.md` (clarify spec-vs-live framing)
- `docs/strategy/05-implementation-roadmap.md` (Phase 1.2 status block; Phase 1.3 prerequisites)
- `docs/sql-audits/05-presentation-group-mapping.sql` (optional — additional drill-down queries on per-rule emissions if the existing 03 file isn't enough)

## Out-of-scope items (for the record)

The following audit findings are noted but explicitly NOT part of Phase 1's reduced scope:

- **n8n hardcoded pricing** (corbel $45, bracket $35, shutter $120, belly band SKUs) — out of repo; resolved when n8n workflows migrate to DB reads in Phase 4.
- **Source-side `MARKUP_RATE = 0.26` dead fallback** — Phase 3 source-hygiene cleanup; harmless until then.
- **Legacy SKU placeholders `HARDIE-BELLYBAND-4X12` / `HARDIE-BELLYBAND-6X12`** — not referenced by any active rule; no DB action needed. Future cleanup if/when discovered active in any environment.

---

## validate:mn568 result (recorded)

**Phase 1.1 audit run** — 2026-04-27 (initial audit doc + SQL files written, no runtime changes):

```
✅ MN568 regression: PASS
   expected: test-data/baselines/MN568.expected.json
   actual:   test-data/runs/MN568.actual.json
   epsilon:  0
exit=0
```

**Phase 1.1 findings-population run** — 2026-04-27 (operator findings recorded, Path B-lite chosen):

```
✅ MN568 regression: PASS
   expected: test-data/baselines/MN568.expected.json
   actual:   test-data/runs/MN568.actual.json
   epsilon:  0
exit=0
```

The audit + findings recording added no runtime code, no schema, no data, no test-data changes — the regression baseline still matches the captured actual run. Phase 1.2 must keep this exit at 0.

---

## Source citations

- `docs/strategy/05-implementation-roadmap.md` — Phase 1 scope and sub-item ordering
- `docs/strategy/04-known-risks-and-debt.md` — Tier-1 risks 1.1, 1.2, 1.3, 1.6, 1.7, 1.8
- `docs/strategy/03-target-architecture.md` — DB-as-truth target, `calculation_constants`, `presentation_group_config`
- `docs/strategy/01-product-output-spec.md` — canonical 7-group taxonomy, canonical-source-per-field table
- `ARCHITECTURE_VIOLATION_REPORT.md` — original hardcoded-values inventory (2026-03-03; partially stale per Phase 1A–3 work)
- `test-data/baselines/MN568.expected.json` — `_meta.notes` recording "Architectural Details → trims" presentation mapping
