-- ============================================================================
-- 04 — Rule tables audit
-- Phase 1.1 — Database Truth Audit
-- Read-only. No mutations.
--
-- Goal: enumerate every auto-scope-related table that exists in the public
-- schema and confirm which is canonical. Resolves Tier-1 contradiction 1.3
-- from docs/strategy/04-known-risks-and-debt.md (does auto_scope_rules_v2
-- actually exist or is it only referenced in legacy commit messages?).
--
-- Code references (from grep across packages/, lib/, app/, migrations/):
--   - siding_auto_scope_rules    — read by autoscope-v2.ts and refData.ts
--   - labor_auto_scope_rules     — read by refData.ts (separate table)
--   - auto_scope_rules_v2        — NO references found in our codebase
--
-- Production-side n8n workflows are not in this repo, so this audit cannot
-- prove n8n's rule table choice; it can only prove what's in the database.
-- ============================================================================

-- 4a. List all tables in the public schema with names matching auto_scope.
--     Catches anything we haven't seen referenced in code (e.g.
--     auto_scope_rules_v2, stone_auto_scope_rules, roofing_auto_scope_rules).
SELECT
  table_schema,
  table_name,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', table_schema, table_name)::regclass)) AS size
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name ILIKE '%auto_scope%' OR table_name ILIKE '%scope_rules%')
ORDER BY table_name;

-- 4b. Row counts and active counts for the two known tables. Returns one
--     row per table; safe to run even if either table doesn't exist (the
--     subqueries that reference missing tables will fail and you'll see
--     which one).
SELECT
  'siding_auto_scope_rules' AS table_name,
  (SELECT COUNT(*) FROM siding_auto_scope_rules) AS total_rows,
  (SELECT COUNT(*) FROM siding_auto_scope_rules WHERE active = true) AS active_rows,
  (SELECT MAX(updated_at) FROM siding_auto_scope_rules) AS last_updated;

SELECT
  'labor_auto_scope_rules' AS table_name,
  (SELECT COUNT(*) FROM labor_auto_scope_rules) AS total_rows,
  (SELECT COUNT(*) FROM labor_auto_scope_rules WHERE active = true) AS active_rows,
  (SELECT MAX(updated_at) FROM labor_auto_scope_rules) AS last_updated;

-- 4c. Confirm auto_scope_rules_v2 does NOT exist. Returns 0 rows if it's
--     absent (which is what we expect).
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'auto_scope_rules_v2';

-- 4d. Surface trade coverage in siding_auto_scope_rules. Confirms the
--     migrate_stone_veneer_rules_to_siding.sql consolidation actually moved
--     rules into this table (rather than leaving them in a separate stone
--     table). Look for non-siding trades that may have leaked in.
SELECT
  trade,
  COUNT(*) AS rule_count,
  COUNT(*) FILTER (WHERE active = true) AS active_count,
  COUNT(DISTINCT material_category) AS distinct_categories
FROM siding_auto_scope_rules
GROUP BY trade
ORDER BY rule_count DESC;

-- 4e. Same for labor_auto_scope_rules.
SELECT
  trade,
  COUNT(*) AS rule_count,
  COUNT(*) FILTER (WHERE active = true) AS active_count
FROM labor_auto_scope_rules
GROUP BY trade
ORDER BY rule_count DESC;
