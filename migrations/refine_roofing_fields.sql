-- Migration: Refine Roofing Trade Configurations
-- Date: 2025-11-15
-- Description: Adds missing fields for complete roofing estimates (color, warranty)
--
-- IMPORTANT: Run this in your Supabase SQL Editor or via psql
--
-- Adds 2 fields:
-- - shingle_color (select dropdown with 14 standard colors)
-- - shingle_warranty (select dropdown with 3 warranty levels)

-- ============================================================================
-- SECTION 1: PRIMARY ROOFING (section_order: 1) - Additional Fields
-- ============================================================================

-- Field 3: Shingle Color
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
  'shingle_color',
  'Shingle Color',
  'select',
  'Shingle color?',
  'Select color',
  'Choose color based on selected manufacturer and product line',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'Charcoal',
        'value', 'charcoal'
      ),
      jsonb_build_object(
        'label', 'Weathered Wood',
        'value', 'weathered_wood'
      ),
      jsonb_build_object(
        'label', 'Pewter Gray',
        'value', 'pewter_gray'
      ),
      jsonb_build_object(
        'label', 'Mission Brown',
        'value', 'mission_brown'
      ),
      jsonb_build_object(
        'label', 'Barkwood',
        'value', 'barkwood'
      ),
      jsonb_build_object(
        'label', 'Shakewood',
        'value', 'shakewood'
      ),
      jsonb_build_object(
        'label', 'Driftwood',
        'value', 'driftwood'
      ),
      jsonb_build_object(
        'label', 'Estate Gray',
        'value', 'estate_gray'
      ),
      jsonb_build_object(
        'label', 'Onyx Black',
        'value', 'onyx_black'
      ),
      jsonb_build_object(
        'label', 'Harbor Blue',
        'value', 'harbor_blue'
      ),
      jsonb_build_object(
        'label', 'Sedona Canyon',
        'value', 'sedona_canyon'
      ),
      jsonb_build_object(
        'label', 'Teak',
        'value', 'teak'
      ),
      jsonb_build_object(
        'label', 'Amber',
        'value', 'amber'
      ),
      jsonb_build_object(
        'label', 'Shasta White',
        'value', 'shasta_white'
      )
    )
  ),
  NULL,
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
  3,
  NULL,
  true,
  now(),
  now(),
  false,
  NULL
);

-- Field 4: Shingle Warranty
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
  'shingle_warranty',
  'Shingle Warranty',
  'select',
  'Warranty level?',
  'Select warranty',
  'Lifetime Limited warranties are standard. System Plus warranties require certified installation.',
  jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object(
        'label', 'Lifetime Limited (Standard)',
        'value', 'lifetime_limited',
        'description', 'Standard manufacturer warranty'
      ),
      jsonb_build_object(
        'label', 'System Plus (Requires GAF Certified)',
        'value', 'system_plus',
        'description', '50-year non-prorated warranty'
      ),
      jsonb_build_object(
        'label', 'Golden Pledge (Requires GAF Master Elite)',
        'value', 'golden_pledge',
        'description', 'Lifetime warranty with 50-year coverage'
      )
    )
  ),
  NULL,
  false,
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
WHERE trade = 'roofing'
ORDER BY section_order, field_order;
