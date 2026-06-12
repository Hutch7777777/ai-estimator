-- ============================================================================
-- PHASE 1 — DB-ONLY FIXES
-- ============================================================================
-- Companion to: docs/CONFIRMED_WORK_PLAN.md §5 (June 10, 2026)
-- Run in: Supabase SQL Editor, top to bottom.
--
-- REGRESSION GATE
--   Run scripts/validate-mn568-baseline.ts BEFORE and AFTER this script.
--   Baseline contract: test-data/baselines/MN568.expected.json
--     final_total = $34,115.55 · 43 line items
--     job_id      = 240e222e-0419-421c-97fa-18a691b40cdb  (extraction job)
--     project_id  = f7e2fc2b-33c1-48f2-bae6-ebff37fbe346
--   Sections 0–8 must produce a ZERO delta. Section B is commented out
--   because it can change output — it belongs to Phase 2.
--
-- DESIGN RULES (what verification changed vs the original audit's Phase 1)
--   • calculation_constants is LIVE — read by exterior-estimation-api
--     (configService.ts:102-104, 5-min TTL) and by this repo
--     (lib/estimating/refData.ts:200-203). Do NOT recreate or alter it.
--     Section 1 only guarantees the six expected rows exist, at values
--     identical to the code fallbacks, so behavior is unchanged whether a
--     row was present or not.
--   • presentation_group_config EXISTS (migrations/create_presentation_group_config.sql)
--     but no code reads it yet (its consumers are dead code in both repos).
--     The fix is wiring consumers — Phase 2 CODE work. Nothing for SQL to do
--     here, intentionally.
--   • Pricing snapshots are IMMUTABLE. This script never UPDATEs an existing
--     pricing_items row. New rows are attached to the active snapshot,
--     following the precedent set by migrations/expand_pricing_items.sql.
--   • extraction_job_totals.siding_squares is a GENERATED column. Nothing in
--     this script writes it; Section 6 documents it so future writers don't.
--   • All inserts are idempotent (WHERE NOT EXISTS / IF NOT EXISTS). The
--     script is safe to re-run.
-- ============================================================================


-- ============================================================================
-- SECTION 0 — PREFLIGHT DIAGNOSTICS (read-only)
-- Review every result before continuing. Stop conditions are noted inline.
-- ============================================================================

-- 0.1 Exactly one active pricing snapshot expected.
SELECT '0.1 active pricing snapshots (expect 1)' AS check_name, COUNT(*) AS n
FROM pricing_snapshots
WHERE active = true;

-- 0.2 Which of the six calculation constants already exist?
--     (Section 1 inserts only the missing ones.)
SELECT '0.2 calculation_constants present' AS check_name,
       constant_name, constant_value, trade, active
FROM calculation_constants
WHERE constant_name IN (
  'markup_rate', 'soc_unemployment_rate', 'li_hourly_rate',
  'insurance_rate_per_thousand', 'default_crew_size', 'default_estimated_weeks'
)
ORDER BY constant_name;

-- 0.3 Duplicate job_id rows in extraction_job_totals?
--     STOP CONDITION: if this returns rows, Section 3 will skip index creation.
--     Resolve duplicates first (see commented dedup in Section 3).
SELECT '0.3 extraction_job_totals duplicate job_ids (expect 0 rows)' AS check_name,
       job_id, COUNT(*) AS copies
FROM extraction_job_totals
GROUP BY job_id
HAVING COUNT(*) > 1;

-- 0.4 Is siding_squares actually GENERATED? (informs Section 6)
SELECT '0.4 siding_squares generation status' AS check_name,
       table_name, column_name, is_generated, generation_expression
FROM information_schema.columns
WHERE column_name = 'siding_squares';

-- 0.5 Do any ACTIVE auto-scope rules reference the SKUs Section 2 seeds?
--     STOP CONDITION: if this returns rows, those rules currently resolve to
--     "missing pricing" — seeding a price would CHANGE their output. Remove
--     the affected SKU from Section 2 and handle it in Phase 2 instead.
SELECT '0.5 active rules referencing Section-2 seed SKUs (expect 0 rows)' AS check_name,
       r.rule_name, r.material_sku
FROM siding_auto_scope_rules r
WHERE r.active = true
  AND r.material_sku IN (
    'BRACKET-DECORATIVE','SHUTTER-VINYL','POST-WRAP-PVC','COLUMN-WRAP-PVC',
    'ROOF-DRIP-10','TRIM-NAIL-SS-2','JH-CAULK-CM',
    'JH-SOFFIT-12-VENT','SOFFIT-JCHANNEL-12','JH-TRIM-FASCIA-6','TRIM-NAILS-SS-1LB',
    'GUTTER-5K-ALU-10','GUTTER-HANGER-HIDDEN','GUTTER-ENDCAP',
    'DOWNSPOUT-2X3-10','DOWNSPOUT-BRACKET','DOWNSPOUT-ELBOW',
    'WW-1X3-12','WW-1X4-12','WW-2X2-20',
    'FLASH-PENETRATION','CAULK-PENETRATION','GABLE-VENT-TRIM','112Z2BPW'
  );

-- 0.6 Current detection_class_material_mapping coverage for the classes the
--     engines DO consult (context for Section B — read, do not act yet).
SELECT '0.6 DCP mappings for engine-consulted classes' AS check_name,
       class_name, display_name, default_product_sku, active
FROM detection_class_material_mapping
WHERE class_name IN ('corbel', 'belly_band_trim', 'belly_band_flashing');


-- ============================================================================
-- SECTION 1 — calculation_constants ENSURE-ROWS
-- The engines silently fall back to hardcoded defaults when this table is
-- empty/unreachable (refData.ts DEFAULT_CONSTANTS; configService DEFAULT_CONSTANTS).
-- Guarantee the rows exist so the fallback never engages. Values are EXACTLY
-- the code defaults — output is identical whether the row was missing or not.
--
-- NAMING LANDMINE (do not "fix" silently): soc_unemployment_rate = 0.1265 is
-- actually the L&I insurance rate (labor.ts names the same value
-- LI_INSURANCE_RATE; real unemployment is 0.013). Renaming is a Phase 2+
-- decision that must touch every consumer at once.
-- ============================================================================

INSERT INTO calculation_constants (constant_name, constant_value, trade, active)
SELECT v.constant_name, v.constant_value, v.trade, true
FROM (VALUES
  ('markup_rate',                 0.26,   'siding'),
  ('soc_unemployment_rate',       0.1265, 'siding'),  -- actually L&I; see note above
  ('li_hourly_rate',              3.56,   'siding'),
  ('insurance_rate_per_thousand', 24.38,  'siding'),
  ('default_crew_size',           4,      'siding'),
  ('default_estimated_weeks',     2,      'siding')
) AS v(constant_name, constant_value, trade)
WHERE NOT EXISTS (
  SELECT 1 FROM calculation_constants c
  WHERE c.constant_name = v.constant_name
);

-- Verify: all six present and active.
SELECT '1.v calculation_constants after seed (expect 6 rows)' AS check_name,
       constant_name, constant_value, active
FROM calculation_constants
WHERE constant_name IN (
  'markup_rate','soc_unemployment_rate','li_hourly_rate',
  'insurance_rate_per_thousand','default_crew_size','default_estimated_weeks'
)
ORDER BY constant_name;


-- ============================================================================
-- SECTION 2 — pricing_items SEEDS FOR ENGINE-EMITTED PLACEHOLDER SKUs
-- The orchestrators emit line items under invented SKUs with hardcoded prices
-- (sidingOrchestratorV2.ts / orchestrator-v2.ts detection blocks). Nothing
-- reads pricing_items for these SKUs today (confirmed by diagnostic 0.5), so
-- seeding them changes NOTHING — it makes the prices visible to snapshots and
-- ready for Phase 2 wiring.
--
-- PRICES ARE DELIBERATELY THE CURRENT HARDCODED VALUES, even where the real
-- catalog disagrees (e.g. BRACKET-DECORATIVE $35 vs catalog BRACKET-MD-PRIMED
-- $45). Reconciling placeholder vs catalog SKUs/prices is an explicit Phase 2
-- business decision (work plan N-5) — do not "correct" prices here.
--
-- Immutability: rows are ADDED to the active snapshot (same precedent as
-- expand_pricing_items.sql); no existing row is updated.
-- ============================================================================

DO $$
DECLARE
  v_snapshot_id uuid;
BEGIN
  -- Resolve the active snapshot; fall back to the snapshot id used by
  -- expand_pricing_items.sql if the lookup finds nothing.
  BEGIN
    SELECT id INTO v_snapshot_id FROM pricing_snapshots WHERE active = true LIMIT 1;
  EXCEPTION WHEN undefined_column THEN
    v_snapshot_id := NULL;
  END;
  IF v_snapshot_id IS NULL THEN
    v_snapshot_id := '0a0cc4ac-0b7f-4e4c-ae6a-af79c624ae53';
    RAISE NOTICE 'No active snapshot found — using known snapshot %', v_snapshot_id;
  END IF;

  INSERT INTO pricing_items
    (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    -- Architectural details (engine: sidingOrchestratorV2.ts:2196,2219,2242,2265)
    ('BRACKET-DECORATIVE', 'Decorative Bracket (engine placeholder)',        'architectural', 'siding', 'ea', 35.00,  0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price. Reconcile with BRACKET-* catalog SKUs in Phase 2.'),
    ('SHUTTER-VINYL',      'Vinyl Shutter (engine placeholder)',             'architectural', 'siding', 'ea', 65.00,  0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price. Reconcile with SHUTTER-* catalog SKUs in Phase 2.'),
    ('POST-WRAP-PVC',      'Post Wrap PVC (engine placeholder)',             'architectural', 'siding', 'ea', 85.00,  0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price. Reconcile with POST-* catalog SKUs in Phase 2.'),
    ('COLUMN-WRAP-PVC',    'Column Wrap PVC (engine placeholder)',           'architectural', 'siding', 'ea', 150.00, 0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    -- Belly band consumables (engine :1809,1831,1853; board/Z-flash fallbacks :1760,1787)
    ('ROOF-DRIP-10',       'Drip Edge 10ft (engine placeholder)',            'flashing',      'siding', 'ea', 8.50,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price. Catalog twin: DRIP-EDGE-10 — reconcile in Phase 2.'),
    ('TRIM-NAIL-SS-2',     'SS Trim Nails 2in Box (engine placeholder)',     'accessories',   'siding', 'ea', 7.50,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price. Catalog twin: TRIM-NAILS-SS-1LB — reconcile in Phase 2.'),
    ('JH-CAULK-CM',        'ColorMatch Caulk (engine placeholder)',          'accessories',   'siding', 'ea', 8.50,   0.00, 'James Hardie', 'Phase 1 seed @ engine-hardcoded price. Catalog twin: CAULK-JH-COLORMATCH — reconcile in Phase 2.'),
    ('112Z2BPW',           'Z-Flashing Belly Band (engine fallback SKU)',    'flashing',      'siding', 'ea', 12.50,  0.00, 'TBD', 'Phase 1 seed @ engine fallback price. Catalog twin: ZFLASH-10 — reconcile in Phase 2.'),
    -- Soffit & fascia (engine :1899,1922,1956,1978)
    ('JH-SOFFIT-12-VENT',  'Hardie Soffit Vented 12in (engine placeholder)', 'soffit',        'siding', 'ea', 28.00,  0.00, 'James Hardie', 'Phase 1 seed @ engine-hardcoded price.'),
    ('SOFFIT-JCHANNEL-12', 'Soffit J-Channel 12ft (engine placeholder)',     'soffit',        'siding', 'ea', 6.50,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    ('JH-TRIM-FASCIA-6',   'HardieTrim Fascia 6in (engine placeholder)',     'trim',          'siding', 'ea', 24.00,  0.00, 'James Hardie', 'Phase 1 seed @ engine-hardcoded price.'),
    ('TRIM-NAILS-SS-1LB',  'SS Trim Nails 1lb (engine placeholder)',         'accessories',   'siding', 'ea', 7.50,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price (likely no-op — catalog already has this SKU).'),
    -- Gutters & downspouts (engine :2013-2129)
    ('GUTTER-5K-ALU-10',   'Gutter 5in K-Style Alum 10ft (engine placeholder)','gutters',     'siding', 'ea', 12.00,  0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    ('GUTTER-HANGER-HIDDEN','Gutter Hanger Hidden (engine placeholder)',     'gutters',       'siding', 'ea', 1.50,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    ('GUTTER-ENDCAP',      'Gutter End Cap (engine placeholder)',            'gutters',       'siding', 'ea', 3.50,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    ('DOWNSPOUT-2X3-10',   'Downspout 2x3 10ft (engine placeholder)',        'gutters',       'siding', 'ea', 8.00,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    ('DOWNSPOUT-BRACKET',  'Downspout Bracket (engine placeholder)',         'gutters',       'siding', 'ea', 2.00,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    ('DOWNSPOUT-ELBOW',    'Downspout Elbow (engine placeholder)',           'gutters',       'siding', 'ea', 4.00,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    -- Whitewood corner system (engine :2374,2393,2419)
    ('WW-1X3-12',          'Whitewood 1x3 12ft (engine placeholder)',        'trim',          'siding', 'ea', 7.82,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    ('WW-1X4-12',          'Whitewood 1x4 12ft (engine placeholder)',        'trim',          'siding', 'ea', 9.37,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    ('WW-2X2-20',          'Whitewood 2x2 20ft (engine placeholder)',        'trim',          'siding', 'ea', 10.42,  0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    -- Penetrations & vents (engine :2485,2507,2534)
    ('FLASH-PENETRATION',  'Penetration Flashing (engine placeholder)',      'flashing',      'siding', 'ea', 8.50,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    ('CAULK-PENETRATION',  'Penetration Caulk (engine placeholder)',         'accessories',   'siding', 'ea', 8.50,   0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.'),
    ('GABLE-VENT-TRIM',    'Gable Vent Trim (engine placeholder)',           'trim',          'siding', 'ea', 12.00,  0.00, 'TBD', 'Phase 1 seed @ engine-hardcoded price.')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  WHERE NOT EXISTS (
    SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku
  );
END $$;

-- Verify: every seed SKU now has exactly one row.
SELECT '2.v seeded SKUs (expect 24 rows, copies = 1 each)' AS check_name,
       sku, material_cost, COUNT(*) OVER (PARTITION BY sku) AS copies
FROM pricing_items
WHERE sku IN (
  'BRACKET-DECORATIVE','SHUTTER-VINYL','POST-WRAP-PVC','COLUMN-WRAP-PVC',
  'ROOF-DRIP-10','TRIM-NAIL-SS-2','JH-CAULK-CM','112Z2BPW',
  'JH-SOFFIT-12-VENT','SOFFIT-JCHANNEL-12','JH-TRIM-FASCIA-6','TRIM-NAILS-SS-1LB',
  'GUTTER-5K-ALU-10','GUTTER-HANGER-HIDDEN','GUTTER-ENDCAP',
  'DOWNSPOUT-2X3-10','DOWNSPOUT-BRACKET','DOWNSPOUT-ELBOW',
  'WW-1X3-12','WW-1X4-12','WW-2X2-20',
  'FLASH-PENETRATION','CAULK-PENETRATION','GABLE-VENT-TRIM'
)
ORDER BY sku;


-- ============================================================================
-- SECTION 3 — extraction_job_totals: UNIQUE INDEX ON job_id
-- Prerequisite for standardizing all five writers on upsert (Phase 1.5/2 code
-- work; PostgREST upsert requires a unique constraint to target).
-- Created only if no duplicates exist (diagnostic 0.3).
-- NOTE: siding_squares on this table is GENERATED — the index does not touch
-- it, and no writer ever should.
-- ============================================================================

DO $$
DECLARE
  v_dupes int;
BEGIN
  SELECT COUNT(*) INTO v_dupes FROM (
    SELECT job_id FROM extraction_job_totals GROUP BY job_id HAVING COUNT(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE NOTICE 'SKIPPED unique index: % duplicated job_id value(s) in extraction_job_totals. Resolve first (see commented dedup below), then re-run this section.', v_dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_extraction_job_totals_job_id
      ON extraction_job_totals (job_id);
    RAISE NOTICE 'Unique index uq_extraction_job_totals_job_id is in place.';
  END IF;
END $$;

-- Dedup helper — DESTRUCTIVE, intentionally commented. Review the dry run
-- (diagnostic 0.3) and confirm which copy to keep before running.
-- Keeps the most recently updated row per job_id:
--
-- DELETE FROM extraction_job_totals t
-- USING (
--   SELECT id, ROW_NUMBER() OVER (
--     PARTITION BY job_id ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
--   ) AS rn
--   FROM extraction_job_totals
-- ) ranked
-- WHERE t.id = ranked.id AND ranked.rn > 1;


-- ============================================================================
-- SECTION 4 — pipeline_errors LOG TABLE
-- Audit §2.6: every pipeline INSERT should be able to record its failure
-- instead of vanishing (extraction-api's supabase_request() returns None and
-- most call sites ignore it). This creates the destination; wiring writers is
-- Phase 1.5+ code work.
-- RLS is enabled with NO policies: only the service role can read/write,
-- which is exactly who the pipelines are.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_errors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  source         text NOT NULL,          -- e.g. 'extraction-api', 'estimation-api', 'n8n', 'frontend'
  operation      text,                   -- e.g. 'insert', 'update', 'upsert', 'webhook'
  table_name     text,                   -- target table of the failed write
  record_key     text,                   -- job_id / project_id / row id involved
  error_detail   jsonb,                  -- raw error payload
  payload_sample jsonb                   -- truncated sample of what was being written
);

CREATE INDEX IF NOT EXISTS idx_pipeline_errors_occurred_at ON pipeline_errors (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_errors_source_table ON pipeline_errors (source, table_name);

ALTER TABLE pipeline_errors ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE pipeline_errors IS
  'Failed pipeline writes (Phase 1, June 2026). Writers: see CONFIRMED_WORK_PLAN.md N-11. Service-role only (RLS enabled, no policies).';


-- ============================================================================
-- SECTION 5 — cad_hover_measurements: ADDITIVE source_type COLUMN
-- Provenance prep for Phase 4 (rename to project_measurements). Verified: no
-- code in any repo reads this column today, so adding it changes nothing.
-- Nullable + CHECK; existing rows stay NULL until backfilled deliberately.
-- ============================================================================

ALTER TABLE cad_hover_measurements
  ADD COLUMN IF NOT EXISTS source_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cad_hover_measurements_source_type_check'
  ) THEN
    ALTER TABLE cad_hover_measurements
      ADD CONSTRAINT cad_hover_measurements_source_type_check
      CHECK (source_type IS NULL OR source_type IN ('hover', 'bluebeam', 'roboflow', 'manual'));
  END IF;
END $$;

-- Backfill — intentionally commented: existing rows are believed to be written
-- exclusively by the n8n "Approve from Detection Editor" workflow (Bluebeam-
-- originated jobs), but that is an n8n-side fact this repo cannot prove.
-- Confirm against the exported workflow before running:
--
-- UPDATE cad_hover_measurements SET source_type = 'bluebeam' WHERE source_type IS NULL;


-- ============================================================================
-- SECTION 6 — SCHEMA DOCUMENTATION (landmine warnings, in the schema itself)
-- ============================================================================

-- 6.1 siding_squares: comment only where the column is actually GENERATED
--     (diagnostic 0.4 shows where). Writing it in an INSERT/UPDATE fails —
--     this has bitten repeatedly (audit §2.6).
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name = 'siding_squares'
      AND table_schema = 'public'
      AND is_generated = 'ALWAYS'
  LOOP
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.siding_squares IS %L',
      rec.table_name,
      'GENERATED ALWAYS column — never include in INSERT/UPDATE payloads. See CONFIRMED_WORK_PLAN.md (Phase 1, June 2026).'
    );
    RAISE NOTICE 'Commented GENERATED column %.siding_squares', rec.table_name;
  END LOOP;
END $$;

-- 6.2 Document the extraction_id = job_id convention where it lives.
COMMENT ON TABLE cad_hover_measurements IS
  'MISLEADING NAME: holds Bluebeam/Detection-Editor approval measurements, not (only) HOVER data. Written by the n8n "Approve from Detection Editor" workflow with extraction_id = extraction job_id (control-flow-as-data convention; readers: estimation-api autoscope-v2.ts, ai-estimator lib/estimating/refData.ts). Slated to become project_measurements with source_type in Phase 4 — see CONFIRMED_WORK_PLAN.md.';

COMMENT ON COLUMN cad_hover_measurements.extraction_id IS
  'Set to the extraction job_id by n8n on approval (NOT a distinct extraction identity). Querying convention: extraction_id = job_id.';


-- ============================================================================
-- SECTION 7 — JSONB BOOLEAN-AS-STRING DIAGNOSTICS (read-only as shipped)
-- The isTrue()/isFalse() helpers in both engines exist to absorb "true"/"false"
-- strings in JSONB. Repo migrations are clean — contamination, if present,
-- came from n8n or ad-hoc writes. Measure before normalizing.
-- ============================================================================

-- 7.1 Contamination in siding_auto_scope_rules (the table the engines read).
SELECT '7.1 siding_auto_scope_rules string-boolean contamination' AS check_name,
       id, rule_name, trigger_condition
FROM siding_auto_scope_rules
WHERE trigger_condition::text ~ ':\s*"(true|false)"'
LIMIT 50;

-- 7.2 Contamination in auto_scope_rules_v2 (n8n-side table — existence itself
--     is part of ground-truthing; if this errors with "relation does not
--     exist", that settles audit finding #13's n8n half differently).
SELECT '7.2 auto_scope_rules_v2 string-boolean contamination' AS check_name,
       rule_name, trigger_condition
FROM auto_scope_rules_v2
WHERE trigger_condition::text ~ ':\s*"(true|false)"'
LIMIT 50;

-- Normalization — intentionally commented. The engines' isTrue()/isFalse()
-- helpers treat both representations identically, so normalizing is safe for
-- the TS engines — but n8n's evaluation semantics are unverified. Export and
-- check the n8n workflows before running, then add the CHECK constraint to
-- prevent recurrence:
--
-- UPDATE siding_auto_scope_rules
-- SET trigger_condition = regexp_replace(
--       regexp_replace(trigger_condition::text, ':\s*"true"',  ': true',  'g'),
--       ':\s*"false"', ': false', 'g'
--     )::jsonb
-- WHERE trigger_condition::text ~ ':\s*"(true|false)"';
--
-- ALTER TABLE siding_auto_scope_rules
--   ADD CONSTRAINT siding_asr_no_string_booleans
--   CHECK (trigger_condition::text !~ ':\s*"(true|false)"');


-- ============================================================================
-- SECTION 8 — GROUND-TRUTH AUDIT (read-only)
-- Settles the findings no repo could verify (CONFIRMED_WORK_PLAN.md #11, #13
-- n8n-half, #14). Corrected from audit §6: cad_manual_markups (the real table
-- name), extraction_detection_details added (the second detection table the
-- audit missed). Run each statement; missing-relation errors are themselves
-- answers — record them.
-- ============================================================================

-- 8.1 Row counts + activity for every suspect table.
SELECT relname AS table_name,
       n_live_tup AS approx_rows,
       seq_scan + idx_scan AS reads_since_stat_reset,
       n_tup_ins AS inserts,
       n_tup_upd AS updates
FROM pg_stat_user_tables
WHERE relname IN (
  'auto_scope_rules', 'material_assemblies',                  -- deprecated v1
  'siding_auto_scope_rules', 'auto_scope_rules_v2',           -- dual engines
  'labor_auto_scope_rules',
  'gutters_auto_scope_rules', 'roofing_auto_scope_rules',     -- existence unproven in any repo
  'windows_auto_scope_rules',
  'cad_manual_markups', 'cad_hover_measurements',             -- corrected name
  'cad_material_callouts', 'cad_layer_mappings', 'bluebeam_projects',
  'extraction_jobs', 'extraction_pages',
  'extraction_detections_draft', 'extraction_detection_details',  -- BOTH detection tables
  'extraction_detections_validated',                          -- referenced by no repo
  'extraction_job_totals',
  'calculation_constants', 'presentation_group_config',
  'detection_class_material_mapping', 'pipeline_errors'
)
ORDER BY reads_since_stat_reset DESC;

-- 8.2 Rules present in BOTH engines' tables (double-fire risk).
SELECT s.rule_name, s.material_sku
FROM siding_auto_scope_rules s
JOIN auto_scope_rules_v2 v
  ON LOWER(s.rule_name) = LOWER(v.rule_name)
  OR (s.material_sku IS NOT NULL AND s.material_sku = v.material_sku)
WHERE s.active = true AND v.active = true;

-- 8.3 Active rules referencing SKUs missing from pricing (run AFTER Section 2;
--     anything still listed here is a genuine gap, not a placeholder-seed gap).
SELECT r.rule_name, r.material_sku, 'siding_auto_scope_rules' AS source
FROM siding_auto_scope_rules r
LEFT JOIN pricing_items p ON p.sku = r.material_sku
WHERE r.active = true AND r.material_sku IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT r.rule_name, r.material_sku, 'auto_scope_rules_v2'
FROM auto_scope_rules_v2 r
LEFT JOIN pricing_items p ON p.sku = r.material_sku
WHERE r.active = true AND r.material_sku IS NOT NULL AND p.id IS NULL;

-- 8.4 Views still depending on deprecated v1 tables (blocks safe DROP in Phase 5).
SELECT DISTINCT dependent_view.relname AS view_name, source_table.relname AS depends_on
FROM pg_depend d
JOIN pg_rewrite r ON d.objid = r.oid
JOIN pg_class dependent_view ON r.ev_class = dependent_view.oid
JOIN pg_class source_table ON d.refobjid = source_table.oid
WHERE source_table.relname IN ('auto_scope_rules', 'material_assemblies')
  AND dependent_view.relname <> source_table.relname;

-- 8.5 Are the misplaced stone-veneer rules still sitting in v1 auto_scope_rules?
--     (migrate_stone_veneer_rules_to_siding.sql copied, never deleted.)
SELECT 'stone veneer rows still in v1 table' AS check_name, COUNT(*) AS n
FROM auto_scope_rules
WHERE rule_name LIKE 'stone_veneer%';


-- ============================================================================
-- SECTION B — BEHAVIOR-AFFECTING SEEDS (Phase 2 — INTENTIONALLY COMMENTED OUT)
-- ============================================================================
-- detection_class_material_mapping rows. Unlike Section 2, the engines DO
-- consult these mappings for corbel / belly_band_trim / belly_band_flashing
-- (DCP-first paths), and the dynamic detection-counts loop consults mappings
-- for classes without dedicated blocks. Enabling a missing mapping CHANGES
-- engine output:
--   • corbel: lines move from "$0 VERIFY PRICING" to the mapped catalog price
--     (MN568 has corbel count = 3 — the baseline WILL move if this mapping is
--     currently absent; diagnostic 0.6 tells you).
--   • belly_band_trim / belly_band_flashing: output moves only if the mapped
--     SKU's price differs from the engine fallbacks ($32.00 board JH-TRIM-BB-8-CP,
--     $12.50 Z-flash 112Z2BPW).
-- Enable during Phase 2 with the explained-delta regression gate: run MN568
-- before/after, review every changed line item, then re-baseline deliberately.
--
-- INSERT INTO detection_class_material_mapping
--   (class_name, display_name, measurement_type, unit_of_measure, default_product_sku, active)
-- SELECT v.*, true
-- FROM (VALUES
--   ('corbel',              'Corbel Count',          'count',  'EA', 'CORBEL-MD-PRIMED'),   -- Phase 2: confirm size/material choice with estimator
--   ('belly_band_trim',     'Belly Band Board',      'linear', 'LF', 'JH-TRIM-BB-8-CP'),
--   ('belly_band_flashing', 'Belly Band Z-Flashing', 'linear', 'LF', '112Z2BPW'),
--   -- Not yet consulted by dedicated blocks (hardcoded unconditionally) but
--   -- mapped here so Phase 2 wiring is a code-only change:
--   ('bracket',             'Bracket Count',         'count',  'EA', 'BRACKET-DECORATIVE'),
--   ('shutter',             'Shutter Count',         'count',  'EA', 'SHUTTER-VINYL'),
--   ('post',                'Post Count',            'count',  'EA', 'POST-WRAP-PVC'),
--   ('column',              'Column Count',          'count',  'EA', 'COLUMN-WRAP-PVC'),
--   ('soffit',              'Soffit Area',           'area',   'SF', 'JH-SOFFIT-12-VENT'),
--   ('fascia',              'Fascia Length',         'linear', 'LF', 'JH-TRIM-FASCIA-6')
-- ) AS v(class_name, display_name, measurement_type, unit_of_measure, default_product_sku)
-- WHERE NOT EXISTS (
--   SELECT 1 FROM detection_class_material_mapping m WHERE m.class_name = v.class_name
-- );

-- ============================================================================
-- END — re-run scripts/validate-mn568-baseline.ts and confirm ZERO delta.
-- ============================================================================
