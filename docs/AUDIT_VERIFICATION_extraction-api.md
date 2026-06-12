# Audit Verification — extraction-api

**Date:** June 10, 2026
**Source audit:** `docs/CODEBASE_AUDIT_JUNE_2026.md`
**Scope:** This repo only (`extraction-api`, Python/Flask). Claims about the frontend, the TypeScript exterior-estimation-api, n8n workflow internals, and the live Supabase schema are marked NOT THIS REPO / UNVERIFIABLE HERE rather than judged.
**Method:** Every audit claim that touches this codebase was checked against current code with grep/read. An independent sweep then covered the same four categories (hardcoded business logic, duplicate sources of truth, dead code, measurement-shape transforms) via four parallel read-only research passes; every finding cited below as load-bearing was re-verified directly against the file before inclusion. No code was changed.

**Verdict legend:** CONFIRMED (matches current code) · PARTIAL (true with caveats / one side verifiable here) · STALE/WRONG (contradicted by current code) · NOT THIS REPO (claim targets another repo/system) · UNVERIFIABLE HERE (depends on live DB/n8n state).

---

## Part 1 — Verification of Audit Claims

### 1.1 Flow B processing is `bluebeam_fresh_import_service.py` (§1 flow table)

**CONFIRMED.** The file exists and implements exactly the described flow: PDF → page images at 150 DPI → `extraction_pages` records → annotation parsing → batch insert into `extraction_detections_draft` (`services/bluebeam_fresh_import_service.py:996-1113`). Endpoint is `POST /import-bluebeam-fresh` (`app.py:2063`), with a preview endpoint at `app.py:2001`.

### 1.2 Bluebeam detections land in `extraction_detections_draft`, reviewed in Detection Editor (§1 flow table)

**CONFIRMED.** Batch insert at `services/bluebeam_fresh_import_service.py:1078-1108`; the endpoint docstring states "User reviews in Detection Editor at /projects/[id]/extraction/[jobId]" (`app.py:2105`). The old roundtrip import also targets the draft table (`services/bluebeam_import_service.py:777-802`). Caveat on "async": the HTTP import request itself is synchronous (no background thread for this endpoint); "async" is accurate only in the sense that calculation happens later, after human review.

### 1.3 Measurement record for Flow B is `cad_hover_measurements` + `extraction_job_totals` (§1 flow table, §1.2 "cad_hover_measurements is a lie")

**PARTIAL — consistent from this side; the write is in n8n.** This repo never writes `cad_hover_measurements`, but it *reads* it for Bluebeam jobs: `_get_product_selections()` looks up product selections in `cad_hover_measurements` keyed by extraction `job_id` (`services/bluebeam_import_service.py:1098-1109`). Code in the Bluebeam pipeline expecting its data in a table named "hover" is direct circumstantial support for the impersonation claim. `extraction_job_totals` is written by four services here (see 1.7). No code in this repo reads or writes a `source_type` column — consistent with the "no provenance column" claim, though the schema itself is UNVERIFIABLE HERE.

### 1.4 The `extraction_id = job_id` hack (§Exec, §1.1)

**NOT THIS REPO.** Zero occurrences of `extraction_id` anywhere in this codebase. The webhook payload this repo builds for the n8n approve flow contains `job_id` and `project_id` but no `extraction_id` (`services/bluebeam_import_service.py:1049-1070`). If the hack exists, it lives inside the n8n workflow. Notably, this repo *does* duplicate the n8n approve call itself: `trigger_recalculation_webhook()` posts to the same webhook the Detection Editor uses (`services/bluebeam_import_service.py:1135-1163`, reachable via `/import-bluebeam` with `trigger_recalc=true`, `app.py:1939-1942`) — see Part 2 finding T-7.

### 1.5 `/start-job` Roboflow flow has no UI (§1.4)

**PARTIAL.** The endpoint half is CONFIRMED: `POST /start-job` exists (`app.py:92`) and drives the PDF→classify→detect pipeline. Whether a UI exists for it is a frontend question — NOT THIS REPO. `cad_markups` (Flow C) has zero references in this repo, consistent with "orphaned."

### 1.6 The `extraction_*` table family is `jobs, pages, detections_draft, detections_validated, job_totals` (§2.5)

**STALE/INCOMPLETE.** Two problems with the audit's list as seen from this repo:

1. **`extraction_detections_validated` has zero references in this codebase.** If it exists, nothing here reads or writes it.
2. **The family is roughly twice as large as listed**, and the omissions matter. Tables actually referenced: `extraction_jobs`, `extraction_pages`, `extraction_detections_draft`, **`extraction_detection_details`**, `extraction_job_totals`, `extraction_elevation_calcs`, `extraction_ocr_data`, `extraction_dimension_sources`, `extraction_cross_refs`, `extraction_takeoff_summary`, `extraction_roof_sections`, `extraction_roof_summary`, `extraction_linear_elements`, `extraction_summary`.

The biggest omission is `extraction_detection_details`: the Roboflow path writes detections there (`services/extraction_service.py:17-92`), **not** to `extraction_detections_draft`. The audit's "one pipeline" diagram shows "Roboflow ML importer → extraction_detections_draft" as if adjacent to current behavior; in reality the two ingest paths already write to **two different detection tables**, which is itself a split the audit missed (see Part 2 finding T-3).

### 1.7 `extraction_job_totals`: "standardize all writers on upsert" (§2.6)

**CONFIRMED — the divergence is real and lives here.** Four writers, three different write patterns, zero actual upserts:

- `services/takeoff_service.py:260-264` — DELETE then POST
- `services/aggregation_service.py:695-718` — GET, then PATCH-if-exists else POST (check-then-act race)
- `services/linear_service.py:296,410` — PATCH only
- `services/floor_plan_service.py:62` — PATCH only

The shared client never sends a PostgREST upsert header — only `Prefer: return=representation` (`database/client.py:32`), so true upsert is impossible without changing the client.

### 1.8 Silent INSERT failures (§2.6)

**CONFIRMED.** `supabase_request()` prints the error and returns `None` on any HTTP ≥400 or exception — it never raises (`database/client.py:47-55`). Most call sites ignore the return value entirely (e.g., the DELETE+POST pair in `takeoff_service.py:260-264`, the OCR PATCH at `extraction_service.py:333-341`). Partial mitigation exists in the fresh import: batch insert failures are logged with a sample row (`bluebeam_fresh_import_service.py:1108-1113`) — but the endpoint's response still counts failed batches in `detection_summary`/`total_detections`, so a partial failure looks like success to the caller. There is no `pipeline_errors` table or equivalent.

### 1.9 Dual rule engines / hardcoded pricing in n8n and the TS API (§2.2, §2.3, §2.4)

**NOT THIS REPO — with one clarifying fact.** This repo reads **neither** `siding_auto_scope_rules` nor `auto_scope_rules_v2` (zero grep hits), so extraction-api is not a third rule engine. Its only pricing-table contact is reading `pricing_items` for material display names (`services/bluebeam_service.py:526`). The claims about `orchestrator-v2.ts`, `siding.ts`, `autoscope-v2.ts`, and the n8n `detectionPricing`/`bellyBandPricing` objects target the other repos. However, the *same disease* (hardcoded business constants that should be data) is present in this repo — see Part 2, category H.

### 1.10 `net_siding_sqft` mapping bug fixed in `dce3c39` (§Exec, §3)

**NOT THIS REPO** (`git cat-file -t dce3c39` → not a valid object here). But the audit's underlying thesis — that this class of bug recurs at every reshape boundary — is **CONFIRMED inside this repo**: the net-siding formula itself exists in four places here and two of them have drifted (Part 2 finding D-1).

### 1.11 The 5-reshape measurement pipeline (§3)

**PARTIAL / understated.** Stages 1–6 of the audit's trace live in the frontend, n8n, and the TS API. What the audit missed is that this repo *adds* parallel reshapes to that count: `aggregate_detections_for_recalc()` (`services/bluebeam_import_service.py:867-1075`) is a second, independent, hand-maintained implementation of the Detection Editor's approve payload — so the "approve payload" shape has at least two producers in two languages. Internal to this repo there are six more shape boundaries with live field-drop bugs (Part 2, category T).

### 1.12 "Move spatial containment out of n8n into the API (or a small endpoint on extraction-api)" (§3 fix 3)

**FEASIBILITY CONFIRMED.** This repo already contains tested-in-production bbox math: IoU, containment fraction, and overlap filtering in `services/detection_postprocess.py:59-231`, plus polygon parsing in the Bluebeam services. A containment endpoint would be additive, not novel.

### 1.13 JSONB booleans-as-strings / `isTrue()` helpers / `siding_squares` GENERATED column (§2.6)

**NOT THIS REPO.** Zero hits for `isTrue`, `is_true`, or `siding_squares` in this codebase. These landmines live in n8n / the TS API / the DB schema.

### 1.14 Flow B storage "(extraction-api handles)" (§1 flow table)

**CONFIRMED.** Page images upload to the Supabase Storage bucket `extraction-markups` (`database/storage.py:9`).

---

## Part 2 — Independent Sweep (this repo)

Findings the audit did not surface, same four categories. IDs: **T** = shape transforms, **D** = duplicate truth, **H** = hardcoded business logic, **X** = dead code. The top items in each category were verified directly against the cited lines.

### Category T — Measurement-shape transforms (correctness risks)

**T-1 — CRITICAL: Fresh-import corners vanish from the recalc payload (class-name schism).**
The fresh import normalizes corner annotations to `corner_outside` / `corner_inside` (`services/bluebeam_fresh_import_service.py:62-66`). The recalc aggregation only matches `outside_corner` / `inside_corner` (`services/bluebeam_import_service.py:982-988`), and its `POINT_MARKER_CLASSES` set (`bluebeam_import_service.py:861-864`) doesn't include the `corner_*` variants either. A corner detection from a fresh import therefore matches **no branch at all** — it is absent from corner counts, corner LF, and `detection_counts` in the payload sent to n8n. The old roundtrip import maps the same Bluebeam subjects to `corner` / `inside_corner` / `outside_corner` (`bluebeam_import_service.py:68-72`), so the two import paths produce mutually incompatible corner classes, and bare `corner` is dropped by aggregation too.

**T-2 — CRITICAL: All linear footage in the recalc payload silently zero for imported detections.**
`aggregate_detections_for_recalc()` reads `real_width_ft` / `real_height_ft` from draft rows (`services/bluebeam_import_service.py:946-947`) and derives starter LF, window/door/garage head/jamb/sill LF, and corner LF from them (`:951-988`). But neither import path ever writes those columns: the fresh import's `ALLOWED_COLUMNS` excludes them (`bluebeam_fresh_import_service.py:1081-1089`) and the old import's new-detection insert omits them (`bluebeam_import_service.py:785-799`). Unless the frontend Detection Editor populates these fields on draft rows (outside this repo), every trim/corner LF in the webhook payload is `0` while areas and counts look correct — the exact "zeros that should have been errors" failure mode the audit describes for the other repos.

**T-3 — HIGH: Two detection tables, and per-page endpoints only see one of them.**
Roboflow detections → `extraction_detection_details` (`services/extraction_service.py:17-92`); Bluebeam detections → `extraction_detections_draft` (both import services). `/generate-facade-markup` and `/siding-polygons` query only `extraction_detection_details` (`app.py:1391`, `app.py:1593`), so they return nothing useful for Bluebeam-imported jobs. The export side papers over the split by checking draft first, then falling back (`services/bluebeam_service.py:703-705`); nothing else does.

**T-4 — HIGH: Fresh-import pages never get `scale_ratio`, so geometry-derived areas are unscaled.**
Page records are created with `dpi: 150` but no `scale_ratio` (`bluebeam_fresh_import_service.py:1007-1019`). Every parser guards its real-world conversion with `if page_record.get('scale_ratio')` (`:672-673`, `:679-680` and the polygon/polyline equivalents), so that branch can never fire during a fresh import — `area_sf` falls back to raw PDF-point area (square inches of paper / 144). The value is rescued only when the Bluebeam `Contents` field carries an explicit measurement ("141 sf"), which `parse_bluebeam_content` then uses as an override (`:175`, applied at `:921-929`, added in commit `b881e60`). Markups without content measurements get areas wrong by the square of the scale factor.

**T-5 — HIGH: `/calculate-takeoff` destroys enrichment data.**
`calculate_takeoff_for_page()` deletes all `extraction_detection_details` rows for the page and re-derives detections from the `extraction_data.raw_predictions` JSONB (`services/takeoff_service.py:32-41`). Any fusion results (`matched_tag`, `final_*` columns written by `fusion_service.py:265-278`) or manual corrections on those rows are wiped on every recalculation.

**T-6 — MEDIUM: Split-brain JSONB columns `extracted_data` vs `extraction_data`.**
`extraction_pages` carries both: intelligent analysis writes `extracted_data` (`intelligent_analysis_service.py:454-466`); the legacy OCR/measurement path writes `extraction_data`. `aggregation_service` reads `extracted_data` (`:177,243,344,389`) while `cross_ref_service` reads only `extraction_data` (`cross_ref_service.py:35-64`) — so cross-references are silently empty for any job processed through the modern analysis path. `takeoff_service` also depends on `extraction_data.raw_predictions` (`takeoff_service.py:32-35`).

**T-7 — MEDIUM: The approve-payload shape is duplicated across repos.**
`aggregate_detections_for_recalc()` (`bluebeam_import_service.py:867-1075`) re-implements in Python the same payload the frontend's approve flow builds, posting to the same n8n webhook (`:1150`). Two hand-maintained producers of one consumer's contract, in different languages, with no shared schema — a new reshape boundary of exactly the kind the audit catalogued.

**T-8 — MEDIUM: Export reads page-dimension fields that are never stored, saved by fallbacks.**
Pages store `original_width`/`original_height` (`extraction_service.py:159`, `bluebeam_fresh_import_service.py:1014-1015`), but the live export's annotation-scaling code reads `image_width`/`width` (`services/bluebeam_service.py:651`) — fields that don't exist on the row. It survives because (a) when the PDF is rebuilt from page images, scale is forced to 1.0 (`:665-667`), and (b) otherwise it fetches the actual image to measure it (`:674-682`), with a final scale-1.0 fallback that prints a warning (`:686-689`). Meanwhile `calculate_measure_conversion()` *in the same file* correctly tries `original_width` first (`bluebeam_service.py:223-225`). One file, two opinions about the schema.

**T-9 — MEDIUM: Geometry edits imported from Bluebeam leave measurements stale.**
The roundtrip import updates only `pixel_x/pixel_y/pixel_width/pixel_height/class` on modified detections (`bluebeam_import_service.py:735-752`) — `area_sf`, `perimeter_lf`, and `real_*` are not recalculated, so a resized markup keeps its old measurements.

**T-10 — LOW: Naming catalog for the same quantity.** Center-x is `x` (Roboflow/postprocess/`original_bbox`) vs `pixel_x` (DB tables) vs `bbox.x` with `w`/`h` (roundtrip NM metadata, export `bluebeam_export_service.py:126-132`, import `bluebeam_import_service.py:537-548`); page width is `original_width` (stored) vs `image_width` (read by export) vs `width` (in-memory); area is `area_sf` (DB) vs `area_sqft` (a dead primary lookup in the export's measurement reader that always misses before its working fallback).

### Category D — Duplicate sources of truth

**D-1 — HIGH (drifted): Four implementations of the net-siding formula; two are wrong.**
CLAUDE.md's canonical formula: `net = (building − roof) − openings + gables`.
- `services/takeoff_service.py:140-143` — correct (verified).
- `services/bluebeam_import_service.py:1014-1015` — correct (verified).
- `app.py:1433-1434` (`/generate-facade-markup`) — **omits the gable add-back**: `net_siding_sf = gross_facade_sf - openings_sf`. Understates net siding on any gabled elevation in the markup overlay (verified).
- `geometry/calculations.py:134-140` (`calculate_real_measurements`, live — called from `extraction_service.py:183`) — **omits both the roof subtraction and gables**: `net_siding_sqft = gross_wall_sqft - openings_sqft` (verified).

**D-2 — HIGH (drifted): Two `VALID_PAGE_TYPES` definitions disagree.**
`config.py:37` has `{…, 'site_plan', 'other'}` but no `notes`; `app.py:2170` has `[…, 'notes']` but no `site_plan`/`other` (verified). The PATCH classify endpoint validates against the app.py copy (`app.py:2194`), so a page type that one half of the system considers valid is rejected by the other.

**D-3 — HIGH (drifted): Four color tables, three different colors for the same class.**
`config.MARKUP_COLORS` (`config.py:41-50`): window=blue, door=orange, garage=purple. `BLUEBEAM_COLORS` (duplicated verbatim in `bluebeam_service.py:274-297` and dead `bluebeam_export_service.py:38-61`): window=orange, door=magenta, garage=green. `COLOR_CLASS_MAPPING` (`bluebeam_import_service.py:83-91`) inverts the BLUEBEAM_COLORS convention (consistent with export). `COLOR_TO_CLASS` (`bluebeam_fresh_import_service.py:88-99`) contradicts all of them: green→window, blue→door, orange→garage. Color-based class inference therefore classifies the same markup differently depending on which import endpoint receives it.

**D-4 — HIGH (drifted): Corner class names** — see T-1; the root cause is two independent subject→class maps (`CLASS_NAME_MAPPING` vs `CLASS_MAPPING`) that also disagree on `wall` (fresh maps `wall→exterior_wall`; old import passes `wall` through unmapped, producing a class nothing downstream recognizes).

**D-5 — MEDIUM: `_store_ocr_results` exists twice with behavioral differences.**
`app.py:745` and `services/extraction_service.py:287`. The app.py copy hardcodes `claude_model: 'claude-sonnet-4-20250514'` and writes `ocr_data_id` back to `elevation_calcs`; the service copy reads the model from the response and never links `ocr_data_id`.

**D-6 — MEDIUM: CLAUDE.md drift.** The documented table list (7 tables) omits ~9 tables the code uses — including `extraction_detections_draft`, the table the whole Bluebeam flow runs on (see 1.6). The documented pipeline also omits the Bluebeam import endpoints entirely.

**D-7 — MEDIUM: Job/page status values are scattered string literals** across seven services with no central enum: `converting`, `classifying`, `analyzing`, `classified`, `processing`, `importing`, `complete`, `failed` — and `scripts/load_bax_to_supabase.py:351` writes `completed` (diverged from `complete`). A DB CHECK constraint exists but is invisible from code (acknowledged in a comment at `intelligent_analysis_service.py:454`); the git log shows three commits fixing invalid-status bugs (`403053f`, `c2df07d`, `88d6e23`).

**D-8 — LOW (agree today, fragile):** `SKIP_CLASSES = {'building'}` duplicated with a "must match" comment (`bluebeam_import_service.py:79-80` vs `bluebeam_service.py:64`); corner-LF formula in three places (`linear_service.py:135`, `aggregation_service.py:571-580`, `floor_plan_service.py:57-58`); pixels→inches conversion in four places (all algebraically identical today); fresh import hardcodes `dpi=150` (`bluebeam_fresh_import_service.py:1002`) while the rest of the pipeline uses `config.DEFAULT_DPI = 200`.

### Category H — Hardcoded business logic

**H-1 — HIGH: Production n8n webhook URL hardcoded** — `APPROVE_WEBHOOK = 'https://n8n-production-293e.up.railway.app/webhook/approve-detection-editor'` (`services/bluebeam_import_service.py:1150`). No env var, no config key.

**H-2 — HIGH: Default product catalog in code** — `'HardiePlank 8.25" Cedarmill'`, `'Arctic White'`, `'HardieTrim 4/4'` as fallback product selections (`bluebeam_import_service.py:1091-1096`), bypassing `pricing_items`.

**H-3 — HIGH: `selected_trades: ['siding']` hardcoded** into every recalc webhook payload (`bluebeam_import_service.py:1055`) — the API-triggered recalculation can never price other trades.

**H-4 — MEDIUM: Scale fallback `48` (1/4″=1′) inlined at 6+ sites** instead of config: `extraction_service.py:146`, `takeoff_service.py:31`, `markup_service.py:230,363`, `geometry/calculations.py:26,77`, `app.py:1260,1322`. Also falsy-zero hazard: a stored `scale_ratio = 0` silently falls through to 48.

**H-5 — MEDIUM: 9-ft wall height default at 4 independent sites**: `linear_service.py:22` (`DEFAULT_WALL_HEIGHT`), `aggregation_service.py:545` (inline `* 9.0`), `floor_plan_service.py:49`, `app.py:1219`. Plus `DEFAULT_STORIES = 2` (`linear_service.py:23`).

**H-6 — MEDIUM: Trade-math constants in services, not config/DB**: pitch factors and waste table 8%–22% (`roof_service.py:21-34`), default overhang 12″ (`roof_service.py:37`, repeated inline `app.py:1067`), corner post 10′ / J-channel 12.5′ / starter strip 12′ (`linear_service.py:26-28`), flat 10% trim waste (`linear_service.py:160`), rough-opening +1″ and head-flashing/sill-pan +4″ (`geometry/measurements.py:23-32`), per-class dimension sanity bounds (`fusion_service.py:39-51`).

**H-7 — LOW: Anthropic token prices and model ID hardcoded** (`intelligent_analysis_service.py:44-45`, model string also embedded in `app.py`'s `_store_ocr_results`) — cost-logging only, but already drift-prone.

**H-8 — Architecture-rule violations (CLAUDE.md: "app.py is routing only"):** `/generate-facade-markup` (~190 lines incl. the drifted formula, `app.py:1344-1533`), `/siding-polygons` (~160 lines, `app.py:1534-1692`), `/debug-markup` (~60 lines of drawing code, `app.py:1241-1301`), `_store_ocr_results` helper (`app.py:745`), and the module-level `VALID_PAGE_TYPES` (`app.py:2170`).

### Category X — Dead code

**X-1 — Tracked backup files** (all in git): `app_old.py` (569-line pre-refactor monolith), `app.py.backup` (80 KB), `services/markup_service.py.backup`.

**X-2 — `services/bluebeam_export_service.py` is dead wholesale.** Zero imports anywhere; the live `export_bluebeam_pdf` is `services/bluebeam_service.py:560`, wired via `services/__init__.py:44`. This matters for triage: the worst export bugs found in the sweep (straight scale-1.0 fallback on missing page dims, diverged AREA/LINEAR/POINT class sets at `bluebeam_export_service.py:25-35`) are in the **dead** file; the live export carries only the milder T-8. Deleting this file removes an entire class of "fixed the wrong file" risk.

**X-3 — Untracked junk:** the directory literally named `{core,services,database/repositories,geometry,api/routes,utils}` — an empty failed shell brace-expansion from Jan 4, untracked.

**X-4 — Dead dependencies:** `cohere==5.13.0` and `numpy==1.26.3` in `requirements.txt` are imported only by dead `app_old.py` (`:26`, `:24`).

**X-5 — Dead package:** `api/` contains only a 3-line docstring `__init__.py`; never imported.

**X-6 — Dead exported functions** (zero call sites outside definition + `__init__` re-export): `geometry/measurements.py` — `pixels_to_real_inches`, `pixels_to_real_feet`, `calculate_area_sf`, `calculate_perimeter_lf` (note: `bluebeam_service.py:97` defines its own local `calculate_perimeter_lf` instead); `geometry/calculations.py:8` — `calculate_real_dimensions`; `geometry/scale_parser.py:59` — `COMMON_SCALES`; `utils/validation.py:42-57` — `validate_job_id`, `validate_page_type`, `validate_scale_ratio`; repositories — `delete_job`, `delete_page`, `create_detection`, `delete_detection`, `delete_detections_by_page`, `get_detections_by_job`, `get_active_detections_by_page`; `linear_service.py:427` — `set_wall_height` (no corresponding route); `app.py:23` imports `claude_client` and never uses it.

**X-7 — Superseded/debug endpoints:** `/classify-job` self-labeled "LEGACY - use /analyze-job instead" (`app.py:118`); `/debug-markup` and `/test-markup` referenced by no documentation; the OCR pipeline (`/extract-dimensions`, `/ocr-job`, `/ocr-data`) and fusion endpoints (`/fuse-data`, `/fusion-summary`, `/dimension-sources`, `/detections-with-sources`) are reachable but bypassed by the intelligent-analysis flow — and fusion only ever processes windows/doors (`fusion_service.py:165`).

**X-8 — Dead config entries:** `MARKUP_COLORS['gutter']` / `TRADE_GROUPS['gutters']: ['roof']` (`config.py:49,58`) — no live path passes the `gutters` trade, and the mapping is semantically wrong anyway. `scripts/load_bax_to_supabase.py` and `scripts/test_nm_field.py` are standalone one-offs; the BAX loader's dedup logic was since reimplemented in the fresh import service.

---

## Summary

**Of the audit's claims that touch this repo:** the Bluebeam pipeline description (1.1, 1.2, 1.14), the `extraction_job_totals` writer chaos (1.7), and the silent-failure pattern (1.8) are CONFIRMED with line-level evidence. The `cad_hover_measurements` impersonation is corroborated from this side by a read dependency (1.3). The `extraction_id` hack, the dual rule engines, the TS-API hardcoded constants, and the `dce3c39` bug are NOT THIS REPO. The audit's one materially **stale/wrong** claim about this repo is its `extraction_*` table inventory (1.6): `extraction_detections_validated` is unused here, ~9 used tables go unlisted, and — most consequentially — the audit missed that Roboflow and Bluebeam ingest already write to **two different detection tables**.

**The independent sweep's headline findings**, all verified directly: fresh-import corners are silently dropped from the recalc payload by a class-name schism between the two import services (T-1); all trim/corner linear footage in that payload is silently zero because the source columns are never written (T-2); fresh-import geometry areas are unscaled unless Bluebeam content text rescues them (T-4); `/calculate-takeoff` wipes fusion/manual enrichment on every run (T-5); two of four net-siding formula copies have drifted from the canonical formula (D-1); and an entire dead duplicate export service (X-2) is sitting next to the live one, soaking up bug reports that don't apply.

The audit's central thesis — *every hand-maintained reshape boundary breeds a silent field-drop bug* — is not just confirmed by this repo; this repo is its strongest evidence. T-1, T-2, T-4, and D-1 are four independent live instances of the exact failure mode the audit predicted from the other side of the system.
