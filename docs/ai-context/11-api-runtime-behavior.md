# 11 — API Runtime Behavior

> Per-endpoint runtime contracts and side-effects for every route under `/app/api/*` (this Next.js repo) and the Railway services they call. Scope is **behavior**, not implementation.
>
> Conventions in this doc:
> - **Service** is `nextjs-api` for routes in this repo, or the Railway service that owns the endpoint when documenting external services.
> - All `nextjs-api` routes use Supabase via `lib/supabase/server.ts` (server-side client; cookies for the current user; RLS applies).
> - All Claude routes call `claude-sonnet-4-20250514` through `@anthropic-ai/sdk`.
> - "Calls out to" is what the handler invokes synchronously; long-running work via webhooks is noted separately.

---

## 1. `nextjs-api` — `/api/n8n/[...path]` (proxy)

**Service**: nextjs-api
**Endpoint**: `POST /api/n8n/{path...}`
**Purpose**: Single browser-facing chokepoint for every n8n workflow on Railway. Forwards JSON bodies to `${N8N_BASE_URL}/webhook/{path}` and streams responses back, with binary support for Excel exports.
**Called by**: Frontend (Detection Editor approve flow, Excel export, project-process trigger).
**Calls out to**: n8n on Railway (`https://n8n-production-293e.up.railway.app/webhook/...`).
**Input**: any JSON body; the URL path determines which n8n webhook fires.
**Output**: opaque JSON or a binary `.xlsx` (when content-type contains `spreadsheet`/`octet-stream`/`excel`).
**Logic inside**: derives n8n base origin (strips any trailing path from the env var), 120 s `AbortController` timeout, content-type sniffing for binary passthrough, fallback paths for empty body, non-JSON body, and HTML error pages.
**Side effects**: none directly; n8n workflows perform DB writes and Storage uploads.
**Failure modes**: 504 on `AbortError` (n8n exceeded 120 s), 502 on connect failure, 502 with `rawPreview` when n8n returns HTML, passthrough of n8n error status otherwise.
**Notes**: Heavy console logging on every call, with extra structured logging when path contains `approve` (used to debug takeoff creation). The whole takeoff/Excel pipeline relies on this proxy — its 120 s ceiling is a hard ceiling for the whole workflow.

---

## 2. `nextjs-api` — `/api/extraction-jobs`

**Endpoint**: `GET /api/extraction-jobs?project_id={uuid}`
**Purpose**: List extraction jobs for a project, newest first. Powers the project dashboard.
**Called by**: Frontend (`/project`, `/projects/[id]`).
**Calls out to**: Supabase (`extraction_jobs` table).
**Input**: query `project_id` (required).
**Output**: `{ success, jobs[]: { id, project_id, project_name, status, total_pages, elevation_count, created_at, completed_at } }`.
**Logic inside**: 400 if `project_id` missing; ordered by `created_at desc`.
**Side effects**: read-only.
**Failure modes**: 500 on DB error.
**Notes**: Verbose console logging for every query; useful when debugging job-list misses.

---

## 3. `nextjs-api` — `/api/extraction-jobs/[id]`

**Endpoint**: `PATCH /api/extraction-jobs/{id}` (rename), `DELETE /api/extraction-jobs/{id}`.
**Purpose**: Rename or delete an extraction job from the dashboard.
**Called by**: Frontend job-list actions.
**Calls out to**: Supabase (`extraction_jobs`).
**Input**: PATCH body `{ project_name }`; DELETE has no body.
**Output**: `{ success, job? }` or error envelope.
**Logic inside**: DELETE requires Supabase auth (`auth.getUser()` → 401 if missing); blocks delete when status is `processing` or `converting`.
**Side effects**: PATCH updates `extraction_jobs.project_name`. DELETE cascades to child tables (`ON DELETE CASCADE`).
**Failure modes**: 401 unauthenticated DELETE, 404 missing job, 400 attempted delete during processing.
**Notes**: PATCH is unauthenticated at the handler layer — relies on `middleware.ts` + RLS to enforce ownership.

---

## 4. `nextjs-api` — `/api/extraction-pages`

**Endpoint**: `GET /api/extraction-pages?project_id|job_id&page_type=elevation`
**Purpose**: Fetch all pages of a given type with their detections, used by the Detection Editor and viewers.
**Called by**: Frontend (Detection Editor, Classification dashboard).
**Calls out to**: Supabase (`extraction_pages`, `extraction_detections_draft`, `extraction_detections_validated`, `extraction_detection_details`).
**Input**: `project_id` OR `job_id` (one required); `page_type` defaults to `elevation`.
**Output**: `{ success, job_id, detection_source: 'draft (user edits)'|'validated (raw Roboflow)'|'ai_original'|'none', pages[]: { id, page_number, page_type, elevation_name, image_url, thumbnail_url, ocr_data, ocr_status, ocr_processed_at, detections[] } }`.
**Logic inside**: 1) resolve job from `project_id` if needed (latest); 2) try the page query **with** OCR columns, fall back to a column-less query if Postgres rejects it (older deploys); 3) detection waterfall — query `extraction_detections_draft` filtered by `is_deleted=false`; if empty, query `extraction_detections_validated`; if empty, query `extraction_detection_details` excluding `status='deleted'`. First non-empty wins; the source is reported in `detection_source`.
**Side effects**: read-only.
**Failure modes**: 400 missing both ids; 404 no job; 500 on DB error. Schema drift between deploys is silently tolerated by the OCR-column fallback.
**Notes**: This is the canonical place where the **draft → validated → ai_original priority** rule lives. If detections render with the wrong source, this handler is the first place to look.

---

## 5. `nextjs-api` — `/api/extraction-pages/[pageId]`

**Endpoint**: `GET /api/extraction-pages/{pageId}`
**Purpose**: Fetch a single page (id, page_number, page_type, ocr_data, ocr_status, ocr_processed_at). Used by the fast-path takeoff generation to read Azure schedule data.
**Called by**: Frontend (Plan Intelligence, Takeoff Viewer fast path).
**Calls out to**: Supabase (`extraction_pages`).
**Input**: route param `pageId`.
**Output**: row JSON.
**Logic inside**: `single()` query; uses an `as any` cast because the OCR columns aren't in the generated types.
**Side effects**: read-only.
**Failure modes**: 400 missing id, 404 not found, 500 DB error.
**Notes**: Returns a raw row, not the `{ success, ... }` envelope used by most routes. Inconsistent shape worth being aware of.

---

## 6. `nextjs-api` — `/api/takeoffs/[id]`

**Endpoint**: `GET /api/takeoffs/{id}`
**Purpose**: Hydrate the Takeoff Viewer (`/takeoffs/[id]`) with separated material, paint, labor, and overhead items plus recomputed totals.
**Called by**: Frontend (`/takeoffs/[id]` and `useTakeoffData`).
**Calls out to**: Supabase (`takeoffs`, `takeoff_line_items`, `extraction_jobs` for back-link).
**Input**: route param takeoff `id`.
**Output**: `{ success, takeoff, line_items[], labor_items[], overhead_items[], totals: { material_cost, paint_cost, labor_cost, overhead_cost, subtotal, markup_percent, final_price } }`.
**Logic inside**: groups items by `item_type`: material (default) and paint go into `line_items`, labor → `labor_items`, overhead → `overhead_items`; recomputes per-item extended values when DB-stored generated columns are missing; **always recomputes** totals from filtered items (DB stored totals can mis-bucket paint); markup percent defaults to `15` when null; final price = subtotal × (1 + markup/100); resolves `extraction_job_id` for the "back to editor" link by querying the latest job for the project.
**Side effects**: read-only.
**Failure modes**: 404 missing takeoff, 500 DB error. Stale DB totals are intentionally ignored.
**Notes**: Source of truth for what the user sees on the Takeoff Viewer. If totals look off, this handler — not the DB — defines the displayed numbers.

---

## 7. `nextjs-api` — `/api/debug-takeoff/[id]`

**Endpoint**: `GET /api/debug-takeoff/{id}`
**Purpose**: Raw dump of a takeoff plus its line items, sections, and latest extraction job for debugging.
**Called by**: Developers / support (manual).
**Calls out to**: Supabase (`takeoffs`, `takeoff_line_items`, `takeoff_sections`, `extraction_jobs`).
**Input**: route param `id`.
**Output**: `{ success, debug, takeoff, line_items: { count, items }, sections: { count, items }, extraction_job }`.
**Logic inside**: straight selects, no recomputation.
**Side effects**: read-only.
**Failure modes**: 404, 500.
**Notes**: Not for production UI; bypasses the consolidation logic in `/api/takeoffs/[id]`.

---

## 8. `nextjs-api` — `/api/detect-region`

**Endpoint**: `POST /api/detect-region`
**Purpose**: Run Roboflow object detection on a user-selected rectangle of a page image.
**Called by**: Frontend (Detection Editor, "redetect region" tool).
**Calls out to**: Roboflow Workflows (`ROBOFLOW_WORKFLOW_URL`, default `serverless.roboflow.com/.../find-windows-garages-...`); Supabase (optional context fetch, non-fatal).
**Input**: `{ page_id, image_url, region: { x, y, width, height }, confidence_threshold? (default 0.3) }`.
**Output**: `{ success, detections[]: { id (pending uuid), class (lowercased + underscored), confidence, pixel_x|y (CENTER), pixel_width|height, polygon_points? }, detection_count, message, region, source: 'roboflow_direct' }`.
**Logic inside**: validates required fields and minimum 50×50 region; checks `ROBOFLOW_API_KEY`; optional Supabase lookup of page (failures swallowed); calls Roboflow workflow with the image URL; extracts predictions from variant nested shapes (`outputs[0].predictions`, `predictions`, first non-empty `outputs[i].predictions`); filters to predictions whose **center** lies inside the requested region and whose confidence ≥ threshold.
**Side effects**: none. The route does NOT persist detections — caller saves them separately (e.g. via webhook or another route).
**Failure modes**: 400 invalid body / region too small; 502 Roboflow connect failure; 500 Roboflow non-2xx; 503 missing API key.
**Notes**: Roboflow returns center-based coordinates; this is preserved through the response. Generated IDs are prefixed `pending-region-` so the frontend knows they're not yet persisted.

---

## 9. `nextjs-api` — `/api/redetect-page`

**Endpoint**: `POST /api/redetect-page`
**Purpose**: Re-run detection for an entire page by delegating to the Extraction API microservice, then replace `extraction_detections_draft` for that page.
**Called by**: Frontend (Detection Editor toolbar).
**Calls out to**: Supabase (server client + a separate untyped browser-anon client for `extraction_detections_draft`); Extraction API `POST /redetect`.
**Input**: `{ page_id, min_confidence? (default 0) }`.
**Output**: `{ success, page_id, detections[], detection_count, message? }` or upstream error.
**Logic inside**: looks up the page (image_url, original_image_url) — uses `original_image_url` when present; calls Extraction API; if it returns detections, soft-deletes existing draft rows for the page (`is_deleted=true`) and inserts the new ones; returns the inserted rows.
**Side effects**: writes to `extraction_detections_draft` (soft-deletes + inserts).
**Failure modes**: 404 page not found; 501 when Extraction API responds 404 ("endpoint not implemented yet"); 500 on DB or API failure.
**Notes**: Uses a separate Supabase anon-key client because `extraction_detections_draft` isn't in the generated types — bypassing the typed cast. RLS still applies.

---

## 10. `nextjs-api` — `/api/sam-segment`

**Endpoint**: `POST /api/sam-segment`
**Purpose**: Convert a click point on an image into a polygon via SAM (Segment Anything).
**Called by**: Frontend (Detection Editor, when SAM tool is selected).
**Calls out to**: Roboflow Inference SAM (`/sam/embed_image`, `/sam/segment_image`) or Replicate `meta/sam-2`.
**Input**: `{ image_url, click_point: {x, y}, image_width, image_height, additional_points? }`.
**Output**: `{ success, polygon_points?, bounding_box?, mask_url?, source: 'roboflow_sam'|'replicate_sam'|'extraction_api_sam', id? }`.
**Logic inside**: tries Roboflow SAM first (if API key configured) — embed image with a deterministic `image_id`, then segment by point; on failure, tries Replicate `meta/sam-2` with `Prefer: wait` header and polls up to ~30 s if not synchronous.
**Side effects**: none.
**Failure modes**: 503 when no provider configured; 500 with concatenated provider errors when all providers fail. **In practice both providers fail today** — Replicate `meta/sam-2` does not accept `point_coords` for images, and Roboflow SAM is enterprise-tier-only — so the route effectively returns 500 even when keys are present. The `SAM_FEATURE_ENABLED = false` constant in the file is documentation; the runtime still attempts the calls.
**Notes**: Infrastructure is in place for when a working point-prompt SAM model becomes available. UI is wired but currently displays an error toast when used.

---

## 11. `nextjs-api` — `/api/claude-detect`

**Endpoint**: `POST /api/claude-detect`
**Purpose**: General-purpose Claude Vision endpoint. Used for ad-hoc plan analysis, the Plan Intelligence chatbot, and structured takeoff/RFI extraction with custom prompts.
**Called by**: Frontend (`PlanIntelligence`, `PlanReaderChatbot`, `ClaudeAssistantPanel`).
**Calls out to**: Anthropic (`claude-sonnet-4-20250514`); for `pdf_url` mode, fetches the PDF and slices specific pages with `pdf-lib` before sending.
**Input**: `{ prompt, page_context?, action? ('create_takeoff'|'create_rfi'|'answer'), subject? }` plus one of: `image_url`, `pages[]: {page_number, reason, image_url}`, or `pdf_url` (preferred, with `pages` to slice).
**Output**: `{ success, analysis (text), structured? (when action provided — items[], total_count, summary, etc.), tokens_used: { input, output }, model_used }`.
**Logic inside**: PDF-mode extracts only the requested pages (sorted, deduped) and base64-encodes; rejects extracted PDFs >15 MB; first call: free-form analysis with `max_tokens: 2048`; **second optional call** when `action` is set: re-uses the prior context and asks Claude to emit strict JSON (`max_tokens: 4000`) per a templated prompt for that action.
**Side effects**: none — pure analysis endpoint, no DB writes.
**Failure modes**: 400 missing fields; 502/500 on PDF fetch/parse failure; passthrough Anthropic errors. Token usage returned for cost monitoring.
**Notes**: Most expensive route in the system in token cost. Two-step (analyse → extract JSON) increases token spend ~50%. Rejects oversized PDFs explicitly.

---

## 12. `nextjs-api` — `/api/extract-schedule`

**Endpoint**: `POST /api/extract-schedule`
**Purpose**: Pass-2 schedule extraction. Uses Claude Vision (with optional structure hint from Pass-1) to parse window/door/skylight/garage schedules from an elevation or schedule page.
**Called by**: Frontend (Classification dashboard) and n8n (during `project-process`).
**Calls out to**: Anthropic; Supabase (`extraction_pages`, `extraction_jobs`).
**Input**: `{ pageId, imageUrl, jobId?, structure? (from `analyze-schedule-structure`) }`.
**Output**: `{ success, pageId, data: ScheduleOCRData (windows[], doors[], skylights[], garages[], totals, confidence, extraction_notes, is_schedule_page, extracted_at, model_used, tokens_used), used_targeted_prompt? }`.
**Logic inside**: builds either a generic prompt or a structure-specific prompt when Pass-1 output is supplied (`max_tokens: 4096`); validates JSON shape; computes totals; merges into `extraction_pages.ocr_data` (with `ocr_status='complete'`, `ocr_processed_at` timestamp); upserts `extraction_jobs.results_summary.schedule_extraction` with counts and method `claude-vision`.
**Side effects**: writes `extraction_pages.ocr_data` and `extraction_jobs.results_summary`.
**Failure modes**: 400 missing fields; 500 with `extraction_notes` describing the failure when Claude returns non-JSON; partial confidence values when nested headers confuse the model.
**Notes**: Has a sibling route `analyze-schedule-structure` (Pass 1) and the Azure variant. Two-pass is more accurate but ~2× the tokens.

---

## 13. `nextjs-api` — `/api/analyze-schedule-structure`

**Endpoint**: `POST /api/analyze-schedule-structure`
**Purpose**: Pass-1 — analyse schedule table structure (column headers, mark/quantity columns, sample rows) so Pass-2 can extract data accurately.
**Called by**: Frontend (Classification dashboard); n8n (optional pre-step).
**Calls out to**: Anthropic only.
**Input**: `{ pageId, imageUrl }`.
**Output**: `{ success, pageId, structure: { window_schedule, door_schedule, skylight_schedule, garage_schedule } each: { exists, header_row_count?, column_headers?, column_count?, size_format?, mark_column?, type_column?, quantity_column?, data_row_count?, sample_rows? }, tokens_used }`.
**Logic inside**: structure-only Claude call (`max_tokens: 2048`); does not extract data rows.
**Side effects**: none — pure analysis, no DB writes.
**Failure modes**: 400/500 standard.
**Notes**: Pure read endpoint — only valuable when paired with `extract-schedule`. Skip entirely if using the Azure variant.

---

## 14. `nextjs-api` — `/api/extract-schedule-azure`

**Endpoint**: `POST /api/extract-schedule-azure`; secondary `GET` for service-config probe.
**Purpose**: Drop-in replacement for the two-pass Claude flow using Azure Document Intelligence's `prebuilt-layout` model. Better at messy nested-header tables.
**Called by**: Frontend / n8n (when configured).
**Calls out to**: Azure Document Intelligence (via `lib/azure-doc-intel.analyzeLayout`); Supabase (`extraction_pages`, `extraction_jobs`).
**Input**: `{ pageId, imageUrl, jobId? }`.
**Output**: `{ success, pageId, data: ScheduleOCRData (same shape as `extract-schedule`), method: 'azure-document-intelligence', elapsed_ms, debug: { tables[] } }`. GET returns `{ service, configured, endpoint, model: 'prebuilt-layout', apiVersion }`.
**Logic inside**: calls Azure once; passes the raw layout to `mapAzureResultToScheduleData` to flatten table cells into `windows/doors/skylights/garages`; emits debug info per-table; updates `extraction_pages.ocr_data` (set status complete) and `extraction_jobs.results_summary.schedule_extraction.method = 'azure-document-intelligence'`.
**Side effects**: same writes as `extract-schedule`. DB write failures are logged but do **not** fail the request — the response still contains the parsed data.
**Failure modes**: 500 on Azure errors. GET returns `configured=false` if env vars missing.
**Notes**: Single round-trip vs two for Claude. Method label distinguishes downstream consumers from Claude-extracted data.

---

## 15. `nextjs-api` — `/api/extract-floor-plan`

**Endpoint**: `POST /api/extract-floor-plan`; `GET` to read existing floor plan data.
**Purpose**: Extract building geometry (perimeter LF, exterior corners, openings, overall dimensions, floor level) from a floor plan page for siding/trim estimation.
**Called by**: Frontend (Classification dashboard); n8n (during `project-process`).
**Calls out to**: Anthropic; Supabase (`extraction_pages`, `extraction_jobs`).
**Input**: POST `{ pageId, imageUrl, jobId?, pageNumber?, scaleNotation? }`; GET `?pageId=`.
**Output**: `{ success, pageId, floorPlan: FloorPlanData (floorLevel, floorAreaSF, exteriorPerimeterLF, wallSegments[], corners[], cornerSummary, windowCount, doorCount, garageDoorCount, overallWidth, overallDepth, scale, confidence, extractionNotes), tokens_used }`.
**Logic inside**: rich prompt with floor-identification rules (e.g. "bedrooms+baths => second", "main floor has kitchen") and corner-counting tips (`max_tokens: 4096`); upserts `extraction_pages.ocr_data` with the floorPlan; updates `extraction_jobs.floor_plan_data` keyed by `floorLevel` so multi-floor plans aggregate.
**Side effects**: writes both tables.
**Failure modes**: standard; floor-level mis-classification is a common silent failure (call it out in `extractionNotes`).
**Notes**: One of the most prompt-engineered routes in the codebase. The "floor identification rules" embed business knowledge about which rooms imply which floor level.

---

## 16. `nextjs-api` — `/api/extract-roof-plan`

**Endpoint**: `POST /api/extract-roof-plan`; `GET` to read existing data.
**Purpose**: Extract roofing geometry — pitches, ridges, hips, valleys, eaves, rakes, slopes, features (skylights/chimneys/vents), and material callouts.
**Called by**: Frontend (Classification dashboard); n8n.
**Calls out to**: Anthropic; Supabase.
**Input**: `{ pageId, imageUrl, jobId?, pageNumber?, scaleNotation? }`.
**Output**: `{ success, pageId, roofPlan: RoofPlanData (primaryPitch, totalRoofAreaSF, slopes[], linearElements[], linearSummary {ridgeLF, hipLF, valleyLF, eaveLF, rakeLF}, features[], materialCallouts[], confidence), tokens_used }`.
**Logic inside**: prompt covers pitch notation variants (`6:12`, `6/12`, `6 IN 12`, triangle symbol); converts pitch to degrees; upserts `extraction_pages.ocr_data` and `extraction_jobs.results_summary` (or job-level data column).
**Side effects**: writes both tables.
**Failure modes**: standard; pitch parsing edge cases (mixed notation on the same plan).
**Notes**: Roofing trade is currently disabled in the takeoff approval path (see `06-known-problems.md` and the Detection Editor `CLASS_TO_TRADE` map). This route still runs and stores data; n8n simply ignores roofing.

---

## 17. `nextjs-api` — `/api/extract-wall-assembly`

**Endpoint**: `POST /api/extract-wall-assembly`; `GET` to read.
**Purpose**: Extract wall section / assembly layer composition (sheathing, WRB, siding, insulation, drywall) and total thickness, used by spec validation.
**Called by**: Frontend; n8n.
**Calls out to**: Anthropic; Supabase.
**Input**: `{ pageId, imageUrl, jobId?, pageNumber? }`.
**Output**: `{ success, pageId, data: WallAssemblyExtractionResult (hasWallSections, assemblies[]: { id, name, layers[], totalThickness, rValue? }, sectionDetails[], extractedAt, modelUsed, tokensUsed, processingTimeMs, extractionNotes), tokens_used }`.
**Logic inside**: Claude with detail / section-drawing prompt (`max_tokens: 4096`); persists to `extraction_pages.ocr_data` and updates `extraction_jobs.results_summary`.
**Side effects**: writes both tables.
**Failure modes**: standard; layer-thickness vs total-thickness mismatch is logged in `extractionNotes` but doesn't fail.
**Notes**: Output is informational today — not yet wired into auto-scope rules.

---

## 18. `nextjs-api` — `/api/extract-material-callouts`

**Endpoint**: `POST /api/extract-material-callouts`; `GET` to read.
**Purpose**: Extract textual material callouts from elevation drawings (e.g. "James Hardie HardiePlank", "ColorPlus Iron Gray").
**Called by**: Frontend (Detection Editor toolbar); n8n.
**Calls out to**: Anthropic; Supabase.
**Input**: `{ pageId, imageUrl, jobId?, pageNumber? }`.
**Output**: `{ success, pageId, data: { callouts[]: { id, rawText, normalizedText, trade, materialType?, manufacturer?, productMatch?, confidence, pageRef? }, summary, extraction_confidence }, tokens_used }`.
**Logic inside**: single-pass Claude extraction (`max_tokens: 4096`); writes `extraction_pages.ocr_data.material_callouts` and updates `extraction_jobs.results_summary`.
**Side effects**: writes both tables.
**Failure modes**: standard.
**Notes**: V1. The V2 sibling below replaces this for production usage.

---

## 19. `nextjs-api` — `/api/extract-material-callouts-v2`

**Endpoint**: `POST /api/extract-material-callouts-v2`; `GET` to read.
**Purpose**: Improved callout extractor with a two-call pipeline — survey → classify. Designed to reduce hallucinated manufacturer matches.
**Called by**: Frontend; n8n.
**Calls out to**: Anthropic (twice per call); Supabase.
**Input**: same as V1.
**Output**: `{ success, pageId, data, tokens_used }` (same envelope as V1; richer per-callout fields).
**Logic inside**: 1) **Survey** call (`max_tokens: 4096`) lists every callout candidate verbatim; 2) **Classify** call (`max_tokens: 1024`) per candidate normalises trade/material/manufacturer/product; deduplicates; aggregates token usage across both calls; writes `extraction_pages.ocr_data` and `extraction_jobs.results_summary`.
**Side effects**: writes both tables.
**Failure modes**: 2× tokens vs V1 → higher cost; classify-call failures are logged per-candidate, partial results returned.
**Notes**: Prefer this over V1 for new integrations.

---

## 20. `nextjs-api` — `/api/extract-notes-specs`

**Endpoint**: `POST /api/extract-notes-specs`; `GET` to read.
**Purpose**: Multi-page Claude pass over notes/spec pages to harvest exterior-finishing specifications (siding specs, trim, flashing, weather barrier, fasteners, code requirements, installation notes, special conditions).
**Called by**: Frontend (Plan Intelligence); n8n.
**Calls out to**: Anthropic (single multi-image call, `max_tokens: 8192`); Supabase (`extraction_pages` for page list, `extraction_jobs` for write).
**Input**: `{ job_id, include_all_pages? }`.
**Output**: `{ success, data: NotesSpecsData (summary, notes[]: { id, category, item, details, importance, source_page, verified }, categories: {by_category_count}, pages_analyzed, extracted_at, version, model_used, tokens_used, confidence, confidenceNotes) }`.
**Logic inside**: queries pages from `extraction_pages` (notes/specs-relevant); sends them as a multi-image prompt; persists to `extraction_jobs.notes_specs_data`.
**Side effects**: writes `extraction_jobs.notes_specs_data`.
**Failure modes**: standard; large jobs may exceed Claude context (no internal pagination).
**Notes**: Output feeds `/api/generate-rfi`. This is the most token-heavy single call (`max_tokens: 8192`).

---

## 21. `nextjs-api` — `/api/generate-rfi`

**Endpoint**: `POST /api/generate-rfi` (generate); `GET ?job_id=` (read); `PUT` (replace `rfi_list_data`).
**Purpose**: Turn `notes_specs_data` into a contractor-ready RFI list. Optionally seeds with a hardcoded `CRITICAL_SPECS` checklist (siding manufacturer, WRB, trim, flashing, fasteners, code) so essentials are never missed.
**Called by**: Frontend (RFI modal on Takeoff Viewer / Plan Intelligence).
**Calls out to**: Supabase (`extraction_jobs`).
**Input**: POST `{ job_id }`; PUT `{ job_id, rfi_list_data }`; GET `?job_id=`.
**Output**: `{ success, data: RFIListData (id, job_id, items[]: { id, source_note_id?, category, question, details?, impact, suggested_default?, resolution?, status, priority, source_page? }, summary, generated_at, updated_at, version) }`.
**Logic inside**: reads `extraction_jobs.notes_specs_data`; runs `analyzeNotesForGaps()` against the hardcoded `CRITICAL_SPECS` checklist; emits one RFI per gap with default values; persists to `extraction_jobs.rfi_list_data`. PUT lets the UI save user edits without regeneration.
**Side effects**: writes `extraction_jobs.rfi_list_data`.
**Failure modes**: 404 missing job; 400 missing notes_specs_data when generating.
**Notes**: This is **not** a Claude call — it's a static rule-based diff against the `CRITICAL_SPECS` array. The Claude call happens earlier in `extract-notes-specs`.

---

## External services referenced

The following services are not in this repo but are called by routes above. Behavior summarised so the doc is self-contained.

### A. Railway service `n8n-production-293e` — n8n workflow engine

**Service**: n8n on Railway.
**Endpoints invoked from this repo (via the proxy)**:
- `POST /webhook/project-process` — kick off page splitting, classification, Roboflow detection, Claude extractions; status updates land on `extraction_jobs`.
- `POST /webhook/detection-edit-sync` — recompute area/perimeter for a single edit; upsert `extraction_detections_draft`.
- `POST /webhook/approve-detection-editor` (a.k.a. `takeoff-generate`) — aggregate measurements, call Extraction API, evaluate auto-scope rules, price line items, write `takeoffs` / `takeoff_sections` / `takeoff_line_items`.
- `POST /webhook/multi-trade-coordinator` — Excel export, returns binary `.xlsx`.
**Input shapes**: workflow-specific JSON (see `05-agent-workflows.md`).
**Output shapes**: JSON envelopes for the first three; binary `.xlsx` for export.
**Side effects**: writes across many Supabase tables; uploads to Storage.
**Failure modes**: 120 s ceiling at the proxy; HTML error page when a workflow is inactive (proxy returns `502` with a `rawPreview`); Code-node template-literal escaping bugs (silent string corruption).
**Notes**: Workflow JSON lives only inside the Railway n8n UI, not in this repo. Treat the n8n service as a separate deploy target.

### B. Railway service `extraction-api-production` — Python microservice

**Service**: extraction-api on Railway.
**Endpoints invoked**:
- `POST /redetect` — re-detect a page (called by `/api/redetect-page`). Body `{ page_id, job_id, image_url, min_confidence }`. Returns `{ success, page_id, detections[], detection_count }`.
- `GET /wall-heights?job_id=` — `{ wall_heights: { default_height_ft, heights_by_elevation, source: 'ocr'|'estimated'|'manual', confidence } | null }`. Called by n8n during approval.
- `POST /calculate-linear` — `{ job_id }` → `Phase4Data { wall_heights, linear_summary { total_perimeter_lf, total_corners_inside/outside, total_trim_lf, by_elevation {...} }, calculated_at }`. Called by n8n.
- `GET /linear-summary?job_id=` — cached `Phase4Data | null`.
- `POST /siding-polygons` — `{ page_id }` → exterior + holes + per-building summaries for net-siding overlay rendering. Called from frontend hooks.
**Input/Output shapes**: see `RAILWAY_APIS.md` for full TypeScript declarations.
**Side effects**: stateless from this repo's perspective. May persist within its own DB (not visible here).
**Failure modes**: returns 404 when an endpoint isn't deployed yet (handled gracefully by `/api/redetect-page`); standard 5xx otherwise.
**Notes**: Owned by a separate repository; deploys are independent of this repo.

### C. Anthropic Claude

**Service**: Anthropic SDK (`api.anthropic.com/v1/messages`).
**Endpoints invoked**: `messages.create` only.
**Model**: `claude-sonnet-4-20250514`.
**Input**: image-or-PDF + text prompt; max-tokens varies by route (1024/2048/4096/8192).
**Output**: text content + `usage: { input_tokens, output_tokens }`.
**Side effects**: token spend, billable.
**Failure modes**: rate limits, JSON parse failures (Claude returns prose when uncertain), context-length overflow on big multi-page jobs.
**Notes**: All calls happen server-side; `ANTHROPIC_API_KEY` never touches the browser. Token counts surface in every `tokens_used` field.

### D. Roboflow

**Service**: Roboflow Workflows + Inference.
**Endpoints invoked**:
- Workflows API (`ROBOFLOW_WORKFLOW_URL`) — used by `/api/detect-region` and the n8n `project-process` workflow.
- Inference SAM (`/sam/embed_image`, `/sam/segment_image`) — used by `/api/sam-segment`.
**Input/Output**: bounding-box predictions with confidence; SAM masks/contours.
**Failure modes**: enterprise-tier gating on SAM point prompts; sporadic empty `predictions` arrays when the workflow output schema drifts.

### E. Replicate

**Service**: Replicate.
**Endpoints invoked**: `POST /v1/models/meta/sam-2/predictions` with `Prefer: wait`.
**Input/Output**: SAM-2 masks (image URL output).
**Failure modes**: model does **not** accept `point_coords` for image inputs — point-based prompts return 4xx/5xx today. Polling ceiling 30 s.

### F. Azure Document Intelligence

**Service**: Azure Document Intelligence (`prebuilt-layout`, API version `2024-11-30`).
**Endpoints invoked**: `analyzeLayout` (via `lib/azure-doc-intel`).
**Input/Output**: structured table cell data (rowIndex/columnIndex/content/kind).
**Failure modes**: unsupported image formats, network errors, malformed schedules.

### G. Supabase

**Service**: Supabase Cloud (`okwtyttfqbfmcqtenize`).
**Used by**: every `nextjs-api` route except `/api/n8n/*` and pure-Claude routes (`analyze-schedule-structure`, `claude-detect`).
**Tables touched directly by API routes** (writes only):
- `extraction_pages` — `ocr_data`, `ocr_status`, `ocr_processed_at` (all `extract-*` routes).
- `extraction_jobs` — `results_summary`, `floor_plan_data`, `notes_specs_data`, `rfi_list_data`, `project_name`, plus row delete (`/api/extraction-jobs/[id]`).
- `extraction_detections_draft` — soft delete + insert (`/api/redetect-page`).
**Failure modes**: RLS-denied reads through the **browser** client hang silently; this is why all protected reads route through these handlers using the server client. Schema drift handled via OCR-column fallback in `/api/extraction-pages`.

---

## Cross-route observations

- **No `/api/projects` or `/api/project-configurations` routes**. Projects + configs are written by the `ProjectForm` directly via the Supabase client and a server action, not via REST. n8n picks up changes via DB polling / webhook trigger.
- **No `/api/auth/*` routes in this directory**. Auth callbacks live under `/app/auth/*`, not `/app/api/*`.
- **Logging is verbose by design** — every route logs request params, query results, and key decisions. Useful in production triage; loud in dev.
- **`extraction_detections_draft`, `_validated`, `_detection_details` are not in `lib/types/database.ts`** — every route that touches them uses `as any` casts or a separate untyped client. Schema drift here is invisible to TypeScript.
- **All Claude routes follow the same DB-write pattern**: write to `extraction_pages.ocr_data` first, then upsert into `extraction_jobs.results_summary` (or a dedicated JSONB column). Failures on the second write are logged but do not fail the response.
- **Two failure-mode classes recur**: (1) **schema drift** silently swallowed by fallbacks, and (2) **Claude returns prose when uncertain** — leading to silent missing fields. Both surface in `extractionNotes` / `confidenceNotes` in the response.
