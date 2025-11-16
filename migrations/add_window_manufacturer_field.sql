-- Migration: Add Window Manufacturer Field
-- Date: 2025-11-15
-- Description: Adds window_manufacturer field to enable manufacturer-based filtering for window series
--
-- IMPORTANT: Run this in your Supabase SQL Editor or via psql
--
-- This migration:
-- 1. Adds window_manufacturer field (field_order: 1)
-- 2. Updates window_series to field_order: 2
-- 3. Updates all subsequent fields in primary_windows section

-- ============================================================================
-- SECTION 1: Add window_manufacturer Field
-- ============================================================================

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
  validation_rules,
  show_if_conditions,
  hide_if_conditions,
  triggers_auto_scope,
  auto_scope_rule_id,
  section_order,
  field_order,
  group_name,
  active,
  created_at,
  updated_at,
  load_from_catalog,
  catalog_filter
) VALUES (
  gen_random_uuid(),
  'windows',
  'primary_windows',
  'window_manufacturer',
  'Window Manufacturer',
  'select',
  'Window manufacturer?',
  'Select manufacturer',
  'Choose your preferred window manufacturer. Series options will filter based on this selection.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'Milgard',
        'value', 'Milgard',
        'description', 'Premium vinyl and fiberglass windows'
      ),
      jsonb_build_object(
        'label', 'Anlin',
        'value', 'Anlin',
        'description', 'High-performance vinyl windows'
      ),
      jsonb_build_object(
        'label', 'Simonton',
        'value', 'Simonton',
        'description', 'Energy-efficient vinyl windows'
      )
    )
  ),
  NULL,
  true,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  1,
  1,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- ============================================================================
-- SECTION 2: Update Field Order for Existing Fields
-- ============================================================================

-- Update window_series to field_order 2
UPDATE trade_configurations
SET
  field_order = 2,
  updated_at = now()
WHERE
  config_name = 'window_series'
  AND trade = 'windows'
  AND config_section = 'primary_windows';

-- Update frame_color to field_order 3
UPDATE trade_configurations
SET
  field_order = 3,
  updated_at = now()
WHERE
  config_name = 'frame_color'
  AND trade = 'windows'
  AND config_section = 'primary_windows';

-- Update glass_package to field_order 4
UPDATE trade_configurations
SET
  field_order = 4,
  updated_at = now()
WHERE
  config_name = 'glass_package'
  AND trade = 'windows'
  AND config_section = 'primary_windows';

-- Update grid_pattern to field_order 5
UPDATE trade_configurations
SET
  field_order = 5,
  updated_at = now()
WHERE
  config_name = 'grid_pattern'
  AND trade = 'windows'
  AND config_section = 'primary_windows';

-- ============================================================================
-- SECTION 3: Add Conditional Visibility to window_series
-- ============================================================================

-- Update window_series to only show when manufacturer is selected
UPDATE trade_configurations
SET
  show_if_conditions = jsonb_build_object(
    'window_manufacturer', jsonb_build_object(
      'operator', 'not_equals',
      'value', ''
    )
  ),
  updated_at = now()
WHERE
  config_name = 'window_series'
  AND trade = 'windows';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

SELECT
  config_section,
  config_name,
  field_label,
  field_type,
  is_required,
  section_order,
  field_order,
  load_from_catalog,
  show_if_conditions
FROM trade_configurations
WHERE trade = 'windows'
  AND config_section = 'primary_windows'
ORDER BY section_order, field_order;
