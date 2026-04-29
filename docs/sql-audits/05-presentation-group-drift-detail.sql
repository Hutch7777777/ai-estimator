-- ============================================================================
-- 05 — Presentation group drift drill-down
-- Phase 1.2 — Presentation Group Contract Audit & Mapping Plan
-- Read-only. No mutations.
--
-- Goal: produce per-rule, per-takeoff visibility into the presentation_group
-- drift that 03-presentation-groups.sql surfaced in aggregate. Used to
-- (a) verify the mapping table in docs/strategy/phase-1-presentation-group-
-- contract.md against live data, and (b) catch any observed value that
-- the mapping doc didn't anticipate.
-- ============================================================================

-- 5a. Per-rule emissions: which active rules emit which presentation_group
--     values. The mapping doc must have a target for every value listed here.
SELECT
  presentation_group,
  rule_name,
  material_category,
  manufacturer_filter,
  trade,
  active
FROM siding_auto_scope_rules
WHERE active = true
ORDER BY presentation_group, rule_name;

-- 5b. Recency check on takeoff_line_items: when did each non-canonical
--     value last appear? Helps distinguish "currently emitted" from
--     "historical only — no current rule emits it."
WITH canonical AS (
  SELECT unnest(ARRAY[
    'cladding', 'trims', 'metals_flashings', 'waterproofing',
    'accessories', 'soffit', 'gutters'
  ]) AS group_name
)
SELECT
  li.presentation_group,
  COUNT(*) AS row_count,
  MIN(li.created_at) AS first_seen,
  MAX(li.created_at) AS last_seen,
  COUNT(DISTINCT li.takeoff_id) AS distinct_takeoffs
FROM takeoff_line_items li
WHERE li.presentation_group NOT IN (SELECT group_name FROM canonical)
  AND li.presentation_group IS NOT NULL
GROUP BY li.presentation_group
ORDER BY last_seen DESC;

-- 5c. Cross-reference: for each non-canonical value currently emitted by a
--     rule (5a), confirm it also appears in line items (5b) — the round-trip.
--     Surfaces dead rules whose emissions never reach takeoffs.
WITH canonical AS (
  SELECT unnest(ARRAY[
    'cladding', 'trims', 'metals_flashings', 'waterproofing',
    'accessories', 'soffit', 'gutters'
  ]) AS group_name
),
rule_groups AS (
  SELECT DISTINCT presentation_group
  FROM siding_auto_scope_rules
  WHERE active = true AND presentation_group IS NOT NULL
),
line_groups AS (
  SELECT DISTINCT presentation_group
  FROM takeoff_line_items
  WHERE presentation_group IS NOT NULL
)
SELECT
  COALESCE(r.presentation_group, l.presentation_group) AS group_name,
  r.presentation_group IS NOT NULL AS emitted_by_active_rule,
  l.presentation_group IS NOT NULL AS appears_in_line_items,
  CASE
    WHEN r.presentation_group IS NOT NULL AND l.presentation_group IS NULL THEN 'RULE_EMITS_NO_LINE_ITEMS'
    WHEN r.presentation_group IS NULL AND l.presentation_group IS NOT NULL THEN 'HISTORICAL_ONLY_NO_ACTIVE_RULE'
    ELSE 'BOTH'
  END AS status,
  CASE WHEN COALESCE(r.presentation_group, l.presentation_group) IN (SELECT group_name FROM canonical) THEN 'canonical' ELSE 'non-canonical' END AS taxonomy_status
FROM rule_groups r
FULL OUTER JOIN line_groups l ON r.presentation_group = l.presentation_group
ORDER BY status, taxonomy_status, group_name;

-- 5d. Per-detection-class fallback path: which detection classes flow through
--     resolvePresentationGroup() in lib/estimating/detectionCountPricing.ts
--     vs. PRESENTATION_GROUP_DEFAULTS (code-side defaults). Surfaces the
--     subset of mapping that already happens in code today, separate from
--     rule-emitted values.
SELECT
  m.class_name,
  m.display_name,
  m.measurement_type,
  m.default_product_sku,
  -- Note: detection_class_material_mapping has no presentation_group column
  -- (confirmed in Phase 0.6 SQL fix). Group resolution for these classes
  -- happens in code via PRESENTATION_GROUP_DEFAULTS in detectionCountPricing.ts.
  -- The mapping doc (phase-1-presentation-group-contract.md) records the
  -- code-side defaults so they can be co-located with rule-side mappings.
  m.active
FROM detection_class_material_mapping m
WHERE m.active = true
ORDER BY m.class_name;
