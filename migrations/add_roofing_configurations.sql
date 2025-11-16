-- Migration: Add Roofing Trade Configurations
-- Date: 2025-11-15
-- Description: Creates configuration fields for roofing trade
--
-- IMPORTANT: Run this in your Supabase SQL Editor or via psql
--
-- Pattern: Users select ONLY the main shingle product
-- Accessories (underlayment, ice & water shield, ridge cap, etc.) are auto-added by backend

-- ============================================================================
-- SECTION 1: PRIMARY ROOFING (section_order: 1)
-- ============================================================================

-- Field 1: Primary Shingle Product (loads from product_catalog)
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
  'roofing',
  'primary_roofing',
  'shingle_product',
  'Primary Shingle Product',
  'select',
  'Primary Shingle Product',
  'Select your shingle product',
  'Choose the main roofing shingles. Underlayment, ridge cap, and accessories will be automatically calculated.',
  NULL,
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
  true,
  jsonb_build_object(
    'active', true,
    'category', jsonb_build_array('shingles')
  )
);

-- Field 2: Shingle Subcategory (conditional - shows after shingle selection)
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
  'roofing',
  'primary_roofing',
  'shingle_subcategory',
  'Shingle Type',
  'select',
  'What shingle type?',
  'Select shingle type',
  'Architectural shingles are standard. Impact-resistant shingles provide hail protection.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'Architectural (Standard)',
        'value', 'architectural',
        'description', 'Premium dimensional shingles'
      ),
      jsonb_build_object(
        'label', 'Impact Resistant (UHDZ/Storm)',
        'value', 'impact_resistant',
        'description', 'Class 4 impact rating for hail protection'
      )
    )
  ),
  'architectural',
  true,
  NULL,
  jsonb_build_object(
    'field', 'shingle_product',
    'operator', 'not_equals',
    'value', ''
  ),
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

-- ============================================================================
-- SECTION 2: OPTIONAL UPGRADES (section_order: 2)
-- ============================================================================

-- Field 3: Upgrade Ice & Water Shield
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
  'roofing',
  'optional_upgrades',
  'upgrade_ice_water_shield',
  'Upgrade Ice & Water Shield',
  'checkbox',
  'Upgrade ice & water shield?',
  NULL,
  'Upgrade to premium leak barrier (WeatherWatch/WeatherLock) instead of standard',
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

-- Field 4: Ridge Vent Include
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
  'roofing',
  'optional_upgrades',
  'ridge_vent_include',
  'Include Ridge Vent',
  'checkbox',
  'Include ridge vent?',
  NULL,
  'Continuous ridge ventilation for proper attic airflow',
  NULL,
  'true',
  false,
  NULL,
  NULL,
  NULL,
  true,
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

-- Field 5: Upgrade Underlayment
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
  'roofing',
  'optional_upgrades',
  'upgrade_underlayment',
  'Upgrade to Synthetic Underlayment',
  'checkbox',
  'Upgrade to synthetic underlayment?',
  NULL,
  'Synthetic underlayment is more durable than felt. Recommended for premium installations.',
  NULL,
  'false',
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
WHERE trade = 'roofing'
ORDER BY section_order, field_order;

-- Expected result:
-- config_section    | config_name                  | field_label                        | field_type | is_required | section_order | field_order | load_from_catalog
-- ------------------|------------------------------|-----------------------------------|------------|-------------|---------------|-------------|------------------
-- primary_roofing   | shingle_product              | Primary Shingle Product           | select     | true        | 1             | 1           | true
-- primary_roofing   | shingle_subcategory          | What shingle type?                | select     | true        | 1             | 2           | false
-- optional_upgrades | upgrade_ice_water_shield     | Upgrade ice & water shield?       | checkbox   | false       | 2             | 1           | false
-- optional_upgrades | ridge_vent_include           | Include ridge vent?               | checkbox   | false       | 2             | 2           | false
-- optional_upgrades | upgrade_underlayment         | Upgrade to synthetic underlayment?| checkbox   | false       | 2             | 3           | false
