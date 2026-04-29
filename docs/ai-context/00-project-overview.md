# 00 — Project Overview

> AI-tuned summary for downstream AI systems. For authoritative detail see the root-level docs (`CLAUDE.md`, `DATABASE_ARCHITECTURE.md`, `SYSTEM_INTEGRATION.md`, `FRONTEND_ARCHITECTURE.md`, `EXTRACTION_ARCHITECTURE_ANALYSIS.md`, `RAILWAY_APIS.md`).

## What this system is

**AI Estimator** (internal name: `ai-estimator`, part of the EstimatePros.ai platform) is a web application that converts construction PDF plans into fully-priced Excel estimates for exterior finish contractors.

The system is built around a single vertical: **James Hardie siding installations** on residential projects in the ~$20–25k range. The stated business goal is to reduce the estimator's desk time from **~45 minutes per plan → ~5 minutes**.

## Users

- Small exterior-finishes contractors (owner-operators, estimators).
- Multi-tenant via Supabase organizations (each contractor is its own org).
- Roles: `owner`, `admin`, `estimator`, `viewer`.

## Key features

- **PDF upload & page classification** — user uploads a Hover/architect PDF; pages are auto-classified (cover, elevation, floor plan, schedule, detail, notes).
- **AI detection** — Roboflow object detection on elevations (windows, doors, garages, gables, walls) + Claude Vision extraction for schedules, floor plans, material callouts, wall assemblies, roof plans, and notes/specs.
- **Detection Editor** (Konva.js canvas) — users review, edit, add, delete, reclassify, and draw polygon detections on top of PDF page images. Optional SAM segmentation (currently disabled upstream) and Bluebeam markup import.
- **Real-world calibration** — each page carries a `scale_ratio` (pixels per foot) so pixel dimensions become real-world area / LF.
- **Auto-scope engine** — database-driven rules (`siding_auto_scope_rules`, `labor_auto_scope_rules`) turn measurements into material + labor line items. Rules support trigger conditions, manufacturer filters, trim-system toggles, and config-match paths.
- **Takeoff viewer** — Materials, Labor, Paint, and Overhead tables plus a cost summary with markup, per-square sell price, sub payout, profit, and margin.
- **Plan Intelligence** (Claude chatbot) — answers questions about the uploaded plan.
- **RFI generator** — turns missing specs into a contractor-ready Request for Information email.
- **Professional Excel export** — multi-tab `.xlsx` via ExcelJS, grouped by 7 consolidated presentation groups.

## High-level flow

```
  ┌──────────┐    ┌────────────────┐    ┌──────────────────────────┐
  │  User    │───▶│ /project/new   │───▶│ Supabase: projects,      │
  │ (browser)│    │ upload PDF     │    │   project_configurations │
  └──────────┘    └────────────────┘    └────────────┬─────────────┘
                                                     │
                                                     ▼
                            ┌────────────────────────────────────────┐
                            │ n8n workflow: project-process           │
                            │  - split PDF, classify pages            │
                            │  - Roboflow detect (windows/doors/etc.) │
                            │  - Claude extract (schedule/floor/etc.) │
                            │  - write extraction_jobs, _pages,       │
                            │    _detections_validated                │
                            └────────────────────────────────────────┘
                                                     │ Supabase Realtime push
                                                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ Detection Editor  /projects/[id]/extraction/[jobId]          │
  │  Konva canvas, sidebar totals, estimate settings panel       │
  │  User edits → /webhook/detection-edit-sync → DB recalc        │
  └──────────────────────────────────────────────────────────────┘
                                                     │ Approve
                                                     ▼
                            ┌────────────────────────────────────────┐
                            │ n8n: approve-detection-editor           │
                            │  - aggregate detections + schedule data │
                            │  - call Extraction API (wall heights,   │
                            │    linear calc, siding polygons)        │
                            │  - apply auto-scope rules + pricing     │
                            │  - write takeoffs, _sections, _items    │
                            └────────────────────────────────────────┘
                                                     │
                                                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ Takeoff Viewer  /takeoffs/[id]                               │
  │  Materials / Labor / Paint / Overhead / Summary              │
  │  Export → /webhook/multi-trade-coordinator (xlsx binary)      │
  └──────────────────────────────────────────────────────────────┘
```

## Input → processing → output

- **Input**: one construction PDF (Hover-generated or architect plan set) + trade/product selections from a multi-step form.
- **Processing**: async via n8n (classify → detect → extract → calibrate → aggregate → price).
- **Output**: a stored `takeoffs` row (with `takeoff_sections` and `takeoff_line_items`), renderable in the UI and downloadable as a professional `.xlsx`.

## Business context

- **Vertical today**: Exterior finishes, primarily James Hardie siding + trim.
- **Reference project**: `MN568` is the always-on regression fixture; every calculation change is validated against it (`/takeoff-validate` skill).
- **Roadmap directions**: roofing, windows, gutters already have trade configurations seeded; a licensing play to other contractors is a medium-term goal.
- **No staging environment** — every push to `main` auto-deploys to Railway production; `/pre-deploy` skill is the only gate.

## Repo orientation for an AI reader

- Next.js 16 App Router. All pages and API routes live under `/app`.
- Shared UI in `/components`, business logic in `/lib`, schema types in `/lib/types/database.ts`, SQL migrations in `/migrations`.
- The long-form architecture reference docs sit at the repo root; treat them as deep dives, this `docs/ai-context/` folder as the index.
