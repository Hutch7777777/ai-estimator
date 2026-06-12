# Scope Architecture Decision Records — v0.1

**Date:** June 12, 2026
**Companions:** SIDING_CONDITION_TAXONOMY.md (the knowledge backbone) · CONFIRMED_WORK_PLAN.md (stabilization sequencing) · UIUX_AUDIT_JUNE_2026.md
**Purpose:** The decisions that govern the scope-knowledge architecture build. Claude
(claude.ai project) and Claude Code both treat DECIDED records as binding constraints
and OPEN records as questions that block their dependent work items. Update statuses
inline as calls are made; never delete a superseded record — mark it SUPERSEDED with a
pointer.

---

## The architecture in one paragraph

Four additive layers over the existing schema (strangler fig — no rework of the 100+
existing tables): **(1) Knowledge** — `scope_conditions`, `assemblies` (product ROLES,
not SKUs; keyed by condition × job_type), `knowledge_sources` (citable doc registry
with revision/date); rules gain nullable `condition_id`/`source_id`. **(2) Inputs** —
each condition declares its `measurement_requirement` and source tier (marked /
derived / declared), with source-confidence recorded per measurement. **(3)
Attribution** — resolution produces line items carrying full provenance (measurement
source + rule/assembly + citation). **(4) Epistemics** — every condition on every job
resolves to SATISFIED / EXPLICITLY ABSENT / UNKNOWN; pre-flight check before Approve;
scope-coverage block on the takeoff.

---

## ADR-001 — Engine of record

**Status: OPEN — blocks the resolver build (Phase 2+).**
Two calc engines exist: the production TS engine (`exterior-estimation-api`) and the
in-frontend port (`packages/estimating-engine`, ai-estimator, ~9,300 lines, built
during stabilization). The condition resolver and `assemblies` consumption must target
exactly one. Encoding knowledge against both, or against the one being retired,
doubles or wastes the work.
**Options:** (a) production TS engine consumes assemblies; port stays a verification
harness. (b) Port becomes the engine of record per the stabilization plan's direction;
production engine is strangled. (c) Shared package consumed by both during transition.
**Decision:** _pending Anthony + an engine-state review session._
**Consequence once decided:** the other engine gets an explicit retirement or
harness-only designation in writing.

## ADR-002 — Knowledge versioning & reproducibility

**Status: DECIDED (design constraint).**
Knowledge tables get versioning from day one: `effective_from`/`effective_to` (or
version int) on assemblies and conditions; takeoffs stamp the `knowledge_version`
they were computed with, exactly parallel to `pricing_snapshot_id`. A March estimate
must be reproducible in June even after assemblies evolve.
**Rationale:** retrofitting immutability onto live tables is far costlier than
carrying it from the first migration. Proven by the pricing snapshot system.

## ADR-003 — Ground truth & regression succession

**Status: DECIDED (policy), OPEN (first exemplar not yet blessed).**
Mike Skjei's MN568 office takeoff is an Excel **formatting template only** — never
quantity/accuracy ground truth. MN568 is an **R&R job**, not new construction.
Accuracy truth = manufacturer-documented assemblies + Anthony's adjudicated scope
policy, expressed as **blessed exemplar takeoffs** (Anthony adjudicates a system
output line-by-line: keep / wrong-qty / wrong-product / missing). The existing
$34,115.55 fixture remains a *stability* oracle only, and fixtures version alongside
rule-set versions so intentional knowledge changes read as "output changed as
predicted by this rule diff," not as regressions.
**Open item:** bless exemplar #1 (adjudication of the June 11 MN568 recalc output, 34
line items) — also produces the rule-fix worklist.
**Sub-decision (DECIDED):** every rule note citing "Office MN568: N pcs" gets
re-adjudicated against documented assemblies; those targets may encode NC assumptions
against an R&R job, or one practitioner's habits.

## ADR-004 — Rollout: shadow mode, never switchover

**Status: DECIDED.**
No staging environment exists; Railway auto-deploys main; pilots are live. The
condition resolver therefore ships in **shadow mode**: runs alongside the existing
rules path on the same inputs, output diffed and logged, zero customer-facing effect,
until diffs are explainable across a corpus of real jobs. Dry-run endpoints (the
/recalculate-job?dry_run=true pattern) are the template. Cutover is a deliberate,
reversible flag flip per org or per job.

## ADR-005 — Dimensions on day one

**Status: DECIDED.**
`scope_conditions.trade` (default 'siding') and `projects.job_type` ('rr' | 'nc')
land in the first migration even though early data is uniform. Roofing is on the
roadmap and retrofitting a trade FK across the knowledge layer later is a migration
project. MN568 gets job_type='rr' recorded, not remembered.
**Also in first migration (already-queued debt):** organization_id backfills —
extraction_jobs (+ column), takeoffs (12 NULL-org projects, NULL-org takeoffs) — and
n8n write paths start setting org + job linkage.

## ADR-006 — Single writer for takeoff truth (prerequisite)

**Status: OPEN — scheduled as weekend Block 2; PREREQUISITE to Layer-3 provenance.**
Three values exist for one takeoff today: engine response $35,959.82 · viewer render
$36,049.76 (client recomputes; marks up overhead) · DB row $36,434.34 (n8n write).
Decision needed: engine-stored totals are canonical; viewer renders stored values
(client math deleted); n8n write path diffed and corrected. Provenance built atop
disagreeing writers documents disagreement in higher resolution.
**Related (DECIDED):** knowledge layer maps to `auto_scope_rules_v2` only; v1 table
formally dead before backfill mapping begins.

## ADR-007 — Org product defaults & role binding

**Status: PROPOSED — bucket split pending Anthony's red pen.**
Assemblies specify **product roles** ("WRB membrane," "seam tape," "Z-flashing 2in"),
never SKUs. `organization_product_defaults` binds role → SKU at org level; editor
settings become job-level overrides. Resolution order: job override → builder default
(NC, future `builders` work) → org default → **error-with-explanation** (no silent
fallback — Layer 4 discipline).
**Proposed buckets:**
- Org default: WRB + seam tape; flashing tapes (FortiFlash/Moistop class); flashing
  metals (Z, drip, kickout); fastener system; sealants (general + ColorMatch);
  consumables (touch-up, primer, spackle, blades).
- Job-level: cladding products/colors; trim package & finish (primed vs ColorPlus);
  decorative details; all H-zone R&R declarations.
- Builder-level: NC spec substitutions overriding org defaults.
**Known bug this fixes:** rules carry fossilized SKUs (Henry Blueskin priced while a
rule is literally named "…(Tyvek Seam Tape)") — the WRB gap category from the MN568
ledger.
**UI home:** Account → Materials tab (exists, unwired).

## ADR-008 — Measurement source tiers & markup SOP

**Status: DECIDED (framework); tier assignments land in taxonomy v0.2 after
adjudication.**
Every condition is tagged: **captured** (detection/import today) · **derived**
(computed from captured) · **manual-mark required** (no class/derivation exists —
currently: A4/A5 transitions, D4 rake LF, D6, E1 LF, E3–E5, F1–F4, F6) · **declared**
(job-setup questions, all H-zone).
**Deliverables from the tags:** a Bluebeam tool chest generated from the taxonomy
(one tool per markable condition, names matched to SUBJECT_KEYWORDS) so markup
completeness is baked into tooling; the pre-flight check covers what tooling can't.
NEW detection classes get created only when a condition justifies them — taxonomy
pulls the class list, not the reverse.

## ADR-009 — Knowledge maintenance process

**Status: DECIDED.**
`knowledge_sources` rows carry document revision + date (e.g., TR1502 rev 09/25) from
the start. Anthony owns a quarterly source-currency check (manufacturer revisions,
new manufacturers — Allura and Nichiha already appear in labor descriptions — code
updates). A citation to a stale revision is flagged, not silently trusted.

## ADR-010 — Pilot-facing change narration

**Status: DECIDED (practice, not code).**
Re-adjudicated rules will move numbers on jobs pilots have seen. Every such shift
ships with a one-line narration ("WRB rule was binding a fossilized SKU; corrected to
org default; Δ = …") sourced from the rule diff. Layer-4 transparency converts
"numbers moved" from instability signal to differentiator — but only when diffs are
deliberate and explainable (ADR-003/004 make them so).

---

## Build sequence (gates, not dates)

0. **Prerequisites:** weekend Block 1 (RLS, org backfills, session-auth reads) +
   Block 2 (ADR-006 single writer) + ADR-001 decision.
1. Taxonomy v0.2 — Anthony's adjudication + source tiers (ADR-008 tags).
2. Schema migration #1 — knowledge tables + versioning (ADR-002) + dimensions
   (ADR-005) + `organization_product_defaults` (ADR-007).
3. Backfill audit — map 172 v2 rules → condition IDs; orphans, overlaps (the
   flashing triple-dip, 2× top-out), and "Office MN568" notes adjudicated.
4. Pre-flight completeness check in Detection Editor (first user-visible payoff).
5. Shadow-mode resolver (ADR-004) over the blessed-exemplar corpus (ADR-003).
6. Provenance surfaced on takeoff + scope-coverage block.
7. Builder/job-type pricing & scope variants (existing builders-table plan).
