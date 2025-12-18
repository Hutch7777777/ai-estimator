-- Migration: Fix Corner Trim Color Values for Color Swatches
-- Purpose: Update corner trim color field values to use spaces instead of underscores
--          so they match the colorMap in ColorSwatchGrid component
-- Date: 2025-11-29
--
-- Issue: corner_trim_color field uses "arctic_white" (underscore) format
--        but ColorSwatchGrid expects "arctic white" (space) format
--        This causes grey placeholder instead of actual color swatches
--
-- Fix: Update field_options to use the correct format matching colorplus_color field

-- Update corner_trim_color field options to use spaces instead of underscores
UPDATE trade_configurations
SET
  field_options = jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('label', 'Match Siding', 'value', 'match_siding'),
      jsonb_build_object('label', 'Arctic White', 'value', 'arctic white'),
      jsonb_build_object('label', 'Cobble Stone', 'value', 'cobble stone'),
      jsonb_build_object('label', 'Monterey Taupe', 'value', 'monterey taupe'),
      jsonb_build_object('label', 'Aged Pewter', 'value', 'aged pewter'),
      jsonb_build_object('label', 'Sandstone Beige', 'value', 'sandstone beige'),
      jsonb_build_object('label', 'Navajo Beige', 'value', 'navajo beige'),
      jsonb_build_object('label', 'Iron Gray', 'value', 'iron gray'),
      jsonb_build_object('label', 'Timber Bark', 'value', 'timber bark'),
      jsonb_build_object('label', 'Khaki Brown', 'value', 'khaki brown'),
      jsonb_build_object('label', 'Heathered Moss', 'value', 'heathered moss'),
      jsonb_build_object('label', 'Mountain Sage', 'value', 'mountain sage'),
      jsonb_build_object('label', 'Evening Blue', 'value', 'evening blue'),
      jsonb_build_object('label', 'Night Gray', 'value', 'night gray'),
      jsonb_build_object('label', 'Boothbay Blue', 'value', 'boothbay blue'),
      jsonb_build_object('label', 'Countrylane Red', 'value', 'countrylane red')
    )
  ),
  default_value = 'match_siding',
  updated_at = NOW()
WHERE
  trade = 'siding'
  AND config_name = 'corner_trim_color';

-- Also update j_channel_color to add all ColorPlus options for consistency
UPDATE trade_configurations
SET
  field_options = jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('label', 'Match Siding', 'value', 'match_siding'),
      jsonb_build_object('label', 'Arctic White', 'value', 'arctic white'),
      jsonb_build_object('label', 'Cobble Stone', 'value', 'cobble stone'),
      jsonb_build_object('label', 'Monterey Taupe', 'value', 'monterey taupe'),
      jsonb_build_object('label', 'Aged Pewter', 'value', 'aged pewter'),
      jsonb_build_object('label', 'Sandstone Beige', 'value', 'sandstone beige'),
      jsonb_build_object('label', 'Navajo Beige', 'value', 'navajo beige'),
      jsonb_build_object('label', 'Iron Gray', 'value', 'iron gray'),
      jsonb_build_object('label', 'Timber Bark', 'value', 'timber bark'),
      jsonb_build_object('label', 'Khaki Brown', 'value', 'khaki brown'),
      jsonb_build_object('label', 'Heathered Moss', 'value', 'heathered moss'),
      jsonb_build_object('label', 'Mountain Sage', 'value', 'mountain sage'),
      jsonb_build_object('label', 'Evening Blue', 'value', 'evening blue'),
      jsonb_build_object('label', 'Night Gray', 'value', 'night gray'),
      jsonb_build_object('label', 'Boothbay Blue', 'value', 'boothbay blue'),
      jsonb_build_object('label', 'Countrylane Red', 'value', 'countrylane red')
    )
  ),
  default_value = 'match_siding',
  updated_at = NOW()
WHERE
  trade = 'siding'
  AND config_name = 'j_channel_color';

-- Verify the changes
SELECT
  config_name,
  field_label,
  default_value,
  field_options->'options' as color_options
FROM trade_configurations
WHERE
  trade = 'siding'
  AND config_name IN ('corner_trim_color', 'j_channel_color', 'colorplus_color')
ORDER BY config_name;

-- Show color values to confirm format
SELECT
  config_name,
  jsonb_array_elements(field_options->'options')->>'value' as color_value,
  jsonb_array_elements(field_options->'options')->>'label' as color_label
FROM trade_configurations
WHERE
  trade = 'siding'
  AND config_name IN ('corner_trim_color', 'j_channel_color')
ORDER BY config_name;
