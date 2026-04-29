# 05 — Agent Workflows & Automation

> The async / multi-step pieces. Background processing is orchestrated in **n8n** (hosted on Railway); in-app AI "agents" live in the Next.js frontend and call Claude directly via server routes.
> Source: `SYSTEM_INTEGRATION.md`, `RAILWAY_APIS.md`, recent commits, `/lib/hooks/*`.

## n8n webhook catalog

All webhooks are proxied from the browser through `/api/n8n/[...path]` (see `03-api-map.md`). n8n workflows run on Railway at `https://n8n-production-293e.up.railway.app`.

### 1. `project-process`
**Trigger**: `ProjectForm` completes; the final step POSTs project + trade config.

**Inputs**: `{ project_id, organization_id, pdf_url, selected_trades, project_configurations }`.

**Side-effects**:
- Downloads the PDF from Supabase Storage (`hover-pdfs` bucket).
- Splits PDF → page images; uploads them back to Storage.
- Inserts `extraction_jobs` (status progresses `converting → classifying → processing`).
- Classifies each page (`cover | elevation | floor_plan | schedule | detail | notes`) and writes `extraction_pages`.
- Calls Roboflow on elevation pages; writes `extraction_detections_validated`.
- Calls Claude routes (directly or via this app's `/api/extract-*`) for schedules, floor plans, material callouts, wall assemblies, roof plans, notes & specs; results land on `extraction_jobs.floor_plan_data`, `notes_specs_data`, and page-level `ocr_data`.
- Updates `extraction_jobs.status = complete`.

**Response**: Immediate `{ accepted: true, job_id }` (synchronous write, asynchronous processing).

**Downstream**: Supabase Realtime pushes `extraction_jobs` row updates to the browser; `useExtractionData` reacts.

### 2. `detection-edit-sync`
**Trigger**: Any edit in the Detection Editor — move, resize, reclassify, draw polygon, delete.

**Inputs**: `{ job_id, page_id, edit_type, detection_id, changes }`.

**Side-effects**:
- Upserts `extraction_detections_draft` with new geometry.
- Recalculates `area_sf` / `perimeter_lf` using the same Shoelace math the frontend uses.
- Re-aggregates `extraction_elevation_calcs` for that page.

**Response**: Sidebar totals JSON (`{ window_count, net_siding_sf, … }`) — used to refresh the Live Calculations panel without refetching.

**Pattern**: Optimistic UI update → webhook returns authoritative totals → `useDetectionSync` merges.

### 3. `approve-detection-editor` (a.k.a. `takeoff-generate`)
**Trigger**: User clicks **Approve & Calculate** in the Detection Editor.

**Inputs** (built by `buildApprovePayload`, commit `2926aef`): the full measurement context — per-elevation totals, schedule data, floor-plan data, estimate settings (trim system, toggles, manual LF overrides, markup %), manufacturer selections, unmatched items (commit `af4f2fb`).

**Side-effects**:
- Calls Extraction API:
  - `GET /wall-heights?job_id=…`
  - `POST /calculate-linear` (perimeter + corners by elevation)
  - `POST /siding-polygons` (per-page building exterior + holes + gables)
- Evaluates `siding_auto_scope_rules` and `labor_auto_scope_rules` against the measurement context.
- Looks up pricing via `v_pricing_current` / `pricing_items`.
- Emits line items grouped by presentation group.
- Inserts `takeoffs`, `takeoff_sections`, `takeoff_line_items` (DB triggers auto-recalculate section + takeoff totals).
- Updates `extraction_jobs.status = approved`.

**Response**: `{ takeoff_id }` — the frontend navigates to `/takeoffs/[id]`.

### 4. `multi-trade-coordinator` (Excel export)
**Trigger**: Export button on `/takeoffs/[id]`.

**Inputs**: `{ takeoff_id, project_id }`.

**Side-effects**:
- Fetches the full takeoff from Supabase.
- Generates a professional `.xlsx` with ExcelJS (or inside n8n). Note: the in-app `lib/utils/exportTakeoffExcel.ts` (61 KB) is the reference implementation; n8n may call it or reproduce it.
- Optionally uploads the file back to Supabase Storage and stores `projects.excel_url`.

**Response**: Binary `.xlsx` (detected by content-type in the proxy and streamed through).

**Risk**: Excel generation approaches the 120 s webhook timeout on large jobs — see `06-known-problems.md`.

---

## Async vs sync boundaries

| User action | Transport | Blocking? |
|-------------|-----------|-----------|
| Create project / upload PDF | DB insert + webhook | Returns immediately; processing async |
| View extraction pages | `/api/extraction-pages` | Synchronous DB read |
| Move a detection on the canvas | Optimistic + `/webhook/detection-edit-sync` | Non-blocking; totals arrive async |
| Click Approve | `/webhook/approve-detection-editor` | Blocks until takeoff row exists |
| Open takeoff viewer | `/api/takeoffs/[id]` | Synchronous DB read |
| Chat in Plan Intelligence | `/api/claude-detect` | Synchronous (few seconds) |
| Click Export Excel | `/webhook/multi-trade-coordinator` | Blocks until binary streams back |
| Generate RFI | `/api/generate-rfi` | Synchronous |

Realtime subscriptions keep the UI in sync between events:
- `extraction_jobs` row updates → progress banner.
- `extraction_detections_*` → live recalculation of sidebar totals.
- `takeoffs` / `takeoff_line_items` → auto-refresh on the takeoff viewer (used by `useTakeoffData`).

---

## In-app AI agents (Claude)

These live in the Next.js app, not in n8n. They run conversationally from the browser via server API routes.

| Feature | Entry point | Route(s) called |
|---------|-------------|------------------|
| **Plan Intelligence chatbot** | `/takeoffs/[id]/components/PlanIntelligence.tsx` | `/api/claude-detect` (mode: custom) |
| **Plan Reader chatbot** | `/components/detection-editor/PlanReaderChatbot.tsx` | `/api/claude-detect` (mode: takeoff) |
| **Claude Assistant panel** | `/components/detection-editor/ClaudeAssistantPanel.tsx` | `/api/claude-detect` |
| **RFI generator** | RFI modal on `/takeoffs/[id]` | `/api/generate-rfi` → `/api/extract-notes-specs` (if not yet done) |
| **Material callout extraction** | Detection Editor toolbar | `/api/extract-material-callouts`, `-v2` |
| **Schedule extraction** | Classification dashboard | `/api/analyze-schedule-structure` + `/api/extract-schedule`, or `/api/extract-schedule-azure` |

All of these are **single request / single response** today — no long-lived sessions, no streaming. Conversation history (for chatbots) is carried in the browser and re-sent each turn.

---

## Frontend hooks that drive automation

(From `lib/hooks/index.ts`.)

| Hook | Purpose |
|------|---------|
| `useTakeoffData` | Fetch takeoff + subscribe to Realtime row updates |
| `useLineItemsSave` | Batched upserts for line item edits in the takeoff grid |
| `useAutoSave` | Debounced save helper |
| `useExtractionData` | Fetch extraction job + subscribe; **`editingModeRef`** gates Realtime writes while the user is editing to prevent flicker (replaces the deprecated conflict-prevention approach) |
| `useDetectionSync` | Wrapper around `/webhook/detection-edit-sync`; optimistic UI + merge of authoritative totals |
| `useConfidenceFilter` | UI filter over detection confidence scores |
| `useClaudeAssistant` | Manages Plan Intelligence chat state |
| `useRegionDetect` | Wraps `/api/detect-region` for the Detection Editor "redetect region" tool |
| `useSAMSegment` | Wraps `/api/sam-segment` (currently no-op — SAM disabled upstream) |
| `useMaterialSearch` | Product picker search; matches manufacturer + SKU + name (commit `d6812e5`) |
| `usePdfRenderer` | PDF.js rendering with zoom/pan |
| `useResizable` | Generic resizable-panel helper |

---

## Realtime channels

```
extraction_jobs            → progress + status (job-level)
extraction_detections_draft → live sidebar totals + canvas redraw
extraction_detections_validated → rarely, when Roboflow completes a rerun
takeoffs, takeoff_sections, takeoff_line_items → live takeoff view
```

Realtime is filtered by `project_id` or `job_id` to avoid cross-tenant leakage; RLS does the final enforcement on the DB side.

---

## Gotchas in automation

- **n8n 120-second timeout**: hardcoded in the proxy; Excel exports on large jobs land close to this cliff. Split into multiple workflows rather than raising the limit.
- **n8n template literals**: use string concatenation, not backticks, inside Code nodes. Backticks get re-escaped when n8n serialises the expression as JSON and the output string will break.
- **Konva event interception**: Popovers (estimate settings, material picker) must render as **DOM siblings** of the Konva canvas, not as children, otherwise Konva captures pointer events (commits `3e6a767`, `b8c919d`, `78ad8b3`, `139ce06`).
- **Panel-on-mount race**: `EstimateSettingsPanel` must not emit defaults until the DB state has loaded (`9c66ece`, `028a62f`, `ed6adc5`).
- **Realtime during edits**: while the user is actively editing, Realtime pushes can clobber local state. `useExtractionData` gates writes on `editingModeRef`.

---

## Where to find each workflow definition

- **n8n workflows**: inside the n8n UI on Railway (there is no checked-in export in this repo — MCP only sees Cloud dev; Railway workflows are imported manually). Treat n8n as a separate deploy target.
- **In-app agent prompts**: `/app/api/extract-*/route.ts` and `/app/api/claude-detect/route.ts` — each route builds its own Claude prompt.
- **Trigger condition schemas**: `docs/api-updates/autoscope-v2-changes.ts` and `docs/api-updates/autoscope-types.ts`.
