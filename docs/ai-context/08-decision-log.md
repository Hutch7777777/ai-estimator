# 08 — Decision Log

> Architectural decisions and the reasoning behind them. Pulled from `CLAUDE.md`, the `/arch-review` skill checklist, recent commit messages, and root-level architecture docs.

## Core platform choices

### D1 — Database-driven configuration (not code-driven)
**Decision**: Trades, form fields, products, auto-scope rules, labour rates all live in Postgres tables (`trade_configurations`, `product_catalog`, `siding_auto_scope_rules`, `labor_auto_scope_rules`).
**Why**: New trades and product lines must be onboardable without a code deploy. A single contractor org can add or tweak materials through a dashboard workflow.
**Consequence**: Never hardcode trades, field definitions, or rules in TS/TSX. Adding a material means a migration + rule insert, not a component edit.

### D2 — Async via n8n + Supabase Realtime
**Decision**: Long-running work (PDF classify, detect, extract, aggregate, price, Excel) runs in n8n workflows on Railway. The browser subscribes to Supabase Realtime channels for progress.
**Why**: n8n already hosts the heavy ML pipeline steps (Roboflow, Extraction API calls). Adding a second orchestrator would duplicate state and deploy surface.
**Alternatives rejected**: Server-sent events (would require a long-lived Next.js process); in-process async (blocks Railway workers); message broker (too much infra for one vertical).

### D3 — Provenance on every line item
**Decision**: `takeoff_line_items.source_measurement` (JSONB) records which detection / extraction payload produced the row.
**Why**: Contractors need to explain line items back to clients. Without provenance, a $500 discrepancy is unauditable.
**Consequence**: Every rule-engine emission must write a meaningful `source_measurement`. "Manual" items set `calculation_source = 'manual'` with an empty provenance.

### D4 — Supabase as the single backend
**Decision**: Postgres, auth, file storage, and realtime all live in Supabase Cloud. No separate auth service, queue, or storage provider.
**Why**: One vendor, one SDK on the client, RLS as the multi-tenant boundary. The tradeoff is platform lock-in, which is acceptable for this stage.

### D5 — No staging environment
**Decision**: `main` auto-deploys to Railway production. No staging or canary environment.
**Why**: Deploy volume is low and contractors want fixes ASAP. Adding staging would double infra cost + slow shipping.
**Consequence**: `/pre-deploy` skill is mandatory before every push; `/takeoff-validate` runs MN568 as a regression baseline. Breaking production is a one-commit revert away.

### D6 — Supabase service-role for protected reads
**Decision**: Reads that traverse RLS-protected tables go through Next.js API routes with the service role key, not the browser client.
**Why**: The browser client silently hangs on RLS-denied queries (no error, no timeout). Multiple bugs traced back to this. Routing server-side makes failures surface.
**Constraint**: Never ship the service-role key to the client.

## Rule engine choices

### D7 — `shouldApplyRule()` evaluation order
**Decision**: Check `config_match`, `trim_system`, `material_category`, `sku_pattern`, and numeric thresholds **before** honoring `trigger.always = true`.
**Why**: `always: true` was added as a fallback escape hatch, then became a silent override when placed first. Fixed in `f74557f`.
**Constraint**: `/arch-review` enforces this ordering; retrosurface lessons encode back into it.

### D8 — Generic + per-manufacturer rule paths
**Decision**: Generic rules (`manufacturer_filter IS NULL`) and per-manufacturer rules (`manufacturer_filter = ARRAY['…']`) run through separate code paths in autoscope-v2 (~line 1554 vs ~1621).
**Why**: Per-manufacturer SKUs and pricing differ enough that collapsing the code paths created too many conditionals.
**Consequence**: Every fix / feature must be applied to **both** paths. Single-path fixes are the #1 root cause of "rule works for Hardie but not Whitewood".

### D9 — Shoelace everywhere + DB-stored `area_sf`
**Decision**: Polygon area uses the Shoelace formula end-to-end (create, drag, resize, display, Excel). The authoritative value lives in `extraction_detections_draft.area_sf`; pixel math in the browser is a fallback with a `console.warn`.
**Why**: Bounding-box area inflated triangular gable shapes. Drag/resize previously wrote bounding-box values back. Fixed across commits `3a1b295`, `bf02c6b`, `f38839b`.
**Consequence**: Do not restore bounding-box area for any code path. Degenerate polygons warn but do not crash.

### D10 — Seven consolidated presentation groups
**Decision**: Line items group into `cladding`, `trims`, `metals_flashings`, `waterproofing`, `accessories`, `soffit`, `gutters` (and a `paint` special-case) for both UI and Excel output.
**Why**: The prior group taxonomy exploded across migrations; contractors read 15+ groups as noise. Consolidation commit: `6726cfa`.
**Consequence**: Legacy group names still route through a fallback mapper in `exportTakeoffExcel.ts`. New rules must use a canonical group or they land in "unknown".

## Frontend choices

### D11 — AG Grid Community only
**Decision**: Never import from `ag-grid-enterprise`.
**Why**: Enterprise has a commercial license; the Community package already covers grid edit / sort / filter / column ops.

### D12 — Tailwind v4 with `@theme` (no config file)
**Decision**: Use the v4 CSS-first config — no `tailwind.config.js`.
**Why**: Tailwind v4 ships with `@theme`; a JS config would be a second source of truth.

### D13 — shadcn/ui managed via CLI
**Decision**: Don't edit `/components/ui/*` manually; regenerate via `npx shadcn@latest add <component>`.
**Why**: Upstream updates and customisation consistency.

### D14 — Konva popovers as DOM siblings / portals
**Decision**: Popovers (estimate settings, material picker) render as siblings of the Konva canvas or through React portals, never as children.
**Why**: Konva captures pointer events on children. Fixed across `3e6a767`, `b8c919d`, `78ad8b3`, `139ce06`.

### D15 — Path alias `@/*` → repo root
**Decision**: `tsconfig.paths` maps `@/*` to the project root.
**Why**: Avoids `../../../` traversal; every import is "from root".

## Auth & middleware

### D16 — Middleware-protected routes except explicit public list
**Decision**: `middleware.ts` redirects unauthenticated users to `/login` except for `/login`, `/signup`, `/auth/callback`, `/auth/confirm`, `/onboarding`, `/api`.
**Why**: Default-deny is safer than default-allow. `/api` is excluded at the middleware layer because handlers re-check the session.

### D17 — `NEXT_PUBLIC_DEV_BYPASS_AUTH` in dev only
**Decision**: Local-only bypass guarded by a `NEXT_PUBLIC_` env var.
**Why**: Fast iteration during setup. Because it's prefixed `NEXT_PUBLIC_`, it's visible in the client bundle, so it gets reviewed before every prod deploy.

### D18 — Real org IDs even in dev bypass
**Decision**: Dev bypass uses the real Exterior Finishes organization ID (commit `87a009d`).
**Why**: Fake IDs silently bypass RLS and mask bugs that only appear in production.

## Excel export

### D19 — `exportTakeoffExcel.ts` as canonical reference
**Decision**: The 61 KB Excel export lives in the frontend utility folder and is the authoritative spec for Excel output, even when n8n is doing the generation.
**Why**: The output format is business-sensitive; having one implementation to reference keeps drift in check.
**Consequence**: Formula cell references (e.g. `Takeoff!C{row}`) in the Summary sheet must match the Takeoff sheet's layout exactly.

## Notable reversals / evolutions

- **Bounding box area → Shoelace area** (commits `bf02c6b`, `f38839b`, `3a1b295`). Reason: gable/triangle shapes inflated. Don't undo.
- **Panel emits-on-mount → panel waits for DB** (commits `ed6adc5`, `028a62f`, `9c66ece`). Reason: default values were overwriting user settings.
- **React Portal → DOM sibling → Portal** for Konva popovers — iterated several times; current state is Portal (`b8c919d`) with sibling DOM alignment for z-index control.
- **Two-pass Claude schedule → Azure `analyzeLayout`** (alternative; both still present). Use Azure for messy merged-cell tables.
- **V1 line-item response handling → V2 (all materials)** (`itemHelpers.ts`) — V1 paths marked deprecated.

## Things that are decided and should NOT be revisited without explicit sign-off

- Database-driven config (D1)
- No staging (D5)
- AG Grid Community only (D11)
- Shoelace + DB-stored area (D9)
- `shouldApplyRule()` ordering (D7)
- Seven presentation groups (D10)
