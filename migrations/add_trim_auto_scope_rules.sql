-- ============================================================================
-- TRIM MATERIAL AUTO-SCOPE RULES MIGRATION
-- ============================================================================
--
-- PURPOSE: Fix trim calculations so HardieTrim materials are automatically
-- generated from window/door/garage opening measurements (trim.total_trim_lf)
--
-- PROBLEM: Current "Window/Door Casing" rule uses simplified formula
-- (openings_count * 5 / 12) instead of actual trim linear feet from payload
--
-- SOLUTION:
-- 1. Update existing Window/Door Casing rule to use trim_total_lf
-- 2. Add new rules for head, jamb, sill trim (optional breakdown)
-- 3. Add caulk and fastener rules triggered by trim LF
--
-- PAYLOAD REFERENCE (from DetectionEditor.tsx:2633-2647):
-- payload.trim = {
--   total_head_lf: windowHeadLf + doorHeadLf + garageHeadLf,
--   total_jamb_lf: windowJambLf + doorJambLf + garageJambLf,
--   total_sill_lf: windowSillLf,
--   total_trim_lf: <sum of all above>
-- }
--
-- N8N VARIABLE MAPPING:
-- These payload fields should map to auto-scope variables:
--   trim.total_trim_lf    -> trim_total_lf
--   trim.total_head_lf    -> trim_head_lf
--   trim.total_jamb_lf    -> trim_jamb_lf
--   trim.total_sill_lf    -> trim_sill_lf
--
-- RUN: Execute this migration in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PHASE 1: Update existing Window/Door Casing rule
-- ============================================================================
-- The current rule uses: Math.ceil(openings_count * 5 / 12)
-- This assumes 5 LF per opening, which is inaccurate
-- New formula: Use actual trim_total_lf from payload
-- ============================================================================

UPDATE siding_auto_scope_rules
SET
  quantity_formula = 'CEILING(trim_total_lf / 12 * 1.10)',
  description = 'HardieTrim boards for window/door/garage openings. Formula: CEILING(trim_total_lf / 12ft board * 1.10 waste)',
  trigger_condition = '{"trim_total_lf_gt": 0}'::jsonb,
  updated_at = NOW()
WHERE rule_name = 'Window/Door Casing';

-- Verify the update
SELECT
  rule_id,
  rule_name,
  quantity_formula,
  trigger_condition,
  material_sku
FROM siding_auto_scope_rules
WHERE rule_name = 'Window/Door Casing';

-- ============================================================================
-- PHASE 2: Add new trim-related auto-scope rules
-- ============================================================================
-- These rules provide more granular control and additional materials
-- ============================================================================

-- 2A. Trim Caulk - ColorMatch caulk for trim joints
-- Formula: 1 tube per 40 LF of trim (joints at butt ends + along windows)
INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  priority,
  active,
  presentation_group,
  group_order,
  item_order,
  size_description
) VALUES (
  'Trim Caulk - ColorMatch',
  'ColorMatch caulk for trim board joints and perimeter sealing. 1 tube per 40 LF.',
  'caulk',
  'CAULK-JH-COLORMATCH',
  'CEILING(trim_total_lf / 40)',
  'tube',
  'tube',
  '{"trim_total_lf_gt": 0}'::jsonb,
  95,  -- After other caulk rules
  true,
  'fasteners',
  4,
  6,  -- After existing caulk rules
  ''
)
ON CONFLICT (rule_name) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  trigger_condition = EXCLUDED.trigger_condition,
  description = EXCLUDED.description,
  updated_at = NOW();

-- 2B. Trim Fasteners - Stainless steel nails for trim
-- Formula: 1 box (1 lb) per 100 LF of trim
INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  priority,
  active,
  presentation_group,
  group_order,
  item_order,
  size_description
) VALUES (
  'Trim Fasteners - SS Nails',
  'Stainless steel ring shank nails for trim installation. 1 box per 100 LF.',
  'fasteners',
  'TRIM-NAILS-SS-1LB',
  'CEILING(trim_total_lf / 100)',
  'box',
  'box',
  '{"trim_total_lf_gt": 0}'::jsonb,
  85,
  true,
  'fasteners',
  4,
  7,
  '1 lb box'
)
ON CONFLICT (rule_name) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  trigger_condition = EXCLUDED.trigger_condition,
  description = EXCLUDED.description,
  updated_at = NOW();

-- 2C. Head Flashing for Trim - Z-flashing over window/door heads
-- Formula: 1 10ft piece per window/door head (use openings_count as proxy)
-- This uses head_lf which is more accurate
INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  priority,
  active,
  presentation_group,
  group_order,
  item_order,
  size_description
) VALUES (
  'Trim Head Flashing',
  'Z-flashing installed above window/door heads under siding. Based on total head trim LF.',
  'flashing',
  'ZFLASH-10',
  'CEILING(trim_head_lf / 10 * 1.10)',
  'ea',
  'ea',
  '{"trim_head_lf_gt": 0}'::jsonb,
  70,
  true,
  'flashing',
  3,
  8,
  '10ft pieces'
)
ON CONFLICT (rule_name) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  trigger_condition = EXCLUDED.trigger_condition,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================================
-- PHASE 3: Verify all trim rules
-- ============================================================================

SELECT
  rule_id,
  rule_name,
  material_category,
  material_sku,
  quantity_formula,
  trigger_condition,
  presentation_group,
  priority,
  active
FROM siding_auto_scope_rules
WHERE rule_name LIKE '%Trim%'
   OR rule_name LIKE '%trim%'
   OR rule_name LIKE '%Casing%'
ORDER BY priority, rule_name;

-- ============================================================================
-- PHASE 4: Verify SKUs exist in pricing_items
-- ============================================================================

SELECT
  sku,
  product_name,
  category,
  unit,
  material_cost,
  coverage_value,
  coverage_unit
FROM pricing_items
WHERE sku IN ('CASING-5/4X4X12', 'CAULK-JH-COLORMATCH', 'TRIM-NAILS-SS-1LB', 'ZFLASH-10');

-- ============================================================================
-- N8N WORKFLOW CHANGES REQUIRED
-- ============================================================================
-- The n8n workflow that processes auto-scope rules needs to be updated to:
--
-- 1. Map payload.trim fields to variables:
--    - trim_total_lf = payload.trim?.total_trim_lf || 0
--    - trim_head_lf = payload.trim?.total_head_lf || 0
--    - trim_jamb_lf = payload.trim?.total_jamb_lf || 0
--    - trim_sill_lf = payload.trim?.total_sill_lf || 0
--
-- 2. Add these variables to the context when evaluating formulas:
--    const context = {
--      ...existingVars,
--      trim_total_lf,
--      trim_head_lf,
--      trim_jamb_lf,
--      trim_sill_lf,
--    };
--
-- 3. Handle new trigger condition: {"trim_total_lf_gt": 0}
--    - Should evaluate: trim_total_lf > 0
--
-- Example n8n Code node update:
-- ```javascript
-- // Extract trim measurements from payload
-- const trim_total_lf = payload.trim?.total_trim_lf || 0;
-- const trim_head_lf = payload.trim?.total_head_lf || 0;
-- const trim_jamb_lf = payload.trim?.total_jamb_lf || 0;
-- const trim_sill_lf = payload.trim?.total_sill_lf || 0;
--
-- // Add to formula context
-- const formulaContext = {
--   ...existingContext,
--   trim_total_lf,
--   trim_head_lf,
--   trim_jamb_lf,
--   trim_sill_lf,
-- };
--
-- // Handle trigger conditions
-- function evaluateTrigger(condition) {
--   if (condition.trim_total_lf_gt !== undefined) {
--     return trim_total_lf > condition.trim_total_lf_gt;
--   }
--   if (condition.trim_head_lf_gt !== undefined) {
--     return trim_head_lf > condition.trim_head_lf_gt;
--   }
--   // ... existing trigger handlers
-- }
-- ```
-- ============================================================================

-- Show summary
SELECT 'MIGRATION COMPLETE' AS status, COUNT(*) AS total_trim_related_rules
FROM siding_auto_scope_rules
WHERE rule_name LIKE '%Trim%'
   OR rule_name LIKE '%trim%'
   OR rule_name LIKE '%Casing%';
