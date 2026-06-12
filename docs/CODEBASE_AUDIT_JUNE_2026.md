# EstimatePros.ai Codebase Audit — June 10, 2026

**Scope:** ai-estimator (frontend), exterior-estimation-api (Railway), extraction-api (Railway), n8n workflows (as documented), Supabase schema (as documented).
**Sources:** Repo files in project knowledge, ARCHITECTURE_VIOLATION_REPORT.md (Mar 3), BLUEBEAM_PIPELINE_SESSION_HANDOFF_MAR15.md, FRONTEND_ANALYSIS.md, SYSTEM_STATE.md, DATABASE_ARCHITECTURE.md.
**Not directly inspected:** Live n8n workflow JSON, live Supabase row counts/table list. Audit SQL provided in Section 6 to ground-truth those.

---

## Executive Summary

The HOVER-flow confusion and the database mess are **the same root problem**: the system has grown three input pipelines that were never unified, and each one left behind its own tables, its own measurement shape, and its own rule engine. The "dataflow not getting the result you want" is the downstream symptom — measurements get reshaped 4–5 times between the Detection Editor and the Excel output, and every reshape is a place where a field silently drops or renames (the `net_siding_sqft` mapping bug fixed in `dce3c39` was exactly this).

**Single most important finding:** The Bluebeam path doesn't have its own pipeline — it *impersonates* the HOVER path. The n8n "Approve from Detection Editor" workflow stores Bluebeam data into a table literally named `cad_hover_measurements` and sets `extraction_id = job_id` as a flag to trick the Multi-Trade Coordinator into branching down the CAD path. That hack is the epicenter of the confusion.

**Second most important:** The v1→v2 database transition that was supposed to end **December 17, 2025 is now ~6 months overdue**, and worse, it never actually completed — the production calc API still reads `siding_auto_scope_rules` (v1-style) while n8n reads `auto_scope_rules_v2`. Two rule engines are live simultaneously, which is a known contributor to the MN568 flashing-deduplication gap.

---

## 1. The Three Input Flows (and why they're confusing)

| | Flow A: HOVER | Flow B: Bluebeam/Plans | Flow C: Manual CAD Markup |
|---|---|---|---|
| Entry component | `HoverUploadStep.tsx` | `BluebeamFreshImportModal.tsx` | `CADMarkupStep.tsx` |
| Storage bucket | `hover-pdfs` | (extraction-api handles) | `project-pdfs` |
| Processing | n8n text/Vision extraction | `bluebeam_fresh_import_service.py` | None (manual polygons) |
| Sync model | **Synchronous** — frontend waits up to 120s for Excel in the HTTP response (see `app/api/n8n/[...path]/route.ts` timeout) | Async — detections land in `extraction_detections_draft`, user reviews in Detection Editor | Client-side only, saved to `cad_markups` |
| Lands in | `projects` + webhook payload, never the Detection Editor | `extraction_detections_draft` → Detection Editor → approve | `cad_markups` table, dead-ends (CSV/JSON export only) |
| Measurement record | Webhook JSONB payload | `cad_hover_measurements` (misleadingly named) + `extraction_job_totals` | `cad_markups.markup_data` JSONB |
| Rule engine reached | n8n evaluates `auto_scope_rules_v2` + hardcoded pricing | Railway API evaluates `siding_auto_scope_rules` | None |

### Specific problems

**1.1 — The `extraction_id = job_id` hack.** "Approve from Detection Editor" sets `extraction_id = job_id` so the Multi-Trade Coordinator's implicit branch ("is there an extraction_id? → CAD path") routes correctly. This is control flow encoded as data mutation. Anyone (including future you) reading the Coordinator cannot tell why a project takes one branch vs the other without knowing this convention.

**1.2 — `cad_hover_measurements` is a lie.** The table name says HOVER; the data in it is Bluebeam/CAD-derived for the Bluebeam path. Two structurally different sources funnel into one JSONB blob with no `source_type` column, so downstream code can't reason about provenance — which directly violates your own Key Principle #2 (full provenance).

**1.3 — HOVER flow bypasses the Detection Editor entirely.** The Bluebeam flow has a human review step (Detection Editor → approve); the HOVER flow goes straight from upload to Excel synchronously. That means: two different validation standards, two different payload shapes hitting the Coordinator, and the HOVER path can't benefit from any Detection Editor improvements (material assignment, counts, corrections).

**1.4 — Flow C is orphaned.** `CADMarkupStep` produces `cad_markups` rows that never reach the calculation engine. Per FRONTEND_ANALYSIS, there is also still no UI for the Roboflow construction-plan flow (`/start-job`) — Bluebeam import partially filled this gap, but the dead code and dead tables from Flow C remain in the repo and schema.

**1.5 — Synchronous vs async split.** The HOVER path's "wait 2 minutes for an Excel buffer in the HTTP response" model is fragile (n8n restarts, Railway cold starts, big PDFs) and architecturally incompatible with the async Detection Editor model. One of these models has to win.

### Recommendation: one pipeline, many importers

Declare the **Bluebeam/Detection Editor path the canonical pipeline** (it's the validated one — 96.5% on MN568) and demote HOVER from "parallel pipeline" to "just another importer":

```
HOVER PDF importer  ──┐
Bluebeam BAX importer ─┼──► extraction_detections_draft + extraction_job_totals
Roboflow ML importer ──┘            │
                                    ▼
                          Detection Editor (review/approve — ALWAYS)
                                    ▼
                     project_measurements (renamed, with source_type column)
                                    ▼
                     ONE n8n route → ONE Railway calc endpoint → Excel
```

Concretely:
- Build a small HOVER importer (extraction-api or n8n) that parses the HOVER PDF into `extraction_detections_draft`/`extraction_job_totals` rows exactly like the Bluebeam importer does. HOVER measurements are pre-validated, so the Detection Editor review can be a 30-second confirm — but everything flows through one gate.
- Replace `cad_hover_measurements` with `project_measurements` (or add columns): `source_type TEXT CHECK (source_type IN ('hover','bluebeam','roboflow','manual'))`, `extraction_job_id UUID`, structured columns for the canonical measurement set instead of an opaque JSONB blob.
- Replace the `extraction_id = job_id` hack with an explicit `pipeline_path` or just delete the branch entirely once both sources produce the same payload.
- Kill the synchronous Excel response. Approve → calculate → store Excel in Supabase Storage → Realtime/poll for `status = 'complete'` → download link. The proxy route's 120s timeout disappears as a failure mode.
- Either wire `cad_markups` into the importer pattern or delete Flow C (component, bucket, table). It's currently maintenance surface with zero output value.

---

## 2. Database Cleanup

### 2.1 — Overdue deletions (the Dec 17, 2025 deadline never executed)

Deprecated per SYSTEM_STATE.md, still presumably present:

| Object | Replacement | Action |
|---|---|---|
| `auto_scope_rules` (table) | `auto_scope_rules_v2` | Archive to CSV, then DROP |
| `material_assemblies` (table) | `material_components` | Archive, DROP |
| `v_calculation_rules_active` (view) | `v_calculation_rules_v2` | DROP |
| `v_accessories_section` (view) | `v_accessories_section_v2` | DROP |
| `material_assemblies_flat` (view) | `v_material_components_flat` | DROP |

The migration file `migrate_stone_veneer_rules_to_siding.sql` proves rules were *still being mistakenly inserted into the old `auto_scope_rules` table* after deprecation — the longer these tables exist, the more wrong-table inserts accumulate.

### 2.2 — The dual rule engine (CRITICAL — this affects your output)

The deeper issue isn't v1 vs v2 — it's that **the documented v2 architecture and the production reality diverged**:

- Railway `autoscope-v2.ts` reads **`siding_auto_scope_rules`** (per the Mar 3 violation report and your own MATERIAL_ONBOARDING SOP, which documents both tables as live).
- n8n Multi-Trade Coordinator reads **`auto_scope_rules_v2`**.
- Your project instructions say "always v2, never v1" — but the calc engine that produces the actual takeoff doesn't comply.

Consequences: a rule added to one table doesn't fire in the other path; rules in both tables can double-fire (this is plausibly part of the flashing-count deduplication item in your MN568 gap); and every rule change requires remembering which engine consumes it.

Plus four more per-trade rule tables (`labor_auto_scope_rules`, `gutters_auto_scope_rules`, `roofing_auto_scope_rules`, `windows_auto_scope_rules`) that fragment the same concept further.

**Fix:** one `auto_scope_rules_unified` table (the Mar 3 report already drafted the schema — it's good), Railway API reads only it, n8n evaluates **zero** rules. This is the single highest-leverage consolidation in the whole system.

### 2.3 — Missing tables (business logic stranded in code)

| Missing | Currently hardcoded in | Impact |
|---|---|---|
| `calculation_constants` | `orchestrator-v2.ts:123-129` (MARKUP_RATE=0.26, L&I 12.65%, insurance $24.38/k, crew size) | Changing Mike Skjei constants requires a production deploy |
| `presentation_group_config` | `getPresentationGroup()` 60+ line mapping in orchestrator + duplicated in frontend | Misconfigured groups silently drop line items (known bug) |
| Detection-item pricing rows | n8n `detectionPricing` object ($45 corbel, $35 bracket, $120 shutter…) | Prices invisible to pricing snapshots, no audit trail, violates immutable-snapshot principle |
| Belly band pricing rows | n8n `bellyBandPricing` object | Same |

These violate your own Principle #1 (database-first) and #3 (immutable snapshots). The Mar 3 report's Phase 1 SQL for these is ready to run — it's a no-deploy fix.

### 2.4 — Hardcoded duplicates in the Railway API

`src/constants/siding.ts` carries `LABOR_RATES`, `OVERHEAD_RATES`, `TRIM_SKUS`, `AUTO_SCOPE_SKUS` — all duplicating database tables. `src/services/labor.ts` has `FALLBACK_LABOR_RATES`. Any of these can silently win over the DB value depending on code path, which is exactly the class of "I changed the database but the output didn't change" mystery that makes the dataflow feel unresponsive.

### 2.5 — Table-family overlap to rationalize

Two parallel families describing the same domain:

- `extraction_*` family: `extraction_jobs`, `extraction_pages`, `extraction_detections_draft`, `extraction_detections_validated`, `extraction_job_totals` — **keep, this is the canonical pipeline**
- `cad_*` / `bluebeam_*` family: `bluebeam_projects`, `cad_markups`, `cad_hover_measurements`, `cad_material_callouts`, `cad_layer_mappings` — fold `cad_hover_measurements` into a properly-named `project_measurements`; audit the rest for actual usage (SQL below) and drop the dead ones.

### 2.6 — Known landmines to fix while you're in there

- JSONB booleans stored as strings vs true — enforce one representation with a migration + CHECK, then delete the `isTrue()`/`isFalse()` workaround helpers
- `extraction_job_totals` unique on `job_id` — standardize all writers on upsert
- `siding_squares` GENERATED column — add a code-review lint/comment; it keeps biting
- Silent INSERT failures — every pipeline INSERT should check the response and write to an `pipeline_errors` log table

---

## 3. Why the Dataflow Isn't Giving You the Result You Want

Trace a single measurement (say, net siding SF) from screen to spreadsheet today:

```
1. Detection Editor state (Konva)            shape: detection objects
2. buildApprovePayload() / buildDetectionCounts()   shape: approve payload
3. n8n "Approve from DE" → cad_hover_measurements   shape: JSONB blob (renamed fields)
4. n8n Multi-Trade "Transform CAD to Measurements"  shape: coordinator format
5. n8n → Railway webhook                            shape: WebhookMeasurements
6. buildMeasurementContext()                        shape: MeasurementContext
   (requires flattening detection_counts — known trap)
7. Formula evaluation → line items → Excel
```

**Five reshapes, three owners (frontend, n8n, API), zero shared schema.** Every reshape is hand-maintained field mapping. The bugs you've already hit — `net_siding_sqft` mapping (`dce3c39`), `detection_counts` flattening, `MeasurementContext` variable aliasing (`facade_sqft` vs `facade_area_sqft` vs `gross_wall_area_sqft`), silent `presentation_group` drops — are not independent bugs. They are the same bug, recurring at different reshape boundaries.

Then the result gets computed by **two rule engines** (§2.2) with **three pricing sources** (DB `pricing_items`, n8n hardcoded objects, API hardcoded constants). When the output is wrong, you currently have to check seven stages × two engines × three price sources. That's why debugging requires emoji-marker log archaeology.

**Fix (in order of leverage):**

1. **One canonical measurement contract.** Define a single TypeScript type (and matching JSON Schema) — essentially your existing `WebhookRequest` — as THE shape. The Detection Editor emits it. The HOVER importer emits it. n8n passes it through *untouched* (routing only, per the Mar 3 target architecture). `buildMeasurementContext()` consumes it directly. Reshapes go from 5 to 1.
2. **Pick one alias per measurement and delete the rest.** `MeasurementContext` having `facade_sqft` AND `facade_area_sqft` means formulas in the rules tables reference both, and a future refactor breaks half of them invisibly. Migrate formulas to canonical names with an UPDATE, drop the aliases.
3. **Move spatial containment out of n8n** into the API (or a small endpoint on extraction-api). Polygon math in a workflow node is undebuggable and untestable.
4. **Validate at the boundary.** Railway API should reject (HTTP 400 with named missing fields) any payload missing required measurements rather than computing with undefined → 0 → silently small takeoff. A lot of "result I'm not looking for" is zeros that should have been errors.

---

## 4. Recommended Sequencing (Strangler Fig — no rewrite)

This intentionally aligns with the Mar 3 migration plan, resequenced for your current priority (pilots + MN568 closure):

| Phase | Work | Deploys? | Est. effort | Why this order |
|---|---|---|---|---|
| **0** | Decision: Bluebeam/Detection-Editor path is canonical; HOVER becomes an importer | None | 0 days | Everything below depends on this call |
| **1** | DB-only: seed detection/belly-band pricing into `pricing_items`; create `calculation_constants` + `presentation_group_config`; run usage-audit SQL (§6) | None | 1–2 days | Kills 2 of 3 CRITICAL violations with zero deploy risk |
| **2** | Consolidate to `auto_scope_rules_unified`; point Railway at it; strip rule evaluation from n8n | API + n8n | 3–5 days | Removes dual-engine ambiguity — likely closes part of the MN568 dedup gap |
| **3** | Canonical measurement contract; n8n becomes pass-through; boundary validation in API; remove `extraction_id=job_id` hack | API + n8n + frontend | 5–7 days | Collapses the 5-reshape pipeline |
| **4** | HOVER importer → Detection Editor flow; kill synchronous Excel; rename `cad_hover_measurements` → `project_measurements` w/ `source_type` | All | 5–7 days | Unifies the flows for real |
| **5** | Drop v1 tables/views (6 months overdue), dead `cad_*` tables, Flow C if unused; remove hardcoded constants from `siding.ts`; move Excel gen to API | All | 3–4 days | Cleanup last — only delete after Phases 2–4 prove nothing reads it |

**Regression gate for every phase:** run MN568 (`240e222e-0419-421c-97fa-18a691b40cdb`) before and after; Excel output must match to the penny (target $19,333, current $18,657). Suggest also adding Keith Ragasa / Dave Rych / John Short as secondary regression projects before Phase 3, since a single baseline can mask compensating errors.

---

## 5. What I Could Not Verify (and how you can)

- **Live n8n workflow contents** — the hardcoded pricing objects are documented but I couldn't read the current workflow JSON. Export "Multi-Trade Coordinator" and "Approve from Detection Editor" from Railway n8n and confirm the `detectionPricing` / `bellyBandPricing` objects are still present before treating Phase 1 SQL as the fix.
- **Actual table usage** — whether `cad_markups`, `cad_material_callouts`, `bluebeam_projects` etc. have live rows or recent writes. Run §6.
- **Whether anything still reads v1 tables** — Supabase doesn't log per-table reads easily, but `pg_stat_user_tables` gives scan counts since last stats reset.

---

## 6. Ground-Truth Audit SQL (run in Supabase SQL Editor)

```sql
-- 6.1 Row counts + last activity for every suspect table
SELECT relname AS table_name,
       n_live_tup AS approx_rows,
       seq_scan + idx_scan AS total_reads_since_stat_reset,
       n_tup_ins AS inserts,
       n_tup_upd AS updates
FROM pg_stat_user_tables
WHERE relname IN (
  'auto_scope_rules','material_assemblies',            -- deprecated v1
  'siding_auto_scope_rules','auto_scope_rules_v2',     -- dual engines
  'labor_auto_scope_rules','gutters_auto_scope_rules',
  'roofing_auto_scope_rules','windows_auto_scope_rules',
  'cad_markups','cad_hover_measurements',
  'cad_material_callouts','cad_layer_mappings','bluebeam_projects',
  'extraction_jobs','extraction_detections_draft','extraction_job_totals'
)
ORDER BY total_reads_since_stat_reset DESC;

-- 6.2 Rules that exist in BOTH engines (double-fire risk)
SELECT s.rule_name, s.material_sku
FROM siding_auto_scope_rules s
JOIN auto_scope_rules_v2 v
  ON LOWER(s.rule_name) = LOWER(v.rule_name)
   OR (s.material_sku IS NOT NULL AND s.material_sku = v.material_sku)
WHERE s.active = true AND v.active = true;

-- 6.3 Rules referencing SKUs that don't exist in active pricing
SELECT r.rule_name, r.material_sku, 'siding_auto_scope_rules' AS source
FROM siding_auto_scope_rules r
LEFT JOIN pricing_items p ON p.sku = r.material_sku
WHERE r.active = true AND r.material_sku IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT r.rule_name, r.material_sku, 'auto_scope_rules_v2'
FROM auto_scope_rules_v2 r
LEFT JOIN pricing_items p ON p.sku = r.material_sku
WHERE r.active = true AND r.material_sku IS NOT NULL AND p.id IS NULL;

-- 6.4 Sanity: exactly one active pricing snapshot
SELECT COUNT(*) AS active_snapshots FROM pricing_snapshots WHERE active = true;

-- 6.5 JSONB boolean-as-string contamination in v2 rules
SELECT rule_name, trigger_condition
FROM auto_scope_rules_v2
WHERE trigger_condition::text ~ '"(true|false)"'
LIMIT 50;

-- 6.6 Views still depending on deprecated tables (blocks safe DROP)
SELECT DISTINCT dependent_view.relname AS view_name, source_table.relname AS depends_on
FROM pg_depend d
JOIN pg_rewrite r ON d.objid = r.oid
JOIN pg_class dependent_view ON r.ev_class = dependent_view.oid
JOIN pg_class source_table ON d.refobjid = source_table.oid
WHERE source_table.relname IN ('auto_scope_rules','material_assemblies')
  AND dependent_view.relname <> source_table.relname;
```

---

## 7. One-Page Answer

- **The confusion** isn't HOVER vs plans — it's that the plans flow *pretends to be* the HOVER flow via `cad_hover_measurements` + the `extraction_id = job_id` flag. Make the Detection Editor pipeline canonical and turn HOVER into an importer that feeds it.
- **The database cleanup** is three jobs: (a) execute the 6-months-overdue v1 deletion, (b) collapse 6 rule tables into 1 and make the API its only reader, (c) move the four stranded pricing/constants sets out of n8n and API code into tables — Phase 1 is pure SQL, no deploys.
- **The dataflow problem** is 5 hand-maintained reshapes across 3 owners feeding 2 rule engines and 3 pricing sources. Cut reshapes to 1 with a canonical contract, engines to 1, pricing sources to 1, and add hard validation at the API boundary so missing fields become errors instead of zeros.
- **Don't start with the rewrite urge** — every phase here is shippable independently and gated by MN568 regression.
