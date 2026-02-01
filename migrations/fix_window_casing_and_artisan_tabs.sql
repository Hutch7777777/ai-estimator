-- ============================================================================
-- FIX WINDOW/DOOR CASING FORMULA AND ARTISAN TAB NOTES
--
-- Problem 1: Window/Door Casing uses openings_count × 5 / 12 (wrong)
--            Should use (window_perimeter_lf + door_perimeter_lf) / 12 * 1.10
--
-- Problem 2: Artisan tab notes show N/A due to missing artisan_sqft variable
-- ============================================================================

-- ============================================================================
-- 1. FIX WINDOW/DOOR CASING RULES
-- ============================================================================

-- First, find and show current state of casing rules
SELECT rule_id, rule_name, quantity_formula, calculation_notes
FROM siding_auto_scope_rules
WHERE LOWER(rule_name) LIKE '%window%casing%'
   OR LOWER(rule_name) LIKE '%door%casing%'
   OR (material_category = 'window_trim' AND LOWER(rule_name) LIKE '%casing%')
   OR material_category = 'trim' AND LOWER(rule_name) LIKE '%casing%';

-- Update the main Window/Door Casing rule
UPDATE siding_auto_scope_rules
SET
  quantity_formula = 'Math.ceil((window_perimeter_lf + door_perimeter_lf) / 12 * 1.10)',
  calculation_notes = '{openings_perimeter_lf} LF opening trim ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE LOWER(rule_name) = 'window/door casing'
   OR (LOWER(rule_name) LIKE '%window%door%casing%' AND manufacturer_filter IS NULL);

-- Update Artisan Window/Door Casing
UPDATE siding_auto_scope_rules
SET
  quantity_formula = 'Math.ceil((window_perimeter_lf + door_perimeter_lf) / 12 * 1.10)',
  calculation_notes = '{openings_perimeter_lf} LF opening trim ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE rule_name = 'Artisan Window/Door Casing'
   OR (LOWER(rule_name) LIKE '%artisan%casing%');

-- Update Allura Window/Door Casing
UPDATE siding_auto_scope_rules
SET
  quantity_formula = 'Math.ceil((window_perimeter_lf + door_perimeter_lf) / 12 * 1.10)',
  calculation_notes = '{openings_perimeter_lf} LF opening trim ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE rule_name = 'Allura Window/Door Casing'
   OR (LOWER(rule_name) LIKE '%allura%casing%');

-- Update LP SmartSide Window/Door Casing
UPDATE siding_auto_scope_rules
SET
  quantity_formula = 'Math.ceil((window_perimeter_lf + door_perimeter_lf) / 12 * 1.10)',
  calculation_notes = '{openings_perimeter_lf} LF opening trim ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE rule_name = 'LP SmartSide Window/Door Casing'
   OR (LOWER(rule_name) LIKE '%lp%smartside%casing%');

-- Update any other casing rules in the trim or window_trim category
UPDATE siding_auto_scope_rules
SET
  quantity_formula = 'Math.ceil((window_perimeter_lf + door_perimeter_lf) / 12 * 1.10)',
  calculation_notes = '{openings_perimeter_lf} LF opening trim ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE material_category IN ('trim', 'window_trim')
  AND LOWER(rule_name) LIKE '%casing%'
  AND quantity_formula LIKE '%openings_count%';

-- ============================================================================
-- 2. FIX ARTISAN TAB/STAPLE NOTES (use net_siding_sqft instead of artisan_sqft)
-- Since artisan_sqft may not be populated, use net_siding_sqft which works
-- when the rule is manufacturer-filtered to Artisan only
-- ============================================================================

-- Fix Artisan Tab Staples
UPDATE siding_auto_scope_rules
SET calculation_notes = '{net_siding_sqft} SF siding ÷ {coverage} SF/box = {quantity} boxes'
WHERE LOWER(rule_name) LIKE '%artisan%tab%staple%'
   OR LOWER(rule_name) LIKE '%artisan%staple%';

-- Fix Artisan Flat Tabs
UPDATE siding_auto_scope_rules
SET calculation_notes = '{net_siding_sqft} SF siding ÷ {coverage} SF/box = {quantity} boxes'
WHERE LOWER(rule_name) LIKE '%artisan%flat%tab%';

-- Fix Artisan Corner Tabs (based on corner count, not SF)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{total_corner_count} corners × 20 tabs/corner ÷ 100 = {quantity} boxes'
WHERE LOWER(rule_name) LIKE '%artisan%corner%tab%';

-- Fix generic Artisan tab rules
UPDATE siding_auto_scope_rules
SET calculation_notes = '{net_siding_sqft} SF siding ÷ {coverage} SF/box = {quantity} boxes'
WHERE LOWER(rule_name) LIKE '%artisan%tab%'
  AND calculation_notes LIKE '%N/A%';

-- ============================================================================
-- 3. VERIFY UPDATES
-- ============================================================================

-- Show updated casing rules
SELECT
  rule_id,
  rule_name,
  material_category,
  quantity_formula,
  calculation_notes
FROM siding_auto_scope_rules
WHERE LOWER(rule_name) LIKE '%casing%'
ORDER BY rule_name;

-- Show updated Artisan tab rules
SELECT
  rule_id,
  rule_name,
  material_category,
  quantity_formula,
  calculation_notes
FROM siding_auto_scope_rules
WHERE LOWER(rule_name) LIKE '%artisan%tab%'
   OR LOWER(rule_name) LIKE '%artisan%staple%'
ORDER BY rule_name;

-- Show any rules still with N/A in calculation_notes
SELECT
  rule_id,
  rule_name,
  material_category,
  calculation_notes
FROM siding_auto_scope_rules
WHERE active = true
  AND calculation_notes LIKE '%N/A%'
ORDER BY material_category, rule_id;
