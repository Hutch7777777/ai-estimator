-- Migration: Make ColorPlus Color Field Conditionally Visible
-- Date: 2025-11-15
-- Description: Updates the colorplus_color field to only show when a ColorPlus product is selected
--
-- IMPORTANT: Run this in your Supabase SQL Editor or via psql
--
-- What this does:
-- 1. Sets show_if_conditions to check if siding_product_type field is populated
-- 2. Sets is_required to false (field is only required when visible)
-- 3. Frontend logic will check if selected product has is_colorplus property
--
-- Note: The actual product property checking is handled in the frontend
-- because show_if_conditions can't directly query product_catalog table

UPDATE trade_configurations
SET
  show_if_conditions = jsonb_build_object(
    'field', 'siding_product_type',
    'operator', 'not_equals',
    'value', ''
  ),
  is_required = false,
  updated_at = now()
WHERE config_name = 'colorplus_color'
  AND trade = 'siding';

-- Verify the update
SELECT
  config_name,
  field_label,
  is_required,
  show_if_conditions
FROM trade_configurations
WHERE config_name = 'colorplus_color'
  AND trade = 'siding';

-- Expected result:
-- config_name      | field_label            | is_required | show_if_conditions
-- -----------------|------------------------|-------------|---------------------------------------------------
-- colorplus_color  | What ColorPlus color?  | false       | {"field": "siding_product_type", "operator": "not_equals", "value": ""}
