-- Migration: Add Belly Band Color Field with ColorPlus Colors
-- Purpose: Add belly_band_color field with all 25 James Hardie ColorPlus colors
-- Date: 2025-11-29
--
-- Background:
-- The update_belly_band_fields.sql migration deactivated the old belly_band_color field
-- because it was being replaced by belly_band_finish (colorplus/primed).
-- However, when belly_band_finish is "colorplus", users need to SELECT which ColorPlus color.
-- This migration adds a new belly_band_color field with:
-- - All 25 ColorPlus colors with hex codes
-- - Conditional visibility: only shows when belly_band_include=true AND belly_band_finish="colorplus"
--
-- Changes:
-- 1. Add belly_band_color field with all 25 ColorPlus colors (with hex codes)
-- 2. Set conditional visibility based on belly_band_include and belly_band_finish
-- 3. Default to "match_siding"

-- Add belly_band_color field with ColorPlus colors
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
  'belly_band_color',
  'Belly Band Color',
  'select',
  'Belly band color',
  NULL,
  'Select ColorPlus color for belly band trim',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('label', 'Match Siding', 'value', 'match_siding', 'hex', '#94a3b8'),
      jsonb_build_object('label', 'Arctic White', 'value', 'arctic white', 'hex', '#F5F5F0'),
      jsonb_build_object('label', 'Aged Pewter', 'value', 'aged pewter', 'hex', '#6B6B63'),
      jsonb_build_object('label', 'Autumn Tan', 'value', 'autumn tan', 'hex', '#B89F7E'),
      jsonb_build_object('label', 'Boothbay Blue', 'value', 'boothbay blue', 'hex', '#5B7A8A'),
      jsonb_build_object('label', 'Cobble Stone', 'value', 'cobble stone', 'hex', '#7A7568'),
      jsonb_build_object('label', 'Country Lane Red', 'value', 'country lane red', 'hex', '#6B3232'),
      jsonb_build_object('label', 'Deep Ocean', 'value', 'deep ocean', 'hex', '#2B4553'),
      jsonb_build_object('label', 'Evening Blue', 'value', 'evening blue', 'hex', '#2B3A4D'),
      jsonb_build_object('label', 'Heathered Moss', 'value', 'heathered moss', 'hex', '#5A6B52'),
      jsonb_build_object('label', 'Iron Gray', 'value', 'iron gray', 'hex', '#4A4F4F'),
      jsonb_build_object('label', 'Khaki Brown', 'value', 'khaki brown', 'hex', '#7D6B5A'),
      jsonb_build_object('label', 'Light Mist', 'value', 'light mist', 'hex', '#D8D8D0'),
      jsonb_build_object('label', 'Midnight Blue', 'value', 'midnight blue', 'hex', '#1E2A3A'),
      jsonb_build_object('label', 'Monterey Taupe', 'value', 'monterey taupe', 'hex', '#8B7D6B'),
      jsonb_build_object('label', 'Mountain Sage', 'value', 'mountain sage', 'hex', '#7A8B7A'),
      jsonb_build_object('label', 'Navajo Beige', 'value', 'navajo beige', 'hex', '#C4B9A7'),
      jsonb_build_object('label', 'Night Gray', 'value', 'night gray', 'hex', '#3D4242'),
      jsonb_build_object('label', 'Pearl Gray', 'value', 'pearl gray', 'hex', '#9A9A94'),
      jsonb_build_object('label', 'Sandstone Beige', 'value', 'sandstone beige', 'hex', '#C9B99A'),
      jsonb_build_object('label', 'Sierra', 'value', 'sierra', 'hex', '#8B5A42'),
      jsonb_build_object('label', 'Slate Gray', 'value', 'slate gray', 'hex', '#5A5F63'),
      jsonb_build_object('label', 'Timber Bark', 'value', 'timber bark', 'hex', '#5D4E42'),
      jsonb_build_object('label', 'Traditional Red', 'value', 'traditional red', 'hex', '#7B2D26'),
      jsonb_build_object('label', 'Tuscan Gold', 'value', 'tuscan gold', 'hex', '#C4A35A'),
      jsonb_build_object('label', 'Woodstock Brown', 'value', 'woodstock brown', 'hex', '#5A4A3A')
    )
  ),
  'match_siding',
  false,
  jsonb_build_object(
    'belly_band_include', true,
    'belly_band_finish', 'colorplus'
  ),
  2, -- trim_accessories section
  4, -- Fourth field (between belly_band_finish and belly_band_locations)
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

-- Update field_order for belly_band_locations to be after belly_band_color
UPDATE trade_configurations
SET
  field_order = 5,
  updated_at = NOW()
WHERE
  trade = 'siding'
  AND config_name = 'belly_band_locations';

-- Update field_order for belly_band_gable_board_count to be after belly_band_locations
UPDATE trade_configurations
SET
  field_order = 6,
  updated_at = NOW()
WHERE
  trade = 'siding'
  AND config_name = 'belly_band_gable_board_count';

-- Verify the changes
SELECT
  config_name,
  field_label,
  field_type,
  default_value,
  show_if_conditions,
  field_order,
  active
FROM trade_configurations
WHERE trade = 'siding'
  AND config_section = 'trim_accessories'
  AND config_name LIKE 'belly_band%'
ORDER BY field_order;

-- Show color count for belly_band_color to verify all 26 colors (25 + "Match Siding")
SELECT
  config_name,
  field_label,
  jsonb_array_length(field_options->'options') as color_count
FROM trade_configurations
WHERE
  trade = 'siding'
  AND config_name = 'belly_band_color';
