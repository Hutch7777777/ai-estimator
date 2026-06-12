# Audit Verification — exterior-estimation-api

**Date:** June 10, 2026
**Verifies:** `docs/CODEBASE_AUDIT_JUNE_2026.md` claims, **this repo only** (exterior-estimation-api)
**Method:** Every audit claim touching this codebase was checked against current source (grep + file reads on `main` @ `a85d15a`). Claims about n8n workflow contents, the frontend repo, the extraction-api repo, and live Supabase schema/rows are marked OUT OF SCOPE. No code was changed.

**Verdict legend:**
- **CONFIRMED** — claim matches current code
- **STALE** — was true, code has since changed
- **MIXED** — part true, part stale/wrong
- **OUT OF SCOPE** — not verifiable from this repo

---

## Part 1 — Claim-by-Claim Verification

### 1.1 The dual rule engine (audit §2.2, Exec Summary) — **CONFIRMED** ✅

**Claim:** "Railway `autoscope-v2.ts` reads `siding_auto_scope_rules`" while n8n reads `auto_scope_rules_v2`.

- `src/calculations/siding/autoscope-v2.ts:334` — `.from('siding_auto_scope_rules')`. Header comment at `autoscope-v2.ts:3` says the same.
- The string `auto_scope_rules_v2` appears **nowhere** in `src/` or `tests/`. This repo never reads the v2 rules table.
- (n8n's side of the dual engine: OUT OF SCOPE, but this repo's half of the claim is exactly as described.)

**Related claim:** "four more per-trade rule tables (`labor_auto_scope_rules`, `gutters_…`, `roofing_…`, `windows_…`)" — **PARTIALLY CONFIRMED**: this repo reads `labor_auto_scope_rules` at `orchestrator-v2.ts:1040`. The gutters/roofing/windows rule tables are not referenced anywhere in this repo.

### 1.2 `net_siding_sqft` mapping bug fixed in `dce3c39` — **CONFIRMED** ✅

Commit exists: `dce3c39 fix: resolve CAD path net_siding_sqft field mapping in webhook transformer`. The fix survives as the alias chain at `src/transformers/webhook.ts:34-38` (`net_siding_sqft > net_siding_area_sqft > net_wall_area_sqft > calculated`) and the field comment at `src/types/webhook.ts:29` ("CAD path field name variant").

### 1.3 `extraction_id = job_id` convention (audit §1.1) — **CONFIRMED (repo side)** ✅

The n8n workflow that sets it is OUT OF SCOPE, but this repo independently corroborates the convention:

- `orchestrator-v2.ts:2876-2880` writes to `extraction_job_totals` with `.eq('job_id', extractionId)` — **the API itself uses its `extraction_id` parameter as a `job_id`**.
- `autoscope-v2.ts:374-378` (`fetchMeasurementsFromDatabase`) looks up `cad_hover_measurements` by `.eq('extraction_id', extractionId)`.

The control-flow-as-data hack the audit describes is encoded on both sides; this repo is a knowing participant.

### 1.4 `cad_hover_measurements` has no provenance (audit §1.2) — **CONFIRMED as far as code shows** ✅

Both readers (`autoscope-v2.ts:375` via `select('*')`, `spatialContainment.ts:389`) consume the table with no `source_type` column referenced anywhere. `spatialContainment.ts` hardcodes `source_type: 'cad'` on its own derived objects (`spatialContainment.ts:970, 1016, 1034, 1049, 1073`) — i.e., provenance is asserted in code, not read from data. The actual DB schema is OUT OF SCOPE, but no code in this repo could distinguish HOVER-derived from Bluebeam-derived rows.

### 1.5 "Missing table: `calculation_constants`, hardcoded in orchestrator-v2.ts:123-129" (audit §2.3) — **STALE** ⚠️

The table is **not missing** — it exists and is the live source:

- `src/services/configService.ts:102-104` queries `calculation_constants` (5-min TTL cache, `configService.ts:45`).
- `orchestrator-v2.ts:862-869` consumes it on the live path: `CALC_MARKUP_RATE = dbConstants.markup_rate` etc., and passes `CALC_MARKUP_RATE` to `calculateProjectTotals` at `orchestrator-v2.ts:2791`.

What remains true: the hardcoded constants still exist — `MARKUP_RATE = 0.26`, `SOC_UNEMPLOYMENT_RATE = 0.1265`, `LI_HOURLY_RATE = 3.56`, `INSURANCE_RATE_PER_THOUSAND = 24.38`, `DEFAULT_CREW_SIZE = 4`, `DEFAULT_ESTIMATED_WEEKS = 2` — but at `orchestrator-v2.ts:146-151` (the audit's `123-129` has drifted), and they now serve only as dormant function-parameter defaults (`:778-779`) plus the fallback copy in `configService.ts:69-80` (`DEFAULT_CONSTANTS`) used when the DB is unreachable. The audit's consequence ("changing constants requires a production deploy") **no longer holds** for the V2 path.

### 1.6 "Missing table: `presentation_group_config`, 60+ line `getPresentationGroup()` mapping" (audit §2.3) — **MIXED** ⚠️

- Table-missing claim: **STALE**. `configService.ts:161-164` queries `presentation_group_config`.
- Hardcoded-mapping claim: **CONFIRMED, and it is still the live source.** `getPresentationGroup()` at `orchestrator-v2.ts:3225-3285` (61 lines) is called on the live path at `orchestrator-v2.ts:1395` and `:1634`. A *second* hardcoded sibling map, `normalizePresentationGroup()`, sits at `orchestrator-v2.ts:3291-3353`.
- **Key nuance the audit missed:** the DB-driven replacement is dead code. `getPresentationGroupTitle` (`configService.ts:181`) and `getPresentationGroupMap` (`configService.ts:206`) have **zero callers** anywhere in `src/`. So the `presentation_group_config` table exists and is cached-loaded by code that nothing invokes — the migration was built but never wired in. In practice the audit's complaint stands.
- "Misconfigured groups silently drop line items": current code does not *drop* — unknown categories default to `'accessories'` (`orchestrator-v2.ts:3284`, `:3352`). The historical bug is plausible but not reproducible from current code.
- "duplicated in frontend": OUT OF SCOPE.

### 1.7 "Hardcoded duplicates in `src/constants/siding.ts`: LABOR_RATES, OVERHEAD_RATES, TRIM_SKUS, AUTO_SCOPE_SKUS" (audit §2.4) — **CONFIRMED, with sharper nuances** ✅

All four exist (`constants/siding.ts:63-78, 84-95, 101-106, 112-118`). The audit understates two things:

1. **`LABOR_RATES` and `OVERHEAD_RATES` are dead exports** — zero imports anywhere in `src/` or `tests/`. And `OVERHEAD_RATES` has *drifted from the live values*: `soc_unemployment_rate: 0.13` vs live `0.1265`, `insurance_per_1000: 20.32` vs live `24.38`. A future reader who "fixes" code by consulting this file inherits wrong rates.
2. **`TRIM_SKUS` / `AUTO_SCOPE_SKUS` are live only on the legacy v1 path** (`trim.ts:8,54`; `autoscope.ts:14,39-200`), reachable via `POST /api/v1/siding/calculate` and `/calculate-priced` (`routes/siding.ts:16,55`) and the PATH 2 SKU-based branch of the webhook (`routes/webhook.ts:215-218`).

### 1.8 "`src/services/labor.ts` has FALLBACK_LABOR_RATES … any of these can silently win over the DB value" (audit §2.4) — **CONFIRMED, and stronger than claimed** ✅

`FALLBACK_LABOR_RATES` at `labor.ts:39-48`. On the legacy SKU-based path the hardcoded rates don't just "silently win" — they are the **only** source: `calculations/siding/pricing.ts:73-152` uses `FALLBACK_LABOR_RATES.*` unconditionally and never queries the `labor_rates` table (only `orchestrator-v2.ts:1021` does). PATH 2 labor pricing is 100% hardcoded.

### 1.9 Reshape pipeline & aliasing (audit §3) — **CONFIRMED; understated for this repo** ✅

- `WebhookMeasurements` → `buildMeasurementContext()` → `MeasurementContext` chain exists exactly as described (`autoscope-v2.ts:397-586`; `types/autoscope.ts:10`).
- **Aliases confirmed:** `MeasurementContext` carries both `facade_sqft` (`types/autoscope.ts:12`) and `facade_area_sqft` ("alias for facade_sqft", `types/autoscope.ts:80`), plus `gross_wall_area_sqft` (`:13`). Aliases are re-emitted for formula compatibility at `autoscope-v2.ts:562-569`.
- **`detection_counts` flattening trap confirmed:** `orchestrator-v2.ts:1450-1458` merges *only* `belly_band` (count/lf) into the measurement context; all other detection classes bypass it and are handled separately in the dynamic loop at `orchestrator-v2.ts:2254-2315`.
- **Understated:** within this repo alone there are **7** reshape layers (see Part 2.4) — the audit counted 5 for the entire system.

### 1.10 "Missing fields become zeros instead of errors" (audit §3, fix #4) — **CONFIRMED in substance** ✅

Boundary validation exists but only at the coarsest level: `project_id` presence (`routes/webhook.ts:34-42`) and `measurements` presence for the SKU path (`routes/webhook.ts:201-210`). Below that, everything defaults silently:

- `buildMeasurementContext`'s `get()` helper (`autoscope-v2.ts:406-411`) defaults ~90 fields to `0` — no distinction between "missing" and "legitimately zero".
- `transformers/webhook.ts:31-49`: `|| 0` chains on gross area, openings, perimeters, corners.
- No zod/joi/JSON-Schema validation exists anywhere in the repo; boundary objects are cast with `as any` (`routes/webhook.ts:64,70-71`; `autoscope-v2.ts:402-403`).

### 1.11 "Move spatial containment out of n8n into the API" (audit §3, fix #3) — **PARTIALLY STALE** ⚠️

The API-side implementation **already exists**: `src/services/spatialContainment.ts` (~1100 lines) served by `POST /webhook/spatial-containment` (`routes/spatial.ts:15`), mounted at `index.ts:39` with the comment *"Spatial containment routes (Phase 3 — replaces n8n Transform CAD node)"*. Whether n8n still runs its own polygon math in parallel is OUT OF SCOPE, but the recommendation should be re-framed as "finish cutting over", not "build it".

### 1.12 "`isTrue()`/`isFalse()` workaround helpers" (audit §2.6) — **CONFIRMED** ✅

Two identical copies: `orchestrator-v2.ts:30-39` and `autoscope-v2.ts:134-144`. Used pervasively (e.g. `orchestrator-v2.ts:662-663, 2739, 2765`; `autoscope-v2.ts:1369-1490`) — direct evidence the boolean-as-string JSONB contamination the audit describes is real in the data this repo consumes.

### 1.13 "`extraction_job_totals` … standardize all writers on upsert" (audit §2.6) — **CONFIRMED (repo's writer noted)** ✅

This repo's single writer uses `.update()` keyed on `job_id` (`orchestrator-v2.ts:2876-2880`), error logged but non-fatal (`:2881-2887`) — consistent with the audit's silent-failure concern (a failed audit write never surfaces to the caller).

### 1.14 Deprecated v1 objects (audit §2.1) — **OUT OF SCOPE (DB), but repo is clean** ✅

Zero references in `src/` or `tests/` to `auto_scope_rules` (bare), `material_assemblies`, `v_calculation_rules_active`, `v_accessories_section`, or `material_assemblies_flat`. Nothing in this repo blocks the overdue drops.

### 1.15 "Three pricing sources" (audit §3) — **CONFIRMED; in-repo count is itself three** ✅

Within this repo alone: (1) DB `pricing_items` / `v_pricing_current` (`services/pricing.ts:61,149,248,304`); (2) ~21 hardcoded unit prices in `orchestrator-v2.ts` — some DB-miss fallbacks via `??`, many **unconditional** (see Part 2.1); (3) hardcoded legacy labor rates (Part 1.8). The n8n hardcoded objects the audit names would be a fourth and fifth source system-wide — OUT OF SCOPE here, but note the API's `$35.00` bracket fallback (`orchestrator-v2.ts:2162`) matches the audit's "$35 bracket" n8n price, suggesting those objects were copied into this repo as fallbacks rather than eliminated.

### Claims not verifiable from this repo (all OUT OF SCOPE)

HOVER/Bluebeam/CAD flow table (§1, frontend + n8n); Detection Editor bypass (§1.3); Flow C orphaned `cad_markups` (§1.4 — note this repo never references `cad_markups`); synchronous Excel response & 120s proxy timeout (§1.5); n8n `detectionPricing`/`bellyBandPricing` objects (§2.3); table-family row counts (§2.5); JSONB contamination extent, GENERATED column (§2.6 — though §1.12 above corroborates the boolean issue); MN568 regression numbers (§4); all §5/§6 SQL.

---

## Part 2 — Independent Sweep (issues the audit missed)

Same categories, this repo only. All line numbers verified against current `main`.

### 2.1 Hardcoded business logic

**(a) ~21 hardcoded unit prices inside `orchestrator-v2.ts`.** Two flavors — DB-miss fallbacks (`?? price`) and *unconditional* constants with no DB lookup at all:

| Line | Value | Item | Kind |
|---|---|---|---|
| 1691 | $32.00 | belly band 5/4×8 board | fallback (`??`) |
| 1718 | $12.50 | Z-flashing head | fallback (`??`) |
| 1743 | $8.50 | drip edge | **unconditional** |
| 1765 | $7.50 | trim nails box | **unconditional** |
| 1787 | $8.50 | caulk tube | **unconditional** |
| 1832 / 1855 | $28.00 / $6.50 | soffit panel / J-channel | **unconditional** |
| 1889 / 1911 | $24.00 / $7.50 | fascia board / fascia nails | **unconditional** |
| 1946 / 1968 / 1991 | $12.00 / $1.50 / $3.50 | gutter / hanger / end cap | **unconditional** |
| 2018 / 2040 / 2062 | $8.00 / $2.00 / $4.00 | downspout / bracket / elbow | **unconditional** |
| 2162 / 2185 / 2208 / 2231 | $35 / $65 / $85 / $150 | bracket / shutter / post wrap / column wrap | **unconditional** |
| 2337 / 2356 / 2382 | $7.82 / $9.37 / $10.42 | whitewood 1×3 / 1×4 / 2×2 corners | **unconditional** |
| 2447 / 2469 / 2496 | $8.50 / $8.50 / $12.00 | penetration flashing / caulk / gable vent trim | **unconditional** |

These violate the database-first and immutable-snapshot principles the audit cites: prices invisible to `pricing_snapshots`, changeable only by deploy. They are the in-repo mirror of the n8n `detectionPricing` problem the audit flagged (§2.3) — the audit looked for it in n8n and missed it here.

**(b) Waste/coverage factor maps duplicated in-file and divergent from `constants/siding.ts`.** `categoryWasteDefaults` appears twice (`orchestrator-v2.ts:1308-1313` and `:3162-3167`), `categoryCoverageDefaults` twice (`:1323-1328` and `:3198-3202`). Values **disagree with** `CONVERSION_SPECS` (`constants/siding.ts:10-45`): siding 1.10 vs 1.12, shingle 1.15 vs 1.18, panel 1.10 vs 1.18. Same input quantity yields different material counts depending on which path (V2 webhook vs legacy SKU) prices it — up to 7% on panels.

**(c) Whitewood corner math fully hardcoded:** 12 ft pieces, 1.05 waste, prices, SKUs (`WW-1X3-12` etc.) at `orchestrator-v2.ts:2330-2390`.

**(d) Belly-band conversion constants block:** `BOARD_LENGTH_FT=12`, `WASTE_FACTOR=1.10`, `FLASHING_LENGTH_FT=10`, `CAULK_COVERAGE_LF=50`, `NAILS_COVERAGE_LF=150` (`orchestrator-v2.ts:1681-1685`) — should live in `pricing_items.coverage_value`.

**(e) Labor burden formula re-hardcoded:** `services/pricing.ts:356-360` `calculateTotalLabor()` inlines `0.1265 + 0.013` instead of calling `services/labor.ts:16` `calculateLaborCost()` — a third copy of the Mike Skjei burden math.

**(f) Mislabeled constant:** `SOC_UNEMPLOYMENT_RATE = 0.1265` (`orchestrator-v2.ts:147`) is actually the **L&I rate** (`labor.ts:6` names the same value `LI_INSURANCE_RATE`); real unemployment is `0.013` (`labor.ts:7`). Anyone "fixing" unemployment in `calculation_constants` by that name changes L&I.

**(g) Default 10 ft wall height** baked into measurement context (`autoscope-v2.ts:453`), silently driving corner LF and facade-perimeter derivations (`:461-463`).

**(h) Class→display-group defaults** hardcoded in `detectionCountPricing.ts:101-116` and again in a string-matching fallback at `:149`.

### 2.2 Duplicate sources of truth

1. **Labor rates ×3 in code** (+2 in DB): `constants/siding.ts:101-106`, `labor.ts:39-48`, `configService.ts:76-79` — all `180/200/220/200` today; three places to drift. DB `labor_rates` (`orchestrator-v2.ts:1021`) and `labor_auto_scope_rules` (`:1040`) make five potential sources of a labor number.
2. **Overhead constants already drifted:** `constants/siding.ts:113,115` (`0.13`, `$20.32/k`) vs live `0.1265`, `$24.38/k` (`orchestrator-v2.ts:147,149`; `configService.ts:71,73`). Dead but booby-trapped (see 2.3-e).
3. **Markup defaults ×3 with a behavioral split:** `0.26` (`orchestrator-v2.ts:146`, `configService.ts:70`) vs `0.10` (`routes/webhook.ts:44,262`; `orchestrator-v2.ts:837`; `orchestrator.ts:230,367`). On PATH 1 the webhook-supplied `markup_rate` is **accepted, logged (`orchestrator-v2.ts:973`), and ignored** — the DB value wins (`:863`, `:2791`). On legacy PATH 2 the same field is **actually used** (`orchestrator.ts:256,459`). The same request field changes meaning by path.
4. **Presentation-group mapping ×3 in code, ×1 dead in DB:** `getPresentationGroup` (`orchestrator-v2.ts:3225`), `normalizePresentationGroup` (`:3291`), `PRESENTATION_GROUP_DEFAULTS` (`detectionCountPricing.ts:101-116`), plus the unwired `presentation_group_config` loader (`configService.ts:148-178`).
5. **Facade-area alias priority diverges between files:** `autoscope-v2.ts:423` resolves `facade_area_sqft > facade_total_sqft > facade_sqft > gross_wall_area_sqft`, but `orchestrator-v2.ts:1351` (labor openings) resolves `facade_area_sqft > facade_sqft > facade_total_sqft`. When both `facade_sqft` and `facade_total_sqft` are present with different values, **auto-scope and labor compute from different facade areas in the same request.** `transformers/webhook.ts:31` has a third, shorter chain.
6. **`isTrue`/`isFalse` ×2** (identical today): `orchestrator-v2.ts:30-39`, `autoscope-v2.ts:134-144`.
7. **Three Supabase access patterns:** singleton client (`database.ts`), `serviceRoleFetch()` direct-fetch helper (`detectionCountPricing.ts:26-56`), and an inline one-off `fetch()` for corbel pricing (`orchestrator-v2.ts:2098-2107`). The direct-fetch patterns exist specifically because the singleton went stale on env-var changes (commit `ff0b6d9`) — the workaround was duplicated instead of fixing the singleton.
8. **Four hand-rolled 5-minute caches:** `services/pricing.ts:44-76`, `configService.ts:45-63`, `detectionCountPricing.ts:87-94`, and the auto-scope rules cache in `autoscope-v2.ts` (~`:320-355`).
9. **`/webhook/calculate-siding` is a ~180-line copy-paste of `/siding-estimator`** (`routes/webhook.ts:27-239` vs `:246-426`), and has *already drifted*: the `[V8.2] PASSING TO ORCHESTRATOR` debug block (`:117-122`) and per-material logging (`:59-61`) exist only in the original. Any future fix applied to one endpoint silently misses the other.

### 2.3 Dead code

1. **The entire DB-driven presentation-group path:** `getPresentationGroupTitle` (`configService.ts:181`) and `getPresentationGroupMap` (`configService.ts:206`) — zero callers. Consequence: the `presentation_group_config` table is effectively unread by production code despite CLAUDE.md listing it as a key table.
2. **`calculateFromMaterialAssignments`** (`orchestrator.ts:363`) — exported, never called (superseded by `calculateWithAutoScopeV2`).
3. **`clearAutoScopeRulesCache`** (`autoscope-v2.ts:355`) — exported, never called.
4. **Unused import:** `lastFetchResult` imported at `orchestrator-v2.ts:21`, never referenced in that file.
5. **`LABOR_RATES` and `OVERHEAD_RATES`** (`constants/siding.ts:101-118`) — zero importers; `OVERHEAD_RATES` additionally carries stale values (Part 2.2-2).
6. **`GET /webhook/debug-pricing`** (`routes/webhook.ts:453-472`) — self-documented "Remove after debugging is complete"; additionally **exposes the live Supabase URL plus 15-20-char prefixes of the anon and service-role keys to any unauthenticated caller** (`:462-467`, plus `detectionCountPricing.ts:50` baking a key prefix into `lastFetchResult`). This is the one sweep finding that warrants action independent of any cleanup phase.
7. **Dormant constant layer:** `MARKUP_RATE` etc. (`orchestrator-v2.ts:146-151`) now reachable only as `calculateProjectTotals` parameter defaults (`:778-779`) that the live call site always overrides (`:2791`); the V2 `markupRate` parameter (`:837`) is dead-except-logging (`:973`).
8. **Probably dead — verify usage before deleting:** the legacy PATH 2 chain — `routes/siding.ts` (all 4 endpoints), `orchestrator.ts`, `materials.ts`, `trim.ts`, `autoscope.ts`, `calculations/siding/pricing.ts`, plus the SKU-based branches of both webhook handlers (`routes/webhook.ts:196-227, 392-413`) and `/webhook/test` (`:478-526`). It is mounted and reachable but represents a second, divergent calculation engine (different waste factors, hardcoded labor, 0.10 markup semantics). Confirming it dead in production logs and deleting it would remove roughly a third of the duplicate-source findings above in one stroke. This is the in-repo analogue of the audit's "two rule engines" finding — **two calculation engines live in one API**, which the audit did not call out.

### 2.4 Measurement-shape transforms

Within this repo there are **7 reshape layers** (the audit's system-wide count of 5 understates it):

| # | Where | In → Out |
|---|---|---|
| 1 | `routes/webhook.ts:64-114` (dup `:277-320`) | `WebhookRequest` → `enrichedMeasurements` (trim/openings hoisting, `as any`) |
| 2 | `transformers/webhook.ts:23-138` | `WebhookRequest` → `CalculationRequest` (legacy path) |
| 3 | `autoscope-v2.ts:397-586` | DB row + webhook blob → `MeasurementContext` (~90 fields, 9 alias chains) |
| 4 | `orchestrator-v2.ts:1450-1458` | `detection_counts.belly_band` → measurement fields (others bypass) |
| 5 | `orchestrator-v2.ts:2254-2315` | remaining `detection_counts` → line items (unknown keys → $0 "VERIFY PRICING") |
| 6 | `autoscope-v2.ts:681-910` | `material_assignments` + `per_material_measurements` → manufacturer groups |
| 7 | `spatialContainment.ts:867-1106` | `cad_hover_measurements` row → per-trade configs |

New findings beyond the audit:

- **DB silently beats webhook field-by-field.** The `get()` helper (`autoscope-v2.ts:406-411`) checks `db[key]` before `wh[key]` for *every* key, so true priority is `db.facade_area_sqft > wh.facade_area_sqft > db.facade_total_sqft > …` — subtly contradicting the code's own comment (`:421-422`, "facade_area_sqft (webhook) > facade_total_sqft (DB)"). A stale `cad_hover_measurements` row can silently override fresh Detection Editor numbers.
- **Cross-file priority divergence** (Part 2.2-5) — the single riskiest shape issue found: auto-scope and labor can price from different facade areas in one request.
- **Unit-string fragility in manufacturer grouping:** unknown/missing units fall back to treating quantity as area (`autoscope-v2.ts:~800-810`), with case-sensitive unit matching throughout layer 6 — a misspelled unit silently re-classifies a quantity.
- **Test coverage is concentrated on the dying layer.** Layer 2 (legacy transformer) and the v1 calculators have unit tests (`tests/unit/webhook.transformer.test.ts`, `siding.autoscope.test.ts`, etc.); layers 1, 3, 4, 5, 6, 7 — the entire live V2 reshape pipeline — have **no dedicated tests**. `buildMeasurementContext`, the single most consequential function in the repo, is untested.
- **No runtime validation anywhere** (no zod/joi; TypeScript only, bypassed by `as any` at every boundary: `routes/webhook.ts:64,70-71`; `autoscope-v2.ts:402-403`).

---

## Part 3 — Summary

**Of the 15 repo-touching audit claims: 10 CONFIRMED, 2 STALE, 2 MIXED, 1 PARTIALLY STALE.**

The audit's load-bearing findings hold: the dual rule engine (this repo reads `siding_auto_scope_rules`, never `auto_scope_rules_v2`), the `extraction_id = job_id` convention (this repo participates in it at `orchestrator-v2.ts:2880`), the alias-ridden reshape pipeline, and zeros-instead-of-errors at the boundary.

The audit is stale on exactly one theme: **the "missing tables" (§2.3) were created and partially wired since it was written.** `calculation_constants` is genuinely live; `presentation_group_config` exists but its consumer is dead code, so the hardcoded mapping still governs. The audit also recommends building the spatial-containment API endpoint that already exists.

The sweep's most significant additions, in rough priority order:

1. `/webhook/debug-pricing` leaks Supabase URL + key prefixes unauthenticated (`routes/webhook.ts:453-472`) — remove regardless of any migration phasing.
2. Facade-area alias priority diverges between auto-scope and labor (`autoscope-v2.ts:423` vs `orchestrator-v2.ts:1351`) — a live correctness risk of exactly the class the audit predicted, plus `get()`'s undocumented DB-over-webhook precedence (`autoscope-v2.ts:406-411`).
3. ~21 hardcoded unit prices in `orchestrator-v2.ts`, most unconditional — the API-side twin of the n8n `detectionPricing` violation the audit flagged.
4. Two calculation engines live in one API (legacy PATH 2 chain with divergent waste factors, hardcoded labor, different markup semantics) — the in-repo mirror of the audit's dual-rule-engine finding; confirm dead in production, then delete.
5. Waste factors silently diverged between the engines (1.10/1.15 vs 1.12/1.18), and `OVERHEAD_RATES` is a dead-but-booby-trapped stale copy.
6. The live V2 reshape pipeline (7 layers in-repo) has no test coverage; tests exercise only the legacy layer.
