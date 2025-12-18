-- Migration: Update ColorPlus Color Fields with Complete 25-Color Palette
-- Purpose: Add all 25 James Hardie ColorPlus colors with official hex codes
-- Date: 2025-11-29
--
-- Changes:
-- 1. Update colorplus_color field with all 25 official ColorPlus colors
-- 2. Update corner_trim_color field with all 25 colors
-- 3. Update j_channel_color field with all 25 colors
--
-- Note: Color values use lowercase with spaces (e.g., "arctic white")
--       to match the colorMap in color-swatch.tsx

-- Update colorplus_color field with complete 25-color palette (with hex codes)
UPDATE trade_configurations
SET
  field_options = jsonb_build_object(
    'options', jsonb_build_array(
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
  default_value = 'arctic white',
  updated_at = NOW()
WHERE
  trade = 'siding'
  AND config_name = 'colorplus_color';

-- Update corner_trim_color field with complete 25-color palette (with hex codes)
UPDATE trade_configurations
SET
  field_options = jsonb_build_object(
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
  default_value = 'match_siding',
  updated_at = NOW()
WHERE
  trade = 'siding'
  AND config_name = 'corner_trim_color';

-- Update j_channel_color field with complete 25-color palette (with hex codes)
UPDATE trade_configurations
SET
  field_options = jsonb_build_object(
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
  default_value = 'match_siding',
  updated_at = NOW()
WHERE
  trade = 'siding'
  AND config_name = 'j_channel_color';

-- Verify the updates
SELECT
  config_name,
  field_label,
  default_value,
  jsonb_array_length(field_options->'options') as color_count
FROM trade_configurations
WHERE
  trade = 'siding'
  AND config_name IN ('colorplus_color', 'corner_trim_color', 'j_channel_color')
ORDER BY config_name;

-- Show a sample of the color values to verify format
SELECT
  config_name,
  jsonb_array_elements(field_options->'options')->>'value' as color_value,
  jsonb_array_elements(field_options->'options')->>'label' as color_label
FROM trade_configurations
WHERE
  trade = 'siding'
  AND config_name = 'colorplus_color'
LIMIT 10;
