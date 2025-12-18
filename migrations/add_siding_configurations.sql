-- Migration: Add Siding Trade Configurations
-- Date: 2025-11-27
-- Description: Creates configuration fields for siding trade (James Hardie focus)
--
-- IMPORTANT: Run this in your Supabase SQL Editor or via psql
--
-- Pattern: Primary siding product selection + ColorPlus options + trim accessories

-- ============================================================================
-- SECTION 1: PRIMARY SIDING (section_order: 1)
-- ============================================================================

-- Field 1: Primary Siding Product Type (loads from product_catalog)
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
  'siding',
  'primary_siding',
  'siding_product_type',
  'Primary Siding Product',
  'select',
  'Primary Siding Product',
  'Select your siding product',
  'Choose the main siding product. Available in standard or ColorPlus (pre-painted).',
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
    'category', jsonb_build_array('LAP SIDING - SMOOTH', 'LAP SIDING - CEDARMILL', 'PANEL SIDING')
  )
);

-- Field 2: ColorPlus Color (conditional - only shows if ColorPlus product selected)
-- NOTE: This field already exists from update_colorplus_conditional.sql migration
-- Verifying it has the correct show_if_conditions

-- ============================================================================
-- SECTION 2: TRIM ACCESSORIES (section_order: 2)
-- ============================================================================

-- Field 3: Belly Band Include
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
  'siding',
  'trim_accessories',
  'belly_band_include',
  'Include Belly Band',
  'checkbox',
  'Include belly band trim?',
  NULL,
  'Horizontal trim band (typically at 4ft mark or between floors)',
  NULL,
  'false',
  false,
  NULL,
  NULL,
  NULL,
  false,
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

-- Field 4: Belly Band Color (conditional - shows if belly_band_include is true)
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
  'siding',
  'trim_accessories',
  'belly_band_color',
  'Belly Band Color',
  'select',
  'Belly band color',
  'Select color',
  'Choose color for belly band trim',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('label', 'Match Siding', 'value', 'match_siding'),
      jsonb_build_object('label', 'Arctic White', 'value', 'arctic_white'),
      jsonb_build_object('label', 'Cobble Stone', 'value', 'cobble_stone'),
      jsonb_build_object('label', 'Monterey Taupe', 'value', 'monterey_taupe'),
      jsonb_build_object('label', 'Aged Pewter', 'value', 'aged_pewter')
    )
  ),
  'match_siding',
  false,
  NULL,
  jsonb_build_object('belly_band_include', true),
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

-- Field 5: Belly Band Material (conditional - shows if belly_band_include is true)
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
  'siding',
  'trim_accessories',
  'belly_band_material',
  'Belly Band Material',
  'select',
  'Belly band material',
  'Select material',
  'Choose material for belly band trim',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('label', 'HardieTrim 4/4', 'value', 'hardie_trim_44'),
      jsonb_build_object('label', 'HardieTrim 5/4', 'value', 'hardie_trim_54'),
      jsonb_build_object('label', 'PVC Trim', 'value', 'pvc_trim')
    )
  ),
  'hardie_trim_44',
  false,
  NULL,
  jsonb_build_object('belly_band_include', true),
  NULL,
  false,
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

-- Field 6: Corner Trim Include
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
  'siding',
  'trim_accessories',
  'corner_trim_include',
  'Include Corner Trim',
  'checkbox',
  'Include corner trim?',
  NULL,
  'Finished corners (inside and outside)',
  NULL,
  'true',
  false,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  2,
  4,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- Field 7: Corner Trim Product (conditional - shows if corner_trim_include is true)
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
  'siding',
  'trim_accessories',
  'corner_trim_product',
  'Corner Trim Product',
  'select',
  'Corner trim product',
  'Select product',
  'Choose corner trim material',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('label', 'HardieTrim Outside Corner', 'value', 'hardie_outside_corner'),
      jsonb_build_object('label', 'HardieTrim Inside Corner', 'value', 'hardie_inside_corner'),
      jsonb_build_object('label', 'PVC Corner Boards', 'value', 'pvc_corner_boards')
    )
  ),
  'hardie_outside_corner',
  false,
  NULL,
  jsonb_build_object('corner_trim_include', true),
  NULL,
  false,
  NULL,
  2,
  5,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- Field 8: Corner Trim Color (conditional - shows if corner_trim_include is true)
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
  'siding',
  'trim_accessories',
  'corner_trim_color',
  'Corner Trim Color',
  'select',
  'Corner trim color',
  'Select color',
  'Choose color for corner trim',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('label', 'Arctic White', 'value', 'arctic_white'),
      jsonb_build_object('label', 'Cobble Stone', 'value', 'cobble_stone'),
      jsonb_build_object('label', 'Monterey Taupe', 'value', 'monterey_taupe'),
      jsonb_build_object('label', 'Aged Pewter', 'value', 'aged_pewter')
    )
  ),
  'arctic_white',
  false,
  NULL,
  jsonb_build_object('corner_trim_include', true),
  NULL,
  false,
  NULL,
  2,
  6,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- Field 9: J-Channel Include
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
  'siding',
  'trim_accessories',
  'j_channel_include',
  'Include J-Channel',
  'checkbox',
  'Include J-channel?',
  NULL,
  'J-channel for window and door trim transitions',
  NULL,
  'true',
  false,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  2,
  7,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- Field 10: J-Channel Product (conditional - shows if j_channel_include is true)
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
  'siding',
  'trim_accessories',
  'j_channel_product',
  'J-Channel Product',
  'select',
  'J-channel product',
  'Select product',
  'Choose J-channel material',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('label', 'Vinyl J-Channel', 'value', 'vinyl_j_channel'),
      jsonb_build_object('label', 'Aluminum J-Channel', 'value', 'aluminum_j_channel')
    )
  ),
  'vinyl_j_channel',
  false,
  NULL,
  jsonb_build_object('j_channel_include', true),
  NULL,
  false,
  NULL,
  2,
  8,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- Field 11: J-Channel Color (conditional - shows if j_channel_include is true)
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
  'siding',
  'trim_accessories',
  'j_channel_color',
  'J-Channel Color',
  'select',
  'J-channel color',
  'Select color',
  'Choose color for J-channel',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('label', 'White', 'value', 'white'),
      jsonb_build_object('label', 'Almond', 'value', 'almond'),
      jsonb_build_object('label', 'Clay', 'value', 'clay')
    )
  ),
  'white',
  false,
  NULL,
  jsonb_build_object('j_channel_include', true),
  NULL,
  false,
  NULL,
  2,
  9,
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
  load_from_catalog,
  show_if_conditions
FROM trade_configurations
WHERE trade = 'siding'
ORDER BY section_order, field_order;

-- Expected result:
-- config_section     | config_name           | field_label                  | field_type | is_required | section_order | field_order | load_from_catalog | show_if_conditions
-- -------------------|-----------------------|------------------------------|------------|-------------|---------------|-------------|-------------------|-------------------
-- primary_siding     | siding_product_type   | Primary Siding Product       | select     | true        | 1             | 1           | true              | NULL
-- primary_siding     | colorplus_color       | ColorPlus Color              | select     | false       | 1             | 2           | false             | {...} (ColorPlus check)
-- trim_accessories   | belly_band_include    | Include belly band trim?     | checkbox   | false       | 2             | 1           | false             | NULL
-- trim_accessories   | belly_band_color      | Belly band color             | select     | false       | 2             | 2           | false             | {"belly_band_include": true}
-- trim_accessories   | belly_band_material   | Belly band material          | select     | false       | 2             | 3           | false             | {"belly_band_include": true}
-- trim_accessories   | corner_trim_include   | Include corner trim?         | checkbox   | false       | 2             | 4           | false             | NULL
-- trim_accessories   | corner_trim_product   | Corner trim product          | select     | false       | 2             | 5           | false             | {"corner_trim_include": true}
-- trim_accessories   | corner_trim_color     | Corner trim color            | select     | false       | 2             | 6           | false             | {"corner_trim_include": true}
-- trim_accessories   | j_channel_include     | Include J-channel?           | checkbox   | false       | 2             | 7           | false             | NULL
-- trim_accessories   | j_channel_product     | J-channel product            | select     | false       | 2             | 8           | false             | {"j_channel_include": true}
-- trim_accessories   | j_channel_color       | J-channel color              | select     | false       | 2             | 9           | false             | {"j_channel_include": true}
