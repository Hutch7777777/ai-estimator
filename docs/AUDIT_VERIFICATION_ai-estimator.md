# Audit Verification — ai-estimator repo

**Date:** June 10, 2026
**Subject:** `docs/CODEBASE_AUDIT_JUNE_2026.md` — every claim treated as a hypothesis and verified against the actual current code in **this repo only** (ai-estimator). Claims about the Railway `exterior-estimation-api` repo, live n8n workflow JSON, or live Supabase state are marked NOT-VERIFIABLE-IN-THIS-REPO where the repo contains no evidence either way.
**Important context the audit predates:** this repo now contains a 1:1 port of the Railway calculation engine (`packages/estimating-engine/`, `lib/estimating/`, `app/api/estimating/` parallel verification routes). Several audit claims written about the Railway repo are now directly checkable — and a few are already stale because the port added DB-driven paths the audit says don't exist.

**Verdict legend:** CONFIRMED · PARTIALLY CONFIRMED · STALE (was true, code has moved) · WRONG · NOT-VERIFIABLE-IN-THIS-REPO

---

## Scorecard

| Audit section | Claims checked | Confirmed | Partial/Stale | Wrong | Not verifiable here |
|---|---|---|---|---|---|
| §1 Input flows | 11 | 7 | 3 | 1 | — |
| §2 Database cleanup | 12 | 4 | 4 | 1 | 3 |
| §3 Reshape pipeline | 8 | 5 | 3 | 0 | — |
| §4 MN568 regression figures | 2 | 0 | 1 | 1 | — |

The audit's **architectural narrative holds up well** in this repo: synchronous HOVER flow, Detection-Editor bypass, the `extraction_id = job_id` convention, the v1 rule table as the engine's only rule source, the alias-heavy MeasurementContext, and the multi-copy presentation-group mapping are all real and evidenced below. Its **specifics drift**: line numbers, two prices, the regression dollar figures, one table name, one component claim, and — most materially — it misses that `calculation_constants` and the detection-pricing mapping are already partially DB-driven in the ported engine.

---

## 1. Input Flows (§1)

### 1a. HOVER entry = `HoverUploadStep.tsx`, bucket `hover-pdfs` — CONFIRMED
- `components/project-form/HoverUploadStep.tsx:135` — `.from('hover-pdfs')`.

### 1b. Bluebeam entry = `BluebeamFreshImportModal.tsx` — CONFIRMED
- `components/dashboard/BluebeamFreshImportModal.tsx` exists, calls the extraction API `/import-bluebeam-fresh`, and routes to the Detection Editor on success (`:249` — `router.push(\`/projects/${projectId}/extraction/${result.job_id}\`)`).
- Note: an older, distinct `components/detection-editor/BluebeamImportModal.tsx` also exists (embedded in the editor). CLAUDE.md lists only the old one — **CLAUDE.md is the stale document here, not the audit.**

### 1c. CAD markup entry = `CADMarkupStep.tsx`, bucket `project-pdfs` — CONFIRMED, with a table-name correction
- `components/cad-markup/CADMarkupStep.tsx` exists; bucket `project-pdfs` is defined in `lib/supabase/pdfStorage.ts:3` (`const BUCKET_NAME = "project-pdfs"`), reached via `uploadProjectPdf()`.
- **Correction:** the markup table is **`cad_manual_markups`**, not `cad_markups` (`lib/supabase/cadMarkups.ts:211,239,273`). The audit (and CLAUDE.md) use the wrong name.

### 1d. HOVER flow is synchronous, 120s timeout, Excel buffer in HTTP response — CONFIRMED
- `app/api/n8n/[...path]/route.ts:20` — `const TIMEOUT_MS = 120_000; // 2 min — Excel generation can be slow`.
- `route.ts:48-62` — when content-type is spreadsheet/octet-stream/excel, returns the raw binary buffer in the response.
- Caller: `HoverUploadStep.tsx:209-228` — `fetch('/api/n8n/multi-trade-coordinator')` → `await response.blob()` → programmatic `a.click()` download. Fully synchronous end to end.

### 1e. HOVER bypasses the Detection Editor entirely — CONFIRMED
- `HoverUploadStep.tsx` `handleGenerateEstimate` (`:233-318`) writes only `projects` (`:271`) and `project_configurations` (`:290`), then triggers the webhook. Zero references to `extraction_jobs` / `extraction_pages` / `extraction_detections*` in the file. No navigation to the Detection Editor.

### 1f. Bluebeam detections land in `extraction_detections_draft`, reviewed in Detection Editor — CONFIRMED
- `lib/supabase/extractionQueries.ts:168` reads the table; `:630-676` Realtime-subscribes to it; `components/detection-editor/DetectionEditor.tsx:1800,2082,2138` read/write it; `app/api/extraction-pages/route.ts:163,231` and `app/api/redetect-page/route.ts:146,170` use it.

### 1g. Flow C (`cad_markups`) is orphaned, CSV/JSON export only — CONFIRMED (as `cad_manual_markups`)
- Export-only handlers: `CADMarkupStep.tsx:553-596` (`handleExportCSV`, `handleExportExcel`, `handleExportJSON`).
- `lib/supabase/cadMarkups.ts` exposes only save/load/delete/count; nothing in any estimation, takeoff, or calculation path consumes it.

### 1h. "Still no UI for the Roboflow construction-plan flow (`/start-job`)" — WRONG (stale)
- `components/project-form/ExtractionUploadStep.tsx:182` — `fetch(\`${EXTRACTION_API_URL}/start-job\`, ...)`. The `/start-job` endpoint has a UI entry point. (Roboflow source types also live in `app/api/detect-region/route.ts:14`, `lib/hooks/useRegionDetect.ts:10`.)

### 1i. The `extraction_id = job_id` hack (§1.1) — CONFIRMED as a convention this repo depends on
- The frontend does **not** set it — `buildApprovePayload` sends only `job_id` (`DetectionEditor.tsx:3756`). The write side is n8n (not inspectable here).
- But this repo's engine **reads by the convention**: `lib/estimating/refData.ts:447-480` queries `cad_hover_measurements WHERE extraction_id = job_id`, with a comment explicitly documenting that n8n's V9.2 Approve workflow writes it that way.
- The local normalizer mirrors the hack: `packages/estimating-engine/src/adapters/detectionEditorAdapter.ts:143` sets `measurements.extraction_id = jobId`.

### 1j. `cad_hover_measurements` holds Bluebeam data under a HOVER name (§1.2) — CONFIRMED (repo side)
- Read in three places: `lib/estimating/refData.ts:477`, `lib/supabase/cadExtractions.ts:175`, `app/api/estimating/calculate-siding/route.ts:199` (plus engine references in `autoscopeV2.ts` / `sidingOrchestratorV2.ts`). No `source_type` handling anywhere in the repo's readers — consistent with the audit's provenance complaint. (Column-level schema is live-DB territory.)

### 1k. Frontend references `extraction_job_totals` — CONFIRMED
- `lib/supabase/extractionQueries.ts:320` (REST query), `:715` (Realtime subscription); typed in `lib/types/database.ts:576`.

---

## 2. Database Cleanup (§2)

### 2a. `migrate_stone_veneer_rules_to_siding.sql` proves wrong-table inserts (§2.1) — CONFIRMED, with a nuance
- File exists at `migrations/migrate_stone_veneer_rules_to_siding.sql`. Header (lines 3-6): "The Railway API queries siding_auto_scope_rules, but stone veneer rules were **mistakenly added to auto_scope_rules**." Body selects `FROM auto_scope_rules WHERE rule_name LIKE 'stone_veneer%'` (`:69-70`).
- Nuance: it's a **copy-only** migration — it never deletes the misplaced rows from `auto_scope_rules`. It proves one wrong-table batch happened, not ongoing accumulation.

### 2b. v1 objects (`auto_scope_rules`, `material_assemblies`, three views) still present and droppable (§2.1) — NOT-VERIFIABLE-IN-THIS-REPO
- `material_assemblies`, `v_calculation_rules_active`, `v_accessories_section`, `material_assemblies_flat`: **zero references anywhere in this repo** outside the audit doc itself. No migration creates them, no code reads them.
- `auto_scope_rules`: only the stone-veneer migration reads it (2a). **No live TypeScript in this repo reads any v1 object** — whatever risk remains is in the live DB / other repos. The audit's own "presumably present" hedge was correct; note its cited source `SYSTEM_STATE.md` does **not exist in this repo** (audit line 4 cites it; `ARCHITECTURE_VIOLATION_REPORT.md` and `MATERIAL_ONBOARDING_STANDARD_OPERATING_PROCEDURE.md` do exist at repo root).

### 2c. Dual rule engine — calc engine reads `siding_auto_scope_rules`, not v2 (§2.2) — CONFIRMED (this repo's half)
- `lib/estimating/refData.ts:381` — `.from('siding_auto_scope_rules')`. Engine comments agree (`sidingOrchestratorV2.ts:887`, `autoscopeV2.ts:62`).
- `auto_scope_rules_v2` appears in **zero** code files in this repo. The n8n half of the dual-engine claim is not verifiable here.

### 2d. Four more per-trade rule tables fragment the concept (§2.2) — PARTIALLY CONFIRMED
- `labor_auto_scope_rules`: real and live — created by `migrations/create_labor_auto_scope_rules.sql:7`, read by `lib/estimating/refData.ts:335`, inserted into by `migrations/add_wrb_installation_labor.sql:43`.
- `gutters_auto_scope_rules`, `roofing_auto_scope_rules`, `windows_auto_scope_rules`: **no migration, no code reference in this repo** (one passing mention in a `docs/sql-audits/04-rule-tables.sql` comment). Existence is a live-DB question; this repo provides no support.

### 2e. `calculation_constants` missing; constants hardcoded at "orchestrator-v2.ts:123-129" (§2.3) — STALE
This is the audit's most consequential staleness. Current state:
- The constants exist, at **`sidingOrchestratorV2.ts:179-184`** (not 123-129): `MARKUP_RATE = 0.26`, `SOC_UNEMPLOYMENT_RATE = 0.1265`, `LI_HOURLY_RATE = 3.56`, `INSURANCE_RATE_PER_THOUSAND = 24.38`, `DEFAULT_CREW_SIZE = 4`, `DEFAULT_ESTIMATED_WEEKS = 2`.
- **But they are now fallbacks, not the source of truth.** `lib/estimating/refData.ts:200-203` reads the `calculation_constants` table (`.eq('active', true)`), and the orchestrator shadows the file constants with DB values at `:999-1005`. The hardcoded copy survives only as `DEFAULT_CONSTANTS` (`refData.ts:55-66`) for when the table read fails — which means a silently missing/empty table still produces Mike Skjei defaults instead of an error.
- No migration in this repo creates `calculation_constants` (the strategy doc `docs/strategy/phase-1-database-audit.md:122` says the live table exists).

### 2f. `presentation_group_config` missing; `getPresentationGroup()` 60+ lines + duplicated in frontend (§2.3) — PARTIALLY CONFIRMED / PARTIALLY STALE
- **Migration now exists** (`migrations/create_presentation_group_config.sql`, commit `e9e293e`) — the "missing table" half is stale. But the migration header itself admits (line 6): "The engine does not read this table until Phase 1.3c lands a fetcher in `lib/estimating/refData.ts`" — and grep confirms **zero code reads it**. So the "code still hardcodes" half is CONFIRMED.
- The mapping is bigger than claimed: `getPresentationGroup()` at `sidingOrchestratorV2.ts:3236-3349` (~113 lines) **plus** `normalizePresentationGroup()` at `:3355-3428` (~73 lines).
- Frontend duplication CONFIRMED, twice not once: `lib/utils/exportTakeoffExcel.ts:104-155` and `app/takeoffs/[id]/components/MaterialsTable.tsx:81-115` both define `mapLegacyPresentationGroup()` (the latter commented "Matches logic in exportTakeoffExcel.ts" at `:79`). **They already diverge:** `fascia` → `'soffit'` in exportTakeoffExcel.ts:120 vs `'trims'` in MaterialsTable.tsx:99.

### 2g. n8n `detectionPricing` ($45 corbel, $35 bracket, $120 shutter) and `bellyBandPricing` hardcoded (§2.3) — PARTIALLY CONFIRMED / PARTIALLY STALE
The port is mid-migration to DB-driven pricing, so the audit's "purely hardcoded" picture is out of date — but most items are still hardcoded:
- DB loader exists: `lib/estimating/detectionCountPricing.ts:168+` queries `detection_class_material_mapping` → `pricing_items`.
- **Corbel:** DB-first; on miss emits `$0 VERIFY PRICING` (`sidingOrchestratorV2.ts:2163-2191`). The audit's $45 is gone.
- **Bracket:** hardcoded `35.00` (`:2196`) — matches audit.
- **Shutter:** hardcoded **`65.00`** (`:2219`) — audit says $120; WRONG on the amount, right that it's hardcoded.
- **Post `85.00`** (`:2242`), **Column `150.00`** (`:2265`) — hardcoded, not in the audit's list.
- **Belly band:** board DCP-first with `$32.00` fallback (`:1753`), Z-flash DCP-first with `$12.50` fallback (`:1779`), drip edge `$8.50` / nails `$7.50` / caulk `$8.50` fully hardcoded (`:1805-1849`). Soffit panel `$28.00` (`:1896`), J-channel `$6.50` (`:1918`), fascia `$24.00` (`:1953`) — hardcoded.
- The engine itself flags this state: `sidingOrchestratorV2.ts:907-911` — "the corbel and Bluebeam-count emission paths still use their hardcoded fallbacks. Wiring those code paths is a follow-up step."

### 2h. `src/constants/siding.ts` (LABOR_RATES, OVERHEAD_RATES, TRIM_SKUS, AUTO_SCOPE_SKUS) and `FALLBACK_LABOR_RATES` (§2.4) — NOT-IN-THIS-REPO
- No such files or constant objects exist here. The port reads `labor_rates` and `overhead_costs` tables via refData. (Only `DEFAULT_LABOR_RATES` in `lib/types/organization.ts:123`, an org-settings schema default.) This claim remains a Railway-repo claim.

### 2i. `isTrue()`/`isFalse()` JSONB boolean workarounds (§2.6) — CONFIRMED
- `sidingOrchestratorV2.ts:63-68`; `isFalse` used at `:695` (`include_dumpster`) and `:733` (`include_toilet`).
- Counterpoint on the underlying landmine: **no migration in this repo** stores string booleans — all `trigger_condition` inserts use native JSON booleans with `::jsonb` (e.g. `migrations/migrate_stone_veneer_rules_to_siding.sql:37-42`, `add_trim_auto_scope_rules.sql:46`). The contamination, if present, came from n8n/ad-hoc writes to the live DB; the helpers' existence is the indirect evidence.

### 2j. Immutable pricing snapshots principle (§2.6/audit SQL) — code does not enforce it
- Zero `.ts` files reference `pricing_snapshots` or `v_pricing_current`. The only repo reference is the view migration `migrations/fix_v_pricing_current_coverage_value.sql:59`. Engine code reads `pricing_items` directly. Worth knowing before relying on snapshot semantics.

---

## 3. Reshape Pipeline (§3)

### 3a. `buildApprovePayload()` / `buildDetectionCounts()` — PARTIALLY CONFIRMED
- `buildApprovePayload` exists: `components/detection-editor/DetectionEditor.tsx:3553`, emitting `ApprovePayload` (`lib/types/extraction.ts:1241`).
- `buildDetectionCounts` **does not exist as a function** — the detection-counts construction is inlined inside `buildApprovePayload` (`:3613-3752`, the dynamic-aggregation version from commit `2926aef`).
- The payload itself already contains a shape-duplication the audit didn't call out: it emits `facade.gross_area_sf` / `facade.net_siding_sf` **and** a parallel `measurements.facade_sqft` / `measurements.net_wall_area_sqft` block — two names for the same values inside one payload.

### 3b. Approve flow wiring — CONFIRMED (single production path + parallel verification routes)
- The Detection Editor POSTs **only** to `/api/n8n/approve-detection-editor` (`DetectionEditor.tsx:4227-4235`); the proxy forwards to `${N8N_BASE_URL}/webhook/approve-detection-editor` (`app/api/n8n/[...path]/route.ts:36`).
- `app/api/estimating/normalize-approval/route.ts:4-8` and `calculate-siding/route.ts:18-21` self-document as parallel verification surfaces "NOT wired into the frontend" — matches the production-path-untouched constraint.

### 3c. Renamed fields at the reshape boundary — CONFIRMED, mapped concretely
The local normalizer (`packages/estimating-engine/src/adapters/detectionEditorAdapter.ts:140-200`, mirroring n8n's Validate & Normalize node) renames: `facade.gross_area_sf→facade_gross_sf`, `facade.net_siding_sf→facade_net_sf`, `windows.area_sf→window_area_sf`, `corners.outside_count→outside_corner_count`, `garages.head_lf→garage_head_lf`, etc., and computes `total_opening_area_sf`, `siding_squares = net_siding_sf / 100`, `source = 'detection_editor'`, `extraction_id = jobId`.
- **Unflagged hazard found here:** the adapter substitutes silent product defaults when absent — `'HardiePlank 8.25" Cedarmill'`, `'Arctic White'` (`detectionEditorAdapter.ts:220-224`). Missing product data is masked, not surfaced.

### 3d. Alias proliferation (`facade_sqft` / `facade_area_sqft` / `gross_wall_area_sqft`) — CONFIRMED, undercounted
- `buildMeasurementContext` (`autoscopeV2.ts:453-531`) assigns one computed `facade_sqft` to `facade_sqft` (`:455`), `gross_wall_area_sqft` (`:456`), and `facade_area_sqft` (`:523`).
- The `MeasurementContext` type (`packages/estimating-engine/src/types/autoscope.ts:10-94`) documents an "ALIASES for database formula compatibility" block with **8 alias groups** (also `openings_area_sqft`, `outside_corners_count`, `inside_corners_count`, `openings_perimeter_lf`, `openings_count`, `facade_height_ft`), not the 3 the audit names. `WebhookMeasurements` (`types/webhook.ts:24+`) additionally absorbs `net_siding_sqft` as a "CAD path field name variant" — corroborating the `dce3c39` bug class even though that commit lives in the Railway repo, not here.

### 3e. `detection_counts` flattening trap — CONFIRMED
- `sidingOrchestratorV2.ts:1491-1499` manually flattens **only `belly_band`** (`belly_band_count`, `belly_band_lf`) into measurements before `buildMeasurementContext` (consumed at `autoscopeV2.ts:491-492`). Every other detection class is handled by per-class hardcoded blocks at `:2151-2284`, bypassing MeasurementContext entirely. A new detection class reaches neither path without manual wiring — the trap is structural, exactly as the audit describes.

### 3f. "Silent presentation_group drops (known bug)" — CONFIRMED as a live pattern
- Encoded as a known failure in `.claude/skills/arch-review/SKILL.md:38` ("Rules get silently filtered if presentation_group doesn't match"). Three divergent mappers (2f), a fourth in `lib/estimating/detectionCountPricing.ts:102-122` (`PRESENTATION_GROUP_DEFAULTS`, e.g. `'Soffit & Fascia'` vs the orchestrator's `'Soffit'`), and mixed-case group values visible in real engine output (`local-real.json`: `"trims"`, `"metals_flashings"` alongside `"Siding"`, `"Belly Band"`).

### 3g. Canonical measurement contract recommendation — current state verified
- `WebhookRequest`/`WebhookMeasurements` exist (`packages/estimating-engine/src/types/webhook.ts:24,95`) and are close to the audit's proposed contract — but the frontend's `ApprovePayload` (`lib/types/extraction.ts:1241`) is a separate, unconnected type with different field names, and `packages/estimating-engine/src/index.ts:11` exports only the normalizer function, not the types. No shared contract yet.

### 3h. Boundary validation recommendation — gap confirmed in the new routes
- Both new routes return 400 on bad JSON, missing `job_id`, and `project_id` mismatch (`calculate-siding/route.ts:37,48,113`; `normalize-approval/route.ts:37,49,122,138`) — but **neither validates measurement completeness**. An absent measurements block still degrades to zeros via `buildMeasurementContext` fallbacks. The audit's "zeros that should have been errors" failure mode is present in the new code too.

---

## 4. MN568 Regression Figures (§4)

### 4a. "MN568 (`240e222e-0419-421c-97fa-18a691b40cdb`)" — PARTIALLY CONFIRMED
- That UUID is the extraction **job_id**, not the project id: `test-data/baselines/MN568.expected.json:12`. The project_id is `f7e2fc2b-33c1-48f2-bae6-ebff37fbe346` (`:11`).

### 4b. "Excel output must match to the penny (target $19,333, current $18,657)" — WRONG (per this repo's baseline)
- The committed baseline asserts **`final_total: 34115.55`** (`MN568.expected.json:63`), with material $17,058.59 / labor $8,979.72 / overhead $4,975.83, 43 line items, net siding 6,278 SF, 47.9 squares, plus per-group and detection-count assertions.
- Neither $19,333 nor $18,657 appears anywhere in the repo outside the audit document. The audit's figures may come from an older configuration or a different total definition, but they do not match the current regression contract. (Per the baseline's own framing: it snapshots **current system behavior**, not contractor-validated correctness.)

---

## 5. Independent Sweep — Issues the Audit Missed

Same categories, this repo only, all verified with file:line.

### Hardcoded business logic
1. **Third copy of the financial constants, in the frontend, with no DB path at all:** `lib/utils/itemHelpers.ts:58` (`LI_INSURANCE_RATE = 0.1265`), `:446` (`PROJECT_INSURANCE_RATE = 24.38`), `:451` (`DEFAULT_MARKUP_RATE = 0.26`), used in live calculations at `:262,458,491`. The audit flagged the orchestrator copy; the engine now DB-drives it (2e) — but this frontend copy will silently diverge the moment anyone edits `calculation_constants`.
2. **L&I percentage baked into Excel display text:** `lib/utils/exportTakeoffExcel.ts:847` — "Labor costs include 12.65% L&I insurance + unemployment" — wrong the moment the DB constant changes.
3. **Waste factors hardcoded in the engine:** `sidingOrchestratorV2.ts:1354-1356` (`siding: 1.10, trim: 1.10, corners: 1.12, flashing: 1.10`) and `:1744` (`WASTE_FACTOR = 1.10`) — belongs in `pricing_items.waste_factor`.
4. **Coverage/board-geometry constants hardcoded:** `sidingOrchestratorV2.ts:1366` (6.58 SF per lap-siding board), `:1370` (fallback `coverage_value || 6.58`), `:1374` (12 ft trim piece length); belly-band/soffit unit conversions (12 ft board, 12 SF panel) inlined at `:1738-1895`.
5. **Production n8n URL hardcoded as fallback:** `app/api/n8n/[...path]/route.ts:9` — `'https://n8n-production-293e.up.railway.app'` when env vars are unset. An unconfigured environment silently talks to production n8n.
6. Minor: hardcoded org id `'org-exterior-finishes'` in `scripts/verify-normalize-approval.ts:144` (test-only).

### Duplicate sources of truth
7. **Presentation-group mapping exists in four places**, not the audit's two: engine `getPresentationGroup`/`normalizePresentationGroup` (`sidingOrchestratorV2.ts:3236-3428`), `exportTakeoffExcel.ts:104-155`, `MaterialsTable.tsx:81-115`, and `detectionCountPricing.ts:102-122` — with two confirmed divergences (`fascia`, `Soffit & Fascia` vs `Soffit`).
8. **Section order/colors duplicated:** `MaterialsTable.tsx:20-31` (`SECTION_ORDER`, `PRESENTATION_GROUP_COLORS`) vs `exportTakeoffExcel.ts:88-98` (`PRESENTATION_GROUPS`) — orderings differ (export has `labor` at 8; the table omits it).
9. **`DEFAULT_CONSTANTS` mirror:** `lib/estimating/refData.ts:55-66` duplicates `sidingOrchestratorV2.ts:179-184` verbatim — an intentional fallback mirror, but two places to update.
10. **Duplicate shoelace-area implementations:** local `calculateArea()` in `DetectionEditor.tsx:1501-1509` (used in the carve/clip path `:1554-1609`) duplicates `lib/utils/polygonUtils.ts` `calculatePolygonArea`; `calculateAreaWithScale()` (`DetectionEditor.tsx:804-876`) is a third independent area path.

### Dead code
11. **`lib/utils/excelExport.ts` (454 lines): zero importers anywhere** — verified by grep. Only `exportTakeoffExcel.ts` and `excelExportProfessional.ts` are live. Delete candidate.
12. **Root-level scratch payload files** (`payload.json`, `payload.json.prev`, `clean-payload.json`, `approval-min.json`, `local*.json`, `real-approval-payload.json`, `test-payload.json` — the last is ~huge): untracked manual-testing artifacts of the approve/engine payloads. Useful as reshape-chain evidence, but they belong in `test-data/` or `.gitignore`, and `real-approval-payload.json` contains real customer project data sitting at repo root.

**Sweep false positives caught and rejected** (recorded so they don't resurface): `useDetectionSync`/`useExtractionData` are NOT dead (`DetectionEditor.tsx:11-12,293,306`); the classify page is NOT orphaned (linked from `components/dashboard/ExtractionsTable.tsx:476` for `status === "classified"` jobs).

### Measurement-shape transforms
13. The approve payload's **internal dual emission** (3a) and the adapter's **silent product defaults** (3c) are reshape hazards within stages the audit treated as clean.
14. The engine's per-detection-class blocks (`:2151-2284`) do LF→pieces and SF→panels conversions with inlined constants (item 4) — unit conversions invisible to any shared normalization.

### Documentation drift (bonus)
15. CLAUDE.md names `cad_markups` (actual: `cad_manual_markups`) and lists only `BluebeamImportModal.tsx` (the dashboard entry is `BluebeamFreshImportModal.tsx`).
16. The audit's cited source `SYSTEM_STATE.md` is not in this repo; claims sourced solely from it (v1 view names, three per-trade rule tables) have no repo evidence and need the audit's §6 SQL against the live DB to settle.

---

## 6. Bottom Line

- **Trust the audit's architecture story** for this repo: one synchronous HOVER path that skips review, one Bluebeam path that the engine reads back via the `extraction_id = job_id` convention from a misnamed table, one orphaned markup flow, a v1-only rule read in the engine, alias-riddled measurement shapes, and multiplied presentation-group maps.
- **Do not trust its specifics without this document:** line numbers (179-184, not 123-129), shutter $65 (not $120), corbel now DB-first, `calculation_constants` already read from DB, `presentation_group_config` migration already committed (but unread by code), `buildDetectionCounts` doesn't exist as a function, `cad_manual_markups` (not `cad_markups`), `/start-job` has a UI, and — critically — **the MN568 regression contract is $34,115.55, not $19,333/$18,657**. Anyone gating a phase on the audit's dollar figures would fail every run against the actual baseline.
- **Highest-leverage repo-local items the audit missed:** the `itemHelpers.ts` frontend constants copy (item 1), the four-way presentation-group mapping (item 7), and the missing measurement-completeness validation in the new verification routes (3h).
