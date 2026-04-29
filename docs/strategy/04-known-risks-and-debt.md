# 04 — Known Risks and Debt

**Audience:** anyone planning a phase, scoping a sprint, or scoring blast radius before a change
**Purpose:** consolidate every known risk into one tiered inventory. Tiered by **correctness impact** — Tier 1 can produce wrong dollar amounts in a contractor's estimate, Tier 2 can produce wrong amounts under specific conditions, Tier 3 is operational/UX.

---

## Current behavior

### Tier 1 — Correctness, high blast radius

Risks that can produce wrong dollar amounts in production estimates. Any of these failing silently is a real-money problem for the contractor.

| # | Risk | Source location | Symptom |
|---|---|---|---|
| 1.1 | **Hardcoded n8n detection pricing** — corbels $45, brackets $35, shutters $120 not in `pricing_items` | n8n workflow `detectionPricing` object | Pricing drift between code and reality; contractor charged from one source, paid sub from another |
| 1.2 | **Hardcoded n8n belly-band pricing** — SKUs and prices in n8n, not DB | n8n workflow `bellyBandPricing` object | Same as 1.1 |
| 1.3 | **Multiple competing rule tables** — `siding_auto_scope_rules` (API reads) vs possible `auto_scope_rules_v2` (n8n may use) | DB | Same project produces different totals from different code paths |
| 1.4 | **Trim variables not wired through n8n** — `trim.total_head_lf`, `_jamb_lf`, `_sill_lf` | n8n workflow | Some trim rules silently produce zero (no error, just $0 line items missing) |
| 1.5 | **Edge classification gap** — perimeter currently double-counts edges shared between detections | Detection layer | Documented 5–15% trim over-estimate |
| 1.6 | **Hardcoded API constants** — `MARKUP_RATE=0.26`, `SOC_UNEMPLOYMENT_RATE=0.1265`, `LI_HOURLY_RATE=3.56`, `INSURANCE_RATE_PER_THOUSAND=24.38`, `DEFAULT_CREW_SIZE`, `DEFAULT_ESTIMATED_WEEKS` | Railway API source | Rate change requires code deploy instead of DB update; org-level overrides require code branching |
| 1.7 | **Hardcoded API SKUs/rates** — `LABOR_RATES`, `OVERHEAD_RATES`, `TRIM_SKUS`, `AUTO_SCOPE_SKUS` | Railway API source | Same as 1.6 |
| 1.8 | **`getPresentationGroup()` 60+ hardcoded mappings** | Railway API source | Adding a new product requires code change + deploy |
| 1.9 | **No staging environment** — every push to `main` auto-deploys to Railway | CI/CD | One bad merge = production outage |
| 1.10 | **No test framework configured** — no Jest/Vitest, no `__tests__` | Repo | Regressions caught manually or in production |
| 1.11 | **`typescript.ignoreBuildErrors: true` in `next.config.ts`** | Build config | Type errors green-light through CI |
| 1.12 | **Duplicate Excel generation** — frontend `lib/utils/exportTakeoffExcel.ts` AND n8n | Frontend + n8n | Two implementations must agree on the contract; drift between them produces silently wrong Excel |

### Tier 2 — Operational, recurrence likely

The 11 repeat-bug zones from the `/arch-review` skill checklist. Each has bitten production at least once.

| # | Risk | Where it bites | Captured in |
|---|---|---|---|
| 2.1 | **Toggle ordering** — wrong state when toggles re-render | Frontend hooks | `/arch-review` |
| 2.2 | **JSONB truthiness** — `=== true` vs `=` mismatch on `trigger_condition` JSONB booleans | DB-backed rule eval | `/arch-review` |
| 2.3 | **Formula variable name drift** — rule references `building_area_sf`, code provides `facade_sqft` | Auto-scope eval | `/arch-review` |
| 2.4 | **Presentation_group typos** — silently fall through to default group | Rule emission | `/arch-review` |
| 2.5 | **manufacturer_filter syntax** — must be object syntax, not string | Auto-scope rules | `/arch-review` |
| 2.6 | **Dual code paths in autoscope-v2** — generic vs per-manufacturer; one fix without the other regresses | `autoscope-v2.ts` | `/arch-review` |
| 2.7 | **n8n template literals** — backticks re-escape in n8n JSON serialization; must use string concatenation | n8n Code nodes | `/arch-review` |
| 2.8 | **Konva event interception** — popovers must render as DOM siblings, not Konva children | Detection Editor | commits `3e6a767`, `b8c919d`, `78ad8b3`, `139ce06` |
| 2.9 | **Per-page scale_ratio** — older code paths used job-level scale | Geometry | `/arch-review` |
| 2.10 | **sku_pattern scoping** — must scope within `material_category` to avoid cross-category matches | Auto-scope rules | `/arch-review` |
| 2.11 | **Polygon area math** — must use Shoelace, not bounding-box | Geometry | commits `bf02c6b`, `f38839b` |

Other Tier 2 operational risks:

| # | Risk | Detail |
|---|---|---|
| 2.12 | **n8n 120-second webhook timeout** | `multi-trade-coordinator` approaches the limit on large jobs. Hardcoded in proxy. Solution is to split workflows, not raise the limit |
| 2.13 | **`lib/types/database.ts` is stale** | `user_profiles`, `organizations`, `siding_auto_scope_rules`, `pricing_items` not yet typed |
| 2.14 | **RLS quirk: browser client hangs** on RLS-protected tables (no error). Fix: route through Next.js API with service role |
| 2.15 | **`NEXT_PUBLIC_DEV_BYPASS_AUTH` is visible in client bundle** | Dev bypass risk; commit `87a009d` switched bypass to use real Exterior Finishes org ID so RLS still fires |
| 2.16 | **Migrations applied out-of-band** | No CI-managed migration runner |
| 2.17 | **Panel-on-mount race** — `EstimateSettingsPanel` must not emit defaults until DB state loaded | commits `9c66ece`, `028a62f`, `ed6adc5` |
| 2.18 | **Realtime conflict race** — `recentlyEditedRef` 5-second TTL; fast edits may conflict | `editingModeRef` helps but not foolproof |
| 2.19 | **Hardcoded Supabase credentials** in `lib/supabase/extractionQueries.ts` | Should be env-driven |

### Tier 3 — Scale and UX, lower urgency

| # | Risk | Detail |
|---|---|---|
| 3.1 | **SAM-2 disabled** | `/api/sam-segment` returns "unsupported"; Replicate route + UI wiring remain |
| 3.2 | **Missing extraction-job upload UI** for multi-page construction PDFs | `FRONTEND_ANALYSIS.md` flags entire `/start-job` → `extraction_jobs` creation pipeline as "NOT IMPLEMENTED" |
| 3.3 | **Large component files** — DetectionEditor 1,679 LOC, KonvaDetectionCanvas 953 LOC, useExtractionData 755 LOC, exportTakeoffExcel 61 KB |
| 3.4 | **Duplicate canvas components** — legacy `DetectionCanvas.tsx` still exists |
| 3.5 | **Inconsistent error handling** — mix of try/catch and `.catch()` chaining |
| 3.6 | **No virtualization** for 1000+ detection sets — may lag |
| 3.7 | **Undo stack memory** — deep clones entire detection map on each change (50-level) |
| 3.8 | **Konva event interception edge cases** — see 2.8; the underlying pattern is fragile |
| 3.9 | **Missing detection classes** — `valley`, `vent`, `flashing`, `downspout`, `outlet`, `hose_bib`, `light_fixture` not user-selectable |
| 3.10 | **Coordinate system confusion** — Roboflow center-based vs Konva top-left; off-by-half-dimension errors possible |
| 3.11 | **Calc notes** — n8n must use string concatenation, not backticks (also a Tier-2 footgun) |

---

## Target behavior

Same inventory, each item phase-tagged from `05-implementation-roadmap.md`:

| Phase | Closes |
|---|---|
| Phase 0 — Pre-flight | n/a (instrumentation) |
| Phase 0.5 — Regression harness skeleton | n/a (creates the safety net used by every later phase) |
| Phase 1 — Database is the truth | 1.1, 1.2, 1.3, 1.6, 1.7, 1.8 |
| Phase 2 — Wire trim variables through n8n | 1.4 |
| Phase 3 — Drain hardcoding from API | 1.6, 1.7, 1.8 (completes 1.6/1.7/1.8 if Phase 1 only seeds DB) |
| Phase 4 — Drain hardcoding from n8n | 1.1, 1.2 (completes if Phase 1 only seeds DB) |
| Phase 5 — Move Excel to API | 1.12 |
| Phase 6 — Cleanup | 1.10, 1.11, 2.13, 2.19, 3.4 |
| Phase 7 — Strategic | 1.5, 3.1, 3.2, 3.3, 3.6, 3.7, 3.9 |
| Out of scope (per `07-roadmap.md` non-goals) | 1.9 (no staging) |

The 11 repeat-bug zones (Tier 2.1–2.11) are addressed by the working rules in `06-claude-code-working-rules.md`, not by a roadmap phase. They cannot be "fixed" structurally — they are categories of mistake the agent must avoid each time.

---

## Non-goals

- Assigning effort estimates (out of scope for this doc; phase scope owns that)
- Choosing implementation approaches for any item (target architecture owns that)
- Triaging by frequency or recency (this is an inventory, not a backlog)

---

## Known contradictions / uncertainty

- **Trim variable status (1.4)** — the source docs disagree on whether trim variables are partially wired (some rules work, others silently zero) or fully unwired. Treating as "partially wired with silent-zero failure on some rules" until validated against the live n8n workflow.
- **Rule table identity (1.3)** — `auto_scope_rules_v2` may or may not exist in production DB. Verify before Phase 1 begins.
- **Excel-generation duplication (1.12)** — frontend export is the well-tested path with recently-shipped per-square economics. n8n export status is unclear. The migration target is API-only, but cutting over without parity testing is risky.

---

## Open questions

- For Tier 2 ops items, should there be CI checks (lint rules, type rules) to prevent recurrence beyond skill-checklists? Examples: a lint rule that flags backticks in n8n string fields, a Zod schema that flags non-canonical `presentation_group` values.
- What's the policy on touching Tier 3 large files (3.3) when fixing a Tier 1 issue inside them? Bulk refactor without a regression harness is unsafe; surgical edits inside a 1,679-LOC file are slow.
- Are there Tier 1 risks not yet captured? `06-known-problems.md` says it's a "consolidating" doc — there may be ad-hoc bugs in commit history that aren't here yet.

---

## Source citations

- `docs/ai-context/06-known-problems.md` — Tier 1 and Tier 2 items, repeat-bug zones, RLS quirks
- `ARCHITECTURE_VIOLATION_REPORT.md` — hardcoded values inventory (1.1, 1.2, 1.3, 1.6–1.8, 1.12)
- `FRONTEND_ANALYSIS.md` — Tier 3 frontend items (3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.9, 3.10)
- `docs/ai-context/04-estimating-business-rules.md` — 16 rule-engine footguns referenced by Tier 2.1–2.11
- `docs/ai-context/05-agent-workflows.md` — 120s timeout (2.12), Konva interception commits (2.8)
- `docs/ai-context/07-roadmap.md` — non-goals that bound the phase plan
