# Confirmed Work Plan — EstimatePros.ai Stabilization

**Date:** June 10, 2026
**Inputs:** `CODEBASE_AUDIT_JUNE_2026.md`, `UIUX_AUDIT_JUNE_2026.md`, `AUDIT_VERIFICATION_ai-estimator.md`, `AUDIT_VERIFICATION_estimation-api.md`, `AUDIT_VERIFICATION_extraction-api.md`, plus targeted live-code checks performed for this document (cited inline as **[new]**).
**Rule applied throughout:** where the audit and a verification report disagree, **live-code evidence wins**. Where no repo contains evidence (live n8n JSON, live Supabase rows), the claim is carried as UNVERIFIED with the ground-truth step that settles it.
**Repos:** `ai-estimator` (frontend + engine port — this repo), `exterior-estimation-api` (Railway TS calc API), `extraction-api` (Railway Python). n8n workflows and live DB state are outside all three.

---

## 1. Reconciled Findings

Final verdict per audit claim, synthesized across all three verification reports. Verdicts: **CONFIRMED** / **CONFIRMED+** (true and worse than claimed) / **PARTIAL** / **STALE** (was true, code moved) / **WRONG** / **UNVERIFIED** (no repo evidence; needs live DB/n8n ground-truth).

### Architecture & input flows (audit §1)

| # | Audit claim | Final verdict | Controlling evidence |
|---|---|---|---|
| 1 | Bluebeam path impersonates HOVER via `cad_hover_measurements` + `extraction_id = job_id` | **CONFIRMED** (triply corroborated; the write itself is n8n-side) | FE engine reads by the convention (`lib/estimating/refData.ts:447-480`); Railway API writes totals with `.eq('job_id', extractionId)` (`orchestrator-v2.ts:2876-2880`) and reads `cad_hover_measurements` by `extraction_id` (`autoscope-v2.ts:374-378`); Python reads the same table by job id (`bluebeam_import_service.py:1098-1109`) |
| 2 | HOVER entry `HoverUploadStep.tsx` → bucket `hover-pdfs` | **CONFIRMED** | `HoverUploadStep.tsx:135` |
| 3 | Bluebeam entry `BluebeamFreshImportModal.tsx`; processing `bluebeam_fresh_import_service.py` | **CONFIRMED** (CLAUDE.md is the stale doc — lists only the older `BluebeamImportModal.tsx`) | `components/dashboard/BluebeamFreshImportModal.tsx:249`; `bluebeam_fresh_import_service.py:996-1113` |
| 4 | CAD markup entry `CADMarkupStep.tsx` → `cad_markups`, dead-ends | **CONFIRMED, table name corrected** — actual table is **`cad_manual_markups`**; export-only (CSV/Excel/JSON), zero refs in either Railway repo | `lib/supabase/cadMarkups.ts:211,239,273`; `CADMarkupStep.tsx:553-596` |
| 5 | HOVER flow synchronous: 120s timeout, Excel buffer in HTTP response | **CONFIRMED** | `app/api/n8n/[...path]/route.ts:20,48-62`; `HoverUploadStep.tsx:209-228` |
| 6 | HOVER bypasses the Detection Editor entirely | **CONFIRMED** | `HoverUploadStep.tsx:233-318` — writes only `projects` + `project_configurations` |
| 7 | Bluebeam detections land in `extraction_detections_draft`, reviewed in Detection Editor | **CONFIRMED** both sides | `bluebeam_fresh_import_service.py:1078-1108`; `extractionQueries.ts:168,630-676` |
| 8 | No UI for the Roboflow `/start-job` flow | **WRONG** | `ExtractionUploadStep.tsx:182` calls `/start-job` |
| 9 | `cad_hover_measurements` has no provenance (`source_type`) | **CONFIRMED** as far as code shows — no reader in any repo references a `source_type` column; Python's spatial code *asserts* `source_type: 'cad'` in memory rather than reading it | `spatialContainment.ts:970-1073`; zero `source_type` reads in FE/API |
| 10 | The audit's `extraction_*` table family list (5 tables) | **STALE/INCOMPLETE** — `extraction_detections_validated` is referenced nowhere; ~9 used tables unlisted; **Roboflow and Bluebeam ingest write to two different detection tables** (`extraction_detection_details` vs `extraction_detections_draft`) | `extraction_service.py:17-92`; verification §1.6 |

### Database cleanup (audit §2)

| # | Audit claim | Final verdict | Controlling evidence |
|---|---|---|---|
| 11 | v1 objects (`auto_scope_rules`, `material_assemblies`, 3 views) still present, droppable, 6 months overdue | **UNVERIFIED** (live-DB question) — zero live code in any repo reads any v1 object, so nothing in code blocks the drops; the audit's source `SYSTEM_STATE.md` exists in no repo | settle with ground-truth SQL (§8 of `migrations/phase1_db_fixes.sql`) |
| 12 | `migrate_stone_veneer_rules_to_siding.sql` proves wrong-table inserts | **CONFIRMED, nuanced** — proves one batch; copy-only, never cleaned the source | `migrations/migrate_stone_veneer_rules_to_siding.sql:3-6,69-70` |
| 13 | Dual rule engine: Railway reads `siding_auto_scope_rules`, n8n reads `auto_scope_rules_v2` | **CONFIRMED (engine half)** — both TS engines read `siding_auto_scope_rules` exclusively; `auto_scope_rules_v2` appears in zero code files in all three repos; extraction-api reads neither (it is *not* a third engine). n8n half UNVERIFIED | `autoscope-v2.ts:334`; `refData.ts:381` |
| 14 | Four more per-trade rule tables | **PARTIAL** — `labor_auto_scope_rules` is real and live (created, read, inserted-into); `gutters_/roofing_/windows_auto_scope_rules` have zero evidence anywhere | `create_labor_auto_scope_rules.sql:7`; `refData.ts:335`; `orchestrator-v2.ts:1040` |
| 15 | `calculation_constants` missing; constants hardcoded at orchestrator-v2.ts:123-129 | **STALE** — the table is **LIVE in both engines** (`configService.ts:102-104` with 5-min TTL; `refData.ts:200-203`); hardcoded values survive only as fallbacks (now at `:146-151` / `:179-184`); "changing constants requires a deploy" no longer holds | both verification reports agree |
| 16 | `presentation_group_config` missing; 60+ line hardcoded mapping duplicated in frontend | **STALE table / CONFIRMED in effect** — table + migration exist, but the DB consumers are **dead code in both repos** (`configService.ts:181,206` zero callers; zero reads in ai-estimator). Hardcoded maps remain the live source — and there are **four** of them, not two, with confirmed divergences (`fascia` → `'soffit'` vs `'trims'`) | `create_presentation_group_config.sql:6`; `exportTakeoffExcel.ts:104-155`; `MaterialsTable.tsx:81-115`; `detectionCountPricing.ts:102-122` |
| 17 | Misconfigured groups "silently drop line items" | **PARTIAL** — current code defaults unknowns to `'accessories'` rather than dropping; the silent-filter failure pattern is real and institutionally documented | `orchestrator-v2.ts:3284,3352`; `.claude/skills/arch-review/SKILL.md:38` |
| 18 | n8n `detectionPricing` ($45 corbel, $35 bracket, $120 shutter) / `bellyBandPricing` objects | **UNVERIFIED in n8n; CONFIRMED-with-drift in both engines** — the same prices live as hardcoded constants in both TS engines (bracket $35 matches; **shutter is $65, not $120**; corbel is now DB-first with $0-VERIFY fallback, not $45) | `sidingOrchestratorV2.ts:2196,2219,2163-2191`; `orchestrator-v2.ts:2162,2185` |
| 19 | `src/constants/siding.ts` LABOR_RATES / OVERHEAD_RATES / TRIM_SKUS / AUTO_SCOPE_SKUS | **CONFIRMED+** — all four exist; LABOR_RATES/OVERHEAD_RATES are **dead exports with drifted values** (0.13 vs live 0.1265; $20.32 vs $24.38); TRIM_SKUS/AUTO_SCOPE_SKUS are live **only on the legacy v1 path**. Not present in the ai-estimator port | `constants/siding.ts:63-118` |
| 20 | `FALLBACK_LABOR_RATES` can silently win over DB | **CONFIRMED+** — on legacy PATH 2 they are the **only** source; that path never queries `labor_rates` | `pricing.ts:73-152` |
| 21 | `isTrue()`/`isFalse()` JSONB boolean workarounds | **CONFIRMED** (×2 in estimation-api, ×1 in the port); repo migrations are clean — contamination, if any, came from n8n/ad-hoc writes | `orchestrator-v2.ts:30-39`; `autoscope-v2.ts:134-144`; `sidingOrchestratorV2.ts:63-68` |
| 22 | `extraction_job_totals`: standardize writers on upsert | **CONFIRMED+** — **five writers, four write patterns, zero upserts** (Python: DELETE+POST, check-then-act, 2× PATCH-only; TS: `.update()`); the shared Python client cannot express an upsert at all | `takeoff_service.py:260-264`; `aggregation_service.py:695-718`; `database/client.py:32`; `orchestrator-v2.ts:2876-2880` |
| 23 | Silent INSERT failures; no `pipeline_errors` table | **CONFIRMED** — `supabase_request()` never raises; partial batch failures still count as successes in API responses | `database/client.py:47-55`; `bluebeam_fresh_import_service.py:1108-1113` |
| 24 | Immutable pricing snapshots principle | **Documented, not enforced** — no TS file in either repo reads `pricing_snapshots` / `v_pricing_current`; engines read `pricing_items` directly | ai-estimator verification §2j |

### Reshape pipeline (audit §3)

| # | Audit claim | Final verdict | Controlling evidence |
|---|---|---|---|
| 25 | 5 reshapes, 3 owners, zero shared schema | **CONFIRMED, understated** — estimation-api alone has 7 reshape layers; extraction-api adds a **second, independent producer of the approve payload** (`aggregate_detections_for_recalc()`, Python); the FE approve payload itself dual-emits the same values under two names | est-api verification Part 2.4; `bluebeam_import_service.py:867-1075`; `DetectionEditor.tsx` (3a) |
| 26 | `buildApprovePayload()` / `buildDetectionCounts()` | **PARTIAL** — `buildApprovePayload` exists (`DetectionEditor.tsx:3553`); `buildDetectionCounts` is inlined, not a function |
| 27 | Alias proliferation (`facade_sqft`/`facade_area_sqft`/`gross_wall_area_sqft`) | **CONFIRMED, undercounted** — 8–9 alias groups, plus a **cross-file alias-priority divergence**: auto-scope and labor can resolve *different facade areas in the same request*, and the `get()` helper gives DB rows silent precedence over fresh webhook values | `autoscope-v2.ts:423` vs `orchestrator-v2.ts:1351`; `autoscope-v2.ts:406-411` |
| 28 | `detection_counts` flattening trap (belly_band only) | **CONFIRMED** in both engines | `orchestrator-v2.ts:1450-1458`; `sidingOrchestratorV2.ts:1491-1499` |
| 29 | Missing fields become zeros instead of errors | **CONFIRMED everywhere** — ~90 fields default to 0; no zod/joi anywhere; `as any` at every boundary; the **new** verification routes in this repo also skip measurement-completeness validation | `autoscope-v2.ts:406-411`; `calculate-siding/route.ts`, `normalize-approval/route.ts` |
| 30 | Move spatial containment out of n8n | **PARTIALLY STALE** — the API endpoint already exists (`POST /webhook/spatial-containment`); the work is *finish the cutover*, not build it | `routes/spatial.ts:15`; `index.ts:39` |
| 31 | `net_siding_sqft` bug (`dce3c39`) | **CONFIRMED** (commit + surviving alias chain in estimation-api); bug *class* further corroborated by **4 net-siding formula copies in extraction-api, 2 drifted** (one omits gable add-back; one omits roof subtraction AND gables) | `transformers/webhook.ts:34-38`; `app.py:1433-1434`; `geometry/calculations.py:134-140` |

### Regression figures (audit §4)

| # | Audit claim | Final verdict | Controlling evidence |
|---|---|---|---|
| 32 | MN568 = `240e222e-0419-421c-97fa-18a691b40cdb`; "target $19,333, current $18,657" | **WRONG on the dollars; id mislabeled** — the committed regression contract is **`final_total: $34,115.55`** (material $17,058.59 / labor $8,979.72 / overhead $4,975.83, 43 line items). `240e222e-…` is the extraction **job_id**; project_id is `f7e2fc2b-33c1-48f2-bae6-ebff37fbe346`. Neither audit figure appears anywhere in any repo. The baseline is a snapshot of **current behavior**, not contractor-validated correctness | `test-data/baselines/MN568.expected.json:11-12,63` |

### UI/UX audit (companion doc — code-level corroboration only; no dedicated verification pass was run)

| Claim | Status |
|---|---|
| `/test-konva` dev page shipped in production routes | **Corroborated** — `app/test-konva/page.tsx` exists **[new]** |
| Five upload entry points (PDFUploadStep, HoverUploadStep, BluebeamFreshImportModal, BluebeamImportModal, CADMarkupStep) | **Corroborated** — all five components exist; the two Bluebeam modals confirmed distinct |
| CAD markup tool visibly accepts work and silently discards it | **Corroborated** (= finding #4 above) |
| 2-minute synchronous wait is the worst UX moment | **Corroborated** (= finding #5 above) |
| Four URL namespaces, no persistent shell, account-page trust-killers, styling dialects, toolbar overload, verb confusion | **Unverified at code level** — plausible, consistent with route structure; needs the visual pass the audit itself recommends |

---

## 2. New Findings (severity-ranked)

Issues no audit listed, found by the three verification sweeps plus targeted checks done for this document. **S0** = likely active correctness defects; **S1** = high structural risk; **S2** = medium; **S3** = hygiene.

### S0 — Prime suspects for the MN568 accuracy gap

**N-1 · Corner class-name schism zeroes corner counts/LF — now confirmed on the PRODUCTION approve path, not just the Python side.**
- extraction-api's fresh import normalizes corners to **`corner_outside` / `corner_inside`** (`bluebeam_fresh_import_service.py:62-66`); its own recalc aggregation matches only `outside_corner` / `inside_corner` (`bluebeam_import_service.py:982-988`) → corners vanish from the Python-built payload (extraction-api T-1).
- **[new — this repo]** The Detection Editor has the same schism internally. The dedicated corner aggregation branches that compute corner **counts and LF from line markups** match only `'outside_corner'`/`'inside_corner'` (+ space variants): `DetectionEditor.tsx:2807-2814` and `:3165-3172`. Only the **point-type** branch tolerates both namings (`:2709-2713` — counts only, no LF, by design). And `DEDICATED_PAYLOAD_CLASSES` (`:3656-3658`) treats `corner_inside`/`corner_outside` as "already in payload as dedicated fields" — fields the line branches never populated for those spellings.
- **Net effect:** a fresh-imported corner drawn as a line with class `corner_outside` produces **zero** `corners.outside_count` / `outside_lf` in the approve payload → zero `outside_corner_count/lf` in `MeasurementContext` → corner trim rules fire on nothing. This is a direct, evidence-backed mechanism for understated corner/trim materials on MN568-class jobs.

**N-2 · `real_width_ft`/`real_height_ft` are never persisted by anyone — cross-repo caveat RESOLVED.**
extraction-api's T-2 carried the caveat "unless the frontend Detection Editor populates these fields." **It does not** **[new]**:
- The editor *computes* them on edit (`DetectionEditor.tsx:1059-1073`) but in local-first mode that update goes to local state only (`updateDetectionLocally`, `:1095-1122`).
- Every direct DB write from the editor touches only narrow columns (`color_override`, material assignment, price override — `:1800,2082,2138` region).
- The bulk save path (`handleValidate` → `validateDetections`, `lib/hooks/useDetectionSync.ts:524-552`) builds a payload containing pixel coords, polygon points, class, materials, overrides — **no `real_width_ft`, `real_height_ft`, `area_sf`, or `perimeter_lf`** — and POSTs it to `/api/n8n/validate-detections`, so n8n cannot store what it never receives.
- Neither extraction-api import path writes them either (`ALLOWED_COLUMNS` excludes them).
- **Net effect:** those draft-table columns are permanently NULL. extraction-api T-2 stands at **full severity**: every LF figure derived from them in `aggregate_detections_for_recalc()` (`bluebeam_import_service.py:946-988`) — starter, head/jamb/sill, corner LF — is silently **0**. The production approve path is insulated only because the FE computes LF in-memory from polygon points + scaleRatio at approve time — meaning **the two producers of the same payload emit different numbers for the same job**. Any recalculation triggered through `/import-bluebeam?trigger_recalc=true` prices trim at zero.

**N-3 · Facade-area alias priority diverges between auto-scope and labor; DB silently beats fresh webhook data** (estimation-api). `autoscope-v2.ts:423` vs `orchestrator-v2.ts:1351` resolve different alias chains — one request can price materials and labor from **different facade areas**. The `get()` helper checks the (possibly stale) `cad_hover_measurements` row before the webhook value for every key (`autoscope-v2.ts:406-411`), contradicting its own comment. A stale approval silently overrides a fresh one.

### S1 — High structural risk

**N-4 · Two complete calculation engines live in one API.** Legacy PATH 2 (`routes/siding.ts`, `orchestrator.ts`, `trim.ts`, `autoscope.ts`, `pricing.ts`) is mounted and reachable, with **divergent waste factors** (1.10/1.15 vs 1.12/1.18 — up to 7% on panels), 100% hardcoded labor, and opposite `markup_rate` semantics (V2 accepts-logs-ignores the webhook field; legacy actually uses it). The in-repo mirror of the audit's dual-engine thesis.

**N-5 · Placeholder SKUs vs catalog SKUs — the hardcoded-pricing problem is worse than "prices in code" [new synthesis].** The engines emit invented SKUs (`BRACKET-DECORATIVE`, `SHUTTER-VINYL`, `POST-WRAP-PVC`, `COLUMN-WRAP-PVC`, `ROOF-DRIP-10`, `JH-CAULK-CM`, `TRIM-NAIL-SS-2`, `112Z2BPW`…) while `migrations/expand_pricing_items.sql` already seeded a real catalog under **different** SKUs (`BRACKET-MD-PRIMED`, `SHUTTER-VNL-15x48`, `POST-WRAP-4X4-8`, `DRIP-EDGE-10`, `CAULK-JH-COLORMATCH`, `TRIM-NAILS-SS-1LB`, `ZFLASH-10`) at **different prices** ($45 vs $35 brackets). Wiring the DB lookups (Phase 2) is therefore not mechanical: someone must decide, per item, which SKU and price wins. ~21 hardcoded unit prices in each engine copy.

**N-6 · Fresh-import pages never get `scale_ratio`** → geometry-derived areas are raw paper area unless Bluebeam `Contents` text rescues them (`bluebeam_fresh_import_service.py:1007-1019`, guards at `:672-680`). Wrong by the square of the scale factor when unrescued.

**N-7 · `/calculate-takeoff` destroys enrichment** — deletes `extraction_detection_details` rows and re-derives from raw predictions, wiping fusion results and manual corrections on every run (`takeoff_service.py:32-41`).

**N-8 · Net-siding formula exists in 4 places in extraction-api; 2 are wrong** (one omits gable add-back — `app.py:1433-1434`; one omits roof subtraction and gables — `geometry/calculations.py:134-140`, live via `extraction_service.py:183`).

**N-9 · Third copy of the financial constants in the frontend with no DB path** — `lib/utils/itemHelpers.ts:58,446,451` (L&I 0.1265, insurance 24.38, markup 0.26) used in live calculations; will silently diverge the moment `calculation_constants` is edited. Plus the L&I percentage baked into Excel display text (`exportTakeoffExcel.ts:847`). Related: `SOC_UNEMPLOYMENT_RATE` is **mislabeled** — the 0.1265 value is the L&I rate; real unemployment is 0.013 (`labor.ts:6-7`). Anyone "fixing unemployment" in `calculation_constants` by that name changes L&I.

**N-10 · Presentation-group mapping ×4 in code (+1 dead in DB), section order/colors ×2, with confirmed divergences** (`fascia`; `'Soffit & Fascia'` vs `'Soffit'`; export order includes `labor`, table omits it).

**N-11 · `extraction_job_totals` writer chaos + silent failure pattern, no error log table** (reconciled finding #22/#23 — listed here because the *fix* is new work: unique index + upsert standardization + `pipeline_errors`).

**N-12 · The live V2 reshape pipeline has no tests** — estimation-api's unit tests cover only the dying legacy layer; `buildMeasurementContext`, the most consequential function in the system, is untested in both engine copies.

### S2 — Medium

- **N-13 · Identical silent product defaults hardcoded in two repos** — `'HardiePlank 8.25" Cedarmill'` / `'Arctic White'` substituted for missing products in both the TS adapter (`detectionEditorAdapter.ts:220-224`) and Python (`bluebeam_import_service.py:1091-1096`). Missing data is masked, twice, in two languages.
- **N-14 · Production n8n URL hardcoded in two repos** — `app/api/n8n/[...path]/route.ts:9` (env fallback) and `bluebeam_import_service.py:1150` (no env var at all). Unconfigured environments silently talk to production.
- **N-15 · Default wall height disagrees across repos** — 10 ft in the TS engines (`autoscope-v2.ts:453`) vs 9 ft at four sites in extraction-api (`linear_service.py:22` etc.). Same quantity, different silent defaults, drives corner/perimeter LF derivations.
- **N-16 · Split-brain JSONB columns** `extracted_data` vs `extraction_data` on `extraction_pages` — cross-references silently empty for modern-path jobs (`cross_ref_service.py:35-64`).
- **N-17 · `VALID_PAGE_TYPES` defined twice and disagreeing; four color→class tables, three different colors for the same class; status strings scattered with a `completed`/`complete` drift** (extraction-api D-2/D-3/D-7).
- **N-18 · `selected_trades: ['siding']` hardcoded** into every Python-triggered recalc (`bluebeam_import_service.py:1055`).
- **N-19 · Duplicate shoelace-area implementations in the editor** (`DetectionEditor.tsx:1501-1509`, `:804-876` vs `polygonUtils.ts`).

### S3 — Hygiene (inventory for Phase 5)

Dead code: `lib/utils/excelExport.ts` (hotfix below); `bluebeam_export_service.py` (hotfix below); legacy PATH 2 chain (confirm-then-delete); `configService` presentation-group loaders; `calculateFromMaterialAssignments`; `clearAutoScopeRulesCache`; `LABOR_RATES`/`OVERHEAD_RATES` dead-but-booby-trapped exports; `app_old.py`, `app.py.backup`, `markup_service.py.backup`; dead deps `cohere`, `numpy`; dead `api/` package; ~15 dead exported functions; `/classify-job` legacy endpoint; the brace-expansion junk directory. Scratch payloads at this repo's root (`payload.json`, `real-approval-payload.json` — **contains real customer data**, move to `test-data/` or gitignore). UI: `/test-konva`, `/project/new` legacy duplicate. **False positives already rejected (do not re-flag):** `useDetectionSync`/`useExtractionData` and the classify page are live; `ExtractionUploadStep` is the `/start-job` UI.

---

## 3. Immediate Hotfixes (independent of all phases)

Ship these now; none changes calculation output.

| # | Action | Repo | Evidence | Risk |
|---|---|---|---|---|
| H-1 | **Remove `GET /webhook/debug-pricing`** — unauthenticated endpoint exposing the live Supabase URL + 15–20-char prefixes of the anon **and service-role** keys (`routes/webhook.ts:453-472`; also strip the key prefix baked into `lastFetchResult` at `detectionCountPricing.ts:50`) | exterior-estimation-api | est-api verification 2.3-6 | Credential exposure live today; removal is deletion of a self-labeled "remove after debugging" route. Push deploys to prod — run `/pre-deploy` + MN568 gate (should be zero-delta) |
| H-2 | **Delete `services/bluebeam_export_service.py`** — dead wholesale (zero imports; live export is `bluebeam_service.py:560`). Carries the worst export bugs found, which currently soak up misdirected debugging | extraction-api | ext-api verification X-2 | None (verified zero importers) |
| H-3 | **Delete `lib/utils/excelExport.ts`** — 454 lines, zero importers (verified by grep) | ai-estimator | ai-estimator verification #11 | None |

Also recommended alongside H-3 (same commit, zero risk): move `real-approval-payload.json` out of the repo root (customer data).

---

## 4. Revised Phase Plan

**Regression gate (all phases):** `scripts/validate-mn568-baseline.ts` against **`test-data/baselines/MN568.expected.json`** — `final_total` **$34,115.55**, 43 line items, per-group and detection-count assertions. The MN568 identifier `240e222e-0419-421c-97fa-18a691b40cdb` is the extraction **job_id** (project `f7e2fc2b-33c1-48f2-bae6-ebff37fbe346`). The audit's $19,333/$18,657 figures are wrong — do not gate on them.
Two gate modes: **(a) to-the-penny** for refactors that must not change output (Phases 1, 2, 3, 5); **(b) explained-delta** for phases whose *purpose* is to change output (Phase 1.5 — corner fixes will move the total; capture the delta, review it line-by-line, then re-baseline deliberately). The baseline snapshots current behavior, not business-correct numbers — never call a re-baselined total "contractor-final." Add 1–2 secondary baseline projects before Phase 2 (single baseline can mask compensating errors — audit's suggestion, still right).

### Phase 0 — Decision (unchanged from audit)
Bluebeam/Detection-Editor path is canonical; HOVER becomes an importer. **Repo:** none. **Deploys:** none. **Risk:** none. Everything below assumes this call.

### Phase 1 — DB-only fixes (REVISED — see §5; deliverable `migrations/phase1_db_fixes.sql`)
**What changed vs the audit:** do **not** create `calculation_constants` (LIVE in both engines — creating/altering it is the one "DB-only" action that could change production math); do **not** create `presentation_group_config` (exists; the gap is unread consumers = Phase 2 code); the pricing seed must use the engines' **placeholder SKUs at exactly the current hardcoded prices** (N-5) so output cannot move.
**Scope:** ensure-rows for the six calculation constants (so the silent code fallback never engages); seed `pricing_items` for every engine-emitted placeholder SKU; unique index on `extraction_job_totals(job_id)` (prereq for upsert standardization); create `pipeline_errors`; additive `source_type` column on `cad_hover_measurements` (prep for Phase 4, inert until read); schema comments on the `siding_squares` GENERATED column and the `extraction_id = job_id` convention; JSONB-boolean diagnostics; corrected ground-truth audit SQL (settles findings #11, #14, #18 and the n8n-side dual-engine half).
**Repo:** live Supabase only. **Deploys:** none. **Risk:** low — active sections are inert-by-construction; the three behavior-affecting mapping seeds (corbel / belly-band board / Z-flash, which the engines *do* consult) are **commented out** with expected-delta notes. **Gate:** to-the-penny.

### Phase 1.5 — Measurement integrity: MN568 gap closure (NEW)
The S0 findings, fixed at the source. This is the phase most likely to recover real estimate accuracy.
1. **Corner class normalization (N-1):** pick one canonical pair (`outside_corner`/`inside_corner`), normalize at every ingest point (`bluebeam_fresh_import_service.py:62-66` map; old-import `CLASS_MAPPING`), make the FE line branches tolerant of both spellings during transition (`DetectionEditor.tsx:2807-2814`, `:3165-3172`), and align the Python aggregation (`bluebeam_import_service.py:861-864,982-988`). Include a one-time draft-row UPDATE migration for existing jobs.
2. **`real_*` columns policy (N-2):** decide once — either persist `real_width_ft`/`real_height_ft`/`area_sf`/`perimeter_lf` in the validate payload (FE + n8n validate workflow change) **or** stop deriving LF from those columns in Python (compute from polygon + scale like the FE does, or delete the duplicate producer per Phase 3). Until then, gate `/import-bluebeam?trigger_recalc=true` behind a warning.
3. **`scale_ratio` at fresh import (N-6):** populate it (or persist the Contents-derived scale) when pages are created.
4. **Net-siding formula consolidation in extraction-api (N-8):** one function, four call sites.
**Repos:** extraction-api, ai-estimator. **Deploys:** extraction-api (Railway), frontend. **Risk:** medium — output is *supposed* to move on corner-bearing jobs. **Gate:** explained-delta, then deliberate re-baseline (MN568 + secondaries).

### Phase 2 — One rule engine, one config source
- Wire the existing-but-dead DB config consumers: `presentation_group_config` (revive/wire `configService.ts:181,206`; land the `refData.ts` fetcher the migration header already names "Phase 1.3c"), collapse the four hardcoded presentation-group maps onto it (N-10), resolve the `fascia` divergence explicitly.
- Wire detection-count pricing through `detection_class_material_mapping` (un-comment Phase-1-SQL Section B; resolve placeholder-vs-catalog SKUs per item — N-5); remove the unconditional hardcoded price blocks.
- Consolidate rules: run the §8 ground-truth SQL first (which v1/v2/per-trade tables actually exist and have rows); then `auto_scope_rules_unified` (Mar 3 schema), point both TS engines' readers at it, strip rule evaluation from n8n. Fix the alias-priority divergence and `get()` DB-precedence while inside `buildMeasurementContext` (N-3).
**Repos:** exterior-estimation-api, ai-estimator (engine port must stay 1:1 — apply changes to both), n8n. **Deploys:** Railway API + n8n. **Risk:** HIGH — this is the calc engine; `/calc-engine` + `/arch-review` workflows mandatory. **Gate:** to-the-penny (config wiring must reproduce the hardcoded maps exactly before any values change).

### Phase 3 — Canonical measurement contract + boundary validation
- Promote `WebhookRequest`/`WebhookMeasurements` (`packages/estimating-engine/src/types/webhook.ts`) to the shared contract; export types from the package index; make the FE `ApprovePayload` derive from it; kill the dual emission inside the approve payload.
- One producer: delete or contract-align the Python `aggregate_detections_for_recalc()` duplicate (T-7) — after Phase 1.5 item 2 this should reduce to deletion.
- Boundary validation (zod or JSON Schema) at the Railway webhook AND the new local routes: named-field 400s for missing measurements instead of zeros (#29). Surface (don't default) missing products (N-13).
- Remove the `extraction_id = job_id` branch/convention once both sources emit the same payload; n8n becomes pass-through.
- Migrate rule formulas to canonical measurement names; drop the 8–9 aliases with an UPDATE against the (now unified) rules table.
**Repos:** all three + n8n. **Deploys:** API + n8n + frontend. **Risk:** HIGH. **Gate:** to-the-penny.

### Phase 4 — One pipeline, many importers (+ the UI half)
- HOVER importer → `extraction_detections_draft`/`extraction_job_totals` → Detection Editor confirm step; kill the synchronous Excel response (async + Storage + Realtime status); the 120s proxy timeout disappears as a failure mode.
- Rename `cad_hover_measurements` → `project_measurements`; populate `source_type` (column already exists from Phase 1); fix the two-detection-table split (T-3) — fold `extraction_detection_details` or teach all readers both.
- UI (UIUX audit #2/#3/#6, same sprint so screens aren't redesigned twice): single "Add Measurements" entry; route consolidation to `/projects/[id]/…` with persistent shell + stage stepper; staged progress UI replaces the 2-minute spinner.
**Repos:** all + n8n. **Deploys:** all. **Risk:** HIGH, user-facing. **Gate:** to-the-penny on calculation output (the pipeline reroute must not change math), plus manual E2E on each importer.

### Phase 5 — Deletions (only after Phases 2–4 prove nothing reads them)
- DB: drop v1 tables/views **that the §8 ground-truth SQL confirms exist and are unread**; drop dead `cad_*` tables per usage audit; Flow C (`cad_manual_markups` + components + bucket) — wire it in or delete it.
- estimation-api: delete legacy PATH 2 chain (confirm dead in production logs first — removes the second engine, the FALLBACK_LABOR_RATES-only path, and the drifted waste factors in one stroke); dead exports in `constants/siding.ts`; dead functions/imports list.
- extraction-api: S3 inventory (backups, dead deps, dead package, dead functions, legacy endpoints, junk directory).
- ai-estimator: `/test-konva`, `/project/new`, scratch payloads, duplicate shoelace implementations (N-19), UIUX component hygiene (#7).
**Risk:** low-medium with grep-before-drop + production-log confirmation for PATH 2. **Gate:** to-the-penny.

---

## 5. Phase 1 Deliverable

**File:** `migrations/phase1_db_fixes.sql` (committed alongside this document). Run top-to-bottom in the Supabase SQL Editor.

| Section | What it does | Output-affecting? |
|---|---|---|
| 0 | Preflight diagnostics: active snapshot, constants present, duplicate `job_id`s, `siding_squares` generation status, rules referencing seed SKUs | read-only |
| 1 | `calculation_constants` ensure-rows (six constants, values = current code defaults; guarded `WHERE NOT EXISTS`) | No — values equal the fallbacks the code already uses |
| 2 | `pricing_items` seeds for 22 engine-emitted placeholder SKUs at **exactly the hardcoded prices** (attached to active snapshot; never UPDATEs existing rows — snapshots stay immutable) | No — nothing reads these rows until Phase 2 wiring (Section 0.5 diagnostic proves no active rule references them) |
| 3 | Unique index on `extraction_job_totals(job_id)` — created only if no duplicates exist; dup report + commented dedup otherwise. **Never touches `siding_squares` (GENERATED)** | No |
| 4 | `pipeline_errors` log table (RLS enabled, no policies → service-role only) | No |
| 5 | Additive `cad_hover_measurements.source_type` column + CHECK; commented backfill | No — no reader references the column yet (verified, all repos) |
| 6 | Schema documentation: COMMENTs on `siding_squares` (GENERATED — never write it) and `extraction_id` (the `= job_id` convention) | No |
| 7 | JSONB boolean-as-string diagnostics on both rule tables; normalization UPDATE provided but commented | read-only as shipped |
| 8 | Ground-truth audit SQL (corrected from audit §6: `cad_manual_markups` not `cad_markups`; `extraction_detection_details` added; both rule tables checked) — settles the UNVERIFIED findings | read-only |
| B (commented) | `detection_class_material_mapping` seeds for the three classes the engines **do** consult (corbel, belly-band board, Z-flash) + the not-yet-consulted classes — each annotated with its expected MN568 delta | **Yes if a mapping is currently missing** — that's why it ships commented; enable during Phase 2 with the explained-delta gate |

**Run procedure:** MN568 baseline run → execute Sections 0–8 → MN568 baseline run → diff must be **zero**. If Section 0 diagnostics show duplicates in `extraction_job_totals` or active rules referencing seed SKUs, stop and resolve per the inline instructions before proceeding.
