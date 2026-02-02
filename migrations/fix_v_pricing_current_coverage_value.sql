-- ============================================================================
-- FIX: Ensure v_pricing_current view includes coverage_value column
--
-- PROBLEM: Tyvek note showing "÷ 900 SF/roll" instead of "÷ 1350 SF/roll"
-- ROOT CAUSE: The v_pricing_current view may not include coverage_value column
--
-- This migration recreates the view to include all necessary columns
-- ============================================================================

-- First, check current view definition
SELECT definition
FROM pg_views
WHERE viewname = 'v_pricing_current';

-- Check if pricing_items has the coverage_value for Tyvek
SELECT sku, product_name, coverage_value, coverage_unit
FROM pricing_items
WHERE LOWER(sku) LIKE '%tyvek%'
   OR LOWER(product_name) LIKE '%tyvek%';

-- ============================================================================
-- RECREATE v_pricing_current VIEW
-- Include coverage_value and coverage_unit columns
-- ============================================================================

-- Drop existing view if it exists
DROP VIEW IF EXISTS v_pricing_current CASCADE;

-- Create the view with all necessary columns including coverage_value
CREATE OR REPLACE VIEW v_pricing_current AS
SELECT
  pi.id,
  pi.snapshot_id,
  pi.sku,
  pi.product_name,
  pi.category,
  pi.trade,
  pi.unit,
  pi.material_cost,
  pi.base_labor_cost,
  pi.total_labor_cost,
  pi.markup_percent,
  pi.manufacturer,
  pi.texture,
  pi.coverage_value,    -- Include coverage_value
  pi.coverage_unit,     -- Include coverage_unit
  pi.reveal_inches,
  pi.is_colorplus,
  pi.notes,
  pi.labor_class,
  pi.created_at,
  pi.updated_at
FROM pricing_items pi
INNER JOIN pricing_snapshots ps ON pi.snapshot_id = ps.id
WHERE ps.is_current = true;

-- Add comment explaining the view
COMMENT ON VIEW v_pricing_current IS
'Current active pricing items (from current snapshot). Includes coverage_value for area/LF coverage calculations.';

-- ============================================================================
-- VERIFY the fix
-- ============================================================================

-- Confirm Tyvek now shows coverage_value
SELECT sku, product_name, coverage_value, coverage_unit
FROM v_pricing_current
WHERE LOWER(sku) LIKE '%tyvek%'
   OR LOWER(product_name) LIKE '%tyvek%';

-- List all products with coverage_value set
SELECT sku, product_name, category, coverage_value, coverage_unit
FROM v_pricing_current
WHERE coverage_value IS NOT NULL
ORDER BY category, sku;
