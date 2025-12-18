-- Migration: Update Belly Band Configuration Fields
-- Purpose: Update belly band fields to match API requirements
-- Date: 2025-11-28
--
-- Changes:
-- 1. Deactivate old belly_band_color field
-- 2. Deactivate old belly_band_material field
-- 3. Add belly_band_size field (6in, 8in, 10in)
-- 4. Add belly_band_finish field (colorplus, primed)
-- 5. Add belly_band_locations field (foundation, gable, both)
-- 6. Add belly_band_gable_board_count field (number, conditional)

-- Deactivate old fields (don't delete to preserve data integrity)
UPDATE trade_configurations
SET active = false
WHERE trade = 'siding'
  AND config_name IN ('belly_band_color', 'belly_band_material');

-- Ensure belly_band_include exists and is correctly configured
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_placeholder,
  field_help_text,
  field_options,
  default_value,
  is_required,
  show_if_conditions,
  section_order,
  field_order,
  active,
  load_from_catalog,
  catalog_filter,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'belly_band_include',
  'Include Belly Band',
  'checkbox',
  'Include belly band trim?',
  NULL,
  'Horizontal trim band (typically at foundation or gable break)',
  NULL,
  'false',
  false,
  NULL,
  2, -- trim_accessories section
  1, -- First field in belly band group
  true,
  false,
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (trade, config_name)
DO UPDATE SET
  field_help_text = EXCLUDED.field_help_text,
  section_order = EXCLUDED.section_order,
  field_order = EXCLUDED.field_order,
  active = true,
  updated_at = NOW();

-- Add belly_band_size field
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_placeholder,
  field_help_text,
  field_options,
  default_value,
  is_required,
  show_if_conditions,
  section_order,
  field_order,
  active,
  load_from_catalog,
  catalog_filter,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'belly_band_size',
  'Belly Band Width',
  'select',
  'Belly band width',
  NULL,
  'Select the width of the belly band trim',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('value', '6in', 'label', '6"'),
      jsonb_build_object('value', '8in', 'label', '8"'),
      jsonb_build_object('value', '10in', 'label', '10"')
    )
  ),
  '8in',
  false,
  jsonb_build_object('belly_band_include', true),
  2, -- trim_accessories section
  2, -- Second field in belly band group
  true,
  false,
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (trade, config_name)
DO UPDATE SET
  field_options = EXCLUDED.field_options,
  default_value = EXCLUDED.default_value,
  show_if_conditions = EXCLUDED.show_if_conditions,
  section_order = EXCLUDED.section_order,
  field_order = EXCLUDED.field_order,
  active = true,
  updated_at = NOW();

-- Add belly_band_finish field
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_placeholder,
  field_help_text,
  field_options,
  default_value,
  is_required,
  show_if_conditions,
  section_order,
  field_order,
  active,
  load_from_catalog,
  catalog_filter,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'belly_band_finish',
  'Belly Band Finish',
  'select',
  'Belly band finish',
  NULL,
  'ColorPlus provides pre-finished color, Primed requires painting',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('value', 'colorplus', 'label', 'ColorPlus'),
      jsonb_build_object('value', 'primed', 'label', 'Primed')
    )
  ),
  'colorplus',
  false,
  jsonb_build_object('belly_band_include', true),
  2, -- trim_accessories section
  3, -- Third field in belly band group
  true,
  false,
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (trade, config_name)
DO UPDATE SET
  field_options = EXCLUDED.field_options,
  default_value = EXCLUDED.default_value,
  show_if_conditions = EXCLUDED.show_if_conditions,
  section_order = EXCLUDED.section_order,
  field_order = EXCLUDED.field_order,
  active = true,
  updated_at = NOW();

-- Add belly_band_locations field
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_placeholder,
  field_help_text,
  field_options,
  default_value,
  is_required,
  show_if_conditions,
  section_order,
  field_order,
  active,
  load_from_catalog,
  catalog_filter,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'belly_band_locations',
  'Belly Band Location',
  'select',
  'Belly band location',
  NULL,
  '⚠️ Foundation uses HOVER measurements (high confidence). Gable break uses estimates - verify on site.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('value', 'foundation', 'label', 'Foundation (high confidence)'),
      jsonb_build_object('value', 'gable', 'label', 'Gable Break (low confidence)'),
      jsonb_build_object('value', 'both', 'label', 'Both')
    )
  ),
  'foundation',
  false,
  jsonb_build_object('belly_band_include', true),
  2, -- trim_accessories section
  4, -- Fourth field in belly band group
  true,
  false,
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (trade, config_name)
DO UPDATE SET
  field_options = EXCLUDED.field_options,
  default_value = EXCLUDED.default_value,
  show_if_conditions = EXCLUDED.show_if_conditions,
  field_help_text = EXCLUDED.field_help_text,
  section_order = EXCLUDED.section_order,
  field_order = EXCLUDED.field_order,
  active = true,
  updated_at = NOW();

-- Add belly_band_gable_board_count field (conditional on locations)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_placeholder,
  field_help_text,
  field_options,
  default_value,
  is_required,
  show_if_conditions,
  section_order,
  field_order,
  active,
  load_from_catalog,
  catalog_filter,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'belly_band_gable_board_count',
  'Gable Board Count',
  'number',
  'Gable board count (default: 6)',
  '6',
  'Number of boards for gable break belly band (estimate - HOVER does not provide this measurement)',
  jsonb_build_object(
    'min', 1,
    'max', 50,
    'step', 1
  ),
  '6',
  false,
  jsonb_build_object(
    'belly_band_include', true,
    'belly_band_locations', jsonb_build_object(
      'operator', 'not_equals',
      'value', 'foundation'
    )
  ),
  2, -- trim_accessories section
  5, -- Fifth field in belly band group
  true,
  false,
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (trade, config_name)
DO UPDATE SET
  field_options = EXCLUDED.field_options,
  default_value = EXCLUDED.default_value,
  show_if_conditions = EXCLUDED.show_if_conditions,
  field_help_text = EXCLUDED.field_help_text,
  section_order = EXCLUDED.section_order,
  field_order = EXCLUDED.field_order,
  active = true,
  updated_at = NOW();

-- Verify the migration
SELECT
  config_name,
  field_label,
  field_type,
  default_value,
  show_if_conditions,
  active
FROM trade_configurations
WHERE trade = 'siding'
  AND config_section = 'trim_accessories'
  AND config_name LIKE 'belly_band%'
ORDER BY field_order;
