# test-data — MN568 regression harness operator runbook

This directory holds the inputs and outputs used by the MN568 regression harness (`scripts/validate-mn568-baseline.ts`, npm script `validate:mn568`). It is read-only at runtime — the harness only ever reads files here, never writes.

## Layout

```
test-data/
├── baselines/
│   └── MN568.expected.json     ← canonical "good" output; checked in
└── runs/
    └── MN568.actual.json       ← canonical Phase 0.7 reproducer; checked in (see below)
```

### Why `runs/MN568.actual.json` is committed

`test-data/runs/MN568.actual.json` is **intentionally committed** as the canonical Phase 0.7 reproducer. It is byte-equivalent to the expected baseline at the moment of commit, so a fresh checkout can run `npm run validate:mn568` and get **PASS** without needing production DB access, Supabase credentials, or a manual capture. This makes the regression harness a single-command runnable on any developer machine or CI environment.

### Operator rules for `runs/`

- **Do not overwrite the committed `MN568.actual.json`** with a new capture. That file is the locked Phase 0.7 reproducer; overwriting it blurs "captured truth" vs "current run" and risks accidentally promoting a broken capture into the canonical reproducer.
- **For ad-hoc operator captures**, use a date-stamped filename:
  - `test-data/runs/MN568.actual.2026-04-28.json`
  - `test-data/runs/MN568.actual.<YYYY-MM-DD>.json`
- **Or pass an explicit path via CLI**: the validator accepts `--actual <path>` (see `scripts/validate-mn568-baseline.ts`) so operator captures can live anywhere without polluting the committed reproducer.
- **Refreshing the canonical reproducer** (`MN568.actual.json`) is a deliberate baseline-refresh action — same procedure as refreshing `MN568.expected.json` per Step 7 below. It is forbidden to refresh either silently to make a failing validator green.

---

## Phase 0.6 — Capture instructions

This is the runbook for populating `MN568.expected.json` with real numbers (today the file is a TEMPLATE — see BLOCKER section below).

### Step 1 — Identify canonical source per field

The harness compares against the **post-approval database state**, because that is what the contractor receives:

| Field in baseline | Canonical source |
|---|---|
| `project.id`, `project.name` | `projects` row (`id` = MN568's project id, `name` column) |
| `detection_counts` (per class) | `extraction_detections_validated` for the MN568 extraction job, grouped by `class` (or `extraction_detections_draft` if validated rows haven't been promoted) |
| `net_siding_sf` | `cad_hover_measurements` row where `extraction_id = MN568's job_id`, column `net_siding_sf` (or computed: `facade_total_sqft − openings_area_sqft + gable_area_sf`) |
| `trim_lf` | `cad_hover_measurements` row, total trim LF (sum of head/jamb/sill if not stored as a single column) |
| `siding_squares` | `net_siding_sf / 100`, rounded per the production formula |
| `material_subtotal` | `SUM(takeoff_line_items.material_extended) WHERE takeoff_id = <MN568 takeoff>` |
| `labor_subtotal` | `SUM(takeoff_line_items.labor_extended) WHERE takeoff_id = <MN568 takeoff>` |
| `overhead_subtotal` | `takeoffs.overhead_total` (or sum of overhead-category line items) |
| `markup_percent` | `takeoffs.markup_percent` |
| `final_total` | `takeoffs.final_total` |
| `line_item_count` | `COUNT(takeoff_line_items) WHERE takeoff_id = <MN568 takeoff>` |
| `presentation_group_totals.<group>` | `SUM(total_extended)` grouped by `takeoff_line_items.presentation_group` |

The Excel export is **not** the canonical source; it is a rendering of these rows. If Excel and DB disagree, Excel is wrong by definition. (See `docs/strategy/01-product-output-spec.md`.)

### Step 2 — Run MN568 through the production approval flow

1. Open the MN568 project in the Detection Editor at `/projects/<MN568 id>/extraction/<job id>`.
2. Confirm detections are reviewed and trade selections are correct.
3. Click "Approve" — this triggers the n8n `approve-detection-editor` workflow (V9.2), which writes `takeoffs` / `takeoff_sections` / `takeoff_line_items` for this project.
4. Wait for completion (a few seconds; the takeoff page becomes viewable).
5. Note the resulting `takeoffs.id` — required for the SQL queries below.

> **Do not** capture from the local verification route (`/api/estimating/calculate-siding`) for the canonical baseline. That route is a parallel verification mirror; the production path is what contractors receive. Once Phase 1+ is complete and the local engine becomes the production calculation owner, this guidance changes.

### Step 3 — Capture aggregates

Run these queries in Supabase SQL editor (substitute `<TAKEOFF_ID>` and `<JOB_ID>`). The output is what gets reshaped into `MN568.actual.json`.

```sql
-- 3a. Top-level takeoff numbers
SELECT
  id AS takeoff_id,
  project_id,
  markup_percent,
  final_total,
  total_material AS material_subtotal,
  total_labor AS labor_subtotal,
  overhead_total AS overhead_subtotal
FROM takeoffs
WHERE id = '<TAKEOFF_ID>';

-- 3b. Line item count
SELECT COUNT(*) AS line_item_count
FROM takeoff_line_items
WHERE takeoff_id = '<TAKEOFF_ID>';

-- 3c. Presentation group totals
SELECT
  presentation_group,
  SUM(total_extended) AS group_total
FROM takeoff_line_items
WHERE takeoff_id = '<TAKEOFF_ID>'
GROUP BY presentation_group
ORDER BY presentation_group;

-- 3d. Detection counts by class
SELECT class, COUNT(*) AS count
FROM extraction_detections_validated
WHERE extraction_job_id = '<JOB_ID>'
GROUP BY class
ORDER BY class;
-- Fallback if validated table is empty: query extraction_detections_draft instead.

-- 3e. Measurements (raw)
SELECT
  facade_total_sqft,
  openings_area_sqft,
  gable_area_sf,
  net_siding_sf,
  -- adjust column names to match your schema:
  total_trim_lf
FROM cad_hover_measurements
WHERE extraction_id = '<JOB_ID>';
```

> Column names above mirror the contract documented in `docs/strategy/01-product-output-spec.md`. If any column doesn't exist in the live schema, capture the equivalent and document the mapping in this file. Do **not** modify the schema during Phase 0.6.

### Step 4 — Build `MN568.actual.json`

Reshape the SQL output into the exact schema of `test-data/baselines/MN568.expected.json`. Save to `test-data/runs/MN568.actual.json`. The `_meta` block can be omitted in the actual file (the validator ignores it), but keeping a small `_meta.captured_at` ISO timestamp is recommended for traceability.

Example skeleton:

```json
{
  "_meta": { "captured_at": "2026-04-27T18:00:00Z", "captured_by": "<name>", "takeoff_id": "<TAKEOFF_ID>" },
  "project": { "id": "MN568", "name": "<actual project name>" },
  "detection_counts": { "window": <n>, "door": <n>, ... },
  "net_siding_sf": <n>,
  "trim_lf": <n>,
  "siding_squares": <n>,
  "material_subtotal": <n>,
  "labor_subtotal": <n>,
  "overhead_subtotal": <n>,
  "markup_percent": <n>,
  "final_total": <n>,
  "line_item_count": <n>,
  "presentation_group_totals": {
    "cladding": <n>, "trims": <n>, "metals_flashings": <n>,
    "waterproofing": <n>, "accessories": <n>, "soffit": <n>, "gutters": <n>
  }
}
```

### Step 5 — Validate against the current template

```bash
npm run validate:mn568
```

While the baseline is still a TEMPLATE (all numerics are zero), every field will report drift. That's expected. The point of running the validator at this stage is to confirm the actual file's **shape** matches — every documented field is present and typed correctly.

### Step 6 — Promote actual → expected (the baseline cutover)

Once the actual file is reviewed by an engineer **and** by the contractor-business owner (pricing values are silent Tier-1 risks per `docs/strategy/04-known-risks-and-debt.md`), copy it onto the baseline:

```bash
cp test-data/runs/MN568.actual.json test-data/baselines/MN568.expected.json
```

Edit the resulting baseline to:
- Restore the full `_meta` block from the original template (the documentation is load-bearing for future operators).
- Update `_meta.status` from `"TEMPLATE — ..."` to `"BASELINE — captured <date> from takeoff <id>; refresh procedure documented in test-data/README.md"`.

Run the validator one more time:

```bash
npm run validate:mn568
```

Should print **PASS**. Commit the baseline change with a descriptive message; this is the moment Phase 1 becomes unblocked.

### Step 7 — Refresh procedure (when business rules change deliberately)

The baseline is frozen until business rules change deliberately (e.g. the contractor changes markup, or new auto-scope rules ship). To refresh:

1. Make the deliberate rule/data change.
2. Re-run MN568 through approval (Step 2).
3. Capture a new actual (Steps 3–4).
4. Have the contractor-business owner sign off on the new numbers.
5. Promote actual → expected (Step 6).
6. Update `_meta.status` with the new captured date and the reason for the refresh.
7. Commit, with a description that explains what changed and why.

**Never refresh the baseline silently to "make the failing test pass."** A failing validator on the canonical MN568 baseline is the correct signal — investigate the drift before deciding whether the new numbers are intended.

---

## BLOCKER — RESOLVED 2026-04-27 (Phase 0.7)

`test-data/baselines/MN568.expected.json` was promoted from TEMPLATE to BASELINE on **2026-04-27** by Anthony Hutchinson, capturing takeoff `1cca55ae-64e4-42ee-b6fc-241cbd92df53` (project `f7e2fc2b-33c1-48f2-bae6-ebff37fbe346`, job `240e222e-0419-421c-97fa-18a691b40cdb`).

**Important framing:** the captured values are a **frozen snapshot of CURRENT system behavior**, reviewed for regression protection before Phase 1. They are NOT a claim that the estimate is business-correct, contractor-final, or business-validated. The baseline's job is to detect *change*, not to assert *correctness*.

`npm run validate:mn568` now exits 0 against the captured actual file. Phase 1 is unblocked.

A meaningful refresh of this baseline (when business rules change deliberately) follows Step 7 above. A silent refresh "to make the failing test pass" remains forbidden — see Step 7's warning.

---

## Last validator run (recorded for reference)

```
$ npm run validate:mn568

> ai-estimator@0.1.0 validate:mn568
> tsx scripts/validate-mn568-baseline.ts


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ MN568 regression: PASS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   expected: test-data/baselines/MN568.expected.json
   actual:   test-data/runs/MN568.actual.json
   epsilon:  0
```

Exit code: **0**. Recorded 2026-04-27 after Phase 0.7 promoted the captured MN568 baseline (takeoff `1cca55ae-64e4-42ee-b6fc-241cbd92df53`, reviewed by Anthony Hutchinson for regression protection — not business-validated). Any future PR that touches calculation, pricing, n8n workflows, or schema must keep this exit at 0.
