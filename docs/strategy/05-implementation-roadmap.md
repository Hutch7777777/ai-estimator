# 05 — Implementation Roadmap

**Audience:** anyone scoping the next sprint or PR; anyone deciding whether a proposed change fits the current phase
**Purpose:** sequence the path from current system to target architecture safely, given that production deploys directly off `main` with no staging environment.

---

## Current behavior

The repo is mid-stabilization. A local TypeScript engine port (`packages/estimating-engine/`) ships as a verification surface alongside the production n8n calculation path. Several Tier-1 issues from `04-known-risks-and-debt.md` have not been fixed because (a) there is no staging, (b) there is no regression harness yet, and (c) hot files are large and intertwined.

---

## Target behavior

Phased migration that moves Tier-1 risks toward zero, in an order chosen so each phase's outputs are independently verifiable against MN568 and any rollback is mechanical.

### Operating principles (apply to every phase)

- **MN568 is the gate.** No phase merges if MN568's per-category totals or cost summary diverge.
- **One phase at a time.** Phase N+1 does not start until Phase N's exit criteria pass.
- **One PR per category.** When draining hardcoding from the API or n8n, each category (constants, labor rates, overhead, trim SKUs, etc.) is its own PR — never bundled.
- **No schema changes without an out-of-band migration plan.** Migrations are applied manually; document the rollback path in the PR description.
- **No new framework, library, or service in any phase except Phase 7.** The roadmap is a stabilization plan, not a redesign.
- **Document rollback for every DB seed/insert.** If a Phase 1 seed introduces wrong values, the PR description includes the SQL to revert.

---

## Phase 0 — Pre-flight (instrument before changing)

**Goal:** make the system observable enough that later phases can be verified.

**Scope:**
- Document current MN568 Excel output byte-for-byte (snapshot file checked in under `docs/strategy/baselines/MN568.xlsx` or similar). Snapshot reviewed by user before merge.
- Document current MN568 per-category totals and cost summary as a JSON or markdown table.
- Verify `pricing_items` schema and current rows that would be touched by Phase 1 (corbel, bracket, shutter, belly band SKUs). DB read only.
- Verify whether `auto_scope_rules_v2` exists (resolves Tier-1 contradiction 1.3).
- Verify trim variable wiring status in n8n (resolves Tier-1 contradiction 1.4).
- **Freeze hot paths during phases 1–4:** no refactors of `lib/utils/exportTakeoffExcel.ts`, `lib/supabase/extractionQueries.ts`, `lib/utils/polygonUtils.ts` while their callers are mid-migration.

**Exit criteria:**
- MN568 baseline snapshot committed.
- Three Tier-1 contradictions (1.3, 1.4, 1.12) have a definite answer.

**MN568 regression check:** n/a (this phase establishes the baseline).

---

## Phase 0.5 — Regression harness skeleton

**Goal:** create the MN568 baseline comparison script before any logic movement, so every later phase has a deterministic green/red signal.

**Scope:**
- A script (e.g. `scripts/regression-mn568.ts` or `.sh`) that:
  - Posts the canonical MN568 payload to `/api/estimating/calculate-siding` (the parallel verification route).
  - Compares the response against the Phase-0 baseline snapshot.
  - Outputs a structured diff: per-category totals delta, line-item count delta, line-by-line diff for any category that drifts beyond a configurable epsilon (default 0).
  - Returns nonzero exit on any drift.
- A second variant of the script that compares the engine output against the production n8n approval output (when both are runnable) — to catch divergence between the verification surface and production.
- README in `docs/strategy/baselines/` describing how to refresh the baseline when business rules change deliberately.

**What this phase does NOT include:**
- A test framework (Jest/Vitest). That's a Phase 6 cleanup item.
- CI integration. The script is run manually before merging any calc-touching PR until CI is added.
- Per-line provenance diffing — only totals and line counts in v1.

**Exit criteria:**
- Script runs locally; clean run on current `main` produces zero drift.
- Documented invocation in `docs/strategy/06-claude-code-working-rules.md` so any agent or engineer touching calc code knows to run it.

**MN568 regression check:** n/a (this phase IS the regression check).

**Phase 0.5 v1 — landed**

- Validator: `scripts/validate-mn568-baseline.ts` (read-only file compare; no network calls; no production runtime touched)
- Baseline: `test-data/baselines/MN568.expected.json` (TEMPLATE — Phase 0 must populate numerics with captured production output for MN568)
- Run path: `test-data/runs/MN568.actual.json` (not committed; produced by reshaping a takeoff response into the baseline shape)
- Invocation: `npm run validate:mn568` (uses `tsx`, installed as a devDependency so it runs on a fresh `npm install`)
- CLI flags: `--expected <path>`, `--actual <path>`, `--epsilon <number>` (default 0; integer fields ignore epsilon)
- Exit codes: 0 = match within epsilon; 1 = drift, missing files, or JSON parse error
- Field contract documented in the baseline's `_meta.fields_documented` array

---

## Phase 0.6 — Capture current MN568 baseline

**Goal:** populate `test-data/baselines/MN568.expected.json` with the real current production output for MN568, so the harness from Phase 0.5 becomes a meaningful regression check (not just a template comparison against zero).

**Scope:**
- Operator runbook documenting capture procedure end-to-end (`test-data/README.md`).
- Identification of canonical sources per field (post-approval DB rows, not Excel).
- One-time capture: run MN568 through production approval, aggregate via documented SQL queries, reshape to baseline schema, save to `test-data/runs/MN568.actual.json`.
- Engineering and contractor-business-owner review of captured numbers before promotion.
- Promote `MN568.actual.json` → `MN568.expected.json`; update `_meta.status` from `TEMPLATE` to `BASELINE — captured <date> from takeoff <id>`.
- Documented refresh procedure for deliberate business-rule changes.

**What this phase does NOT include:**
- Any code or schema change. The capture is read-only against the production DB.
- Automated capture script. v1 is manual SQL + JSON reshape; an automated capture is a future improvement.
- CI integration. Manual `npm run validate:mn568` continues until CI lands in Phase 6.

**Phase 0.6 status — landed (documentation only)**
- Operator runbook: `test-data/README.md` (Steps 1–7 with copy-paste SQL templates)
- Canonical-source mapping: `docs/strategy/01-product-output-spec.md` ("Canonical source per field" section)
- BLOCKER recorded: see below
- Validator status: `npm run validate:mn568` exits 1 with "actual run file not found" — expected behavior until cutover. Recorded in `test-data/README.md`.

**Phase 0.6 status — landed (numerics captured 2026-04-27 in Phase 0.7)**
- `test-data/baselines/MN568.expected.json` `_meta.status` is now `BASELINE — captured 2026-04-27 from takeoff 1cca55ae-64e4-42ee-b6fc-241cbd92df53`.
- Capture metadata recorded in the baseline's `_meta` block (capture_date, source, reviewer, sign_off, takeoff_id, project_id, job_id, notes).
- `npm run validate:mn568` exits 0 against the captured actual file.
- **Framing:** the captured values are a frozen snapshot of CURRENT system behavior, reviewed by Anthony Hutchinson for regression protection. NOT a claim of business-correctness or contractor-final approval.

**Exit criteria:**
- `MN568.expected.json` `_meta.status` reads `BASELINE — captured <date>` (not `TEMPLATE`).
- `npm run validate:mn568` returns exit 0 (PASS) when run against a captured actual file.
- Contractor-business owner has signed off on the captured numbers.
- `test-data/README.md` Step 6 has been executed in a real PR; commit message documents capture context.

**MN568 regression check:** n/a (this phase establishes the baseline values).

---

## Phase 1 — Database is the truth

> **UNBLOCKED 2026-04-27 (Phase 0.7).** BASELINE captured from takeoff `1cca55ae-64e4-42ee-b6fc-241cbd92df53`, reviewed by Anthony Hutchinson for regression protection. The baseline is a frozen snapshot of CURRENT system behavior, NOT a claim of business-correctness. Phase 1 may proceed; every seed/insert PR must keep `npm run validate:mn568` at exit 0.

> **Phase 1.1 landed 2026-04-27.** Audit doc + 4 read-only SQL files written. See `docs/strategy/phase-1-database-audit.md` and `docs/sql-audits/`. Findings sections are PENDING operator-side execution against production. Phase 1.2 path (A/B/C) chosen based on those findings.

> **Phase 1.1 findings recorded 2026-04-27 — Path B-lite selected.** Audit eliminated 3 of 4 candidate Tier-1 risks (1.3 rule tables, 1.6 constants, 1.7 SKUs). Remaining open risk is 1.8 — presentation_group taxonomy drift. `markup_rate=0.10` is recorded as current DB truth (NOT a drift to fix); the source-side `MARKUP_RATE=0.26` fallback is dead code under normal operation and is a Phase 3 source-hygiene item, not a Phase 1 fix. **Phase 1.2 scope: Presentation Group Contract Audit & Mapping Plan — documentation/config design only, no runtime changes.**

> **Phase 1.2 landed 2026-04-27.** Contract & mapping doc: `docs/strategy/phase-1-presentation-group-contract.md`. Canonical 7 + 4 non-material buckets defined; every observed historical/active value mapped with disposition codes; three enforcement strategies compared. **Phase 1.3 recommendation: Strategy B (presentation_group_config table) with code-side fallback** — aligns with target architecture, no baseline refresh required, code fallback prevents catastrophic failure. Phase 1.3 is BLOCKED on three open `needs_owner_decision` items + operator-side run of `docs/sql-audits/05-presentation-group-drift-detail.sql` (prerequisites listed in contract doc).

> **Phase 1.2 closed 2026-04-27.** Drill-down SQL run; recent and rule-authored values recorded. Three owner decisions APPROVED: (1) Flashing conditional split — metal/Z-flash/drip-edge/sheet-metal → `metals_flashings`, tape/membrane/seam-tape → `waterproofing`, indeterminate → `review_required` + warning; (2) `Unmatched Items` → `unmatched_items` bucket, `Other Materials` → `review_required` bucket; (3) trim consolidation — `Window Trims`/`Door Trims`/`Belly Band`/`Horizontal Trims`/`Architectural Details` → `trims`, no expansion to 9 canonical groups. `Sheet Metal` added to mapping inventory. Phase 1.3 implementation plan landed: hybrid DB table + code-side fallback, forward-only at line-item insert, no historical rewrites, 6-PR sequencing, full rollback plan. **Phase 1.3 unblocked but not started.**

> **Phase 1.3a landed 2026-04-27.** DDL migration `migrations/create_presentation_group_config.sql` written with full rollback SQL inline. Table created empty (no seeds; seeds are 1.3b). Schema: `id` (uuid pk), `observed_value`, `canonical_group` (CHECK to 11 allowed values), `bucket_type` (CHECK to material/non_material/review), `mapping_action` (CHECK to 5 disposition codes), `trade`, `priority`, `active`, `notes`, timestamps. Cross-constraint enforces `bucket_type ↔ canonical_group` consistency. UNIQUE on `(observed_value, trade)`. Two indexes for runtime lookup + downstream aggregation. **Types and consumer wiring deferred to 1.3c** (deviation from earlier plan: types without a consumer add no value in 1.3a). No runtime change. validate:mn568 exit 0.

**Goal:** seed the database with everything currently hardcoded so later phases can swap reads to DB without changing values.

**Scope:**
- Add missing rows to `pricing_items` for detection-driven items (corbel, bracket, shutter) and belly band SKUs. Closes Tier-1 1.1, 1.2.
- Create `calculation_constants` table; seed with `markup_rate=0.26`, `soc_unemployment_rate=0.1265`, `li_hourly_rate=3.56`, `insurance_rate_per_thousand=24.38`, `default_crew_size`, `default_estimated_weeks`. Closes Tier-1 1.6.
- Create `presentation_group_config` table; seed with the current 60+ mappings from `getPresentationGroup()`. Closes Tier-1 1.8.
- If Phase 0 confirmed `auto_scope_rules_v2` exists, consolidate it into `siding_auto_scope_rules`. Closes Tier-1 1.3.
- Migrate hardcoded `LABOR_RATES`, `OVERHEAD_RATES`, `TRIM_SKUS`, `AUTO_SCOPE_SKUS` rows into `labor_rates`, `overhead_costs`, and `pricing_items` / rule rows respectively. Closes Tier-1 1.7.

**What this phase does NOT do:**
- Change any code that reads pricing/constants/rules. Code still uses hardcoded values; DB has parallel rows.
- Change the API or n8n workflows.

**Exit criteria:**
- Every hardcoded value referenced in `04-known-risks-and-debt.md` Tier-1 has a corresponding DB row.
- Each new row has documented rollback SQL.
- Engineer-reviewed seed values (no AI-only seeds for pricing).

**MN568 regression check:** zero drift expected — code still reads hardcoded values.

---

## Phase 2 — Wire trim variables through n8n

**Goal:** close the silent-zero-on-some-trim-rules failure mode (Tier-1 1.4).

**Scope:**
- Wire `trim.total_head_lf`, `trim.total_jamb_lf`, `trim.total_sill_lf` through the n8n `approve-detection-editor` workflow's Code nodes.
- Verify against rules that currently emit zero on these variables.
- Use string concatenation, not backticks (Tier-2 2.7).

**Exit criteria:**
- Affected trim rules emit non-zero on MN568 (specifically the rules currently failing).
- MN568 totals reflect the corrected trim quantities.
- New trim totals are user-validated against the actual desk estimate before merge.

**MN568 regression check:** **expected drift** — the whole point of this phase is to fix wrong numbers. Drift must match the user-validated correct values, and the new MN568 baseline is re-snapshotted.

---

## Phase 3 — Drain hardcoding from API

**Goal:** swap each hardcoded API constant/SKU for a DB read. Closes Tier-1 1.6, 1.7, 1.8 in code (Phase 1 closed them in data).

**Scope (one PR per category):**
- `MARKUP_RATE`, `SOC_UNEMPLOYMENT_RATE`, `LI_HOURLY_RATE`, `INSURANCE_RATE_PER_THOUSAND` → read from `calculation_constants`
- `LABOR_RATES`, `FALLBACK_LABOR_RATES` → read from `labor_rates`
- `OVERHEAD_RATES` → read from `overhead_costs`
- `TRIM_SKUS` → read from `pricing_items` + auto-scope rules
- `AUTO_SCOPE_SKUS` → read from `pricing_items`
- `getPresentationGroup()` → lookup from `presentation_group_config`

**Exit criteria per PR:**
- Hardcoded value removed from API source.
- DB read replaces it.
- MN568 regression script returns clean.

**MN568 regression check:** zero drift required.

---

## Phase 4 — Drain hardcoding from n8n

**Goal:** swap n8n's hardcoded `detectionPricing` and `bellyBandPricing` for DB-driven equivalents. Closes Tier-1 1.1, 1.2 in code.

**Scope:**
- n8n workflows fetch from `pricing_items` (or call API endpoints that wrap the fetch).
- Remove `detectionPricing` object from n8n.
- Remove `bellyBandPricing` object from n8n.
- Move spatial containment computation out of n8n (target: API).
- Move rule evaluation out of n8n (target: API only).

**Exit criteria:**
- n8n workflows have no hardcoded prices.
- MN568 regression clean.
- Backup of pre-change n8n workflow JSON committed alongside the change.

**MN568 regression check:** zero drift required.

---

## Phase 5 — Move Excel to API

**Goal:** single owner for Excel generation. Closes Tier-1 1.12.

**Scope:**
- New API endpoint owns `ExcelJS` generation, reading from `takeoffs` / `takeoff_sections` / `takeoff_line_items`.
- n8n `multi-trade-coordinator` calls this endpoint instead of generating Excel itself.
- Frontend `lib/utils/exportTakeoffExcel.ts` either becomes a thin client over the API endpoint OR remains the in-app export path while the n8n path uses the API.
- **Byte-level Excel parity test** — produced Excel must match Phase-0 baseline byte-for-byte (or with documented differences for justified format changes).

**Exit criteria:**
- One canonical Excel-producing code path.
- MN568 regression clean.
- Byte-level Excel parity validated.

**MN568 regression check:** zero drift required.

---

## Phase 6 — Cleanup

**Goal:** remove tech debt enabled by Phases 0–5.

**Scope:**
- Remove `typescript.ignoreBuildErrors: true` from `next.config.ts`. Fix all type errors that surface.
- Regenerate `lib/types/database.ts` to include all current tables.
- Delete legacy `DetectionCanvas.tsx` (duplicate of `KonvaDetectionCanvas.tsx`).
- Rotate hardcoded Supabase credentials out of `lib/supabase/extractionQueries.ts`.
- Add a minimal test framework (Vitest) — at least one suite that drives the regression harness from Phase 0.5.
- Address Tier-2 footguns that have CI-amenable fixes (e.g. lint rule for backticks in n8n strings).

**Exit criteria:**
- `npx tsc --noEmit` clean across whole repo.
- No hardcoded credentials in source.
- Regression harness wired into CI (optional in this phase if CI infra isn't ready).

**MN568 regression check:** zero drift required.

---

## Phase 7 — Strategic (optional, depends on stability)

**Goal:** capabilities and scale work that was non-trivial during stabilization.

**Scope (no required ordering):**
- **Edge classification** at the detection layer to close the 5–15% trim over-estimate. Closes Tier-1 1.5.
- **Multi-trade rollout** (roofing, windows, gutters). Trade configs already seeded; engine and rules need per-trade extension.
- **Plan Intelligence depth** — conversational history; longer-lived sessions.
- **Licensing play** — expose to other contractor orgs.
- **Extraction-job upload UI** for multi-page construction PDFs. Closes Tier-3 3.2.
- **Component decomposition** — break up DetectionEditor.tsx, KonvaDetectionCanvas.tsx, useExtractionData.ts. Closes Tier-3 3.3.
- **Re-enable SAM-2** if model availability returns. Closes Tier-3 3.1.
- **Detection virtualization** for 1000+ detection sets. Closes Tier-3 3.6.

---

## Non-goals (entire roadmap)

- Introducing a staging environment (per `07-roadmap.md` explicit non-goal — out of scope for this stabilization plan)
- Switching off n8n
- Custom auth service
- Replacing AG Grid Community with Enterprise
- Adding a message broker
- Splitting the database
- Single-PR landing of any phase past Phase 0.5
- Bundling phases (Phase 1 + 2 in one PR is forbidden — they are sequenced for verifiability, not arbitrary)

---

## Known contradictions / uncertainty

- **Phase 4 spatial containment migration** — ARCHITECTURE_VIOLATION_REPORT.md flags moving spatial containment to API as a target, but Extraction API is Python. The TypeScript engine port may need access to geometry primitives currently owned by Python. Decision deferred to Phase 4 scoping.
- **Phase 5 frontend Excel export status** — whether `lib/utils/exportTakeoffExcel.ts` becomes a thin client or stays as an in-app export path is not pre-decided. Phase 5 PR will choose based on user-facing requirements at the time.
- **Phase 7 ordering** — these items can be reordered based on user/business priority. The phase number is a "ready to start" gate, not a within-phase sequence.

---

## Open questions

- Is there appetite for adding a real CI pipeline (GitHub Actions running the regression harness) before Phase 6, or does the harness stay manual until then?
- Should Phase 1 seed data be reviewed by both engineering AND the contractor-business owner? Pricing values seeded incorrectly are silent Tier-1 problems.
- For Phase 3 PRs, should we cut over one organization at a time (feature-flag-by-org) or all-at-once? With no staging, all-at-once carries more risk; per-org gating requires building a flag system that doesn't exist.
- After Phase 4, does the local engine port at `packages/estimating-engine/` become the production calculation owner, or stay as a verification mirror? `03-target-architecture.md` flags this as an open question.

---

## Source citations

- `ARCHITECTURE_VIOLATION_REPORT.md` — 5-phase migration plan inspiration, hardcoded values inventory
- `docs/ai-context/06-known-problems.md` — Tier-1 risks resolved by each phase
- `docs/ai-context/07-roadmap.md` — recently-shipped status, in-flight items, explicit non-goals (no staging, no n8n replacement)
- `docs/strategy/04-known-risks-and-debt.md` — phase-tag mapping
