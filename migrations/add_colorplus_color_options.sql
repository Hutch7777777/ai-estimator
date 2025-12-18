-- Migration: Add ColorPlus Color Field Options
-- Date: 2025-11-26
-- Description: Adds the 15 official James Hardie ColorPlus color options to the colorplus_color field
--
-- IMPORTANT: Run this in your Supabase SQL Editor or via psql
--
-- This migration updates the existing colorplus_color field to include all 15 James Hardie ColorPlus colors
-- with their exact names (matching the hex color map in color-swatch.tsx)

-- Update the colorplus_color field with the complete list of ColorPlus colors
UPDATE trade_configurations
SET
  field_options = jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'Arctic White',
        'value', 'arctic white'
      ),
      jsonb_build_object(
        'label', 'Aged Pewter',
        'value', 'aged pewter'
      ),
      jsonb_build_object(
        'label', 'Cobble Stone',
        'value', 'cobble stone'
      ),
      jsonb_build_object(
        'label', 'Monterey Taupe',
        'value', 'monterey taupe'
      ),
      jsonb_build_object(
        'label', 'Sandstone Beige',
        'value', 'sandstone beige'
      ),
      jsonb_build_object(
        'label', 'Navajo Beige',
        'value', 'navajo beige'
      ),
      jsonb_build_object(
        'label', 'Iron Gray',
        'value', 'iron gray'
      ),
      jsonb_build_object(
        'label', 'Timber Bark',
        'value', 'timber bark'
      ),
      jsonb_build_object(
        'label', 'Khaki Brown',
        'value', 'khaki brown'
      ),
      jsonb_build_object(
        'label', 'Heathered Moss',
        'value', 'heathered moss'
      ),
      jsonb_build_object(
        'label', 'Mountain Sage',
        'value', 'mountain sage'
      ),
      jsonb_build_object(
        'label', 'Evening Blue',
        'value', 'evening blue'
      ),
      jsonb_build_object(
        'label', 'Night Gray',
        'value', 'night gray'
      ),
      jsonb_build_object(
        'label', 'Boothbay Blue',
        'value', 'boothbay blue'
      ),
      jsonb_build_object(
        'label', 'Countrylane Red',
        'value', 'countrylane red'
      )
    )
  ),
  updated_at = now()
WHERE config_name = 'colorplus_color'
  AND trade = 'siding';

-- Verify the update
SELECT
  config_name,
  field_label,
  field_type,
  is_required,
  load_from_catalog,
  field_options
FROM trade_configurations
WHERE config_name = 'colorplus_color'
  AND trade = 'siding';

-- Expected result:
-- config_name      | field_label            | field_type | is_required | load_from_catalog | field_options
-- -----------------|------------------------|------------|-------------|-------------------|------------------
-- colorplus_color  | What ColorPlus color?  | select     | false       | false             | {"options": [{"label": "Arctic White", "value": "arctic white"}, ...]}
--
-- Note: The field will only be visible when a ColorPlus product is selected (handled by frontend logic)
-- The hex colors for the color swatches are mapped in /components/ui/color-swatch.tsx
