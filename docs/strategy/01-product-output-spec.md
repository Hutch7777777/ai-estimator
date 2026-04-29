# 01 — Product Output Spec

**Audience:** anyone touching this repo (engineer, AI agent, PM)
**Purpose:** define the unchanging contract between the system and its user — the artifact a contractor pays the system to produce. Every architectural choice downstream must preserve this contract.

---

## Current behavior

The system converts a construction PDF plan into a multi-tab `.xlsx` estimate for a James Hardie siding contractor.

### Product scope (today)

- Single vertical: **James Hardie siding installations** on residential projects in the **~$20–25k** range.
- Business goal: reduce estimator's desk time from **~45 minutes per plan → ~5 minutes**.
- Multi-tenant via Supabase organizations; roles: `owner`, `admin`, `estimator`, `viewer`.
- **Reference project: `MN568`** is the always-on regression fixture — every calculation change is validated against it before merge.

### Output contract — Excel estimate

Generated via **ExcelJS**, currently authored at `lib/utils/exportTakeoffExcel.ts` (frontend) and partially also in n8n (see contradiction below). The Excel has:

- **7 canonical presentation groups (spec):** `cladding`, `trims`, `metals_flashings`, `waterproofing`, `accessories`, `soffit`, `gutters`.
  - **Spec vs. live-data distinction:** the 7 above are the *canonical spec* — the values the regression baseline reports under `presentation_group_totals` and the values future-emitted line items should resolve to. Live data in `siding_auto_scope_rules` and historical `takeoff_line_items` contains additional non-canonical values (e.g. `Belly Band`, `Window Trims`, `Architectural Details`, `Flashing & Weatherproofing`). The mapping from observed → canonical is owned by `docs/strategy/phase-1-presentation-group-contract.md`. Phase 1.3 will land a forward-only remap (no historical rewrites) so that future emissions normalize to the canonical 7.
  - **Non-material buckets** (`labor`, `overhead`, `unmatched_items`, `review_required`) are tracked separately and MUST NOT contribute to `presentation_group_totals`. See the contract doc.
- **Paint table** rendered separately (purple styling) — items match `category = 'paint'`, or `presentation_group` containing 'paint', or paint-keyword description match.
- **Per-square economics columns** on each line: sell price/sq, sub payout/sq, profit/sq, margin% (recently shipped — commits `3f20...`, `4391...`).
- **Cost summary** with overhead, L&I (12.65% of labor subtotal), insurance, mobilization, port-a-john, markup.
- **Provenance** preserved upstream in `takeoff_line_items.source_measurement` JSONB so every cell is traceable to a source detection or extraction payload.

### Calculation contract — load-bearing formulas

These outputs are mechanically derived from these formulas; if any drifts, MN568 fails.

- **Net siding:** `net_siding_sf = building_area_sf − total_openings_sf + gable_area_sf`
- **Polygon area:** Shoelace formula in pixel space, then divided by `scaleRatio²` (per-page scale, not job-level)
- **Corners (standard):** `quantity_pieces = CEILING(corner_count × wall_height_ft / piece_length_ft × waste_factor)` — angles assumed 90°
- **Trim (12 ft pieces):** `CEILING(trim_total_lf / 12 × 1.10)` (10% waste)
- **Caulk (tubes):** `CEILING(trim_total_lf / 40)`
- **Fasteners (boxes):** `CEILING(trim_total_lf / 100)`
- **WRB rolls:** `CEILING(facade_sqft / coverage_sf_per_roll × waste_factor)`
- **Labor:** squares-based — `facade_sqft / 100` (1 SQ = 100 SF)
- **L&I insurance:** **12.65%** applied to labor subtotal

### In-app companion outputs (not the contracted artifact, but expected)

- AG Grid estimate editor at `/projects/[id]`
- Takeoff Viewer at `/takeoffs/[id]` with materials/labor/paint tables
- RFI email generation (Claude-backed)
- Plan Intelligence panel for AI-assisted plan reading

### Canonical source per field (for MN568 regression baseline)

The Excel and the in-app Takeoff Viewer are **renderings**, not the source of truth. The MN568 regression harness (Phase 0.5/0.6) compares against the post-approval database state. If Excel and DB ever disagree, the Excel is wrong by definition.

| Baseline field | Canonical source | Notes |
|---|---|---|
| `project.id` / `project.name` | `projects` row | |
| `detection_counts.<class>` | `extraction_detections_validated` grouped by `class` (fall back to `extraction_detections_draft`) | Detection priority: draft → validated → ai_original |
| `net_siding_sf` | `cad_hover_measurements.net_siding_sf` (or computed: `facade_total_sqft − openings_area_sqft + gable_area_sf`) | Per-page scale already applied |
| `trim_lf` | `cad_hover_measurements` total trim LF | Sum of head/jamb/sill if not stored as one column |
| `siding_squares` | `net_siding_sf / 100`, rounded per production formula | |
| `material_subtotal` | `SUM(takeoff_line_items.material_extended)` for the takeoff | |
| `labor_subtotal` | `SUM(takeoff_line_items.labor_extended)` for the takeoff | |
| `overhead_subtotal` | `takeoffs.overhead_total` (or sum of overhead-category line items) | |
| `markup_percent` | `takeoffs.markup_percent` | Phase 1 will source from `calculation_constants.markup_rate` |
| `final_total` | `takeoffs.final_total` | The customer-facing number |
| `line_item_count` | `COUNT(takeoff_line_items)` for the takeoff | |
| `presentation_group_totals.<group>` | `SUM(takeoff_line_items.total_extended) GROUP BY presentation_group` | One sum per canonical group |

Operational details (SQL templates, capture procedure, refresh procedure) live in `test-data/README.md`.

---

## Target behavior

Same Excel contract — this is the artifact and it does not change. Targets focus on making it **provably correct** and **trivially diffable**:

- **MN568 baseline expanded** to capture per-category subtotals (cladding total, trims total, metals total, etc.) plus the cost summary block. Any future calc change diffs cleanly against this baseline before merge.
- **Trim variables fully wired through n8n** so trim rules cannot silently produce zero (currently a Tier-1 risk — see `04-known-risks-and-debt.md`).
- **Edge classification** added at the detection layer to close the documented 5–15% trim over-estimate (corner/window/door perimeter currently double-counted).
- **Single owner for Excel generation** (target: API only — see `03-target-architecture.md`).
- **Per-square economics columns stable** across runs — same project produces the same numbers.
- **Address-optional projects** generate an Excel even when `address` is missing (column derivation is downstream of address-based heuristics in some paths).

---

## Non-goals

- Changing the 7 canonical presentation groups
- Changing the Excel format, tab structure, or visual styling
- Replacing ExcelJS with another library
- Adding new estimate-document formats (PDF estimate, web-only estimate, etc.)
- Multi-trade Excel layout (roofing, windows, gutters live in `trade_configurations` but are out of scope for the current single-vertical contract)

---

## Known contradictions / uncertainty

- **Excel generation location:** `00-project-overview.md` says ExcelJS lives in the frontend (`lib/utils/exportTakeoffExcel.ts`, 61 KB). `ARCHITECTURE_VIOLATION_REPORT.md` says Excel generation runs in **n8n** and should move to API. Reality is most likely both — frontend export for in-app download, n8n export for async workflow output. Both copies must agree on the contract above. Reconciled in `03-target-architecture.md` (target: API only) and `05-implementation-roadmap.md` (Phase 5).
- **Presentation_group taxonomy stability:** `04-estimating-business-rules.md` lists 7 canonical groups. `07-roadmap.md` notes new `presentation_group` values still appear in commits, which means either the taxonomy is evolving silently or some rules emit non-canonical values that get folded back during render. This must be reconciled before Phase 1 of the roadmap (DB-backed `presentation_group_config`).

---

## Open questions

- Is the **per-square economics** spec frozen, or are columns expected to evolve (e.g. add overtime cost per square)?
- For **multi-page construction PDFs** (vs. HOVER reports), what is the contracted output? `FRONTEND_ANALYSIS.md` flags that the upload UI for these doesn't exist yet — until it does, the output contract for that input class is undefined.
- Does **MN568** need versioning? If business rules change deliberately, the baseline must be re-snapshotted — there's currently no documented procedure for that.

---

## Source citations

- `docs/ai-context/00-project-overview.md` — product scope, target metrics, MN568, multi-tenancy
- `docs/ai-context/04-estimating-business-rules.md` — formulas, presentation groups, paint handling, L&I rate
- `docs/ai-context/07-roadmap.md` — recently-shipped per-square economics, 7-group consolidation
- `ARCHITECTURE_VIOLATION_REPORT.md` — Excel-location contradiction, taxonomy concerns
