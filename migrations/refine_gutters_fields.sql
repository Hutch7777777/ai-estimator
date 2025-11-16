-- Migration: Refine Gutters Trade Configurations
-- Date: 2025-11-15
-- Description: Adds missing fields for complete gutter estimates (material, spacing, extensions)
--
-- IMPORTANT: Run this in your Supabase SQL Editor or via psql
--
-- Adds 3 fields:
-- - gutter_material (select dropdown with 3 material types)
-- - hanger_spacing (select dropdown with 2 spacing options)
-- - downspout_extensions (checkbox with auto-scope trigger)

-- ============================================================================
-- SECTION 1: PRIMARY GUTTERS (section_order: 1) - Additional Fields
-- ============================================================================

-- Field 4: Gutter Material
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
  'gutters',
  'primary_gutters',
  'gutter_material',
  'Gutter Material',
  'select',
  'Gutter material?',
  'Select material',
  'Aluminum is standard and cost-effective. Copper is premium and long-lasting.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'Aluminum .027 (Standard)',
        'value', 'aluminum_027',
        'description', 'Most common, affordable'
      ),
      jsonb_build_object(
        'label', 'Aluminum .032 (Heavy Duty)',
        'value', 'aluminum_032',
        'description', 'Thicker, more durable'
      ),
      jsonb_build_object(
        'label', 'Copper (Premium)',
        'value', 'copper',
        'description', 'Lifetime material, develops patina'
      )
    )
  ),
  'aluminum_027',
  true,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  1,
  4,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- Field 5: Hanger Spacing
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
  'gutters',
  'primary_gutters',
  'hanger_spacing',
  'Hanger Spacing',
  'select',
  'Hanger spacing?',
  'Select spacing',
  'Closer spacing provides better support. 16" OC recommended for snow loads.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', '24" On Center (Standard)',
        'value', '24_oc',
        'description', 'Normal residential'
      ),
      jsonb_build_object(
        'label', '16" On Center (Heavy Duty)',
        'value', '16_oc',
        'description', 'Snow load areas'
      )
    )
  ),
  '24_oc',
  true,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  1,
  5,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- ============================================================================
-- SECTION 2: GUTTER PROTECTION (section_order: 2) - Additional Fields
-- ============================================================================

-- Field 3: Downspout Extensions
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
  'gutters',
  'gutter_protection',
  'downspout_extensions',
  'Downspout Extensions',
  'checkbox',
  'Include downspout extensions?',
  NULL,
  'Extensions direct water away from foundation. Recommended for all installations.',
  NULL,
  'true',
  false,
  NULL,
  NULL,
  NULL,
  true,
  NULL,
  2,
  3,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

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
  load_from_catalog
FROM trade_configurations
WHERE trade = 'gutters'
ORDER BY section_order, field_order;
