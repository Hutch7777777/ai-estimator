# Phase 1.2 — Presentation Group Contract & Mapping Plan

**Status:** ✅ DESIGN COMPLETE — landed 2026-04-27. Drill-down SQL run; owner decisions approved; Phase 1.3 implementation plan recorded below.
**Audience:** Phase 1.3 implementer; rule authors; reviewers of any future PR that emits a `presentation_group` value
**Purpose:** define the canonical taxonomy of `presentation_group` values, map every observed historical/active value into the canonical set, and select an enforcement strategy for Phase 1.3 — without changing any runtime, schema, data, or test-data baseline.

---

## Why this exists

`docs/strategy/phase-1-database-audit.md` recorded that `presentation_group` is the only Tier-1 risk still open after Phase 1.1. Live data has many more distinct values than the canonical 7 in `docs/strategy/01-product-output-spec.md`. The current MN568 baseline survives because some non-canonical values are remapped at presentation time (e.g. `Architectural Details → trims`) and others happen to land in canonical buckets coincidentally.

Without an authoritative mapping, any rule edit, new rule, or refactor risks emitting a new non-canonical value (silent Tier-1) or accidentally remapping a value differently across code paths.

This doc is the **single source of truth** for that mapping. It does not modify any code or data.

---

## Drill-down findings (recorded 2026-04-27)

`docs/sql-audits/05-presentation-group-drift-detail.sql` was run by the operator against production. Recorded findings:

### Recent line-item emissions (since 2026-03-23)

The current operating window is mostly canonical-ish. Distinct `presentation_group` values appearing in `takeoff_line_items` since 2026-03-23:

- **Material (canonical):** `cladding`, `trims`, `metals_flashings`, `waterproofing`, `accessories`
- **Non-material:** `labor`, `overhead`, `Unmatched Items`
- **Non-canonical leftovers** (still emitted by some active rules): `Architectural Details`, `Accessories` (capitalized), `Fasteners`, `Labor` (capitalized), `Siding`, `Water Barrier`

Pre-2026-03-23 history contains additional values not represented in recent output. Those are dispositioned as `historical_only` and require no remap (no current rule emits them).

### Active rule emissions (`siding_auto_scope_rules.presentation_group` distinct values)

Rules continue to emit legacy labels alongside canonical ones. Distinct values currently emitted by active rules:

- **Already canonical:** `cladding`, `trims`, `metals_flashings`, `waterproofing`, `accessories`
- **Legacy (need forward_remap):** `Belly Band`, `Fasteners`, `Flashing`, `Siding`, `Siding Materials`, `Substrate & WRB`, `Horizontal Trims`, `Sheet Metal`, plus the variants in the inventory below

### MN568 — regression guardrail confirmed

The captured MN568 baseline uses the current output shape (mostly canonical, with `Architectural Details` remapped at presentation time). It remains the regression guardrail for Phase 1.3. Any Phase 1.3 PR that touches code or seeds must keep `npm run validate:mn568` at exit 0.

### Inventory completeness

Every distinct value surfaced by the drill-down is present in the mapping inventory below — including `Sheet Metal`, which was added during this update. **No new `needs_owner_decision` items emerged.**

---

## Canonical taxonomy

### Material groups (7) — render in the Excel materials tabs

The canonical 7 from `docs/strategy/01-product-output-spec.md`. These are the only groups that should appear in `presentation_group_totals` of the regression baseline.

| Canonical group | Scope |
|---|---|
| `cladding` | Lap siding, panel siding, shingle siding, primary wall covering |
| `trims` | All trim — corners, frieze, bands, casings (head/jamb/sill), architectural details, belly band trim boards |
| `metals_flashings` | Metal flashing (Z-flash, kick-out, drip edge), gable end flashing, metal trim |
| `waterproofing` | WRB (housewrap), flashing tape, peel-and-stick membranes, sealants used as moisture barrier |
| `accessories` | Caulk & sealants (non-WP), fasteners, starter strips, J-channel, vent boots, miscellaneous installation hardware |
| `soffit` | Soffit panels, vented/non-vented soffit, soffit trim |
| `gutters` | Gutters, downspouts, gutter accessories, leader heads |

### Non-material buckets (4) — render outside the materials tabs

These are NOT material groups. They render in their own sections of the Excel and the in-app Takeoff Viewer. The regression baseline tracks them through `material_subtotal`, `labor_subtotal`, `overhead_subtotal`, and `final_total` separately — they MUST NOT contribute to `presentation_group_totals`.

| Non-material bucket | Scope |
|---|---|
| `labor` | Labor line items (siding install, trim install, WRB install). Aggregated into `labor_subtotal` |
| `overhead` | Overhead line items (mobilization, port-a-john, insurance, L&I). Aggregated into `overhead_subtotal` |
| `unmatched_items` | Engine UNMATCHED fallback emissions (detection classes with no rule match; Bluebeam subjects with no `pricing_items` SKU). Engineer/contractor-business-owner review needed before they get a real SKU |
| `review_required` | Items flagged for human review for any reason other than UNMATCHED — low-confidence detections, disputed measurements, ambiguous categorizations. Distinct from `unmatched_items` because the issue is review, not pricing |

---

## Disposition codes

Every mapping entry uses one of:

| Code | Meaning |
|---|---|
| `forward_remap` | Observed value gets remapped to a canonical group (or non-material bucket) at presentation time. Historical takeoffs keep the original value; future emissions normalize. No data rewrite. |
| `historical_only` | Observed value appears in historical `takeoff_line_items` only. No active rule emits it; no current code path can produce it. No mapping action needed; documenting only. |
| `promote_to_canonical` | Observed value is sufficiently distinct that it should become a new canonical group (extends the spec from 7 to N). Requires `01-product-output-spec.md` update before Phase 1.3. |
| `separate_bucket` | Observed value belongs to a non-material bucket (`labor`, `overhead`, `unmatched_items`, `review_required`). Excluded from `presentation_group_totals`. |
| `needs_owner_decision` | Mapping is ambiguous; requires sign-off from Anthony Hutchinson (per `feedback_baseline_framing.md`) before Phase 1.3 can ship. |

---

## Drift inventory + canonical mapping

Every observed value enumerated below is mapped to a canonical target with a disposition. The list is built from the explicit examples in the Phase 1.2 task brief, augmented with values surfaced by Phase 1.1's audit (queries 03-presentation-groups.sql 3a/3b/3c). Values not in this table that surface in `docs/sql-audits/05-presentation-group-drift-detail.sql` results must be added before Phase 1.3 ships.

### Cladding (target: `cladding`)

| Observed value | Source | Target | Disposition | Notes |
|---|---|---|---|---|
| `Siding` | rules + line items | `cladding` | `forward_remap` | Title-cased Hardie lap/panel/shingle siding |
| `siding` | rules + line items | `cladding` | `forward_remap` | Lowercase variant; same target |
| `Siding Materials` | line items (historical) | `cladding` | `forward_remap` | Older verbose label |
| `cladding` | line items | `cladding` | (canonical) | Already correct |

### Trims (target: `trims`)

| Observed value | Source | Target | Disposition | Notes |
|---|---|---|---|---|
| `Trim` | rules + line items | `trims` | `forward_remap` | |
| `trim` | line items | `trims` | `forward_remap` | |
| `Trim & Corners` | rules + line items | `trims` | `forward_remap` | Combines corner trim + general trim into single trim bucket |
| `Window Trims` | rules | `trims` | `forward_remap` | Window head/jamb/sill trim consolidated to general trims per canonical 7 |
| `Door Trims` | rules | `trims` | `forward_remap` | Same; door head/jamb/sill |
| `Horizontal Trims` | rules | `trims` | `forward_remap` | Belly band material; consolidate to trims |
| `Belly Band` | rules | `trims` | `forward_remap` | Belly band trim board (the trim itself, not the flashing) |
| `Architectural Details` | rules + line items | `trims` | `forward_remap` | Already remapped at presentation time per MN568 baseline `_meta.notes`. This codifies the existing behavior. |
| `trims` | line items | `trims` | (canonical) | Already correct |

### Metals & flashings (target: `metals_flashings`)

| Observed value | Source | Target | Disposition | Notes |
|---|---|---|---|---|
| `Flashing` | rules + line items | `metals_flashings` *or* `waterproofing` (conditional) | `forward_remap` | Owner-approved conditional split. Metal flashing / Z-flashing / drip edge / horizontal flashing / sheet metal → `metals_flashings`. Flashing tape / WRB tape / membrane / seam tape → `waterproofing`. Resolution depends on the originating SKU's `category` / `material_category`. |
| `Flashing & Weatherproofing` | rules | `metals_flashings` *or* `waterproofing` (conditional) | `forward_remap` | Same conditional rule as `Flashing`. |
| `flashing` | line items (historical) | `metals_flashings` *or* `waterproofing` (conditional) | `forward_remap` | Lowercase variant; same conditional rule. |
| `Sheet Metal` | rules | `metals_flashings` | `forward_remap` | Always metal per owner decision 1; no conditional needed. |
| `metals_flashings` | line items | `metals_flashings` | (canonical) | Already correct |

### Waterproofing (target: `waterproofing`)

| Observed value | Source | Target | Disposition | Notes |
|---|---|---|---|---|
| `Water Barrier` | rules + line items | `waterproofing` | `forward_remap` | WRB (housewrap) products |
| `wrb` | line items (historical) | `waterproofing` | `forward_remap` | Lowercase abbreviation |
| `Substrate & WRB` | rules | `waterproofing` | `forward_remap` | Combined label; both substrates and WRB serve the moisture-barrier role |
| `flashing_tape` | rules + line items | `waterproofing` | `forward_remap` | Peel-and-stick membrane; the resolution case for the conditional `Flashing` mapping above |
| `waterproofing` | line items | `waterproofing` | (canonical) | Already correct |

### Accessories (target: `accessories`)

| Observed value | Source | Target | Disposition | Notes |
|---|---|---|---|---|
| `Caulk & Sealants` | rules + line items | `accessories` | `forward_remap` | Non-waterproofing sealants (cosmetic gap fillers) |
| `Fasteners` | rules + line items | `accessories` | `forward_remap` | Nails, screws, clips |
| `fasteners` | line items (historical) | `accessories` | `forward_remap` | Lowercase variant |
| `Accessories` | rules + line items | `accessories` | `forward_remap` | Title-cased variant |
| `accessories` | line items | `accessories` | (canonical) | Already correct |

### Soffit (target: `soffit`)

| Observed value | Source | Target | Disposition | Notes |
|---|---|---|---|---|
| `Soffit` | rules | `soffit` | `forward_remap` | Title-cased |
| `Soffit & Fascia` | rules + code | `soffit` | `forward_remap` | Existing code-side default in `lib/estimating/detectionCountPricing.ts:resolvePresentationGroup`. Codifies current behavior. |
| `soffit` | line items | `soffit` | (canonical) | Already correct |

### Gutters (target: `gutters`)

| Observed value | Source | Target | Disposition | Notes |
|---|---|---|---|---|
| `Gutters & Downspouts` | rules + line items | `gutters` | `forward_remap` | |
| `gutters` | line items | `gutters` | (canonical) | Already correct |
| `downspouts` | line items | `gutters` | `forward_remap` | Subset of gutter system |
| `Gutters & Drainage` | code | `gutters` | `forward_remap` | Existing code-side default in `deriveBluebeamPresentationGroup` |

### Non-material buckets

| Observed value | Source | Target | Disposition | Notes |
|---|---|---|---|---|
| `labor` | line items | `labor` (bucket) | `separate_bucket` | Labor items must NOT count toward `presentation_group_totals` |
| `Labor` | line items (historical) | `labor` (bucket) | `separate_bucket` | Title-cased variant |
| `overhead` | line items | `overhead` (bucket) | `separate_bucket` | Overhead items must NOT count toward `presentation_group_totals` |
| `Unmatched Items` | code (orchestrator UNMATCHED fallback) | `unmatched_items` (bucket) | `separate_bucket` | Engine UNMATCHED emissions (`sku: 'UNMATCHED'`, `calculation_source: 'detection_count_unmatched'` or `'bluebeam_unmatched'`). Distinct from `review_required` because the gap is pricing, not categorization. |
| `Other Materials` | code (`PRESENTATION_GROUP_DEFAULTS` fallback) | `review_required` (bucket) | `separate_bucket` | The catch-all default in `lib/estimating/detectionCountPricing.ts:115`. Anything landing here had no specific mapping; it deserves human review, not silent classification. |

---

## Three enforcement strategies

### Strategy A — Code-side remap

Extend `lib/estimating/detectionCountPricing.ts:resolvePresentationGroup()` to cover rule-emitted values too. The remap applies at line-item insert time (or at presentation time, depending on insertion point). The mapping table from this doc gets compiled into a constant.

**Pros:**
- No schema change.
- Immediate to implement (single file edit).
- Already partially exists for detection-count items.
- No baseline refresh required (output identical to current behavior because the mapping codifies what already happens at render).

**Cons:**
- Split brain: rules in DB say one thing, code remaps to another. Operators reading rule rows see non-canonical values without realizing the render layer rewrites them.
- Non-developers cannot update mappings — every change is a code deploy.
- Does not align with `docs/strategy/03-target-architecture.md`'s "DB is the truth" target (which lists `presentation_group_config` explicitly).

### Strategy B — `presentation_group_config` table

DB-driven from-value/to-value with an active flag and trade scope. Orchestrator reads the table at refData build time (alongside the existing `calculation_constants` and `detection_class_material_mapping` reads) and applies remap before writing line items.

**Pros:**
- Aligns with target architecture (`03-target-architecture.md` explicitly lists `presentation_group_config` under the Database tier).
- Configurable without deploy; non-developers can update.
- Single source of truth — operators can grep one table.
- Future-proofs trade expansion (per-trade mapping rows possible).

**Cons:**
- Requires schema change (out of Phase 1.2's allowed scope; lands in Phase 1.3).
- One additional DB read on hot path (low cost; refData already does ~10 parallel reads).
- Seed values need engineer + Anthony Hutchinson sign-off before insert (per `feedback_baseline_framing.md`).

### Strategy C — Rule-author convention only

Update active rules in `siding_auto_scope_rules` to emit canonical values directly. No code change. No new table.

**Pros:**
- Simplest mechanism — zero new infrastructure.
- Removes the need for a remap layer entirely.

**Cons:**
- Forces a baseline refresh — `MN568.expected.json` would change because future takeoffs would have different `presentation_group` values than the captured baseline. **Violates the frozen-snapshot framing rule in `feedback_baseline_framing.md`** unless we explicitly choose to refresh.
- Doesn't help with detection-count items that bypass rules (corbel, bracket, etc. — those go through `lib/estimating/detectionCountPricing.ts`).
- Doesn't help with code-side defaults in `PRESENTATION_GROUP_DEFAULTS`.
- Rule edits are data changes; they're forbidden in Phase 1.2 and require their own PR + review pipeline in Phase 1.3.
- Doesn't align with target architecture.

---

## Recommendation for Phase 1.3

**Strategy B with a code-side fallback.** Specifically:

1. **Create `presentation_group_config` table** per `docs/strategy/03-target-architecture.md`. Schema sketch (final shape decided in Phase 1.3):
   - `id` (uuid)
   - `from_value` (text, NOT NULL)
   - `to_value` (text, NOT NULL — must be in canonical 7 OR a non-material bucket name)
   - `bucket_kind` (text, NULL or one of `material` / `labor` / `overhead` / `unmatched_items` / `review_required`)
   - `trade` (text, nullable — global if NULL, scoped if siding/roofing/etc.)
   - `active` (boolean, default true)
   - `notes` (text)
   - `created_at`, `updated_at`
2. **Seed the table** with the mappings in this doc, marked active, scoped to `trade='siding'` or `NULL` as appropriate. Seeds reviewed by Anthony Hutchinson per the framing rules.
3. **Wire the read path** in `lib/estimating/refData.ts` (a `fetchPresentationGroupConfig` parallel to the existing fetchers).
4. **Apply the remap** in the orchestrator at line-item creation, AFTER rule evaluation and BEFORE insert. This means rules continue to emit non-canonical values; the orchestrator normalizes.
5. **Keep a code-side fallback** — `PRESENTATION_GROUP_FALLBACK` constant in `lib/estimating/detectionCountPricing.ts` (or sibling) holds the same mapping seeded into the DB. If the table is empty (e.g. a fresh dev environment or a degraded DB), the orchestrator uses the fallback. This is the same DB-read-then-fallback pattern already in use for `calculation_constants`.
6. **No baseline refresh.** The seeded mapping codifies what code already does at render for detection-count items, plus the inferred remappings for rule-emitted values. The Phase 1.3 PR ships only when `npm run validate:mn568` exits 0 — meaning the baseline output is byte-identical before and after.

**Why not A or C alone:**
- A is fast but consolidates the wrong layer (code, not DB) and entrenches "code is the truth" in a system that's actively migrating to "DB is the truth."
- C requires a baseline refresh that violates the regression-protection contract until business rules have actually changed.

**Why hybrid B + code-side fallback:**
- Lands the target-architecture table now, while the migration is in motion.
- Code-side fallback prevents catastrophic failure if seeds get cleared.
- Zero baseline drift because seeds match current behavior.

---

## Owner decisions (APPROVED 2026-04-27)

All three open decisions resolved by Anthony Hutchinson. Each decision is recorded with the approved rule for Phase 1.3 implementation.

### ✅ Decision 1: `Flashing` / `Flashing & Weatherproofing` / `flashing` conditional split — APPROVED

**Approved rule:** the remap inspects the originating SKU's `category` and/or `material_category`:

- **→ `metals_flashings`** when SKU/category indicates: metal flashing, Z-flashing, drip edge, horizontal flashing, sheet metal
- **→ `waterproofing`** when SKU/category indicates: flashing tape, WRB tape, membrane, seam tape
- **→ `review_required` + warning log** when SKU context is indeterminate

**Implementation note:** Phase 1.3 ships a helper function (e.g. `resolveFlashingTarget(rawValue, sku, category)`) that the orchestrator and `lib/estimating/detectionCountPricing.ts` both call. The lookup keys (substring matches like "metal", "drip", "tape", "membrane") are documented in the helper's source so they can be audited without DB access.

### ✅ Decision 2: `Unmatched Items` vs `review_required` separation — APPROVED

**Approved split:**

- **`Unmatched Items`** (the orchestrator's UNMATCHED fallback emission — `sku: 'UNMATCHED'`, `calculation_source: 'detection_count_unmatched'` or `'bluebeam_unmatched'`) → bucket `unmatched_items`. The gap is specifically *pricing not found*.
- **`Other Materials`** (the catch-all default in `PRESENTATION_GROUP_DEFAULTS`) → bucket `review_required`. The gap is *categorization*, not pricing.

Two distinct buckets, two distinct remediation paths.

### ✅ Decision 3: Trim consolidation — APPROVED (consolidate, do not expand canonical groups)

**Approved:**

- `Window Trims`, `Door Trims`, `Belly Band`, `Horizontal Trims`, `Architectural Details` all → `trims` (forward_remap, consolidate).
- **Do not expand the canonical material groups to 9 for v1.** The canonical set stays at 7. Per-opening-type detail (window vs door vs belly band) remains visible at the line-item level via `description`, `category`, and `quantity`.

If a future business need requires per-opening-type subtotals in the regression baseline, that's a separate decision tracked through a baseline refresh per `feedback_baseline_framing.md`.

### Inventory completeness — drill-down confirmed

Per the drill-down findings recorded above, every distinct value live in the DB is present in the mapping inventory. `Sheet Metal` was added during this Phase 1.2 update. **No new `needs_owner_decision` items remain.** Phase 1.3 may proceed.

---

## Phase 1.3 — Implementation Plan (forward-only)

**Status:** plan landed 2026-04-27; implementation NOT started.
**Goal:** apply the contract mapping at line-item insert time so future emissions normalize to the canonical 7 (or to a non-material bucket). **Forward-only — no historical `takeoff_line_items` rewrites.** No baseline refresh.
**Strategy chosen:** `presentation_group_config` table **AND** code-side fallback (DB read with hardcoded fallback). Same DB-read-then-fallback pattern as `calculation_constants`.

### Why "both, with DB-read then fallback"

| Layer | Role |
|---|---|
| `presentation_group_config` table | Single source of truth for the mapping. Editable without deploy. Aligns with `docs/strategy/03-target-architecture.md` (DB tier names this table). |
| Code-side `PRESENTATION_GROUP_FALLBACK` constant | Degraded-mode safety net. If the table is empty (fresh dev environment, accidentally truncated, RLS misconfiguration) the orchestrator still produces canonical output. The constant mirrors the seeded rows; engineer-reviewed before each release. |

Strategy A alone (code-only) entrenches the wrong layer. Strategy C alone (rule edits) forces a baseline refresh that violates the regression-protection contract per `feedback_baseline_framing.md`. Hybrid avoids both.

### Forward-only enforcement (load-bearing constraint)

**The remap applies at line-item creation time. Historical `takeoff_line_items` rows are NEVER updated.** Concretely:

- Orchestrator reads each rule emission, calls `resolveCanonicalPresentationGroup(rawValue, sku, category, configMap)`, writes the resolved value into the new `takeoff_line_items` row.
- For detection-count items, `lib/estimating/detectionCountPricing.ts:resolvePresentationGroup()` already does similar work — it gets refactored to delegate to the same helper.
- Bluebeam UNMATCHED items in the orchestrator's `bluebeam_count` block similarly route through the helper.
- **No `UPDATE takeoff_line_items SET presentation_group = ...`** anywhere in the migration or code path. Historical rows keep their original (sometimes non-canonical) values forever — the regression baseline is unchanged.

### Schema (Phase 1.3 DDL — actual column names landed in 1.3a)

New table `presentation_group_config`. Column names refined during Phase 1.3a from the Phase 1.2 first-draft (`from_value`/`to_value`/`bucket_kind`) to the user-approved final names below.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key, `DEFAULT gen_random_uuid()` |
| `observed_value` | text NOT NULL | the observed value as emitted by rules / detection-count / Bluebeam |
| `canonical_group` | text NOT NULL | the canonical material group OR non-material bucket name; CHECK-constrained to the 11 allowed values |
| `bucket_type` | text NOT NULL | one of `material`, `non_material`, `review`; drives downstream renderer placement |
| `mapping_action` | text NOT NULL | one of `forward_remap`, `historical_only`, `promote_to_canonical`, `separate_bucket`, `needs_owner_decision` |
| `trade` | text | nullable; global if NULL, scoped if `siding`/`roofing`/etc. |
| `priority` | integer | nullable; reserved for future ordering when multiple rows may match (none in v1) |
| `active` | boolean | default true |
| `notes` | text | engineer note explaining the mapping origin |
| `created_at`, `updated_at` | timestamptz | NOT NULL DEFAULT NOW() |

**Cross-constraint** (`presentation_group_config_bucket_consistency`) enforces `bucket_type ↔ canonical_group` consistency in DB. **Unique constraint** on `(observed_value, trade)` prevents duplicate mappings for the same value within a trade scope.

Indexes: `(observed_value, active)` for runtime lookup; `(canonical_group)` for downstream aggregation.

Migration file: `migrations/create_presentation_group_config.sql` with rollback SQL inline at the bottom of the same file (matches existing repo convention; not a separate `_rollback.sql`). **Landed in Phase 1.3a 2026-04-27.**

### Seeds (Phase 1.3 DML)

`migrations/seed_presentation_group_config.sql` populates one row per inventory entry. Rows reviewed by Anthony Hutchinson before insert per `feedback_baseline_framing.md` (pricing data risk class). Rollback: `TRUNCATE presentation_group_config;`.

### Engine changes (Phase 1.3 code)

| Change | Location |
|---|---|
| New type `PresentationGroupConfig` | `packages/estimating-engine/src/types/` (new file or extend `orchestrator.ts`) |
| New fetcher `fetchPresentationGroupConfig` | `lib/estimating/refData.ts` — added to the existing `Promise.all` batch alongside `fetchCalculationConstants`, etc. |
| RefData bag extension | `presentationGroupConfig: Map<string, PresentationGroupConfig>` keyed by `from_value` (lowercased for case-insensitive lookup) |
| New helper `resolveCanonicalPresentationGroup(rawValue, sku, category, configMap)` | `packages/estimating-engine/src/presentation/groupResolver.ts` (new file) — pure function, no DB calls. Returns `{ to_value, bucket_kind }`. |
| New helper `resolveFlashingTarget(sku, category)` | Same file — encapsulates Decision 1's conditional rule. Called from `resolveCanonicalPresentationGroup` when `rawValue` matches the Flashing family. |
| Code-side fallback constant `PRESENTATION_GROUP_FALLBACK` | Same file. Kept in sync with seeded rows. |
| Orchestrator wiring | `packages/estimating-engine/src/orchestrators/sidingOrchestratorV2.ts` — call the helper at every `lineItems.push(...)` site that sets `presentation_group`. |
| Detection-count consumption | `lib/estimating/detectionCountPricing.ts` — refactor `resolvePresentationGroup` to delegate to the helper. The existing `PRESENTATION_GROUP_DEFAULTS` constant either consolidates with `PRESENTATION_GROUP_FALLBACK` or stays as a class-name → group default that feeds INTO the helper. |

### PR sequencing (one PR per concern)

Each PR keeps `npm run validate:mn568` at exit 0 across every commit.

| PR | Scope | Risk | Status |
|---|---|---|---|
| **1.3a** | DDL migration + rollback SQL. **No types, no consumer wiring.** Empty table. | Low — table exists but is unused | ✅ landed 2026-04-27 |
| **1.3b** | Seed migration. Engineer-reviewed seed values from the inventory above. | Medium — bad seed = wrong remap once 1.3d ships | pending |
| **1.3c** | refData fetcher + engine type definition + code-side fallback constant. **Engine reads but does not apply.** Types deferred from 1.3a to here since they have no consumer until 1.3c. | Low — engine ignores result until wired | pending |
| **1.3d** | Orchestrator wiring + Flashing conditional helper. **Apply remap on insert.** | Medium-high — new line items normalize; baseline must remain at exit 0 | pending |
| **1.3e** | Refactor `lib/estimating/detectionCountPricing.ts` to delegate to helper. | Low — semantic equivalence with existing defaults | pending |
| **1.3f (optional cleanup)** | Update `01-product-output-spec.md` to narrow "spec vs live" language; remove redundant fallback constants. | Doc-only | pending |

### Validation gates (Phase 1.3)

- Every PR: `npm run validate:mn568` → exit 0.
- Every PR: `npx tsc --noEmit -p packages/estimating-engine/tsconfig.json` → exit 0.
- Pre-deploy: `/pre-deploy` skill before any push to main.
- After 1.3d ships: spot-check 3+ recent takeoffs in production to confirm new emissions land canonical and old rows are unchanged.

### Edge cases the implementation must handle

| Case | Behavior |
|---|---|
| New value emitted, not in seeds AND not in fallback | Emit `bucket_kind = 'review_required'`, log warning with rawValue + originating rule/SKU. **No silent drop.** |
| `presentation_group_config` table empty (fresh env, RLS issue) | Engine falls back to `PRESENTATION_GROUP_FALLBACK` constant. Behavior unchanged. |
| `Flashing` SKU context indeterminate | Helper returns `review_required` per Decision 1. |
| Already-canonical value (`cladding`, `trims`, etc.) | Helper returns the same value. No-op for already-correct emissions. |
| Org-level override (e.g. one org wants `Window Trims` to stay as `Window Trims` for invoice clarity) | Out of v1 scope. The `trade` column allows future scoping, but no per-org column ships in 1.3. |

### Rollback plan

| Step | Action |
|---|---|
| Code rollback | Revert PRs 1.3d/1.3e — orchestrator + detectionCountPricing.ts changes. Engine reverts to current behavior; the populated DB table is read but unused. |
| Seed rollback | `TRUNCATE presentation_group_config;` — engine falls back to code-side constant. Behavior identical to pre-1.3. |
| Schema rollback | `DROP TABLE presentation_group_config;` (only if absolutely required — preferred is leaving the table in place for re-attempt). |
| Baseline | Unchanged at every step. No baseline refresh is needed for any rollback path. |

### Out of scope for Phase 1.3

- Editing any active rule in `siding_auto_scope_rules`. Rules continue to emit non-canonical values; the orchestrator normalizes. Rule-author cleanup is a separate, optional, much-later Phase (1.4 candidate, not yet planned).
- Updating historical `takeoff_line_items` rows. Forever forbidden under the regression-protection contract.
- Refreshing `MN568.expected.json`. Forbidden until business rules change deliberately per `feedback_baseline_framing.md`.
- Org-scoped or per-customer overrides.
- Multi-trade rollout (roofing, windows, gutters) — wait until siding ships clean.

### Files Phase 1.3 will create or modify

**New:**
- `migrations/create_presentation_group_config.sql`
- `migrations/seed_presentation_group_config.sql`
- `packages/estimating-engine/src/presentation/groupResolver.ts`
- `packages/estimating-engine/src/types/presentationGroup.ts` (or extend an existing type file)

**Modified:**
- `lib/estimating/refData.ts` (add fetcher + Promise.all entry)
- `lib/estimating/detectionCountPricing.ts` (delegate `resolvePresentationGroup` to helper)
- `packages/estimating-engine/src/orchestrators/sidingOrchestratorV2.ts` (wire helper at line-item insert sites)
- `packages/estimating-engine/src/types/orchestrator.ts` (add `presentationGroupConfig` to RefData)
- `docs/strategy/05-implementation-roadmap.md` (status blocks)
- `docs/strategy/phase-1-presentation-group-contract.md` (this file — record Phase 1.3 status as it advances)

**Forbidden in Phase 1.3:**
- Any change to existing rule rows (`UPDATE siding_auto_scope_rules`).
- Any historical line-item update.
- Any `test-data/baselines/MN568.expected.json` change.
- Any change to `app/`, `components/`, n8n workflows, or out-of-engine library code unless the change directly wires the new helper into a presentation_group emission site.

---

## What this doc does NOT do (explicit non-goals)

- Edit any auto-scope rule (data change — forbidden in Phase 1.2).
- Add or modify any database table or schema.
- Change `lib/estimating/detectionCountPricing.ts` or any runtime.
- Refresh `test-data/baselines/MN568.expected.json` (refresh is gated on a deliberate rule/data change per `feedback_baseline_framing.md`).
- Rewrite any historical `takeoff_line_items` rows.
- Define the implementation details of the Phase 1.3 remap mechanism beyond the recommendation above (table shape, fetcher placement, etc. are decided in 1.3 with reviewer input).

---

## validate:mn568 result (recorded)

**Phase 1.2 initial — 2026-04-27** (contract doc + drill-down SQL written):

```
✅ MN568 regression: PASS    exit=0
```

**Phase 1.2 closing — 2026-04-27** (drill-down findings + owner decisions + Phase 1.3 plan recorded):

```
✅ MN568 regression: PASS    exit=0
```

Phase 1.2 added no runtime, no schema, no data, no test-data changes — the regression baseline still matches. Phase 1.3 must keep this exit at 0 across every intermediate commit.

---

## Source citations

- `docs/strategy/phase-1-database-audit.md` — Phase 1.1 findings, Path B-lite selection
- `docs/strategy/01-product-output-spec.md` — canonical 7-group taxonomy, Excel output contract
- `docs/strategy/03-target-architecture.md` — `presentation_group_config` table named under DB tier
- `docs/strategy/04-known-risks-and-debt.md` — Tier-1 risk 1.8 (presentation_group hardcoded mappings)
- `docs/strategy/05-implementation-roadmap.md` — Phase 1 scope, operating principles
- `docs/strategy/06-claude-code-working-rules.md` — universal rule for PR scoping
- `docs/sql-audits/03-presentation-groups.sql` — aggregate drift query
- `docs/sql-audits/05-presentation-group-drift-detail.sql` — per-rule, per-takeoff drill-down
- `feedback_baseline_framing.md` (memory) — "current behavior, not business-correct" framing
- `lib/estimating/detectionCountPricing.ts` — `PRESENTATION_GROUP_DEFAULTS`, `resolvePresentationGroup`, `deriveBluebeamPresentationGroup` (read-only inspection during this phase)
- `test-data/baselines/MN568.expected.json` — `_meta.notes` recording `Architectural Details → trims` remap
