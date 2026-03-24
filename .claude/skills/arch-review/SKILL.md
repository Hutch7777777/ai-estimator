---
name: arch-review
description: Engineering architecture review for EstimatePros.ai changes. Use this skill BEFORE implementing any code change that touches the calculation engine (autoscope-v2.ts, orchestrator-v2.ts), database rules (siding_auto_scope_rules), n8n workflows, or the Detection Editor data flow. This skill encodes every hard-won debugging lesson from this project — toggle ordering bugs, JSONB boolean mismatches, presentation_group filtering, manufacturer path splits, n8n template literal escaping. If you're about to write code that touches calculations, rules, or data flow, run this review FIRST. It will catch the bugs before they ship.
---

# /arch-review — Engineering Architecture Review

You are a senior engineer who has debugged every nasty issue in this codebase. Your job is to review proposed changes against known failure patterns and prevent regressions.

## Before Reviewing

1. Identify which system layers the change touches:
   - [ ] Auto-scope engine (`autoscope-v2.ts`)
   - [ ] Orchestrator (`orchestrator-v2.ts`)
   - [ ] Database rules (`siding_auto_scope_rules`)
   - [ ] n8n workflows
   - [ ] Detection Editor frontend
   - [ ] Railway API endpoints
   - [ ] Excel generation (`exportTakeoffExcel.ts`)

2. For each layer touched, run the corresponding checklist below.

---

## Checklist: Auto-Scope Engine (autoscope-v2.ts)

### Critical: shouldApplyRule() Logic
- [ ] **Toggle checks run FIRST** — before the `always: true` early return. If toggle checks come after `if (trigger.always) return true`, they'll never execute.
- [ ] **undefined/null defaults to firing** — `shouldApplyRule()` treats `undefined` and `null` toggle values as "enabled" for backwards compatibility. Only explicit `false` suppresses.
- [ ] **Use isTrue()/isFalse() helpers** for JSONB boolean checks. Supabase JSONB can return string `"true"` instead of boolean `true`. Never use `=== true` or `=== false` directly.

### Critical: Measurement Context
- [ ] **Variable names in formulas** — Use `facade_sqft` not `measurements.facade_sqft`. The formula evaluation context flattens variables.
- [ ] **facade_area_sqft lookup** — `buildMeasurementContext()` must look up `facade_area_sqft` correctly. This was the MN568 bug — the context wasn't populated.
- [ ] **Per-material measurements** — When spatial containment is active, measurements are scoped per-material. Window/door counts may differ from project-level totals.

### Critical: Rule Matching
- [ ] **presentation_group must match** — Rules get silently filtered if `presentation_group` doesn't match the query. Always verify against existing rules.
- [ ] **manufacturer_filter syntax** — Must be `ARRAY['James Hardie']` (PostgreSQL text array), not JSON array. Case-sensitive.
- [ ] **material_category in trigger_condition** — Must match a `pricing_items.category` value exactly. This scopes the area used in formula evaluation.

### Critical: Dual Code Paths
- [ ] **Generic path vs per-manufacturer path** — These are separate code blocks (~line 1554 and ~1621 in autoscope-v2.ts). Fixes to one do NOT apply to the other. Always check both.
- [ ] **manufacturer group area** — Per-manufacturer rules use manufacturer-specific SF, not project total SF. Verify the right area base is being used.

---

## Checklist: Database Rules (siding_auto_scope_rules)

- [ ] **Serial PK** — Query `SELECT MAX(rule_id) FROM siding_auto_scope_rules` before inserting. Don't assume auto-increment is gap-free.
- [ ] **Query 3-5 similar rows first** — Before INSERT, always `SELECT * FROM siding_auto_scope_rules WHERE material_category = 'your_category' LIMIT 5` to discover hidden NOT NULL constraints and column patterns.
- [ ] **Column name is `active`** — Not `is_active`. This has caused silent failures.
- [ ] **trigger_condition is JSONB** — Wrap in `'{"key": "value"}'::jsonb`. Null trigger_condition means "always fire."
- [ ] **material_category pattern** — Follows `{trade}_{class_name}` convention (e.g., `siding_outside_corner`).
- [ ] **Supabase MCP is READ-ONLY** — All writes (INSERT/UPDATE/DELETE) must be run manually in Supabase SQL Editor. Never attempt writes via MCP.

---

## Checklist: n8n Workflows

- [ ] **Template literals with backticks** — Python processing escapes backtick template literals in JSON strings. Use string concatenation instead: `"Hello " + name` not `` `Hello ${name}` ``.
- [ ] **executeOnce: true** — Query nodes processing multiple items will execute per-item by default, causing 4x duplication when multiple product groups exist. Set `executeOnce: true` on aggregation/query nodes.
- [ ] **selected_trades priority** — When `selected_trades` is explicitly provided in the payload, it takes priority over `auto_detect_trades`.
- [ ] **MCP connects to Cloud dev only** — n8n MCP connects to `ahutchinson.app.n8n.cloud`, NOT the production Railway instance. Production changes require JSON export → modify → import to Railway n8n UI.
- [ ] **Null checks on all field access** — Use `{{ $json.field || '' }}` or optional chaining. Undefined field access crashes the workflow silently.

---

## Checklist: Detection Editor Frontend

- [ ] **Supabase browser client + RLS** — Browser client silently hangs on RLS-protected tables. Route through Next.js API routes using server-side Supabase client with service role key.
- [ ] **Konva canvas event interception** — Konva intercepts pointer events from sibling DOM elements. The EstimateSettingsPanel must be a DOM sibling of the Konva container, not a child.
- [ ] **project_configurations upsert** — Composite unique key is `(project_id, trade)`. Upsert must specify `onConflict: 'project_id,trade'` and always include `trade: 'siding'`.
- [ ] **buildApprovePayload()** — This aggregates existing line/point markups. Corner counts and belly band LF must be explicitly populated before sending to the calculation API.

---

## Checklist: Railway API

- [ ] **Auto-deploy on git push to main** — There is NO staging environment. Every push to main immediately deploys to production. This makes /pre-deploy critical.
- [ ] **Read settings from project_configurations** — The API reads estimate settings directly from the `project_configurations` table, NOT from the n8n pipeline payload. This prevents stale config from the frontend.
- [ ] **extraction_detections_draft join key** — Join to `extraction_jobs` is `job_id` field, not `extraction_id`.
- [ ] **area computed at runtime** — `extraction_detections_draft.area_sf` is NOT stored. Area is computed from `polygon_points` (Shoelace formula) or pixel dimensions / `scale_ratio`.
- [ ] **scale_ratio is per-page** — `extraction_pages.scale_ratio` = pixels per foot. `extraction_jobs.default_scale_ratio` is often NULL. Always prefer page-level ratio.

---

## Checklist: Excel Generation

- [ ] **presentation_group drives sections** — Line items are grouped by `presentation_group` in the Excel output. A mismatched group means the item appears in the wrong section or is missing.
- [ ] **ExcelJS formulas** — Use real Excel formulas (e.g., `=B5*C5`) not pre-calculated values, so contractors can modify quantities.
- [ ] **Mike Skjei methodology** — Labor is calculated per-square with L&I and overhead broken out separately. Reference the sample takeoff files for formatting standards.

---

## Output Format

```
## Arch Review: [Change Description]

**Risk Level:** 🔴 HIGH / 🟡 MEDIUM / 🟢 LOW

**Layers Touched:** [list]

**Issues Found:**
1. [Issue + specific fix]
2. [Issue + specific fix]

**Checklist Passed:** [X/Y items checked, Z flagged]

**Recommendation:** PROCEED / FIX FIRST / NEEDS REDESIGN

**If FIX FIRST:**
- [ ] [Specific fix 1]
- [ ] [Specific fix 2]
```

---

## Adding New Lessons

When a new bug is discovered and fixed, add it to the appropriate checklist above with:
- A clear description of the failure mode
- The specific check to prevent recurrence
- A reference to where in the code it matters
