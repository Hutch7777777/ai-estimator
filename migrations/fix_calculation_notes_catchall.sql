-- ============================================================================
-- FIX CALCULATION_NOTES THAT FELL THROUGH TO CATCHALL
-- These rules got generic templates like "1378 SF facade → 2 ROLL"
-- Update them with proper formula-based templates
-- ============================================================================

-- Fix Outside Corner Trim (fell through to facade-based catchall)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{outside_corners_count} outside corners × {corner_height}ft ÷ {piece_length}ft = {quantity} pcs'
WHERE LOWER(rule_name) LIKE '%outside%corner%'
  AND (calculation_notes LIKE '%facade%→%' OR calculation_notes LIKE '%corners →%');

-- Fix Inside Corner Trim (fell through to facade-based catchall)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{inside_corners_count} inside corners × {corner_height}ft ÷ {piece_length}ft = {quantity} pcs'
WHERE LOWER(rule_name) LIKE '%inside%corner%'
  AND (calculation_notes LIKE '%facade%→%' OR calculation_notes LIKE '%corners →%');

-- Fix Siding Fasteners (fell through to facade-based catchall)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{net_siding_sqft} SF siding ÷ {coverage} SF/box = {quantity} boxes'
WHERE (LOWER(rule_name) LIKE '%fastener%' OR LOWER(rule_name) LIKE '%siding nail%')
  AND (calculation_notes LIKE '%facade%→%' OR calculation_notes LIKE 'Calculated:%');

-- Fix Touch-Up Paint (fell through to facade-based catchall)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_sqft} SF ÷ {coverage} SF/kit = {quantity} kits'
WHERE (LOWER(rule_name) LIKE '%touch-up%' OR LOWER(rule_name) LIKE '%touch up%' OR LOWER(rule_name) LIKE '%paint%')
  AND (calculation_notes LIKE '%facade%→%' OR calculation_notes LIKE 'Calculated:%');

-- Fix Kickout Flashing (missing kickout_count variable)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{kickout_count} roof-to-wall intersections = {quantity} pcs'
WHERE (LOWER(rule_name) LIKE '%kickout%' OR LOWER(rule_name) LIKE '%kick-out%' OR LOWER(rule_name) LIKE '%kick out%')
  AND (calculation_notes LIKE '%N/A%' OR calculation_notes LIKE '%roof-to-wall intersections = {quantity}%');

-- Fix Corner Flashing (missing lf_per_corner variable)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{total_corner_count} corners × {lf_per_corner} LF/corner ÷ {piece_length}ft = {quantity} pcs'
WHERE material_category = 'flashing'
  AND LOWER(rule_name) LIKE '%corner%'
  AND (calculation_notes LIKE '%N/A%' OR calculation_notes LIKE '%× N/A LF%');

-- Fix Head Flashing (missing lf_per_opening variable)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{openings_count} openings × {lf_per_opening} LF avg ÷ {piece_length}ft = {quantity} pcs'
WHERE (LOWER(rule_name) LIKE '%head flash%' OR LOWER(rule_name) LIKE '%drip cap%')
  AND (calculation_notes LIKE '%N/A%' OR calculation_notes LIKE '%× N/A LF%');

-- Fix Joint Flashing (missing joint_count variable)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{joint_count} horizontal joints × {piece_length}ft/pc = {quantity} pcs'
WHERE (LOWER(rule_name) LIKE '%joint flash%' OR LOWER(rule_name) LIKE '%lap flash%')
  AND (calculation_notes LIKE '%N/A%' OR calculation_notes LIKE 'Calculated:%');

-- Fix Generic Flashing with source_lf
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_perimeter_lf} LF ÷ {piece_length}ft = {quantity} pcs'
WHERE material_category = 'flashing'
  AND (calculation_notes LIKE '%source_lf%' OR calculation_notes LIKE '%N/A LF%');

-- Fix Paintable Caulk (missing joint_lf variable)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_perimeter_lf} LF perimeter ÷ {coverage} LF/tube = {quantity} tubes'
WHERE (LOWER(rule_name) LIKE '%paintable%' AND LOWER(rule_name) LIKE '%caulk%')
  AND (calculation_notes LIKE '%N/A%' OR calculation_notes LIKE '%joint_lf%');

-- Fix Generic Caulk/Sealant with source_lf
UPDATE siding_auto_scope_rules
SET calculation_notes = '{openings_perimeter_lf} LF openings ÷ {coverage} LF/tube = {quantity} tubes'
WHERE material_category IN ('caulk', 'sealant')
  AND (calculation_notes LIKE '%source_lf%' OR calculation_notes LIKE '%N/A LF%');

-- Fix Artisan-specific items (tabs, staples, corner flashing)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{net_siding_sqft} SF ÷ 16 tabs/staple = {quantity} boxes'
WHERE LOWER(rule_name) LIKE '%artisan%tab%staple%'
  AND (calculation_notes LIKE '%N/A%' OR calculation_notes LIKE 'Calculated:%');

UPDATE siding_auto_scope_rules
SET calculation_notes = '{total_corner_count} corners × 20 tabs/corner ÷ 100 = {quantity} boxes'
WHERE LOWER(rule_name) LIKE '%artisan%corner%tab%'
  AND (calculation_notes LIKE '%N/A%' OR calculation_notes LIKE 'Calculated:%');

UPDATE siding_auto_scope_rules
SET calculation_notes = '{net_siding_sqft} SF ÷ 16 SF/tab = {quantity} boxes'
WHERE LOWER(rule_name) LIKE '%artisan%flat%tab%'
  AND (calculation_notes LIKE '%N/A%' OR calculation_notes LIKE 'Calculated:%');

UPDATE siding_auto_scope_rules
SET calculation_notes = '{total_corner_count} corners × {lf_per_corner} LF/corner ÷ {piece_length}ft = {quantity} pcs'
WHERE LOWER(rule_name) LIKE '%artisan%mitered%corner%'
  AND (calculation_notes LIKE '%N/A%' OR calculation_notes LIKE '× N/A LF%');

-- ============================================================================
-- Verify updates - show rules that still have N/A or generic catchall
-- ============================================================================

SELECT
  rule_id,
  rule_name,
  material_category,
  calculation_notes
FROM siding_auto_scope_rules
WHERE active = true
  AND (
    calculation_notes LIKE '%N/A%'
    OR calculation_notes LIKE '%→%'
    OR calculation_notes LIKE 'Calculated:%'
  )
ORDER BY material_category, rule_id;
