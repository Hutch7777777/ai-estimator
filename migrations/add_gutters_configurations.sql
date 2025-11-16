-- Migration: Add Gutters Trade Configurations
-- Date: 2025-11-15
-- Description: Creates configuration fields for gutters trade
--
-- IMPORTANT: Run this in your Supabase SQL Editor or via psql
--
-- Pattern: Users select gutter specifications
-- Downspouts, hangers, and accessories are auto-calculated

-- ============================================================================
-- SECTION 1: PRIMARY GUTTERS (section_order: 1)
-- ============================================================================

-- Field 1: Gutter Size
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
  'gutter_size',
  'Gutter Size',
  'select',
  'Gutter size?',
  'Select gutter size',
  '5" is standard for most homes. 6" for larger roofs or heavy rainfall areas.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', '5" K-Style (Standard)',
        'value', '5_inch',
        'description', 'Most common residential size'
      ),
      jsonb_build_object(
        'label', '6" K-Style (Heavy Duty)',
        'value', '6_inch',
        'description', 'For larger roofs or high rainfall'
      )
    )
  ),
  '5_inch',
  true,
  NULL,
  NULL,
  NULL,
  true,
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

-- Field 2: Gutter Color
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
  'gutter_color',
  'Gutter Color',
  'select',
  'Gutter color?',
  'Select color',
  NULL,
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'White',
        'value', 'white'
      ),
      jsonb_build_object(
        'label', 'Bronze',
        'value', 'bronze'
      ),
      jsonb_build_object(
        'label', 'Tan',
        'value', 'tan'
      ),
      jsonb_build_object(
        'label', 'Black',
        'value', 'black'
      )
    )
  ),
  'white',
  true,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  1,
  2,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- Field 3: Downspout Size
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
  'downspout_size',
  'Downspout Size',
  'select',
  'Downspout size?',
  'Select downspout size',
  'Should match gutter capacity. 2x3 for 5" gutters, 3x4 for 6" gutters.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', '2x3 (Standard)',
        'value', '2x3',
        'description', 'For 5" gutters'
      ),
      jsonb_build_object(
        'label', '3x4 (Large)',
        'value', '3x4',
        'description', 'For 6" gutters'
      )
    )
  ),
  '2x3',
  true,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  1,
  3,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- ============================================================================
-- SECTION 2: GUTTER PROTECTION (section_order: 2)
-- ============================================================================

-- Field 4: Include Gutter Guards
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
  'include_gutter_guards',
  'Include Gutter Guards',
  'checkbox',
  'Include gutter guards?',
  NULL,
  'Gutter guards prevent leaves and debris from clogging gutters',
  NULL,
  'false',
  false,
  NULL,
  NULL,
  NULL,
  true,
  NULL,
  2,
  1,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- Field 5: Guard Type (conditional - shows when include_gutter_guards is checked)
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
  'guard_type',
  'Guard Type',
  'select',
  'Guard type?',
  'Select guard type',
  NULL,
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'Mesh Screen (Standard)',
        'value', 'mesh',
        'description', 'Good for most debris'
      ),
      jsonb_build_object(
        'label', 'Solid Cover (Premium)',
        'value', 'solid_cover',
        'description', 'Best protection, higher cost'
      )
    )
  ),
  'mesh',
  false,
  NULL,
  jsonb_build_object(
    'field', 'include_gutter_guards',
    'operator', 'equals',
    'value', true
  ),
  NULL,
  false,
  NULL,
  2,
  2,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify the inserts
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

-- Expected result:
-- config_section     | config_name              | field_label               | field_type | is_required | section_order | field_order | load_from_catalog
-- -------------------|--------------------------|---------------------------|------------|-------------|---------------|-------------|------------------
-- primary_gutters    | gutter_size              | Gutter size?              | select     | true        | 1             | 1           | false
-- primary_gutters    | gutter_color             | Gutter color?             | select     | true        | 1             | 2           | false
-- primary_gutters    | downspout_size           | Downspout size?           | select     | true        | 1             | 3           | false
-- gutter_protection  | include_gutter_guards    | Include gutter guards?    | checkbox   | false       | 2             | 1           | false
-- gutter_protection  | guard_type               | Guard type?               | select     | false       | 2             | 2           | false
