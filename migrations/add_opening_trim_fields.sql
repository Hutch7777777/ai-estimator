-- Migration: Add Opening Trim Fields (Window, Door, Garage) to Siding Trade Configuration
-- Created: 2024-11-29
-- Purpose: Add window trim, door trim, and garage trim configuration fields to the siding trade
--          These fields follow the parent-child pattern used by belly_band, corner_trim, and j_channel

-- =============================================================================
-- WINDOW TRIM FIELDS
-- =============================================================================

-- Window Trim Include (Parent Checkbox)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'window_trim_include',
  'Include Window Trim',
  'checkbox',
  'Include Window Trim',
  NULL,
  4,
  50,
  NULL,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- Window Trim Width (Child Field)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'window_trim_width',
  'Window Trim Width',
  'select',
  'Window Trim Width',
  '{"options": [
    {"value": "3.5", "label": "3.5\""},
    {"value": "5.5", "label": "5.5\""},
    {"value": "7.25", "label": "7.25\""}
  ]}'::jsonb,
  4,
  51,
  '{"window_trim_include": true}'::jsonb,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- Window Trim Finish (Child Field)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'window_trim_finish',
  'Window Trim Finish',
  'select',
  'Window Trim Finish',
  '{"options": [
    {"value": "colorplus", "label": "ColorPlus"},
    {"value": "primed", "label": "Primed"}
  ]}'::jsonb,
  4,
  52,
  '{"window_trim_include": true}'::jsonb,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- Window Trim ColorPlus Color (Child Field - Conditional on finish=colorplus)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'window_trim_colorplus_color',
  'Window Trim Color',
  'select',
  'Window Trim Color',
  '{"options": [
    {"value": "arctic_white", "label": "Arctic White"},
    {"value": "cobble_stone", "label": "Cobble Stone"},
    {"value": "navajo_beige", "label": "Navajo Beige"},
    {"value": "khaki_brown", "label": "Khaki Brown"},
    {"value": "timber_bark", "label": "Timber Bark"},
    {"value": "midnight_black", "label": "Midnight Black"}
  ]}'::jsonb,
  4,
  53,
  '{"window_trim_include": true, "window_trim_finish": "colorplus"}'::jsonb,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- =============================================================================
-- DOOR TRIM FIELDS
-- =============================================================================

-- Door Trim Include (Parent Checkbox)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'door_trim_include',
  'Include Door Trim',
  'checkbox',
  'Include Door Trim',
  NULL,
  4,
  54,
  NULL,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- Door Trim Width (Child Field)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'door_trim_width',
  'Door Trim Width',
  'select',
  'Door Trim Width',
  '{"options": [
    {"value": "3.5", "label": "3.5\""},
    {"value": "5.5", "label": "5.5\""},
    {"value": "7.25", "label": "7.25\""}
  ]}'::jsonb,
  4,
  55,
  '{"door_trim_include": true}'::jsonb,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- Door Trim Finish (Child Field)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'door_trim_finish',
  'Door Trim Finish',
  'select',
  'Door Trim Finish',
  '{"options": [
    {"value": "colorplus", "label": "ColorPlus"},
    {"value": "primed", "label": "Primed"}
  ]}'::jsonb,
  4,
  56,
  '{"door_trim_include": true}'::jsonb,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- Door Trim ColorPlus Color (Child Field - Conditional on finish=colorplus)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'door_trim_colorplus_color',
  'Door Trim Color',
  'select',
  'Door Trim Color',
  '{"options": [
    {"value": "arctic_white", "label": "Arctic White"},
    {"value": "cobble_stone", "label": "Cobble Stone"},
    {"value": "navajo_beige", "label": "Navajo Beige"},
    {"value": "khaki_brown", "label": "Khaki Brown"},
    {"value": "timber_bark", "label": "Timber Bark"},
    {"value": "midnight_black", "label": "Midnight Black"}
  ]}'::jsonb,
  4,
  57,
  '{"door_trim_include": true, "door_trim_finish": "colorplus"}'::jsonb,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- =============================================================================
-- GARAGE TRIM FIELDS
-- =============================================================================

-- Garage Trim Include (Parent Checkbox)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'garage_trim_include',
  'Include Garage Trim',
  'checkbox',
  'Include Garage Trim',
  NULL,
  4,
  58,
  NULL,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- Garage Trim Size (Child Field - Note: Different sizes than window/door)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'garage_trim_size',
  'Garage Trim Size',
  'select',
  'Garage Trim Size',
  '{"options": [
    {"value": "4", "label": "4\""},
    {"value": "6", "label": "6\""}
  ]}'::jsonb,
  4,
  59,
  '{"garage_trim_include": true}'::jsonb,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- Garage Trim Finish (Child Field)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'garage_trim_finish',
  'Garage Trim Finish',
  'select',
  'Garage Trim Finish',
  '{"options": [
    {"value": "colorplus", "label": "ColorPlus"},
    {"value": "primed", "label": "Primed"}
  ]}'::jsonb,
  4,
  60,
  '{"garage_trim_include": true}'::jsonb,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- Garage Trim ColorPlus Color (Child Field - Conditional on finish=colorplus)
INSERT INTO trade_configurations (
  id,
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_options,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'siding',
  'trim_accessories',
  'garage_trim_colorplus_color',
  'Garage Trim Color',
  'select',
  'Garage Trim Color',
  '{"options": [
    {"value": "arctic_white", "label": "Arctic White"},
    {"value": "cobble_stone", "label": "Cobble Stone"},
    {"value": "navajo_beige", "label": "Navajo Beige"},
    {"value": "khaki_brown", "label": "Khaki Brown"},
    {"value": "timber_bark", "label": "Timber Bark"},
    {"value": "midnight_black", "label": "Midnight Black"}
  ]}'::jsonb,
  4,
  61,
  '{"garage_trim_include": true, "garage_trim_finish": "colorplus"}'::jsonb,
  false,
  NULL,
  true,
  NOW(),
  NOW()
);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Verify all new fields were inserted
SELECT
  config_name,
  field_label,
  field_type,
  config_section,
  field_order,
  show_if_conditions
FROM trade_configurations
WHERE trade = 'siding'
  AND config_section = 'trim_accessories'
  AND config_name LIKE '%_trim_%'
ORDER BY field_order;

-- Count of trim accessory fields (should be 21 total after this migration)
SELECT
  COUNT(*) as total_trim_fields
FROM trade_configurations
WHERE trade = 'siding'
  AND config_section = 'trim_accessories';
