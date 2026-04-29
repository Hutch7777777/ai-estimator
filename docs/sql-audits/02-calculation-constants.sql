-- ============================================================================
-- 02 — Calculation constants audit
-- Phase 1.1 — Database Truth Audit
-- Read-only. No mutations.
--
-- Goal: enumerate which constants are in the calculation_constants table
-- vs. only living as hardcoded fallbacks in source. The orchestrator
-- (sidingOrchestratorV2.ts:179-184 hardcoded; sidingOrchestratorV2.ts:1000-1006
-- DB read) prefers DB values when present. We need to confirm which rows
-- exist before Phase 1 seeds anything.
--
-- Hardcoded fallback values in source (for comparison):
--   markup_rate                  = 0.26
--   soc_unemployment_rate        = 0.1265
--   li_hourly_rate               = 3.56
--   insurance_rate_per_thousand  = 24.38
--   default_crew_size            = 4
--   default_estimated_weeks      = 2
-- ============================================================================

-- 2a. List ALL active calculation_constants rows (global + siding).
--     Source applies global rows first, then siding-specific overrides.
SELECT
  constant_name,
  constant_value,
  trade,
  active,
  notes,
  updated_at
FROM calculation_constants
WHERE active = true
ORDER BY trade NULLS FIRST, constant_name;

-- 2b. Specifically check the six constants the orchestrator hardcodes as
--     fallbacks. Returns one row per constant with the DB value (if any) and
--     the documented hardcoded fallback for comparison.
WITH expected AS (
  SELECT * FROM (VALUES
    ('markup_rate',                 0.26),
    ('soc_unemployment_rate',       0.1265),
    ('li_hourly_rate',              3.56),
    ('insurance_rate_per_thousand', 24.38),
    ('default_crew_size',           4),
    ('default_estimated_weeks',     2)
  ) AS t(constant_name, hardcoded_fallback)
)
SELECT
  e.constant_name,
  e.hardcoded_fallback,
  c_global.constant_value AS db_value_global,
  c_siding.constant_value AS db_value_siding,
  COALESCE(c_siding.constant_value, c_global.constant_value) AS effective_db_value,
  CASE
    WHEN c_siding.constant_value IS NOT NULL OR c_global.constant_value IS NOT NULL THEN
      CASE
        WHEN COALESCE(c_siding.constant_value, c_global.constant_value)::numeric = e.hardcoded_fallback THEN 'OK_MATCHES_HARDCODE'
        ELSE 'DB_DIVERGES_FROM_HARDCODE'
      END
    ELSE 'MISSING_USES_FALLBACK'
  END AS status
FROM expected e
LEFT JOIN calculation_constants c_global
  ON c_global.constant_name = e.constant_name AND c_global.trade IS NULL AND c_global.active = true
LEFT JOIN calculation_constants c_siding
  ON c_siding.constant_name = e.constant_name AND c_siding.trade = 'siding' AND c_siding.active = true
ORDER BY e.constant_name;

-- 2c. Surface any other constants in the table beyond the six fallbacks —
--     flags drift between code and data (constants that live in DB but no
--     code path reads them, or constants the code expects under a different
--     name).
SELECT
  constant_name,
  COUNT(*) AS row_count,
  array_agg(DISTINCT trade ORDER BY trade NULLS FIRST) AS trades_present
FROM calculation_constants
WHERE active = true
  AND constant_name NOT IN (
    'markup_rate', 'soc_unemployment_rate', 'li_hourly_rate',
    'insurance_rate_per_thousand', 'default_crew_size', 'default_estimated_weeks'
  )
GROUP BY constant_name
ORDER BY constant_name;
