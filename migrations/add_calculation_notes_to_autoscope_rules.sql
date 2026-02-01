-- ============================================================================
-- ADD CALCULATION_NOTES TO SIDING_AUTO_SCOPE_RULES
-- Adds a template field for generating meaningful line item notes
-- Format uses {variable_name} placeholders that get substituted with actual values
-- ============================================================================

-- 1. Add the calculation_notes column
ALTER TABLE siding_auto_scope_rules
ADD COLUMN IF NOT EXISTS calculation_notes TEXT;

-- Add comment explaining the format
COMMENT ON COLUMN siding_auto_scope_rules.calculation_notes IS
'Template for line item notes. Uses {variable} placeholders substituted with values at runtime.
Available variables: facade_sqft, net_siding_sqft, openings_count, openings_perimeter_lf,
outside_corners_count, inside_corners_count, outside_corner_lf, inside_corner_lf,
trim_total_lf, trim_head_lf, trim_jamb_lf, trim_sill_lf, belly_band_lf,
quantity, unit_cost, coverage, waste_factor, piece_length';

-- ============================================================================
-- 2. UPDATE TRIM & CORNERS
-- ============================================================================

-- Outside Corner Trim
UPDATE siding_auto_scope_rules
SET calculation_notes = '{outside_corners_count} outside corners × {corner_height}ft ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE material_category = 'corner'
  AND (LOWER(rule_name) LIKE '%outside%corner%' OR LOWER(material_sku) LIKE '%oc%')
  AND calculation_notes IS NULL;

-- Inside Corner Trim
UPDATE siding_auto_scope_rules
SET calculation_notes = '{inside_corners_count} inside corners × {corner_height}ft ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE material_category = 'corner'
  AND (LOWER(rule_name) LIKE '%inside%corner%' OR LOWER(material_sku) LIKE '%ic%')
  AND calculation_notes IS NULL;

-- Generic corner trim (if not specifically outside or inside)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{total_corner_count} corners × {corner_height}ft ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE material_category = 'corner'
  AND calculation_notes IS NULL;

-- Starter Strip
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_perimeter_lf} LF perimeter ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE (LOWER(rule_name) LIKE '%starter%' OR LOWER(material_category) LIKE '%starter%')
  AND calculation_notes IS NULL;

-- Frieze Board
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_perimeter_lf} LF perimeter ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE (LOWER(rule_name) LIKE '%frieze%' OR LOWER(material_sku) LIKE '%frieze%')
  AND calculation_notes IS NULL;

-- J-Channel
UPDATE siding_auto_scope_rules
SET calculation_notes = '{openings_perimeter_lf} LF opening perimeter ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE (LOWER(rule_name) LIKE '%j-channel%' OR LOWER(rule_name) LIKE '%j channel%' OR LOWER(material_sku) LIKE '%jc%')
  AND calculation_notes IS NULL;

-- Window/Door Casing (Trim boards)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{trim_total_lf} LF total trim ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE material_category = 'trim'
  AND (LOWER(rule_name) LIKE '%casing%' OR LOWER(rule_name) LIKE '%trim board%')
  AND calculation_notes IS NULL;

-- Generic trim boards
UPDATE siding_auto_scope_rules
SET calculation_notes = '{trim_total_lf} LF trim ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE material_category = 'trim'
  AND calculation_notes IS NULL;

-- ============================================================================
-- 3. UPDATE FLASHING & WEATHERPROOFING
-- ============================================================================

-- Tyvek House Wrap
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_sqft} SF facade ÷ {coverage} SF/roll × {waste_factor} waste = {quantity} rolls'
WHERE (material_category = 'water_barrier' OR material_category = 'wrb' OR material_category = 'house_wrap')
  AND (LOWER(rule_name) LIKE '%tyvek%' OR LOWER(rule_name) LIKE '%house wrap%' OR LOWER(rule_name) LIKE '%housewrap%')
  AND calculation_notes IS NULL;

-- Generic WRB (felt, tar paper, etc.)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_sqft} SF facade ÷ {coverage} SF/roll × {waste_factor} waste = {quantity} rolls'
WHERE (material_category = 'water_barrier' OR material_category = 'wrb')
  AND calculation_notes IS NULL;

-- Tyvek Seam Tape
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_perimeter_lf} LF seams ÷ {coverage} LF/roll × {waste_factor} waste = {quantity} rolls'
WHERE (LOWER(rule_name) LIKE '%seam tape%' OR LOWER(rule_name) LIKE '%tape%')
  AND (material_category = 'water_barrier' OR material_category = 'accessories')
  AND calculation_notes IS NULL;

-- Z-Flashing Base/Wall
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_perimeter_lf} LF perimeter ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE (LOWER(rule_name) LIKE '%z-flash%base%' OR LOWER(rule_name) LIKE '%z flash%base%')
  AND calculation_notes IS NULL;

-- Generic Z-Flashing
UPDATE siding_auto_scope_rules
SET calculation_notes = '{source_lf} LF ÷ {piece_length}ft × {waste_factor} waste = {quantity} pcs'
WHERE material_category = 'flashing'
  AND LOWER(rule_name) LIKE '%z-flash%'
  AND calculation_notes IS NULL;

-- Kickout Flashing
UPDATE siding_auto_scope_rules
SET calculation_notes = '{kickout_count} roof-to-wall intersections = {quantity} pcs'
WHERE (LOWER(rule_name) LIKE '%kickout%' OR LOWER(rule_name) LIKE '%kick-out%' OR LOWER(rule_name) LIKE '%kick out%')
  AND calculation_notes IS NULL;

-- Corner Flashing
UPDATE siding_auto_scope_rules
SET calculation_notes = '{total_corner_count} corners × {lf_per_corner} LF/corner ÷ {piece_length}ft = {quantity} pcs'
WHERE material_category = 'flashing'
  AND LOWER(rule_name) LIKE '%corner%'
  AND calculation_notes IS NULL;

-- Head Flashing (window/door)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{openings_count} openings × {lf_per_opening} LF avg ÷ {piece_length}ft = {quantity} pcs'
WHERE (LOWER(rule_name) LIKE '%head flash%' OR LOWER(rule_name) LIKE '%drip cap%')
  AND calculation_notes IS NULL;

-- Joint Flashing
UPDATE siding_auto_scope_rules
SET calculation_notes = '{joint_count} horizontal joints × {piece_length}ft/pc = {quantity} pcs'
WHERE (LOWER(rule_name) LIKE '%joint flash%' OR LOWER(rule_name) LIKE '%lap flash%')
  AND calculation_notes IS NULL;

-- Generic Flashing
UPDATE siding_auto_scope_rules
SET calculation_notes = '{source_lf} LF ÷ {piece_length}ft = {quantity} pcs'
WHERE material_category = 'flashing'
  AND calculation_notes IS NULL;

-- ============================================================================
-- 4. UPDATE FASTENERS & ACCESSORIES
-- ============================================================================

-- Siding Fasteners/Nails
UPDATE siding_auto_scope_rules
SET calculation_notes = '{net_siding_sqft} SF siding ÷ {coverage} SF/box = {quantity} boxes'
WHERE material_category = 'fastener'
  AND (LOWER(rule_name) LIKE '%siding%nail%' OR LOWER(rule_name) LIKE '%fastener%')
  AND calculation_notes IS NULL;

-- Trim Nails
UPDATE siding_auto_scope_rules
SET calculation_notes = '{trim_total_lf} LF trim ÷ {coverage} LF/box = {quantity} boxes'
WHERE material_category = 'fastener'
  AND LOWER(rule_name) LIKE '%trim%nail%'
  AND calculation_notes IS NULL;

-- Generic Fasteners
UPDATE siding_auto_scope_rules
SET calculation_notes = '{source_measure} ÷ {coverage} = {quantity} boxes'
WHERE material_category = 'fastener'
  AND calculation_notes IS NULL;

-- Touch-Up Paint
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_sqft} SF ÷ {coverage} SF/kit = {quantity} kits'
WHERE (LOWER(rule_name) LIKE '%touch-up%' OR LOWER(rule_name) LIKE '%touch up%' OR LOWER(rule_name) LIKE '%paint%')
  AND material_category IN ('accessories', 'paint', 'touch_up')
  AND calculation_notes IS NULL;

-- ============================================================================
-- 5. UPDATE CAULK & SEALANTS
-- ============================================================================

-- ColorMatch Caulk (for openings)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{openings_perimeter_lf} LF openings ÷ {coverage} LF/tube = {quantity} tubes'
WHERE (LOWER(rule_name) LIKE '%colormatch%' OR LOWER(rule_name) LIKE '%color match%' OR LOWER(rule_name) LIKE '%color-match%')
  AND material_category IN ('caulk', 'sealant', 'accessories')
  AND calculation_notes IS NULL;

-- Paintable Caulk
UPDATE siding_auto_scope_rules
SET calculation_notes = '{joint_lf} LF joints ÷ {coverage} LF/tube = {quantity} tubes'
WHERE (LOWER(rule_name) LIKE '%paintable%' AND LOWER(rule_name) LIKE '%caulk%')
  AND calculation_notes IS NULL;

-- Color-Matched Caulk (for siding joints)
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_perimeter_lf} LF perimeter ÷ {coverage} LF/tube = {quantity} tubes'
WHERE material_category IN ('caulk', 'sealant')
  AND LOWER(rule_name) LIKE '%color%match%'
  AND calculation_notes IS NULL;

-- Generic Caulk/Sealant
UPDATE siding_auto_scope_rules
SET calculation_notes = '{source_lf} LF ÷ {coverage} LF/tube = {quantity} tubes'
WHERE material_category IN ('caulk', 'sealant')
  AND calculation_notes IS NULL;

-- ============================================================================
-- 6. UPDATE ARCHITECTURAL DETAILS
-- ============================================================================

-- Corbels
UPDATE siding_auto_scope_rules
SET calculation_notes = '{corbel_count} corbels detected from plans'
WHERE material_category = 'architectural'
  AND LOWER(rule_name) LIKE '%corbel%'
  AND calculation_notes IS NULL;

-- Brackets
UPDATE siding_auto_scope_rules
SET calculation_notes = '{bracket_count} brackets detected from plans'
WHERE material_category = 'architectural'
  AND LOWER(rule_name) LIKE '%bracket%'
  AND calculation_notes IS NULL;

-- Shutters
UPDATE siding_auto_scope_rules
SET calculation_notes = '{shutter_count} shutters detected (pairs = {shutter_pairs})'
WHERE material_category = 'architectural'
  AND LOWER(rule_name) LIKE '%shutter%'
  AND calculation_notes IS NULL;

-- Columns/Posts
UPDATE siding_auto_scope_rules
SET calculation_notes = '{column_count} columns detected from plans'
WHERE material_category = 'architectural'
  AND (LOWER(rule_name) LIKE '%column%' OR LOWER(rule_name) LIKE '%post%')
  AND calculation_notes IS NULL;

-- Louvers/Gable Vents
UPDATE siding_auto_scope_rules
SET calculation_notes = '{louver_count} gable louvers detected from plans'
WHERE material_category = 'architectural'
  AND (LOWER(rule_name) LIKE '%louver%' OR LOWER(rule_name) LIKE '%gable vent%')
  AND calculation_notes IS NULL;

-- Generic architectural
UPDATE siding_auto_scope_rules
SET calculation_notes = '{detection_count} items detected from plans'
WHERE material_category = 'architectural'
  AND calculation_notes IS NULL;

-- ============================================================================
-- 7. UPDATE SIDING PANELS (for auto-scope siding rules if not assigned)
-- ============================================================================

UPDATE siding_auto_scope_rules
SET calculation_notes = '{net_siding_sqft} SF net siding ÷ {coverage} SF/pc × {waste_factor} waste = {quantity} pcs'
WHERE material_category IN ('siding', 'lap_siding', 'panel_siding', 'shingle_siding')
  AND calculation_notes IS NULL;

-- ============================================================================
-- 8. CATCHALL for remaining rules without notes
-- ============================================================================

-- Rules based on facade area
UPDATE siding_auto_scope_rules
SET calculation_notes = '{facade_sqft} SF facade → {quantity} {unit}'
WHERE calculation_notes IS NULL
  AND quantity_formula LIKE '%facade%';

-- Rules based on opening perimeter
UPDATE siding_auto_scope_rules
SET calculation_notes = '{openings_perimeter_lf} LF openings → {quantity} {unit}'
WHERE calculation_notes IS NULL
  AND quantity_formula LIKE '%openings_perimeter%';

-- Rules based on corners
UPDATE siding_auto_scope_rules
SET calculation_notes = '{total_corner_count} corners → {quantity} {unit}'
WHERE calculation_notes IS NULL
  AND quantity_formula LIKE '%corner%';

-- Rules based on trim
UPDATE siding_auto_scope_rules
SET calculation_notes = '{trim_total_lf} LF trim → {quantity} {unit}'
WHERE calculation_notes IS NULL
  AND quantity_formula LIKE '%trim%';

-- Final catchall - formula-based note
UPDATE siding_auto_scope_rules
SET calculation_notes = 'Calculated: {quantity} {unit}'
WHERE calculation_notes IS NULL;

-- ============================================================================
-- 9. Verify updates
-- ============================================================================

SELECT
  rule_id,
  rule_name,
  material_category,
  quantity_formula,
  calculation_notes
FROM siding_auto_scope_rules
WHERE active = true
ORDER BY material_category, rule_id
LIMIT 30;
