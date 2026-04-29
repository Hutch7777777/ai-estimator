# 02 — Current System Map

**Audience:** anyone debugging a production issue or planning a change that crosses service boundaries
**Purpose:** map every service, transport, and calculation owner as they exist today. This is descriptive (what is), not prescriptive (what should be — that lives in `03-target-architecture.md`).

---

## Current behavior

### Production services (7)

| # | Service | Where | Notes |
|---|---|---|---|
| 1 | **ai-estimator** (Next.js 16 + API routes) | Railway | Pushes to `main` auto-deploy. Hosts the App Router app, all in-app API routes, the n8n proxy, the new local engine port |
| 2 | **Supabase Cloud** | `okwtyttfqbfmcqtenize` | PostgreSQL + Auth + Realtime + Storage (PDFs). Multi-tenant via `organizations` |
| 3 | **n8n** | Railway | Async orchestration. Workflows live in n8n UI, NOT in this repo |
| 4 | **Extraction API** (Python) | Railway | Geometry/measurement endpoints called from n8n: `/wall-heights`, `/calculate-linear`, `/siding-polygons`, `/generate-facade-markup`, `/linear-summary` |
| 5 | **Claude Sonnet 4** | Anthropic API | Model id `claude-sonnet-4-20250514`. Used for schedule/floor-plan/wall-assembly/notes/specs extraction and in-app agents |
| 6 | **Roboflow** | Roboflow Cloud | Object detection on elevation pages (windows, doors, garages, gables, walls) |
| 7 | **Replicate** (SAM-2) | Replicate | **Currently disabled** — `/api/sam-segment` returns "unsupported" |

Optional alternative: **Azure Document Intelligence** for schedule extraction.

### Transports

- **HTTPS** for all service-to-service calls
- **Webhook proxy** at `/api/n8n/[...path]` centralizes auth + binary handling + a hard **120-second timeout**
- **Supabase Realtime** for client subscriptions (channels listed below)
- **Supabase REST/PostgREST** for direct DB reads from the host (service-role key for RLS-protected tables)

### n8n workflows (4 key)

Stored in Railway n8n UI; not in this repo. Imported manually.

| Workflow | Trigger | Function |
|---|---|---|
| `project-process` | New project upload | PDF split → Roboflow on elevations → Claude routes for schedules/floor-plan/materials/wall-assemblies/roof/notes/specs |
| `detection-edit-sync` | Detection edit | Recalc totals; webhook returns authoritative numbers; `useDetectionSync` merges optimistic UI state |
| `approve-detection-editor` | "Approve" button (V9.2) | Calls Extraction API for measurements → evaluates auto-scope rules → looks up pricing → inserts `takeoffs` / `takeoff_sections` / `takeoff_line_items` |
| `multi-trade-coordinator` | After approve (V9.3) | Generates `.xlsx` via ExcelJS. **Approaches the 120 s timeout on large jobs.** |

### In-app AI agents (6)

All currently single-request/response — no long-lived sessions; conversation state held in browser.

- **Plan Intelligence** (custom mode in Claude Assistant Panel)
- **Plan Reader** (takeoff mode)
- **Claude Assistant** panel (general)
- **RFI generator** (`/api/generate-rfi`)
- **Material callout extraction** (`/api/extract-material-callouts`)
- **Schedule extraction** (`/api/extract-schedule`)

### Realtime channels

- `extraction_jobs` — job lifecycle
- `extraction_detections_draft` — draft detections (priority source)
- `extraction_detections_validated` — user-validated detections
- `takeoffs` — totals
- `takeoff_sections` — section grouping
- `takeoff_line_items` — line items

Detection priority: `draft → validated → ai_original`. `editingModeRef` gates Realtime writes during user edits to prevent flicker.

### Where calculations actually happen today (calculation owners)

This is the most important table in this doc. **Calculation owner** ≠ where the formula is defined; it's where the numbers are produced at runtime.

| Calculation | Owner today | Owner target | Notes |
|---|---|---|---|
| Polygon area (Shoelace) | Frontend (`lib/utils/polygonUtils.ts`) and Extraction API | API (single owner) | Shoelace replaced bounding-box math in commits `bf02c6b`, `f38839b`. `area_sf` now stored in DB (`extraction_detections_draft.area_sf`) per commit `3a1b295`. |
| Per-page scale conversion | Extraction API + frontend | API | Per-page `extraction_pages.scale_ratio` is canonical. Job-level scale was a prior bug. |
| Auto-scope rule evaluation | Railway API (`autoscope-v2.ts`) AND n8n | API only | Multiple competing rule tables exist (see `04-known-risks-and-debt.md`) |
| Pricing lookup | Railway API + n8n | API only | n8n hardcodes corbel ($45), bracket ($35), shutter ($120), belly band SKUs/prices — NOT in `pricing_items` |
| Calculation constants | Railway API (hardcoded in source) | DB (`calculation_constants`) | `MARKUP_RATE=0.26`, `SOC_UNEMPLOYMENT_RATE=0.1265`, `LI_HOURLY_RATE=3.56`, `INSURANCE_RATE_PER_THOUSAND=24.38`, `DEFAULT_CREW_SIZE`, `DEFAULT_ESTIMATED_WEEKS` |
| Labor rates | Railway API (`FALLBACK_LABOR_RATES`, `LABOR_RATES` hardcoded) | DB (`labor_rates`) | |
| Overhead | Railway API (`OVERHEAD_RATES` hardcoded) | DB (`overhead_costs`) | |
| Trim SKU resolution | Railway API (`TRIM_SKUS` hardcoded) | DB (`pricing_items` + auto-scope rules) | Recently ported to DB-driven in the local engine port (autoscope-v2 `resolveHardieTrimSku`) |
| Auto-scope SKUs | Railway API (`AUTO_SCOPE_SKUS` hardcoded) | DB | |
| Presentation group resolution | Railway API (`getPresentationGroup()` 60+ hardcoded mappings) | DB (`presentation_group_config`) | |
| Excel generation | Frontend (`lib/utils/exportTakeoffExcel.ts`, 61 KB) AND n8n | API | Two copies must agree |
| Spatial containment (which detection is inside which polygon) | n8n | API | Layer leak — should not be in n8n |
| Provenance ledger | DB (`takeoff_line_items.source_measurement` JSONB) | DB | Working as designed |

### Frontend ownership (Detection Editor + hooks)

The frontend has **no major pricing/formula ownership violations**, but the Detection Editor and related hooks are **overloaded with workflow/state responsibilities** that should belong to backend services or thinner presentation hooks.

- `DetectionEditor.tsx` — **1,679 LOC** main orchestrator
- `KonvaDetectionCanvas.tsx` — **953 LOC** canvas
- `useExtractionData.ts` — **755 LOC** central state hook
- `useDetectionSync.ts` — **575 LOC** webhook sync
- 9+ custom hooks coordinate state, optimistic UI, undo/redo (50-level), 30-second auto-save to localStorage, scale calibration, SAM segmentation (disabled), region detect, material search, PDF rendering, resizable panels

These are not calculation violations; they are workflow/state-management bloat that makes the editor hard to change without unintended consequences.

### Detection data model (what flows through the system)

Every detection carries: `id`, `class`, `confidence`, pixel coords (Roboflow center-based), real-world measurements, `area_sf`, `perimeter_lf`, `polygon_points`, `status` (`auto`|`verified`|`edited`|`deleted`), `assigned_material_id`, `notes`. Markup types: polygon (area, SF), line (LF), point (count).

User-selectable detection classes: `window, door, garage, siding, roof, gable, trim, fascia, gutter, eave, rake, ridge, soffit`. Missing classes (per `FRONTEND_ANALYSIS.md`): `valley, vent, flashing, downspout, outlet, hose_bib, light_fixture`.

---

## Target behavior

Same map, but with two changes that make it correctness-checkable:

- **Single calculation owner per row** in the table above (always API or always DB).
- **Two missing flow boxes added:**
  - Multi-page construction PDF upload UI → `extraction_jobs` creation (currently absent — see `FRONTEND_ANALYSIS.md`)
  - Approval-context builder service that prepares the payload n8n's `approve-detection-editor` consumes (today, this is implicit in the n8n workflow)

The full target architecture is specified in `03-target-architecture.md`.

---

## Non-goals

- Switching transports (HTTPS + Webhook + Realtime stay)
- Adding services (no message broker, no separate cache, no custom auth — see `07-roadmap.md` non-goals)
- Replacing n8n
- Replacing AG Grid Community with Enterprise
- Restructuring the detection data model

---

## Known contradictions / uncertainty

- **Excel generation appears in two places** (frontend `lib/utils/exportTakeoffExcel.ts` AND n8n `multi-trade-coordinator`). Must converge before Phase 5 of roadmap.
- **Auto-scope rules table identity unclear** — `siding_auto_scope_rules` is the documented canonical, but `ARCHITECTURE_VIOLATION_REPORT.md` notes a possible `auto_scope_rules_v2` may also be referenced by n8n. Needs DB-side verification.
- **Trim variables wiring** — `06-known-problems.md` says trim variables (`trim.total_head_lf`, `_jamb_lf`, `_sill_lf`) are NOT wired in n8n; `04-estimating-business-rules.md` lists trim formulas as live. Most likely partially wired, with silent-zero failure on some rules.

---

## Open questions

- Is `auto_scope_rules_v2` actually present in production DB, or only referenced in legacy code paths? Verifying requires a DB read, which is out of scope for this doc.
- Are there any other in-flight n8n workflows beyond the 4 documented (e.g., a beta workflow) that consumers might be hitting?
- Does the local engine port at `packages/estimating-engine/` count as a parallel calculation owner, or is it strictly a verification surface? Today it's the latter (parallel verification routes; see `feedback_parallel_verification_routes.md`), but architecture decisions must clarify.

---

## Source citations

- `docs/ai-context/01-current-architecture.md` — services, transports, polygon math, provenance
- `docs/ai-context/05-agent-workflows.md` — n8n workflows, in-app agents, Realtime channels, hooks
- `docs/ai-context/06-known-problems.md` — trim variable wiring, dual rule paths
- `FRONTEND_ANALYSIS.md` — Detection Editor LOC, missing detection classes, missing extraction-job upload flow
- `ARCHITECTURE_VIOLATION_REPORT.md` — calculation owners table, hardcoded constants/SKUs
