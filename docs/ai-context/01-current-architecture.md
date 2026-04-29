# 01 — Current Architecture

> Services, transports, and data flow. Sources: `SYSTEM_INTEGRATION.md`, `RAILWAY_APIS.md`, `FRONTEND_ARCHITECTURE.md`, `CLAUDE.md`.

## Services (production topology)

| # | Service | Host | Responsibility |
|---|---------|------|----------------|
| 1 | **ai-estimator** (this repo) | Railway | Next.js 16 frontend + `/app/api/*` server routes |
| 2 | **Supabase Cloud** (`okwtyttfqbfmcqtenize`) | Supabase | Postgres, Auth, Storage (`hover-pdfs` bucket), Realtime channels, RLS |
| 3 | **n8n** (`n8n-production-293e.up.railway.app`) | Railway | Long-running workflows: page classify, detect, aggregate, price, Excel export |
| 4 | **Extraction API** (`extraction-api-production.up.railway.app`) | Railway | Python microservice: wall heights, linear calc (perimeter/corners), siding polygon generator |
| 5 | **Anthropic Claude** | api.anthropic.com | Vision (`claude-sonnet-4-20250514`) for PDF page understanding + chatbot/RFI text |
| 6 | **Roboflow** | roboflow.com | Object detection on elevation images |
| 7 | **Replicate** | replicate.com | SAM-2 segmentation host (**currently disabled** — no point-based model available) |
| 8 | **Azure Document Intelligence** | Azure | Structured table extraction from schedule pages (`analyzeLayout`) — alternative to Claude two-pass |

## Transports & communication

| From → To | Transport | Sync / Async | Notes |
|-----------|-----------|--------------|-------|
| Browser → `ai-estimator` routes | HTTPS | Sync | Normal Next.js request/response |
| `ai-estimator` → Supabase | HTTPS + WebSocket | Sync (queries) / Async (Realtime) | Browser uses anon key + RLS; server uses service role |
| Browser → n8n | HTTPS POST via `/api/n8n/[...path]` proxy | Async | 2-min timeout; proxy is binary-aware for `.xlsx` |
| n8n → Supabase | HTTPS | Sync | n8n reads/writes the same Postgres tables |
| n8n → Extraction API | HTTPS | Sync | `GET /wall-heights`, `POST /calculate-linear`, `POST /siding-polygons` |
| n8n → Roboflow | HTTPS | Sync | Per-elevation detection |
| `ai-estimator` (server routes) → Claude | Anthropic SDK | Sync | `ANTHROPIC_API_KEY` server-only |
| Supabase Realtime → Browser | WebSocket | Async | Channels: `extraction_jobs`, `extraction_detections_*`, `takeoffs` |

## Data flow — path A: PDF → detections

1. Browser uploads PDF to Supabase Storage (`hover-pdfs` bucket) + inserts `projects` row.
2. Browser POSTs form data → `/project/new` server action → inserts `project_configurations` → triggers n8n `project-process` webhook.
3. n8n:
   - splits PDF into page images, uploads back to Storage;
   - creates `extraction_jobs` (status `converting` → `classifying` → `processing`);
   - inserts `extraction_pages` (one per page, with `page_type`, `elevation_name`, `scale_ratio`, `image_url`);
   - runs Roboflow on elevation pages → writes `extraction_detections_validated`;
   - runs Claude extractions (via `ai-estimator` `/api/extract-*` routes OR directly against Anthropic) → stores OCR payloads on `extraction_pages.ocr_data` or on dedicated JSONB columns (`floor_plan_data`, `notes_specs_data`, `rfi_list_data`);
   - updates `extraction_jobs.status = classified` / `complete`.
4. Realtime pushes notify the frontend; Detection Editor re-queries and renders.

## Data flow — path B: detections → takeoff → Excel

1. User interacts with Detection Editor; every edit fires `/webhook/detection-edit-sync` → n8n recalculates `area_sf` / `perimeter_lf` → writes `extraction_detections_draft` → Realtime push.
2. User clicks **Approve** → browser POSTs to `/webhook/approve-detection-editor` (a.k.a. `takeoff-generate`).
3. n8n:
   - aggregates detections by class + merges schedule + floor-plan data;
   - calls Extraction API: `GET /wall-heights?job_id=...`, `POST /calculate-linear`, `POST /siding-polygons`;
   - evaluates `siding_auto_scope_rules` and `labor_auto_scope_rules` against the measurement context;
   - looks up prices from `pricing_items` / `product_catalog`;
   - writes `takeoffs`, `takeoff_sections`, `takeoff_line_items` (GENERATED columns compute line totals; triggers recompute section & takeoff totals).
4. Browser navigates to `/takeoffs/[id]`, loads via `/api/takeoffs/[id]`.
5. Excel export posts to `/webhook/multi-trade-coordinator` — n8n returns an `.xlsx` binary; proxy detects the content-type and streams the binary through.

## Key architectural patterns

- **Database-driven configuration** — form fields, product catalog, auto-scope rules are all rows in Postgres. Never hardcode a trade, field, or rule in code (see `CLAUDE.md`).
- **Async via n8n + Realtime** — the API never blocks on long work. Write to DB, trigger webhook, subscribe to Realtime.
- **Provenance on every line item** — `takeoff_line_items.source_measurement` JSONB ties each row back to the detection or extraction payload that caused it.
- **Priority-based detection source** — the `/api/extraction-pages` endpoint returns `draft → validated → ai_original` in that order, so the UI always prefers user edits.
- **Webhook proxy** (`/api/n8n/[...path]`) — centralises auth + binary handling + 2-min timeout; the browser never talks to n8n directly.
- **Per-page scale ratio** — `extraction_pages.scale_ratio` (pixels per foot), NOT job-level. All area/LF math must use the page's own ratio.
- **Polygon math (Shoelace)** — polygon areas are computed with the Shoelace formula end-to-end; bounding-box math was removed in `bf02c6b` and `f38839b` because it inflated triangular/gable areas.
- **`area_sf` stored in DB** — frontend reads from `extraction_detections_draft.area_sf` and only falls back to pixel math with a `console.warn` (commit `3a1b295`).

## Why this topology

- **n8n vs server-sent events**: n8n already hosts the heavy ML pipeline steps, so it stays the orchestrator.
- **Extraction API as a separate service**: pure-Python polygon / linear math is hot and easier to iterate without redeploying Next.js.
- **Supabase everywhere**: one source of truth for DB, auth, storage, and push — removes a message-queue and a user-service from the stack.
- **Claude Sonnet 4 for vision**: chosen for instruction-following on construction plans; see `RAILWAY_APIS.md` §"Anthropic Claude API".

## Non-goals (explicit)

- No custom auth service.
- No message broker (no SQS / Kafka / RabbitMQ).
- No separate cache layer (Postgres + browser cache only).
- No staging environment — `main` → Railway production.
