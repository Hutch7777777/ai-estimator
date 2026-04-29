-- ============================================================================
-- 03 — Presentation group taxonomy audit
-- Phase 1.1 — Database Truth Audit
-- Read-only. No mutations.
--
-- Goal: surface every distinct presentation_group value flowing through the
-- system and compare against the canonical 7-group contract documented in
-- docs/strategy/01-product-output-spec.md and 04-estimating-business-rules.md.
--
-- Canonical groups (target after Phase 1):
--   cladding, trims, metals_flashings, waterproofing,
--   accessories, soffit, gutters
--
-- Note: MN568 baseline _meta.notes records that "Architectural Details" is
-- mapped into "trims" at presentation time. That mapping is currently in
-- code; the audit checks whether "Architectural Details" appears as a raw
-- value in the underlying tables.
-- ============================================================================

-- 3a. Distinct presentation_group values currently in takeoff_line_items.
--     This is what the Excel and the Takeoff Viewer actually render.
SELECT
  presentation_group,
  COUNT(*) AS row_count,
  COUNT(DISTINCT takeoff_id) AS takeoff_count,
  ROUND(SUM(total_extended)::numeric, 2) AS sum_total_extended
FROM takeoff_line_items
GROUP BY presentation_group
ORDER BY row_count DESC;

-- 3b. Distinct presentation_group values emitted by siding_auto_scope_rules.
--     This is the source: rules write rows; rows become line items.
SELECT
  presentation_group,
  COUNT(*) AS rule_count,
  COUNT(*) FILTER (WHERE active = true) AS active_rule_count,
  array_agg(DISTINCT material_category ORDER BY material_category) AS material_categories
FROM siding_auto_scope_rules
GROUP BY presentation_group
ORDER BY rule_count DESC;

-- 3c. Drift check: which presentation_group values exist in either table
--     but are NOT in the canonical 7-group set?
WITH canonical AS (
  SELECT unnest(ARRAY[
    'cladding', 'trims', 'metals_flashings', 'waterproofing',
    'accessories', 'soffit', 'gutters'
  ]) AS group_name
),
live_values AS (
  SELECT DISTINCT presentation_group AS group_name FROM takeoff_line_items
  WHERE presentation_group IS NOT NULL
  UNION
  SELECT DISTINCT presentation_group FROM siding_auto_scope_rules
  WHERE presentation_group IS NOT NULL
)
SELECT
  l.group_name AS non_canonical_value,
  EXISTS(SELECT 1 FROM takeoff_line_items WHERE presentation_group = l.group_name) AS used_in_line_items,
  EXISTS(SELECT 1 FROM siding_auto_scope_rules WHERE presentation_group = l.group_name) AS used_in_rules
FROM live_values l
WHERE l.group_name NOT IN (SELECT group_name FROM canonical)
ORDER BY l.group_name;

-- 3d. Reverse drift check: which canonical groups have NO line items? May
--     indicate a never-emitting rule path that needs investigation.
WITH canonical AS (
  SELECT unnest(ARRAY[
    'cladding', 'trims', 'metals_flashings', 'waterproofing',
    'accessories', 'soffit', 'gutters'
  ]) AS group_name
)
SELECT
  c.group_name AS canonical_group,
  COALESCE(li.row_count, 0) AS line_item_rows,
  COALESCE(r.rule_count,  0) AS active_rule_rows
FROM canonical c
LEFT JOIN (
  SELECT presentation_group, COUNT(*) AS row_count
  FROM takeoff_line_items GROUP BY presentation_group
) li ON li.presentation_group = c.group_name
LEFT JOIN (
  SELECT presentation_group, COUNT(*) AS rule_count
  FROM siding_auto_scope_rules WHERE active = true GROUP BY presentation_group
) r ON r.presentation_group = c.group_name
ORDER BY c.group_name;
