# 06 — Known Problems, Tech Debt & Unreliable Areas

> Failure modes, anti-patterns, and repeat bugs captured from code comments, recent commit fixes, the `/arch-review` skill checklist, and exploration findings.

## Extraction & detection limitations

| Area | Impact | Notes |
|------|--------|-------|
| SAM-2 point segmentation disabled | Users can't click to segment arbitrary regions | Replicate SAM-2 model does not support point prompts; Roboflow SAM needs enterprise tier. Route (`/api/sam-segment`) returns "unsupported". UI wiring remains. |
| Edge classification gap | 5–15 % trim over-estimate when openings are adjacent | No `edge_type: head|sill|jamb_left|jamb_right` or `is_exterior` on detections. Documented in `EXTRACTION_ARCHITECTURE_ANALYSIS.md`. |
| Wall height not per-detection | Multi-story material quantities approximate | `extraction_job_totals.wall_heights` is one number; detections carry no story index. |
| Corners assumed 90° | Non-rectangular buildings slightly off | No `angle_degrees` column on detections. |
| Gable measurement gaps | Can't separate gable siding from main wall cleanly | Only `rake_lf` is captured; `base_width`, `peak_height`, `roof_pitch` missing. |
| Product-specific params | Overlap, exposure, board length assumed by n8n | No per-detection `exposure_in`, `board_length`, `waste_factor`; n8n workflow is a black box. |
| Adjacency tracking missing | Can't optimise trim where openings share a jamb | No `parent_detection_id` or `shared_edges`. |
| Hole / subtraction tracking | Unclear impact on net area | `PolygonWithHoles` exists but `has_hole` → net-area math is inconsistent. |
| Trim variables not wired in n8n | Some trim rules produce 0 | `trim.total_head_lf / _jamb_lf / _sill_lf` not mapped to formula variables. See `docs/N8N_TRIM_IMPLEMENTATION.md`. |

## Performance / capacity

- **n8n 120-second webhook timeout** (`/api/n8n/[...path]`). Excel generation (`multi-trade-coordinator`) can approach it on large jobs. If it exceeds 120 s the proxy aborts with 408.
- **Hot / large files** — changes here are high-blast-radius:
  - `lib/utils/exportTakeoffExcel.ts` (~61 KB)
  - `lib/supabase/extractionQueries.ts` (~23 KB)
  - `lib/utils/polygonUtils.ts` (~22 KB)
  - `SYSTEM_INTEGRATION.md` (~141 KB root doc)
- **Realtime + large canvases** — opening elevations with many detections + Realtime updates has caused re-render loops; `ResizeObserver` was one source (commit `caf742d`).

## Tech debt

- `typescript.ignoreBuildErrors: true` in `next.config.ts` — CI will green-light type errors. Always run `npx tsc --noEmit` manually.
- No test framework configured. No Jest / Vitest / Playwright, no `__tests__` directory, no test script in `package.json`.
- **Deprecated V1 response handling** in `lib/utils/itemHelpers.ts` — all line items are treated as materials in V2; V1 branches still exist.
- **Legacy `presentation_group` fallback** in `lib/utils/exportTakeoffExcel.ts` (~104–155) — keeps old rules rendering while new 7-group taxonomy spreads.
- **CAD / Bluebeam subsystem** (`/components/cad-markup/*`, 22+ components) is active but secondary to the Detection Editor; changes here can silently regress the primary path via shared hooks.
- **`user_profiles`, `organizations`, `siding_auto_scope_rules`, `pricing_items`, etc.** are not yet in `lib/types/database.ts`. Regenerate types after the next wave of migrations.
- **RLS policies** — service-role vs anon behaviour is inconsistently enforced. The browser client silently hangs on denied reads (see below).

## Repeat-bug zones (from `/arch-review` skill checklist)

These keep coming back. Every change to the rule engine, detection data, or settings panel should cross-check against this list:

1. **Toggle ordering** — `shouldApplyRule()` must check `config_match` / `trim_system` **before** the `if (trigger.always) return true` short-circuit. (commit `f74557f`)
2. **JSONB truthiness** — `undefined` / `null` defaults to "fires" because JavaScript truthiness differs from what a user expects. Use `isTrue()` / `isFalse()` helpers.
3. **Formula variable names** — use `facade_sqft`, not `measurements.facade_sqft`. The evaluator is flat.
4. **`presentation_group` typos** — silent zero quantities when the group doesn't match the Excel grouper.
5. **`manufacturer_filter` syntax** — Postgres text array: `ARRAY['James Hardie']`. Case-sensitive.
6. **Dual code paths in autoscope-v2** — generic (~line 1554) vs per-manufacturer (~line 1621) are separate blocks. Changing one without the other is the most common cause of "rule works for Hardie but not Whitewood".
7. **n8n Code-node template literals** — use string concatenation, not backticks. Backticks are re-escaped when n8n serialises the expression into JSON.
8. **Konva event interception** — popovers must render as DOM siblings (or via React Portal) of the Konva canvas. Children get their events eaten.
9. **`scale_ratio` is per-page** — on `extraction_pages`. Using a job-level default silently inflates/deflates areas.
10. **`sku_pattern` scoping** — must be scoped to matching `material_category` products only (commit `4a1cb21`), otherwise substrings match across categories.
11. **Polygon area** — use Shoelace, not bounding box. Drag/resize now does this end-to-end (commits `bf02c6b`, `f38839b`, `3a1b295`).

## Workflow gaps / TODOs in source

| File | TODO |
|------|------|
| `app/projects/[id]/page.tsx` | "Implement approval workflow" |
| `app/projects/[id]/page.tsx` | "Implement send to client" |
| `app/takeoffs/[id]/components/PlanIntelligence.tsx` | `fromDetections` currently hardcoded to `0`; should come from job totals |
| `docs/N8N_TRIM_IMPLEMENTATION.md` | Trim head/jamb/sill variables not yet wired through n8n workflow |

## Auth / RLS quirks

- **Supabase browser client hangs on RLS-protected tables** — no error is thrown; the promise never resolves. Fix is to route protected reads through a Next.js API route using the service role key (`SUPABASE_SERVICE_ROLE_KEY`).
- **Dev bypass** — `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` in `.env.local` skips auth locally. If this flag leaks into production the entire app is open. Guard rails: env var is `NEXT_PUBLIC_` prefixed, so it's visible in the client bundle — review before every prod deploy.
- **Real org IDs in dev bypass** — commit `87a009d` switched the dev bypass to use the real Exterior Finishes org ID so RLS still fires; don't re-hardcode a fake one.

## Deployment / release risk

- **No staging environment** — `git push origin main` goes straight to Railway production.
- **No feature flags** — changes are behind "is the code deployed?" only.
- **Migrations are applied via Supabase dashboard / CLI**, out of band from Railway. Forgetting to run one causes the fallback-on-missing-column code paths to silently limp.
- **n8n workflows must be imported manually** into the Railway n8n; local n8n-MCP only sees Cloud dev.

## Places where behaviour is non-obvious

- `extraction_detections_draft.area_sf` is the source of truth; pixel math in the browser is a fallback with `console.warn`. Do not "fix" the fallback by making it primary.
- Detection class vs `presentation_group` vs `category` are **three different taxonomies** that must agree for a rule to fire. Missing any one silently zeroes quantity.
- Paint items are routed out of the Materials table (`separateItemsByType`) into their own table and Excel block. A paint item landing in Materials means the detection is misconfigured.
- "Unmatched items" — if Approve is clicked before every detection has an assigned material, unmatched ones are still added to the payload with flags (commit `af4f2fb`). These surface in the takeoff but with zero price.
