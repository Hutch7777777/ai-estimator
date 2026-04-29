# 06 — Claude Code Working Rules

**Audience:** any Claude Code agent (or human engineer) about to touch this repo
**Purpose:** the rules that prevent the 11 documented repeat-bug zones from recurring, plus the production-safety rules that prevent unintended deploys. Every rule here came from a real bug.

---

## Current behavior

The repo has accumulated tribal knowledge in `.claude/skills/`, in commit messages, in `docs/ai-context/06-known-problems.md`, and in author memory. This doc consolidates the rules into one reference. It does not replace `.claude/skills/`; the skills are workflow orchestrators that reference these rules.

---

## Target behavior

Every rule below is followed for every change. Violations should fail review.

### Universal rule (applies to every code-touching task)

**No implementation task may touch code unless it references the strategy doc, states the phase, and lists files allowed to change.**

A PR description (or task plan) must include:
- Which strategy doc(s) the change implements (e.g. `docs/strategy/05-implementation-roadmap.md` Phase 3)
- Which phase the change belongs to (e.g. "Phase 3 — Drain hardcoding from API, category: labor rates")
- The explicit list of files allowed to change (e.g. `app/api/.../route.ts`, `lib/estimating/refData.ts`)

If a change does not fit any strategy phase, the PR must either (a) defer until the relevant phase starts, or (b) update the strategy doc first in a separate PR. **No "while I'm here" cleanup commits.**

### Calculation engine rules (Tier-2 footguns 2.1–2.11)

These prevent silent wrong dollar amounts. Each was a production bug.

- **Toggle ordering** — when reading multiple toggles that gate the same code path, evaluate in the order documented by the source rule, not alphabetically. Re-rendering can change the effective state if order is wrong.
- **JSONB truthiness** — for `trigger_condition` JSONB booleans, use `=== true`, never `=`. PostgreSQL JSONB stores booleans as JSON, and string equality differs from JSON equality.
- **Formula variable name drift** — the rule's referenced variable name (`building_area_sf`, `facade_sqft`, `trim.total_head_lf`) must match exactly what the engine's measurement context provides. A mismatch silently yields zero.
- **Presentation_group typos** — only emit values from the canonical set (currently 7: `cladding`, `trims`, `metals_flashings`, `waterproofing`, `accessories`, `soffit`, `gutters`). After Phase 1, only emit values present in `presentation_group_config`.
- **manufacturer_filter syntax** — must use object syntax (`{ manufacturer: 'James Hardie' }`), never a bare string.
- **Dual code paths in autoscope-v2** — the engine has generic and per-manufacturer rule paths. A fix to one is incomplete until verified in the other.
- **n8n template literals** — inside n8n Code nodes, build strings with concatenation (`'a' + var + 'b'`), NOT backticks. Backticks re-escape during n8n's JSON serialization and produce broken expressions.
- **Per-page scale_ratio** — always read `extraction_pages.scale_ratio` for the page the detection is on. Never use a job-level scale.
- **sku_pattern scoping** — `sku_pattern` matches must scope inside `material_category` to avoid cross-category matches.
- **CEILING() wrapping** — the final integer output of any quantity formula must be wrapped in `CEILING()`. Decimal piece counts produce wrong material orders.
- **Polygon area math** — use the Shoelace formula in pixel space, then divide by `scaleRatio²`. Never bounding-box. Stored value lives in `extraction_detections_draft.area_sf` per commit `3a1b295`.

### Frontend rules

- **Konva popovers as DOM siblings, not children.** Rendering popovers inside the Konva tree intercepts events. Place them outside the canvas DOM. See commits `3e6a767`, `b8c919d`, `78ad8b3`, `139ce06`.
- **`editingModeRef` gates Realtime writes during edits.** When a user is editing a detection, do not write Realtime updates that would cause flicker. The pattern replaces a deprecated `recentlyEditedRef` 5-second TTL.
- **RLS-protected tables** are read through Next.js API routes with the service-role client, not the cookie-scoped browser client. The browser client hangs silently on RLS misses.
- **Do not edit `components/ui/`.** These are shadcn-managed. To add a component, use `npx shadcn@latest add [component]`.
- **Do not import from `ag-grid-enterprise`.** Free version only.
- **Panel-on-mount race** — `EstimateSettingsPanel` and similar components must not emit defaults until DB state has loaded. See commits `9c66ece`, `028a62f`, `ed6adc5`.

### Production-safety rules

The repo deploys directly off `main` with no staging environment. Every push is a production deploy.

- **Run `/pre-deploy` before every push to main.**
- **Run the MN568 regression harness** (`scripts/regression-mn568.*` once Phase 0.5 ships) before merging any calc-touching PR.
- **No `--no-verify` on commits** unless the user explicitly asks. Hooks are there for a reason.
- **No commit amending** unless the user explicitly asks. After a hook failure, fix and create a NEW commit.
- **Never skip type checking** even though `typescript.ignoreBuildErrors: true` is set in `next.config.ts`. Run `npx tsc --noEmit -p packages/estimating-engine/tsconfig.json` for engine changes; run `npx tsc --noEmit` whole-repo for cross-cutting changes.
- **Never reset, force-push, or delete branches** unless the user explicitly asks.
- **Never modify `.env.local`** without explicit user authorization. Add fallbacks in code instead (e.g. `process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL`).
- **Never modify the n8n proxy at `app/api/n8n/[...path]/route.ts`** without explicit authorization. Parallel verification routes are the safe path. (See `feedback_parallel_verification_routes.md`.)
- **Never replace production calculation code** with the local engine port when local output diverges from n8n. The engine is a faithful 1:1 port; suspect host wiring (route shape, refData injection, service-role usage) FIRST. (See `feedback_diagnose_wiring_before_engine.md`.)

### Documentation hygiene

- **No "what" comments** — well-named identifiers explain what the code does. Only comment the WHY when non-obvious (a hidden constraint, an unintuitive workaround, a subtle invariant).
- **No PR-context comments** — `// added for the X flow`, `// used by Y`, `// fixes #123` belong in PR descriptions, not code. They rot.
- **No planning/decision MD files** unless the user explicitly asks. Working from conversation context is the default.
- **Run `/retro` after every fixed bug.** It encodes the lesson into the relevant skill so the same bug doesn't recur.

### Data hygiene

- **Don't mock the database in tests.** Mock/prod divergence has masked broken migrations before. Integration tests must hit a real database.
- **Don't seed pricing or rules without engineer review.** AI-only pricing seeds are silent Tier-1 risks.
- **Document rollback for any DB seed/insert.** Phase-1 PRs must include the SQL to revert the seed.

---

## Non-goals

- Replacing the `.claude/skills/` workflow system
- Defining new agents
- Specifying lint rules (some are implied as Phase-6 work; this doc does not enforce them)
- Mandating PR review processes (org-level concern)
- Mandating commit message format

---

## Known contradictions / uncertainty

- **`typescript.ignoreBuildErrors: true` in `next.config.ts`** — this is a Tier-1 risk in `04-known-risks-and-debt.md` (1.11) AND it's the current production setting. The rule above ("Never skip type checking even though...") tells the agent to typecheck despite the flag, but the build itself will green-light errors. Removing the flag is Phase 6 work.
- **"No 'while I'm here' cleanup commits"** vs **organic refactoring** — the rule is strict, but in practice an agent fixing a bug in a 1,679-LOC file may genuinely need a small refactor. The intent is to disallow scope creep, not surgical adjacent fixes. When in doubt, ask the user.
- **MN568 regression script status** — Phase 0.5 produces this script. Until it exists, the rule "run the MN568 regression harness" can only mean "manually compare totals against the documented baseline."

---

## Open questions

- Should this doc be auto-loaded as `CLAUDE.md` content when an agent enters the repo, or referenced explicitly in skill prompts?
- For non-AI engineers, is there appetite for a CI rule that fails PRs without a strategy-doc reference (the universal rule above)?
- Some rules (e.g. backticks in n8n) could be enforced by static analysis. Should those move from rules to lint rules in Phase 6, leaving this doc as the rules that *cannot* be statically enforced?

---

## Source citations

- `docs/ai-context/06-known-problems.md` — 11 repeat-bug zones, RLS quirks, hot files
- `docs/ai-context/04-estimating-business-rules.md` — formula footguns, presentation_group canonical set
- `docs/ai-context/05-agent-workflows.md` — Konva interception commits, panel-on-mount race
- `CLAUDE.md` (project root) — production-safety baselines, shadcn rules, AG Grid rule
- `feedback_parallel_verification_routes.md` (memory) — n8n proxy untouchability
- `feedback_diagnose_wiring_before_engine.md` (memory) — wiring-first debugging order
- `.claude/skills/` (root) — `/arch-review`, `/pre-deploy`, `/retro`, `/calc-engine`, `/rule-add`, `/material-onboard`, `/takeoff-validate`, `/scope-review`
