-- ============================================================================
-- WRB INSTALLATION LABOR RATE & AUTO-SCOPE RULE
-- Weather Resistive Barrier (house wrap) installation labor
-- Rate: $40.00 per square, based on facade area (not net siding area)
-- ============================================================================

-- 1. Add or update the WRB Installation labor rate
-- This ensures the rate exists with the correct $40/square pricing
INSERT INTO labor_rates (
  rate_name,
  description,
  trade,
  presentation_group,
  unit,
  base_rate,
  difficulty_multiplier,
  active,
  notes
)
VALUES (
  'WRB Installation',
  'Install weather resistive barrier (house wrap)',
  'siding',
  'prep',
  'square',
  40.00,
  1.00,
  true,
  'Applied to entire facade area. Tyvek, felt paper, or similar WRB installation.'
)
ON CONFLICT (rate_name) WHERE trade = 'siding'
DO UPDATE SET
  description = EXCLUDED.description,
  base_rate = EXCLUDED.base_rate,
  presentation_group = EXCLUDED.presentation_group,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- 2. Add or update the labor auto-scope rule that triggers WRB installation
-- trigger_type: 'always' means this applies to every siding job
-- quantity_source: 'facade_sqft' uses total facade area (NOT net siding area)
-- quantity_formula: 'facade_sqft / 100' converts SF to squares
INSERT INTO labor_auto_scope_rules (
  rule_id,
  rule_name,
  description,
  trade,
  trigger_type,
  trigger_value,
  labor_rate_id,
  quantity_source,
  quantity_formula,
  quantity_unit,
  priority,
  active
)
VALUES (
  'LABOR-WRB-INSTALL',
  'WRB Installation',
  'Weather resistant barrier installation - applies to all siding jobs based on facade area',
  'siding',
  'always',
  NULL,
  (SELECT id FROM labor_rates WHERE rate_name = 'WRB Installation' AND trade = 'siding'),
  'facade_sqft',
  'facade_sqft / 100',
  'square',
  10,  -- Priority 10 = runs early (before siding installation)
  true
)
ON CONFLICT (rule_id)
DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  description = EXCLUDED.description,
  labor_rate_id = EXCLUDED.labor_rate_id,
  quantity_source = EXCLUDED.quantity_source,
  quantity_formula = EXCLUDED.quantity_formula,
  quantity_unit = EXCLUDED.quantity_unit,
  priority = EXCLUDED.priority,
  active = EXCLUDED.active,
  updated_at = NOW();

-- 3. Verify the rule is set up correctly
SELECT
  lar.rule_id,
  lar.rule_name,
  lar.trigger_type,
  lar.quantity_source,
  lar.quantity_formula,
  lar.quantity_unit,
  lr.rate_name,
  lr.base_rate,
  lr.unit
FROM labor_auto_scope_rules lar
LEFT JOIN labor_rates lr ON lar.labor_rate_id = lr.id
WHERE lar.rule_id = 'LABOR-WRB-INSTALL';

-- ============================================================================
-- EXPECTED OUTPUT IN LABOR SECTION:
-- For a 1,280 SF facade:
-- | DESCRIPTION                                    | QTY         | RATE   | TOTAL   |
-- |------------------------------------------------|-------------|--------|---------|
-- | Install weather resistive barrier (house wrap) | 12.80 square| $40.00 | $512.00 |
-- ============================================================================
