# 03 — API Map

> Every route under `/app/api/*`. Source: directory listing + `RAILWAY_APIS.md`.
> All routes are Next.js App Router handlers. Authentication via Supabase SSR middleware (`middleware.ts`) except the public paths listed in `CLAUDE.md`.

## Quick table

| Route | Method | Purpose | External services |
|-------|--------|---------|------------------|
| `/api/extraction-jobs` | GET | List jobs for a project | Supabase |
| `/api/extraction-jobs/[id]` | PATCH, DELETE | Update job name / delete job | Supabase |
| `/api/extraction-pages` | GET | Fetch pages (+ detections, ocr) by project/job | Supabase |
| `/api/extraction-pages/[pageId]` | GET | Fetch single page with OCR data | Supabase |
| `/api/claude-detect` | POST | Custom multi-page Claude vision analysis (takeoff, RFI, prompts) | Claude |
| `/api/detect-region` | POST | Roboflow bounding-box detection on an image region | Roboflow |
| `/api/redetect-page` | POST | Re-run detection on a single page after edits | Roboflow |
| `/api/sam-segment` | POST | SAM-2 polygon segmentation from click points | Replicate *(disabled)* |
| `/api/extract-schedule` | POST | Claude extract window/door/skylight/garage schedule | Claude |
| `/api/extract-schedule-azure` | POST | Azure Document Intelligence schedule table extraction (alt) | Azure |
| `/api/analyze-schedule-structure` | POST | Pass-1 structure analysis for schedule tables | Claude |
| `/api/extract-floor-plan` | POST | Claude extract floor-plan geometry & corners | Claude |
| `/api/extract-material-callouts` | POST | Claude extract material callouts from elevations | Claude |
| `/api/extract-material-callouts-v2` | POST | v2 callout extractor (improved prompts) | Claude |
| `/api/extract-wall-assembly` | POST | Claude extract wall-section layer composition | Claude |
| `/api/extract-roof-plan` | POST | Claude extract roof slopes/linears/features | Claude |
| `/api/extract-notes-specs` | POST | Claude extract spec notes across job pages | Claude |
| `/api/generate-rfi` | POST | Generate RFI items from missing/incomplete specs | Claude |
| `/api/takeoffs/[id]` | GET | Fetch takeoff + sections + line items | Supabase |
| `/api/debug-takeoff/[id]` | GET | Debug — raw takeoff DB state | Supabase |
| `/api/n8n/[...path]` | POST (and others) | Proxy to n8n webhooks (2-min timeout, binary-aware) | n8n |

## Contract details

### Extraction management

**`GET /api/extraction-jobs?project_id=<uuid>`**
→ `{ success: true, jobs: ExtractionJobRecord[] }`

**`PATCH /api/extraction-jobs/[id]`** — body `{ project_name: string }`
**`DELETE /api/extraction-jobs/[id]`** — blocked if job is actively processing.

**`GET /api/extraction-pages`** — params: `project_id`, `job_id`, `page_type` (default `elevation`).
Response carries `detection_source: 'draft (user edits)' | 'validated (raw Roboflow)' | 'ai_original' | 'none'` indicating which tier served the detections. See `RAILWAY_APIS.md` §"Detection Priority".

**`GET /api/extraction-pages/[pageId]`** — single page with OCR payload for schedule details.

### Detection / segmentation

**`POST /api/claude-detect`** — general-purpose Claude vision endpoint used by the Plan Intelligence chatbot and bespoke takeoff prompts. Input: `{ pageIds: string[], prompt: string, mode?: 'takeoff'|'rfi'|'custom' }`.

**`POST /api/detect-region`** — invokes Roboflow workflow; input `{ image_url, region }`.

**`POST /api/redetect-page`** — re-runs Roboflow on an already-classified page; used from the Detection Editor toolbar.

**`POST /api/sam-segment`** — currently **returns an explicit "unsupported" response**. The route exists to keep the UI wiring in place; re-enable when a point-based SAM-2 model or Roboflow SAM enterprise tier is available.

### Document extraction (Claude)

All of these take `{ pageId, imageUrl, jobId?, pageNumber? }` and return `{ success, data, tokens_used }` with the payload shape documented in `RAILWAY_APIS.md`:

- `/api/extract-schedule` → `ScheduleOCRData`
- `/api/analyze-schedule-structure` → `StructureAnalysisResult`
- `/api/extract-floor-plan` → `FloorPlanData`
- `/api/extract-material-callouts` / `-v2` → `{ callouts: MaterialCallout[], summary, confidence }`
- `/api/extract-wall-assembly` → `WallAssemblyExtractionResult`
- `/api/extract-roof-plan` → `RoofPlanData`
- `/api/extract-notes-specs` — input `{ job_id, include_all_pages? }` → `NotesSpecsData`

### Azure alternative

**`POST /api/extract-schedule-azure`** — consolidates Pass 1 + Pass 2 into a single call against Azure Document Intelligence `analyzeLayout`. Returns cell-by-cell table data. Use when schedule pages have messy merged cells that Claude struggles with.

### RFI

**`POST /api/generate-rfi`** — input `{ job_id }`. Reads `extraction_jobs.notes_specs_data`, asks Claude to flag missing/ambiguous specs, writes back to `extraction_jobs.rfi_list_data`.

### Takeoff

**`GET /api/takeoffs/[id]`** → `{ takeoff, sections, line_items, project }`. Used by `/takeoffs/[id]` page.

**`GET /api/debug-takeoff/[id]`** — dumps raw rows for debugging; not for production UI.

### n8n proxy

**`/api/n8n/[...path]`** — forwards any method/body to `${N8N_WEBHOOK_URL}/${path}`. Key behaviours:
- 120-second timeout (matches the n8n webhook cliff).
- Detects `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and streams the `.xlsx` binary through (used by `multi-trade-coordinator`).
- Normalises error envelopes into `{ success: false, error }`.

Known webhooks proxied through this route:

- `POST /api/n8n/project-process` — kick off classify/detect/extract.
- `POST /api/n8n/detection-edit-sync` — push a single edit, receive recomputed sidebar totals.
- `POST /api/n8n/approve-detection-editor` — materialise the takeoff.
- `POST /api/n8n/multi-trade-coordinator` — Excel export (binary response).

## Known failure points

| Area | Symptom | Why |
|------|---------|-----|
| `/api/sam-segment` | Returns disabled / unsupported | Replicate's current SAM-2 model doesn't support point prompts; Roboflow SAM requires enterprise tier. |
| `/api/n8n/*` | 408 / aborted request | n8n webhook exceeded 120s (Excel exports near the cliff). |
| `/api/extraction-pages*` | 500 on older DBs | Falls back when `ocr_data` / `ocr_status` / `ocr_processed_at` columns don't exist — fallback query logic protects this, but confirm after a migration. |
| `/api/extract-schedule-azure` | Different result shape | Consolidates Pass 1 + Pass 2; callers written for Claude two-pass must adapt. |
| `/api/extract-*` (Claude) | Silent empty fields | Claude returns `null` when it can't read a value; don't confuse "missing spec" with "extractor failure". Check `confidence` and `confidenceNotes`. |
| Supabase browser client | Hangs on RLS-protected tables | Route reads through a server API with the service role key. This bit `14f14c5` / multiple fix commits. |
| Approve flow | "canApprove" mismatch with handler | See commit `c263c78`; both gates must agree before the Approve button does anything. |
| Trim fields in payload | Rules silently produce 0 quantity | n8n workflow doesn't map `trim.total_head_lf` / `_jamb_lf` / `_sill_lf` to the formula variables yet. See `docs/N8N_TRIM_IMPLEMENTATION.md`. |

## Error shape (convention)

```ts
// Success
{ success: true, ...payload }

// Failure
{ success: false, error: string }
```

HTTP codes used: `400` bad input, `404` missing resource, `408` timeout (proxy), `500` server error.

## Authentication

- `middleware.ts` protects everything except: `/login`, `/signup`, `/auth/callback`, `/auth/confirm`, `/onboarding`, `/api`.
- API routes re-check the Supabase session via `lib/supabase/server.ts` — `/api` is public at the middleware layer but not at the handler layer.
- Dev-only bypass: `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` — never set in production.
