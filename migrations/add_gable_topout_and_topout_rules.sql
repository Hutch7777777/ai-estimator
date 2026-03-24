-- ============================================================================
-- GABLE TOP-OUT AND TOP-OUT AUTO-SCOPE RULES MIGRATION
-- ============================================================================
--
-- PURPOSE: Add auto-scope rules for two new linear detection classes:
--   - gable_topout: Horizontal trim at wall-to-gable transition
--   - topout: Horizontal trim at top of wall (eave/soffit termination)
--
-- FRONTEND: Detection Editor already sends these as detection_counts with total_lf
-- Example payload:
--   detection_counts: {
--     gable_topout: { count: 2, total_lf: 45.5, display_name: "Gable Top-Out", measurement_type: "linear", unit: "LF" },
--     topout: { count: 4, total_lf: 120.0, display_name: "Top-Out", measurement_type: "linear", unit: "LF" }
--   }
--
-- BACKEND: Railway API extracts these into MeasurementContext:
--   gable_topout_lf, gable_topout_count, topout_lf, topout_count
--
-- RUN: Execute this migration in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Verify existing pricing items and max rule_id
-- ============================================================================

-- Check existing trim products for reference pricing
-- Run this first to verify pricing patterns:
-- SELECT sku, product_name, material_cost, base_labor_cost, unit, category
-- FROM pricing_items
-- WHERE category ILIKE '%trim%' OR sku ILIKE '%TRIM%' OR sku ILIKE '%FRIEZE%'
-- ORDER BY sku;

-- Check current max rule_id:
-- SELECT MAX(rule_id) FROM siding_auto_scope_rules;

-- ============================================================================
-- STEP 2: Insert pricing items for gable_topout and topout materials
-- ============================================================================

-- Gable Top-Out Trim (horizontal board at wall-to-gable transition)
INSERT INTO pricing_items (
  sku,
  product_name,
  manufacturer,
  category,
  material_cost,
  base_labor_cost,
  unit,
  description
)
VALUES (
  'TRIM-GABLE-TOPOUT-12',
  'HardieTrim 5/4 x 4 x 12ft Gable Top-Out',
  'James Hardie',
  'gable_topout_trim',
  18.50,
  5.50,
  'EA',
  'Horizontal trim board at wall-to-gable transition, 12ft piece'
)
ON CONFLICT (sku) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  material_cost = EXCLUDED.material_cost,
  base_labor_cost = EXCLUDED.base_labor_cost,
  updated_at = NOW();

-- Top-Out Trim (horizontal board at top of wall / eave termination)
INSERT INTO pricing_items (
  sku,
  product_name,
  manufacturer,
  category,
  material_cost,
  base_labor_cost,
  unit,
  description
)
VALUES (
  'TRIM-TOPOUT-12',
  'HardieTrim 5/4 x 6 x 12ft Top-Out',
  'James Hardie',
  'topout_trim',
  24.00,
  6.50,
  'EA',
  'Horizontal trim board at top of wall siding termination, 12ft piece'
)
ON CONFLICT (sku) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  material_cost = EXCLUDED.material_cost,
  base_labor_cost = EXCLUDED.base_labor_cost,
  updated_at = NOW();

-- Z-Flashing for Gable Top-Out
INSERT INTO pricing_items (
  sku,
  product_name,
  manufacturer,
  category,
  material_cost,
  base_labor_cost,
  unit,
  description
)
VALUES (
  'FLASH-GABLE-TOPOUT-10',
  'Z-Flashing 10ft for Gable Top-Out',
  'Generic',
  'gable_topout_flashing',
  8.50,
  2.00,
  'EA',
  'Z-flashing behind gable top-out trim, 10ft piece'
)
ON CONFLICT (sku) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  material_cost = EXCLUDED.material_cost,
  base_labor_cost = EXCLUDED.base_labor_cost,
  updated_at = NOW();

-- Z-Flashing for Top-Out
INSERT INTO pricing_items (
  sku,
  product_name,
  manufacturer,
  category,
  material_cost,
  base_labor_cost,
  unit,
  description
)
VALUES (
  'FLASH-TOPOUT-10',
  'Z-Flashing 10ft for Top-Out',
  'Generic',
  'topout_flashing',
  8.50,
  2.00,
  'EA',
  'Z-flashing behind top-out trim, 10ft piece'
)
ON CONFLICT (sku) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  material_cost = EXCLUDED.material_cost,
  base_labor_cost = EXCLUDED.base_labor_cost,
  updated_at = NOW();

-- ============================================================================
-- STEP 3: Insert auto-scope rules for gable_topout
-- ============================================================================

-- Gable Top-Out Trim Boards (12ft pieces, 10% waste)
INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  presentation_group,
  group_order,
  item_order,
  priority,
  active,
  manufacturer_filter,
  size_description
) VALUES (
  'Gable Top-Out Trim Boards',
  'Horizontal trim at wall-to-gable transition. 12ft pieces with 10% waste.',
  'gable_topout_trim',
  'TRIM-GABLE-TOPOUT-12',
  'Math.ceil(gable_topout_lf * 1.10 / 12)',
  'ea',
  'ea',
  '{"min_gable_topout_lf": 1}'::jsonb,
  'trim',
  2,
  20,
  64,
  true,
  NULL,
  '5/4 x 4 x 12ft'
)
ON CONFLICT (rule_name) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  trigger_condition = EXCLUDED.trigger_condition,
  material_sku = EXCLUDED.material_sku,
  updated_at = NOW();

-- Gable Top-Out Z-Flashing (10ft pieces, 10% waste)
INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  presentation_group,
  group_order,
  item_order,
  priority,
  active,
  manufacturer_filter,
  size_description
) VALUES (
  'Gable Top-Out Z-Flashing',
  'Z-flashing behind gable top-out trim. 10ft pieces with 10% waste.',
  'gable_topout_flashing',
  'FLASH-GABLE-TOPOUT-10',
  'Math.ceil(gable_topout_lf * 1.10 / 10)',
  'ea',
  'ea',
  '{"min_gable_topout_lf": 1}'::jsonb,
  'flashing',
  3,
  25,
  65,
  true,
  NULL,
  '10ft'
)
ON CONFLICT (rule_name) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  trigger_condition = EXCLUDED.trigger_condition,
  material_sku = EXCLUDED.material_sku,
  updated_at = NOW();

-- ============================================================================
-- STEP 4: Insert auto-scope rules for topout
-- ============================================================================

-- Top-Out Trim Boards (12ft pieces, 10% waste)
INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  presentation_group,
  group_order,
  item_order,
  priority,
  active,
  manufacturer_filter,
  size_description
) VALUES (
  'Top-Out Trim Boards',
  'Horizontal trim at top of wall / eave termination. 12ft pieces with 10% waste.',
  'topout_trim',
  'TRIM-TOPOUT-12',
  'Math.ceil(topout_lf * 1.10 / 12)',
  'ea',
  'ea',
  '{"min_topout_lf": 1}'::jsonb,
  'trim',
  2,
  21,
  66,
  true,
  NULL,
  '5/4 x 6 x 12ft'
)
ON CONFLICT (rule_name) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  trigger_condition = EXCLUDED.trigger_condition,
  material_sku = EXCLUDED.material_sku,
  updated_at = NOW();

-- Top-Out Z-Flashing (10ft pieces, 10% waste)
INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  presentation_group,
  group_order,
  item_order,
  priority,
  active,
  manufacturer_filter,
  size_description
) VALUES (
  'Top-Out Z-Flashing',
  'Z-flashing behind top-out trim. 10ft pieces with 10% waste.',
  'topout_flashing',
  'FLASH-TOPOUT-10',
  'Math.ceil(topout_lf * 1.10 / 10)',
  'ea',
  'ea',
  '{"min_topout_lf": 1}'::jsonb,
  'flashing',
  3,
  26,
  67,
  true,
  NULL,
  '10ft'
)
ON CONFLICT (rule_name) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  trigger_condition = EXCLUDED.trigger_condition,
  material_sku = EXCLUDED.material_sku,
  updated_at = NOW();

-- ============================================================================
-- STEP 5: Verification queries
-- ============================================================================

-- Verify pricing items were created
SELECT sku, product_name, material_cost, base_labor_cost, unit, category
FROM pricing_items
WHERE sku LIKE '%TOPOUT%'
ORDER BY sku;

-- Verify auto-scope rules were created
SELECT
  rule_id,
  rule_name,
  material_sku,
  quantity_formula,
  trigger_condition,
  presentation_group,
  active
FROM siding_auto_scope_rules
WHERE material_category LIKE '%topout%'
ORDER BY rule_id;

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- PRESENTATION GROUP MAPPING:
-- - 'trim' → Routes to "Trim & Corners" section in Excel export
-- - 'flashing' → Routes to "Flashing" section in Excel export
--
-- PRICING NOTES:
-- - Material costs are placeholder estimates based on typical HardieTrim pricing
-- - Verify against actual supplier pricing before production use
-- - Labor costs assume standard trim installation rates
--
-- FORMULA LOGIC:
-- - Math.ceil(topout_lf * 1.10 / 12)
--   - topout_lf: Linear feet from detection_counts.topout.total_lf
--   - 1.10: 10% waste factor
--   - 12: Board length in feet
--   - Math.ceil: Round up to whole pieces
--
-- TRIGGER CONDITIONS:
-- - min_gable_topout_lf: 1 → Only fires if any gable_topout detections exist
-- - min_topout_lf: 1 → Only fires if any topout detections exist
--
-- ESTIMATE SETTINGS PANEL:
-- - Users can disable these sections via estimateSettings.gable_topout.include = false
-- - Users can override LF via estimateSettings.gable_topout.manual_lf
-- ============================================================================
