# 07 — Roadmap

> **Inferred** from open TODOs, the `/scope-review` skill description, recent commit momentum, and migration naming. Not a formal roadmap doc — treat as best-effort synthesis. When in doubt, ask the product owner (see `user` memory: Anthony Hutchinson).

## Recently shipped (last ~30 commits)

- **Polygon math hardening** — Shoelace-everywhere, DB-stored `area_sf` as source of truth, degenerate-polygon warnings (`f38839b`, `bf02c6b`, `3a1b295`).
- **Per-square economics in Excel** — Sell/SQ, Sub Payout/SQ, Profit, Margin on the Summary sheet (`3f204e8`, `439035e`).
- **Excel section order & grouping** — 7 consolidated presentation groups with legacy fallback; UI and Excel now match (`314939e`, `6726cfa`).
- **Detection Editor stability** — race-condition fixes around `handlePageClassify`, `setPages`, `saveEstimateConfig`, panel mount (`2f88c27`, `0e29941`, `9c66ece`, `ed6adc5`, `028a62f`).
- **Estimate Settings Panel** — Phase 2A/2B section toggles, toolbar-integrated settings, config_match mechanism + dynamic L&I (`a851b38`, `14f14c5`, `f74557f`, `81d82c5`).
- **Bluebeam integrations** — auto-enrich materials, "Show Bluebeam Markups" toggle, bulk material assignment, scale-less approval, extraction-job delete (`a359b16`, `fc2d723`, `f2c8556`, `5794ed9`).
- **Detection canvas** — real polygon shapes, Live Calculations panel expanded, draggable column reorder in Markups List (`c695831`, `e7527a7`, `18586ab`).

## In-flight / near-term (inferred)

- **Wire trim variables in n8n** — `trim.total_head_lf / _jamb_lf / _sill_lf` → formula variables so head-flashing and casing rules fire correctly (`docs/N8N_TRIM_IMPLEMENTATION.md`).
- **Approval workflow** — `app/projects/[id]/page.tsx` has a "TODO: Implement approval workflow" for moving a takeoff from `review` → `approved`.
- **Send-to-client** — sibling TODO to email / portal-share the approved estimate.
- **Plan Intelligence `fromDetections`** — surface detection counts in the chatbot context (`PlanIntelligence.tsx` TODO).
- **Type regeneration** — bring `lib/types/database.ts` current with the newer tables (`siding_auto_scope_rules`, `pricing_items`, `organizations`, …).
- **MN568 baseline expansion** — `/takeoff-validate` skill regression fixture; additional reference projects beyond MN568 would give more signal.
- **Stone veneer migration** — `migrate_stone_veneer_rules_to_siding.sql` rolled rules under the siding table; follow-through for UI / presentation groups.

## Strategic (from `/scope-review` skill + trade configs already in DB)

- **Multi-trade expansion** — `roofing`, `windows`, `gutters` already have `trade_configurations` and refinement migrations (`add_roofing_configurations.sql`, `refine_roofing_fields.sql`, `add_windows_configurations.sql`, `refine_windows_fields.sql`, `add_gutters_configurations.sql`, `refine_gutters_fields.sql`). Full auto-scope coverage for these trades is the next horizontal expansion.
- **Licensing play** — expose the platform to other contractor orgs (multi-tenant foundations already exist via `organizations` / `organization_memberships`).
- **Plan-intelligence chatbot depth** — currently single-turn; conversational history + plan-wide reasoning is a plausible next step given the Claude Assistant / Plan Reader components already in place.
- **Edge classification** — adding `edge_type` + `is_exterior` to detections would close the 5–15 % trim over-estimate gap. Known architecturally but not scoped yet.
- **Self-improving skill system** — `/retro` skill encodes lessons into other skills' checklists so the same bug doesn't recur. This is ongoing meta-work, not a feature.

## Explicitly NOT on the near-term roadmap

- Staging environment / feature flags (cost/complexity vs. low deploy frequency).
- Custom auth service (sticking with Supabase Auth).
- Switching away from n8n for orchestration.
- Replacing AG Grid Community with Enterprise (licensing decision).

## Signals to watch

- New migrations under `/migrations/` — the fastest signal for "where is the product heading" because config is DB-driven.
- New trade keys in `trade_configurations` — implies a new vertical coming online.
- New `presentation_group` values appearing — triggers Excel / UI group additions.
- Additions under `/components/cad-markup/*` — Bluebeam / CAD import is an adjacent workflow that tends to grow in bursts.
