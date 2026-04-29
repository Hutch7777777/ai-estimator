# 03 — Target Architecture

**Audience:** anyone proposing a structural change; anyone reviewing a PR that crosses layer boundaries
**Purpose:** define where each class of work belongs in the target system. Synthesizes `ARCHITECTURE_VIOLATION_REPORT.md`'s target state with the frontend boundary observations from `FRONTEND_ANALYSIS.md`.

---

## Current behavior (one-paragraph summary)

The frontend has no major pricing or formula ownership violations, but DetectionEditor and related hooks are overloaded with workflow/state responsibilities. n8n owns hardcoded pricing for corbels, brackets, shutters, and belly band SKUs that are not in `pricing_items`. The Railway API owns hardcoded constants (`MARKUP_RATE=0.26`, `SOC_UNEMPLOYMENT_RATE=0.1265`, `LI_HOURLY_RATE=3.56`, `INSURANCE_RATE_PER_THOUSAND=24.38`), hardcoded `LABOR_RATES`, `OVERHEAD_RATES`, `TRIM_SKUS`, `AUTO_SCOPE_SKUS`, and a 60+ entry hardcoded `getPresentationGroup()` mapping. Multiple competing rule tables may exist. Excel generation runs in both the frontend and n8n. Detailed in `02-current-system-map.md`.

---

## Target behavior

### Layer responsibilities

```
┌────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js App + API routes)                           │
│  - Display, aggregate, edit, optimistic UI                     │
│  - Uploads, Realtime subscriptions                             │
│  - NO pricing math, NO formula evaluation                      │
└────────────────────────────────────────────────────────────────┘
                            │
┌────────────────────────────────────────────────────────────────┐
│  n8n (Railway)                                                 │
│  - Async orchestration only                                    │
│  - Workflow steps, retries, fan-out                            │
│  - NO pricing, NO formulas, NO Excel generation                │
│  - NO spatial computation, NO rule evaluation                  │
└────────────────────────────────────────────────────────────────┘
                            │
┌────────────────────────────────────────────────────────────────┐
│  Railway API (Python) + Estimating Engine (TypeScript)         │
│  - ALL calculations: polygon, scale, net siding, openings,     │
│    corners, trim, labor, overhead, markup                      │
│  - ALL pricing lookups                                         │
│  - ALL formula evaluation (auto-scope rules)                   │
│  - ALL presentation_group resolution                           │
│  - ALL Excel generation                                        │
└────────────────────────────────────────────────────────────────┘
                            │
┌────────────────────────────────────────────────────────────────┐
│  Database (Supabase)                                           │
│  Single source of truth:                                       │
│  - pricing_items (all SKUs, including detection classes)       │
│  - siding_auto_scope_rules (one canonical table)               │
│  - calculation_constants (markup, SOC, L&I, insurance, crew)   │
│  - presentation_group_config (replaces hardcoded mappings)     │
│  - labor_rates                                                 │
│  - overhead_costs                                              │
│  - detection_class_material_mapping                            │
└────────────────────────────────────────────────────────────────┘
```

### Frontend boundary target

The frontend is split into four bounded responsibilities. Anything that doesn't fit one of these does not belong in the frontend.

- **Detection Editor owns drawing/review UX.** Konva canvas, polygon/line/point editing, undo/redo, calibration UI, confidence filtering, manual reclassification. Pure interaction state. No business rules. No pricing.
- **Backend owns approval context building.** When the user hits "Approve," the payload that flows to the estimating engine is assembled by a backend route, not by the frontend. The frontend sends *what was edited*; the backend resolves *what the engine needs* (measurements, organization context, settings, pricing item ids).
- **Estimating engine owns priced line item generation.** The `packages/estimating-engine/` package + its API route is the single producer of `takeoffs`, `takeoff_sections`, and `takeoff_line_items`. Pure functional, refData injected, no DB or network calls inside engine code.
- **Excel is a rendering of approved takeoff data.** Excel generation reads from `takeoffs` / `takeoff_sections` / `takeoff_line_items` only — it does not re-derive numbers, re-evaluate rules, or re-look-up pricing. If the Excel disagrees with the in-app Takeoff Viewer, the Excel is wrong (because the viewer reads the same canonical rows).

This boundary makes "what does this frontend file do?" answerable in one sentence per file.

### Data ownership rules

- **Pricing:** every priced item — including detection-driven items (corbel, bracket, shutter) and belly-band SKUs — comes from `pricing_items`. No hardcoded pricing in any other layer.
- **Constants:** every percentage, rate, default, or threshold lives in `calculation_constants` keyed by name (`markup_rate`, `li_hourly_rate`, etc.) and trade. No hardcoded numerics in API source.
- **Rules:** one canonical `siding_auto_scope_rules`. Other tables (e.g. `auto_scope_rules_v2` if present) are deprecated and removed.
- **Presentation groups:** lookup via `presentation_group_config` table. The 60+ hardcoded mappings in `getPresentationGroup()` move to seed rows.
- **Provenance:** unchanged — every line item still carries `source_measurement` JSONB.

### Calculation engine principles

- **Pure functional engine:** the `packages/estimating-engine/` package has no DB calls, no network calls, no cookies, no Supabase clients. All side effects happen in the host (`lib/estimating/refData.ts`).
- **refData injection pattern:** the host fetches all reference data (pricing, rules, constants, measurements) and passes it into the engine as a single typed bag. The engine is a deterministic function of `(payload, refData) → takeoff`.
- **Synchronous engine:** no `await` inside the engine. All async work is the host's responsibility.
- **Parallel verification routes:** new routes (`/api/estimating/normalize-approval`, `/api/estimating/calculate-siding`) ship as verification surfaces, never as replacements for the production n8n proxy path. See `feedback_parallel_verification_routes.md`.

---

## Non-goals

- Replacing n8n (per `07-roadmap.md` explicit non-goal)
- Custom auth service
- Adding a message broker
- Adding a separate cache layer
- Splitting the database into microservice DBs
- Replacing AG Grid Community with Enterprise
- Removing Realtime subscriptions
- Removing Roboflow / Claude / Extraction API as separate services
- Replacing the App Router with another framework
- A single PR that lands the entire target — the migration is phased, see `05-implementation-roadmap.md`

---

## Known contradictions / uncertainty

- **Excel-generation target** — the violation report says move it to API. The current frontend export is well-tested (the recently-shipped per-square economics work landed there). The migration must preserve byte-level Excel parity, not just structural parity. The frontend export may stay as a thin client over an API endpoint rather than be deleted outright.
- **Calculation engine port location** — the current port lives at `packages/estimating-engine/` inside the Next.js repo. The Railway API is Python. Whether the target is "TypeScript engine alongside Next.js calls into Python API for some operations" or "TypeScript engine fully owns calculation, Python is read-only for geometry" is not yet decided. The target diagram above describes the *layer*, not the implementation language split.
- **Spatial containment in n8n** — the violation report flags this as a violation. It's currently in n8n because Extraction API (Python) returns geometry data and n8n joins it to detections. Moving this to the API requires either Python-side join logic or moving join logic into the engine.

---

## Open questions

- Should the new `calculation_constants` table be trade-keyed (e.g. siding-specific markup rate) or global with overrides? The current code reads global + siding override pattern from `services/configService.ts:124-132`.
- Should `presentation_group_config` allow per-organization overrides, or is the taxonomy global?
- Does the local engine port at `packages/estimating-engine/` eventually replace n8n's calculation step entirely, or only serve as a verification mirror? `07-roadmap.md` does not state this.
- For multi-trade expansion (roofing/windows/gutters), do we add per-trade engines or a generic engine that consumes per-trade rules? The current engine is siding-only.

---

## Source citations

- `ARCHITECTURE_VIOLATION_REPORT.md` — target layer responsibilities, hardcoded values inventory
- `FRONTEND_ANALYSIS.md` — Detection Editor responsibilities, missing extraction-job upload flow
- `docs/ai-context/01-current-architecture.md` — current service map, "non-goals" list (no custom auth, etc.)
- `docs/ai-context/07-roadmap.md` — explicit non-goals (no staging, no n8n replacement, no AG Grid Enterprise)
- `feedback_parallel_verification_routes.md` (memory) — parallel-routes safety rule
