-- Migration: Refine Windows Trade Configurations
-- Date: 2025-11-15
-- Description: Adds missing fields for complete window estimates (color, glass, grids, screens)
--
-- IMPORTANT: Run this in your Supabase SQL Editor or via psql
--
-- Adds 4 fields:
-- - frame_color (select dropdown with 4 standard colors)
-- - glass_package (select dropdown with 4 glass types)
-- - grid_pattern (select dropdown with 4 grid styles)
-- - screen_type (select dropdown with 4 screen options)

-- ============================================================================
-- SECTION 1: PRIMARY WINDOWS (section_order: 1) - Additional Fields
-- ============================================================================

-- Field 3: Frame Color
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
  'frame_color',
  'Frame Color',
  'select',
  'Frame color?',
  'Select frame color',
  'White is standard. Custom colors may have upcharge.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'White (Standard)',
        'value', 'white'
      ),
      jsonb_build_object(
        'label', 'Bronze',
        'value', 'bronze'
      ),
      jsonb_build_object(
        'label', 'Black',
        'value', 'black'
      ),
      jsonb_build_object(
        'label', 'Clay/Tan',
        'value', 'clay'
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
  3,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- Field 4: Glass Package
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
  'glass_package',
  'Glass Package',
  'select',
  'Glass package?',
  'Select glass type',
  'Low-E improves energy efficiency. Tempered required near doors/tubs per code.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'Clear Dual Pane (Standard)',
        'value', 'clear_dual',
        'description', 'Basic insulation'
      ),
      jsonb_build_object(
        'label', 'Low-E Dual Pane (Energy Star)',
        'value', 'low_e_dual',
        'description', 'Recommended for energy savings'
      ),
      jsonb_build_object(
        'label', 'Low-E Triple Pane (Premium)',
        'value', 'low_e_triple',
        'description', 'Maximum efficiency for cold climates'
      ),
      jsonb_build_object(
        'label', 'Tempered (Code Required)',
        'value', 'tempered',
        'description', 'Safety glass for specific locations'
      )
    )
  ),
  'low_e_dual',
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

-- Field 5: Grid Pattern
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
  'grid_pattern',
  'Grid Pattern',
  'select',
  'Grid pattern?',
  'Select grid style',
  'Grids are decorative. Colonial and Prairie are most popular.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'No Grids (Clean Look)',
        'value', 'none'
      ),
      jsonb_build_object(
        'label', 'Colonial (Traditional)',
        'value', 'colonial'
      ),
      jsonb_build_object(
        'label', 'Prairie (Craftsman)',
        'value', 'prairie'
      ),
      jsonb_build_object(
        'label', 'Farmhouse (Custom)',
        'value', 'farmhouse'
      )
    )
  ),
  'none',
  false,
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
-- SECTION 2: TRIM OPTIONS (section_order: 2) - Additional Fields
-- ============================================================================

-- Field 3: Screen Type
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
  'screen_type',
  'Screen Type',
  'select',
  'Window screens?',
  'Select screen type',
  NULL,
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'Standard Fiberglass',
        'value', 'standard'
      ),
      jsonb_build_object(
        'label', 'Pet-Resistant (Heavy Duty)',
        'value', 'pet_resistant'
      ),
      jsonb_build_object(
        'label', 'Solar (Blocks UV)',
        'value', 'solar'
      ),
      jsonb_build_object(
        'label', 'No Screens',
        'value', 'none'
      )
    )
  ),
  'standard',
  false,
  NULL,
  NULL,
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
WHERE trade = 'windows'
ORDER BY section_order, field_order;
