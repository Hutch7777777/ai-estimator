-- ============================================================================
-- Create presentation_group_config table (Phase 1.3a)
-- ============================================================================
-- Phase 1.3a — DDL ONLY. No seed data. No consumer wiring. The engine does
-- not read this table until Phase 1.3c lands a fetcher in lib/estimating/
-- refData.ts. After this migration applies, runtime behavior is unchanged
-- because no code path consumes the table.
--
-- Purpose: forward-only mapping from observed presentation_group values
-- (emitted by siding_auto_scope_rules, detection-count items, and Bluebeam
-- subjects) to a canonical taxonomy of 7 material groups + 4 non-material
-- buckets. See docs/strategy/phase-1-presentation-group-contract.md for the
-- mapping inventory, owner-approved decisions, and the full Phase 1.3 plan.
--
-- Forward-only: this migration creates an empty table. It does NOT update
-- any existing takeoff_line_items row. Historical data is preserved verbatim
-- under the regression-protection contract recorded in
-- feedback_baseline_framing.md.
-- ============================================================================

CREATE TABLE IF NOT EXISTS presentation_group_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The non-canonical or canonical value as emitted by rules / detection-count
  -- items / Bluebeam subjects. Examples: 'Belly Band', 'Architectural Details',
  -- 'cladding', 'Sheet Metal', 'Unmatched Items'.
  observed_value TEXT NOT NULL,

  -- Where the observed value remaps to. Constrained to the 11 allowed values
  -- (7 canonical material groups + 4 non-material buckets).
  canonical_group TEXT NOT NULL CHECK (canonical_group IN (
    'cladding', 'trims', 'metals_flashings', 'waterproofing',
    'accessories', 'soffit', 'gutters',
    'labor', 'overhead', 'unmatched_items', 'review_required'
  )),

  -- Downstream renderer category. Drives where the line item appears in the
  -- Excel output: material tabs, labor/overhead totals, or review section.
  bucket_type TEXT NOT NULL CHECK (bucket_type IN (
    'material', 'non_material', 'review'
  )),

  -- Disposition code for this mapping (per phase-1-presentation-group-contract.md).
  mapping_action TEXT NOT NULL CHECK (mapping_action IN (
    'forward_remap', 'historical_only', 'promote_to_canonical',
    'separate_bucket', 'needs_owner_decision'
  )),

  -- Optional trade scoping. NULL = global; 'siding'/'roofing'/etc. = scoped.
  -- Forward-compatibility for multi-trade rollout. v1 ships only 'siding' or NULL rows.
  trade TEXT,

  -- Reserved for future use when multiple rows may match the same observed_value
  -- (none in v1). Conditional logic for ambiguous values like 'Flashing' lives
  -- in code (resolveFlashingTarget helper, Phase 1.3d), not in this column.
  priority INTEGER,

  active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Engineer note explaining the mapping origin (e.g. "owner-approved 2026-04-27,
  -- Decision 1: Sheet Metal is always metal flashing").
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Cross-constraint: bucket_type must match canonical_group's allowed set.
  -- Prevents data drift like a row claiming canonical_group='labor' with
  -- bucket_type='material'.
  CONSTRAINT presentation_group_config_bucket_consistency CHECK (
    (bucket_type = 'material' AND canonical_group IN (
      'cladding', 'trims', 'metals_flashings', 'waterproofing',
      'accessories', 'soffit', 'gutters'
    ))
    OR
    (bucket_type = 'non_material' AND canonical_group IN ('labor', 'overhead'))
    OR
    (bucket_type = 'review' AND canonical_group IN (
      'unmatched_items', 'review_required'
    ))
  ),

  -- One mapping per (value, trade) pair. Allows future trade-scoped overrides
  -- without duplicate observed_value rows for the same trade.
  CONSTRAINT presentation_group_config_unique_value_trade UNIQUE (observed_value, trade)
);

-- Runtime lookup index — orchestrator (Phase 1.3c+) reads by observed_value
-- filtered to active=true. Composite index covers both fields.
CREATE INDEX IF NOT EXISTS idx_presentation_group_config_lookup
  ON presentation_group_config (observed_value, active);

-- Downstream renderer index — Excel/Takeoff Viewer may aggregate by canonical_group.
CREATE INDEX IF NOT EXISTS idx_presentation_group_config_canonical
  ON presentation_group_config (canonical_group);

-- Self-documentation
COMMENT ON TABLE presentation_group_config IS
  'Forward-only mapping from observed presentation_group values (rule emissions, detection counts, Bluebeam subjects) to canonical taxonomy. Phase 1.3a (Phase 1.3c+ wires the read path). See docs/strategy/phase-1-presentation-group-contract.md.';

COMMENT ON COLUMN presentation_group_config.observed_value IS
  'The value as emitted by rules/detection-count/Bluebeam. Looked up case-sensitively against the engine refData cache.';
COMMENT ON COLUMN presentation_group_config.canonical_group IS
  'Target group. 7 material groups (cladding, trims, metals_flashings, waterproofing, accessories, soffit, gutters) or 4 non-material buckets (labor, overhead, unmatched_items, review_required).';
COMMENT ON COLUMN presentation_group_config.bucket_type IS
  'Downstream renderer category: material | non_material | review. Determined by canonical_group; the cross-constraint enforces consistency.';
COMMENT ON COLUMN presentation_group_config.mapping_action IS
  'Disposition code from the contract doc. forward_remap is the most common; needs_owner_decision should be empty in v1 (all decisions approved 2026-04-27).';
COMMENT ON COLUMN presentation_group_config.trade IS
  'NULL = global; trade name = scoped. Reserved for multi-trade rollout. v1 seeds use NULL or ''siding''.';
COMMENT ON COLUMN presentation_group_config.priority IS
  'Reserved for future use; v1 leaves NULL. Conditional logic for ambiguous values lives in code helpers, not here.';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- To revert this migration, run the following SQL. Drops the indexes and
-- constraints automatically via CASCADE on the table drop.
--
-- DROP TABLE IF EXISTS presentation_group_config;
--
-- Note: this rollback is safe at any point during Phase 1.3 because no
-- consumer reads the table until 1.3c. After 1.3c-1.3e ship, rolling back
-- this migration also requires reverting the consumer code (or the engine
-- will fall through to the code-side PRESENTATION_GROUP_FALLBACK constant
-- introduced in 1.3c — same observable behavior).
-- ============================================================================
