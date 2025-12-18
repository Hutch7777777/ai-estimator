-- Diagnostic Query: Check ColorPlus Color Field Configuration
-- Run this in Supabase SQL Editor to see the current state

SELECT
  id,
  trade,
  config_name,
  field_label,
  field_type,
  is_required,
  load_from_catalog,
  field_options,
  show_if_conditions
FROM trade_configurations
WHERE config_name = 'colorplus_color'
  AND trade = 'siding';

-- What to look for:
-- 1. If NO rows returned → Field doesn't exist yet (need to create it)
-- 2. If field_options is NULL or empty → Run add_colorplus_color_options.sql
-- 3. If field_options has data → Check if it has all 15 colors
