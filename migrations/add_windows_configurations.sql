-- Migration: Add Windows Trade Configurations
-- Date: 2025-11-15
-- Description: Creates configuration fields for windows trade
--
-- IMPORTANT: Run this in your Supabase SQL Editor or via psql
--
-- Pattern: Users select window series and installation method
-- Trim and accessories are optionally added

-- ============================================================================
-- SECTION 1: PRIMARY WINDOWS (section_order: 1)
-- ============================================================================

-- Field 1: Window Series (loads from product_catalog)
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
  'window_series',
  'Window Series',
  'select',
  'Window series?',
  'Select window series',
  'Choose your window product line. Tuscany and Mira are mid-range. QuietLine and Trinsic are premium.',
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
    'category', jsonb_build_array('window')
  )
);

-- Field 2: Installation Method
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
  'installation_method',
  'Installation Method',
  'select',
  'Installation method?',
  'Select installation type',
  'New construction uses flanged windows. Retrofit fits into existing frames.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'New Construction (Flanged)',
        'value', 'new_construction',
        'description', 'Standard installation with nail fin'
      ),
      jsonb_build_object(
        'label', 'Retrofit (Insert)',
        'value', 'retrofit',
        'description', 'Fits into existing frame'
      )
    )
  ),
  'new_construction',
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

-- ============================================================================
-- SECTION 2: TRIM OPTIONS (section_order: 2)
-- ============================================================================

-- Field 3: Include Window Trim
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
  'trim_options',
  'include_trim',
  'Include Window Trim',
  'checkbox',
  'Include window trim?',
  NULL,
  'Add exterior and interior casing around windows',
  NULL,
  'true',
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

-- Field 4: Trim Material (conditional - shows when include_trim is checked)
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
  'trim_options',
  'trim_material',
  'Trim Material',
  'select',
  'Trim material?',
  'Select trim material',
  NULL,
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'PVC (Exterior)',
        'value', 'pvc',
        'description', 'Low maintenance, won''t rot'
      ),
      jsonb_build_object(
        'label', 'Pine (Interior)',
        'value', 'pine',
        'description', 'Paintable wood trim'
      )
    )
  ),
  'pvc',
  false,
  NULL,
  jsonb_build_object(
    'field', 'include_trim',
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
WHERE trade = 'windows'
ORDER BY section_order, field_order;

-- Expected result:
-- config_section    | config_name          | field_label             | field_type | is_required | section_order | field_order | load_from_catalog
-- ------------------|----------------------|-------------------------|------------|-------------|---------------|-------------|------------------
-- primary_windows   | window_series        | Window series?          | select     | true        | 1             | 1           | true
-- primary_windows   | installation_method  | Installation method?    | select     | true        | 1             | 2           | false
-- trim_options      | include_trim         | Include window trim?    | checkbox   | false       | 2             | 1           | false
-- trim_options      | trim_material        | Trim material?          | select     | false       | 2             | 2           | false
