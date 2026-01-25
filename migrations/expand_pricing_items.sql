-- ============================================================================
-- PRICING_ITEMS EXPANSION MIGRATION
-- ============================================================================
-- Run this script in Supabase SQL Editor
--
-- This migration:
--   1. Deduplicates existing SKUs
--   2. Adds missing auto-scope SKUs
--   3. Adds architectural/decorative products (corbels, brackets, shutters, etc.)
--   4. Expands siding products (multiple widths, LP SmartSide)
--   5. Adds gutter accessories
--   6. Adds soffit alternatives
--
-- IMPORTANT: Run each phase separately and verify before proceeding
-- ============================================================================

-- ============================================================================
-- PHASE 0: BACKUP CHECK - Verify current state before changes
-- ============================================================================

-- Run this first to see current duplicate count
SELECT 'PHASE 0: Pre-migration check' as phase;
SELECT COUNT(*) as total_products FROM pricing_items;
SELECT COUNT(DISTINCT sku) as unique_skus FROM pricing_items;
SELECT COUNT(*) - COUNT(DISTINCT sku) as duplicate_count FROM pricing_items;

-- ============================================================================
-- PHASE 1: DEDUPLICATE SKUs
-- ============================================================================
-- Keeps the FIRST entry (oldest created_at) for each duplicate SKU
-- ============================================================================

SELECT 'PHASE 1: Deduplicating SKUs' as phase;

-- First, let's see what will be deleted (DRY RUN)
-- SELECT id, sku, product_name, created_at,
--        ROW_NUMBER() OVER (PARTITION BY sku ORDER BY created_at ASC) as rn
-- FROM pricing_items
-- WHERE sku IN (SELECT sku FROM pricing_items GROUP BY sku HAVING COUNT(*) > 1)
-- ORDER BY sku, created_at;

-- Delete duplicates, keeping the oldest entry
DELETE FROM pricing_items
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY sku ORDER BY created_at ASC) as rn
    FROM pricing_items
  ) ranked
  WHERE rn > 1
);

-- Verify deduplication
SELECT 'Duplicates remaining:' as check_type, COUNT(*) as count
FROM (
  SELECT sku FROM pricing_items GROUP BY sku HAVING COUNT(*) > 1
) dups;

-- ============================================================================
-- PHASE 2: ADD MISSING AUTO-SCOPE SKUs
-- ============================================================================
-- These SKUs are referenced by siding_auto_scope_rules but don't exist
-- ============================================================================

SELECT 'PHASE 2: Adding missing auto-scope SKUs' as phase;

-- Get the current snapshot_id (required for pricing_items)
-- Using the existing snapshot_id from the current pricing_items data
DO $$
DECLARE
  v_snapshot_id uuid := '0a0cc4ac-0b7f-4e4c-ae6a-af79c624ae53';
BEGIN
  -- Alternatively, get snapshot_id from existing pricing_items
  -- SELECT DISTINCT snapshot_id INTO v_snapshot_id FROM pricing_items LIMIT 1;

  -- Insert missing SKUs only if they don't already exist
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('CAULK-JH-COLORMATCH', 'James Hardie ColorMatch Caulk 10.1oz', 'sealants', 'siding', 'tube', 8.50, 0.25, 'James Hardie', 'Color-matched to ColorPlus colors'),
    ('DRIP-EDGE-10', 'Aluminum Drip Edge 2" x 10ft', 'flashing', 'siding', 'ea', 8.50, 2.00, 'Generic', 'Pre-painted white aluminum'),
    ('TRIM-NAILS-SS-1LB', 'Stainless Steel Trim Nails 6d 2" 1lb Box', 'fasteners', 'siding', 'box', 7.50, 0.00, 'Grip-Rite', 'Ring shank, hand drive'),
    ('ZFLASH-10', 'Z-Flashing 2" x 10ft Pre-Painted White', 'flashing', 'siding', 'ea', 12.50, 2.00, 'Generic', 'Aluminum Z-bar for horizontal transitions'),
    ('JH-TRIM-BB-8-CP', 'HardieTrim Belly Band 1x8 x 12ft ColorPlus', 'trim', 'siding', 'ea', 32.00, 0.00, 'James Hardie', 'Smooth finish belly band trim'),
    ('HARDIE-LAP-825-12FT', 'HardiePlank 8.25" x 12ft ColorPlus', 'siding', 'siding', 'ea', 20.50, 0.00, 'James Hardie', 'Default siding product for auto-scope')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  WHERE NOT EXISTS (
    SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku
  );
END $$;

-- Verify auto-scope SKUs exist
SELECT 'Auto-scope SKUs check:' as check_type;
SELECT sku, product_name, category
FROM pricing_items
WHERE sku IN ('CAULK-JH-COLORMATCH', 'DRIP-EDGE-10', 'TRIM-NAILS-SS-1LB', 'ZFLASH-10', 'JH-TRIM-BB-8-CP', 'HARDIE-LAP-825-12FT');

-- ============================================================================
-- PHASE 3: ADD ARCHITECTURAL/DECORATIVE PRODUCTS
-- ============================================================================
-- New category 'architectural' for corbels, brackets, shutters, posts, columns
-- ============================================================================

SELECT 'PHASE 3: Adding architectural/decorative products' as phase;

DO $$
DECLARE
  v_snapshot_id uuid := '0a0cc4ac-0b7f-4e4c-ae6a-af79c624ae53';
BEGIN

  -- CORBELS
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('CORBEL-SM-PRIMED', 'Decorative Corbel Small 6" - Primed Polyurethane', 'architectural', 'siding', 'ea', 35.00, 25.00, 'Fypon', 'Paintable, moisture resistant'),
    ('CORBEL-MD-PRIMED', 'Decorative Corbel Medium 10" - Primed Polyurethane', 'architectural', 'siding', 'ea', 55.00, 30.00, 'Fypon', 'Paintable, moisture resistant'),
    ('CORBEL-LG-PRIMED', 'Decorative Corbel Large 14" - Primed Polyurethane', 'architectural', 'siding', 'ea', 85.00, 35.00, 'Fypon', 'Paintable, moisture resistant'),
    ('CORBEL-SM-PVC', 'Decorative Corbel Small 6" - Cellular PVC', 'architectural', 'siding', 'ea', 45.00, 25.00, 'Azek', 'No painting required, rot-proof'),
    ('CORBEL-MD-PVC', 'Decorative Corbel Medium 10" - Cellular PVC', 'architectural', 'siding', 'ea', 75.00, 30.00, 'Azek', 'No painting required, rot-proof'),
    ('CORBEL-LG-PVC', 'Decorative Corbel Large 14" - Cellular PVC', 'architectural', 'siding', 'ea', 115.00, 35.00, 'Azek', 'No painting required, rot-proof')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

  -- DECORATIVE BRACKETS
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('BRACKET-SM-PRIMED', 'Decorative Bracket Small 8" - Primed Polyurethane', 'architectural', 'siding', 'ea', 28.00, 20.00, 'Fypon', 'Craftsman style'),
    ('BRACKET-MD-PRIMED', 'Decorative Bracket Medium 12" - Primed Polyurethane', 'architectural', 'siding', 'ea', 45.00, 25.00, 'Fypon', 'Craftsman style'),
    ('BRACKET-LG-PRIMED', 'Decorative Bracket Large 16" - Primed Polyurethane', 'architectural', 'siding', 'ea', 65.00, 30.00, 'Fypon', 'Craftsman style'),
    ('BRACKET-GABLE-PRIMED', 'Gable Bracket Decorative 24" - Primed Polyurethane', 'architectural', 'siding', 'ea', 95.00, 40.00, 'Fypon', 'For gable accents'),
    ('BRACKET-KNEE-PRIMED', 'Knee Brace Bracket 18" - Primed Polyurethane', 'architectural', 'siding', 'ea', 55.00, 25.00, 'Fypon', 'Porch/overhang accent')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

  -- SHUTTERS
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('SHUTTER-VNL-15x48', 'Vinyl Raised Panel Shutter 15"x48"', 'architectural', 'siding', 'ea', 38.00, 25.00, 'Mid-America', 'Pair - 2 shutters'),
    ('SHUTTER-VNL-15x55', 'Vinyl Raised Panel Shutter 15"x55"', 'architectural', 'siding', 'ea', 45.00, 25.00, 'Mid-America', 'Pair - 2 shutters'),
    ('SHUTTER-VNL-15x60', 'Vinyl Raised Panel Shutter 15"x60"', 'architectural', 'siding', 'ea', 50.00, 25.00, 'Mid-America', 'Pair - 2 shutters'),
    ('SHUTTER-VNL-15x67', 'Vinyl Raised Panel Shutter 15"x67"', 'architectural', 'siding', 'ea', 55.00, 25.00, 'Mid-America', 'Pair - 2 shutters'),
    ('SHUTTER-LOUVER-15x48', 'Vinyl Louvered Shutter 15"x48"', 'architectural', 'siding', 'ea', 35.00, 25.00, 'Mid-America', 'Pair - 2 shutters'),
    ('SHUTTER-LOUVER-15x55', 'Vinyl Louvered Shutter 15"x55"', 'architectural', 'siding', 'ea', 40.00, 25.00, 'Mid-America', 'Pair - 2 shutters'),
    ('SHUTTER-LOUVER-15x60', 'Vinyl Louvered Shutter 15"x60"', 'architectural', 'siding', 'ea', 45.00, 25.00, 'Mid-America', 'Pair - 2 shutters'),
    ('SHUTTER-COMP-15x55', 'Composite Board & Batten Shutter 15"x55"', 'architectural', 'siding', 'ea', 125.00, 35.00, 'Timberlane', 'Per shutter, paintable'),
    ('SHUTTER-COMP-15x60', 'Composite Board & Batten Shutter 15"x60"', 'architectural', 'siding', 'ea', 145.00, 35.00, 'Timberlane', 'Per shutter, paintable'),
    ('SHUTTER-CEDAR-15x55', 'Western Red Cedar Raised Panel Shutter 15"x55"', 'architectural', 'siding', 'ea', 185.00, 45.00, 'Timberlane', 'Per shutter, unfinished'),
    ('SHUTTER-CEDAR-15x60', 'Western Red Cedar Raised Panel Shutter 15"x60"', 'architectural', 'siding', 'ea', 210.00, 45.00, 'Timberlane', 'Per shutter, unfinished')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

  -- POSTS
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('POST-WRAP-4X4-8', 'Post Wrap 4x4 x 8ft - Cellular PVC White', 'architectural', 'siding', 'ea', 65.00, 35.00, 'Azek', 'Wraps existing 4x4 post'),
    ('POST-WRAP-4X4-10', 'Post Wrap 4x4 x 10ft - Cellular PVC White', 'architectural', 'siding', 'ea', 85.00, 40.00, 'Azek', 'Wraps existing 4x4 post'),
    ('POST-WRAP-6X6-8', 'Post Wrap 6x6 x 8ft - Cellular PVC White', 'architectural', 'siding', 'ea', 95.00, 45.00, 'Azek', 'Wraps existing 6x6 post'),
    ('POST-WRAP-6X6-10', 'Post Wrap 6x6 x 10ft - Cellular PVC White', 'architectural', 'siding', 'ea', 125.00, 50.00, 'Azek', 'Wraps existing 6x6 post'),
    ('POST-TURNED-8-PRIME', 'Turned Porch Post 8ft - Primed Polyurethane', 'architectural', 'siding', 'ea', 145.00, 55.00, 'Fypon', 'Full replacement post'),
    ('POST-TURNED-10-PRIME', 'Turned Porch Post 10ft - Primed Polyurethane', 'architectural', 'siding', 'ea', 175.00, 60.00, 'Fypon', 'Full replacement post'),
    ('POST-SQUARE-8-PVC', 'Square Porch Post 5x5 x 8ft - Cellular PVC', 'architectural', 'siding', 'ea', 165.00, 55.00, 'Azek', 'Full replacement post'),
    ('POST-SQUARE-10-PVC', 'Square Porch Post 5x5 x 10ft - Cellular PVC', 'architectural', 'siding', 'ea', 195.00, 60.00, 'Azek', 'Full replacement post')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

  -- COLUMNS
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('COLUMN-RND-8-8', 'Round Column 8" dia x 8ft - Fiberglass', 'architectural', 'siding', 'ea', 285.00, 85.00, 'HB&G', 'Non-tapered, structural'),
    ('COLUMN-RND-8-10', 'Round Column 8" dia x 10ft - Fiberglass', 'architectural', 'siding', 'ea', 345.00, 95.00, 'HB&G', 'Non-tapered, structural'),
    ('COLUMN-RND-10-8', 'Round Column 10" dia x 8ft - Fiberglass', 'architectural', 'siding', 'ea', 385.00, 95.00, 'HB&G', 'Non-tapered, structural'),
    ('COLUMN-RND-10-10', 'Round Column 10" dia x 10ft - Fiberglass', 'architectural', 'siding', 'ea', 450.00, 105.00, 'HB&G', 'Non-tapered, structural'),
    ('COLUMN-SQ-8-8', 'Square Column 8" x 8ft - Cellular PVC', 'architectural', 'siding', 'ea', 245.00, 75.00, 'Azek', 'Non-tapered, structural'),
    ('COLUMN-SQ-8-10', 'Square Column 8" x 10ft - Cellular PVC', 'architectural', 'siding', 'ea', 295.00, 85.00, 'Azek', 'Non-tapered, structural'),
    ('COLUMN-WRAP-8-8', 'Column Wrap Kit 8" x 8ft - Cellular PVC', 'architectural', 'siding', 'ea', 165.00, 65.00, 'Azek', 'Wraps existing column'),
    ('COLUMN-WRAP-8-10', 'Column Wrap Kit 8" x 10ft - Cellular PVC', 'architectural', 'siding', 'ea', 195.00, 75.00, 'Azek', 'Wraps existing column'),
    ('COLUMN-WRAP-10-8', 'Column Wrap Kit 10" x 8ft - Cellular PVC', 'architectural', 'siding', 'ea', 215.00, 75.00, 'Azek', 'Wraps existing column'),
    ('COLUMN-WRAP-10-10', 'Column Wrap Kit 10" x 10ft - Cellular PVC', 'architectural', 'siding', 'ea', 255.00, 85.00, 'Azek', 'Wraps existing column')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

  -- GABLE VENTS
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('GVENT-TRI-24', 'Gable Vent Triangle 24" Base - Vinyl White', 'architectural', 'siding', 'ea', 35.00, 25.00, 'Mid-America', 'Functional vent'),
    ('GVENT-TRI-30', 'Gable Vent Triangle 30" Base - Vinyl White', 'architectural', 'siding', 'ea', 45.00, 30.00, 'Mid-America', 'Functional vent'),
    ('GVENT-TRI-36', 'Gable Vent Triangle 36" Base - Vinyl White', 'architectural', 'siding', 'ea', 55.00, 35.00, 'Mid-America', 'Functional vent'),
    ('GVENT-RECT-12X18', 'Gable Vent Rectangle 12"x18" - Vinyl White', 'architectural', 'siding', 'ea', 28.00, 20.00, 'Mid-America', 'Functional vent'),
    ('GVENT-RECT-14X24', 'Gable Vent Rectangle 14"x24" - Vinyl White', 'architectural', 'siding', 'ea', 38.00, 25.00, 'Mid-America', 'Functional vent'),
    ('GVENT-RECT-18X24', 'Gable Vent Rectangle 18"x24" - Vinyl White', 'architectural', 'siding', 'ea', 48.00, 30.00, 'Mid-America', 'Functional vent'),
    ('GVENT-OCTAGON-18', 'Gable Vent Octagon 18" - Vinyl White', 'architectural', 'siding', 'ea', 45.00, 25.00, 'Mid-America', 'Functional vent'),
    ('GVENT-OCTAGON-22', 'Gable Vent Octagon 22" - Vinyl White', 'architectural', 'siding', 'ea', 55.00, 30.00, 'Mid-America', 'Functional vent'),
    ('GVENT-HALFROUND-28', 'Gable Vent Half Round 28" - Cellular PVC', 'architectural', 'siding', 'ea', 95.00, 40.00, 'Fypon', 'Decorative functional vent'),
    ('GVENT-HALFROUND-34', 'Gable Vent Half Round 34" - Cellular PVC', 'architectural', 'siding', 'ea', 125.00, 45.00, 'Fypon', 'Decorative functional vent')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);
END $$;

-- Verify architectural products added
SELECT 'Architectural products added:' as check_type, COUNT(*) as count
FROM pricing_items WHERE category = 'architectural';

-- ============================================================================
-- PHASE 4: ADD EXPANDED SIDING PRODUCTS
-- ============================================================================
-- Multiple widths for HardiePlank, LP SmartSide products
-- ============================================================================

SELECT 'PHASE 4: Adding expanded siding products' as phase;

DO $$
DECLARE
  v_snapshot_id uuid := '0a0cc4ac-0b7f-4e4c-ae6a-af79c624ae53';
BEGIN

  -- HARDIEPLANK LAP SIDING - CEDARMILL TEXTURE (Multiple Widths)
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, texture, coverage_value, coverage_unit, reveal_inches, is_colorplus, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('HP-525-CM-PR', 'HardiePlank 5.25" x 12ft Cedarmill Primed', 'lap_siding', 'siding', 'ea', 12.50, 0.00, 'James Hardie', 'cedarmill', 4.375, 'SF', 4.0, false, '5.25" face, 4" reveal'),
    ('HP-525-CM-CP', 'HardiePlank 5.25" x 12ft Cedarmill ColorPlus', 'lap_siding', 'siding', 'ea', 16.50, 0.00, 'James Hardie', 'cedarmill', 4.375, 'SF', 4.0, true, '5.25" face, 4" reveal'),
    ('HP-625-CM-PR', 'HardiePlank 6.25" x 12ft Cedarmill Primed', 'lap_siding', 'siding', 'ea', 13.50, 0.00, 'James Hardie', 'cedarmill', 5.25, 'SF', 5.0, false, '6.25" face, 5" reveal'),
    ('HP-625-CM-CP', 'HardiePlank 6.25" x 12ft Cedarmill ColorPlus', 'lap_siding', 'siding', 'ea', 17.75, 0.00, 'James Hardie', 'cedarmill', 5.25, 'SF', 5.0, true, '6.25" face, 5" reveal'),
    ('HP-725-CM-PR', 'HardiePlank 7.25" x 12ft Cedarmill Primed', 'lap_siding', 'siding', 'ea', 14.50, 0.00, 'James Hardie', 'cedarmill', 6.0, 'SF', 6.0, false, '7.25" face, 6" reveal'),
    ('HP-725-CM-CP', 'HardiePlank 7.25" x 12ft Cedarmill ColorPlus', 'lap_siding', 'siding', 'ea', 19.00, 0.00, 'James Hardie', 'cedarmill', 6.0, 'SF', 6.0, true, '7.25" face, 6" reveal'),
    ('HP-825-CM-PR', 'HardiePlank 8.25" x 12ft Cedarmill Primed', 'lap_siding', 'siding', 'ea', 15.25, 0.00, 'James Hardie', 'cedarmill', 7.0, 'SF', 7.0, false, '8.25" face, 7" reveal'),
    ('HP-825-CM-CP', 'HardiePlank 8.25" x 12ft Cedarmill ColorPlus', 'lap_siding', 'siding', 'ea', 20.50, 0.00, 'James Hardie', 'cedarmill', 7.0, 'SF', 7.0, true, '8.25" face, 7" reveal')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, texture, coverage_value, coverage_unit, reveal_inches, is_colorplus, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

  -- HARDIEPLANK LAP SIDING - SMOOTH TEXTURE (Multiple Widths)
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, texture, coverage_value, coverage_unit, reveal_inches, is_colorplus, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('HP-525-SM-PR', 'HardiePlank 5.25" x 12ft Smooth Primed', 'lap_siding', 'siding', 'ea', 12.00, 0.00, 'James Hardie', 'smooth', 4.375, 'SF', 4.0, false, '5.25" face, 4" reveal'),
    ('HP-525-SM-CP', 'HardiePlank 5.25" x 12ft Smooth ColorPlus', 'lap_siding', 'siding', 'ea', 16.00, 0.00, 'James Hardie', 'smooth', 4.375, 'SF', 4.0, true, '5.25" face, 4" reveal'),
    ('HP-625-SM-PR', 'HardiePlank 6.25" x 12ft Smooth Primed', 'lap_siding', 'siding', 'ea', 13.00, 0.00, 'James Hardie', 'smooth', 5.25, 'SF', 5.0, false, '6.25" face, 5" reveal'),
    ('HP-625-SM-CP', 'HardiePlank 6.25" x 12ft Smooth ColorPlus', 'lap_siding', 'siding', 'ea', 17.25, 0.00, 'James Hardie', 'smooth', 5.25, 'SF', 5.0, true, '6.25" face, 5" reveal'),
    ('HP-725-SM-PR', 'HardiePlank 7.25" x 12ft Smooth Primed', 'lap_siding', 'siding', 'ea', 14.00, 0.00, 'James Hardie', 'smooth', 6.0, 'SF', 6.0, false, '7.25" face, 6" reveal'),
    ('HP-725-SM-CP', 'HardiePlank 7.25" x 12ft Smooth ColorPlus', 'lap_siding', 'siding', 'ea', 18.50, 0.00, 'James Hardie', 'smooth', 6.0, 'SF', 6.0, true, '7.25" face, 6" reveal'),
    ('HP-825-SM-PR', 'HardiePlank 8.25" x 12ft Smooth Primed', 'lap_siding', 'siding', 'ea', 14.75, 0.00, 'James Hardie', 'smooth', 7.0, 'SF', 7.0, false, '8.25" face, 7" reveal'),
    ('HP-825-SM-CP', 'HardiePlank 8.25" x 12ft Smooth ColorPlus', 'lap_siding', 'siding', 'ea', 20.00, 0.00, 'James Hardie', 'smooth', 7.0, 'SF', 7.0, true, '8.25" face, 7" reveal')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, texture, coverage_value, coverage_unit, reveal_inches, is_colorplus, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

  -- HARDIEPLANK BEADED CEDARMILL (premium option)
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, texture, coverage_value, coverage_unit, reveal_inches, is_colorplus, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('HP-825-BCM-PR', 'HardiePlank 8.25" x 12ft Beaded Cedarmill Primed', 'lap_siding', 'siding', 'ea', 17.50, 0.00, 'James Hardie', 'beaded_cedarmill', 7.0, 'SF', 7.0, false, 'Premium beaded edge profile'),
    ('HP-825-BCM-CP', 'HardiePlank 8.25" x 12ft Beaded Cedarmill ColorPlus', 'lap_siding', 'siding', 'ea', 23.00, 0.00, 'James Hardie', 'beaded_cedarmill', 7.0, 'SF', 7.0, true, 'Premium beaded edge profile')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, texture, coverage_value, coverage_unit, reveal_inches, is_colorplus, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

  -- LP SMARTSIDE LAP SIDING
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, coverage_value, coverage_unit, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('LP-LAP-8-16-PR', 'LP SmartSide 8" x 16ft Lap Siding Primed', 'lap_siding', 'siding', 'ea', 18.50, 0.00, 'LP Building Solutions', 8.9, 'SF', 'Engineered wood strand substrate'),
    ('LP-LAP-8-16-FIN', 'LP SmartSide 8" x 16ft Lap Siding Pre-Finished', 'lap_siding', 'siding', 'ea', 24.00, 0.00, 'LP Building Solutions', 8.9, 'SF', 'Factory finished, 5-year paint warranty'),
    ('LP-LAP-12-16-PR', 'LP SmartSide 12" x 16ft Lap Siding Primed', 'lap_siding', 'siding', 'ea', 22.00, 0.00, 'LP Building Solutions', 13.3, 'SF', 'Engineered wood strand substrate'),
    ('LP-LAP-12-16-FIN', 'LP SmartSide 12" x 16ft Lap Siding Pre-Finished', 'lap_siding', 'siding', 'ea', 28.50, 0.00, 'LP Building Solutions', 13.3, 'SF', 'Factory finished, 5-year paint warranty')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, coverage_value, coverage_unit, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

  -- LP SMARTSIDE PANEL
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, coverage_value, coverage_unit, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('LP-PANEL-48-PR', 'LP SmartSide 4x8 Panel Siding Primed', 'panel', 'siding', 'ea', 42.00, 0.00, 'LP Building Solutions', 32, 'SF', 'Textured cedar grain'),
    ('LP-PANEL-48-STUCCO', 'LP SmartSide 4x8 Panel Stucco Texture Primed', 'panel', 'siding', 'ea', 48.00, 0.00, 'LP Building Solutions', 32, 'SF', 'Smooth stucco texture'),
    ('LP-PANEL-49-PR', 'LP SmartSide 4x9 Panel Siding Primed', 'panel', 'siding', 'ea', 48.00, 0.00, 'LP Building Solutions', 36, 'SF', 'Textured cedar grain'),
    ('LP-PANEL-410-PR', 'LP SmartSide 4x10 Panel Siding Primed', 'panel', 'siding', 'ea', 54.00, 0.00, 'LP Building Solutions', 40, 'SF', 'Textured cedar grain')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, coverage_value, coverage_unit, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

  -- LP SMARTSIDE TRIM
  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, coverage_value, coverage_unit, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    ('LP-TRIM-4-16', 'LP SmartSide Trim 1x4 x 16ft Primed', 'trim', 'siding', 'ea', 14.00, 0.00, 'LP Building Solutions', 16, 'LF', 'Reversible texture'),
    ('LP-TRIM-6-16', 'LP SmartSide Trim 1x6 x 16ft Primed', 'trim', 'siding', 'ea', 18.50, 0.00, 'LP Building Solutions', 16, 'LF', 'Reversible texture'),
    ('LP-TRIM-8-16', 'LP SmartSide Trim 1x8 x 16ft Primed', 'trim', 'siding', 'ea', 24.00, 0.00, 'LP Building Solutions', 16, 'LF', 'Reversible texture'),
    ('LP-TRIM-10-16', 'LP SmartSide Trim 1x10 x 16ft Primed', 'trim', 'siding', 'ea', 32.00, 0.00, 'LP Building Solutions', 16, 'LF', 'Reversible texture'),
    ('LP-TRIM-12-16', 'LP SmartSide Trim 1x12 x 16ft Primed', 'trim', 'siding', 'ea', 38.00, 0.00, 'LP Building Solutions', 16, 'LF', 'Reversible texture')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, coverage_value, coverage_unit, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);
END $$;

-- Verify siding products added
SELECT 'Lap siding products:' as check_type, COUNT(*) as count
FROM pricing_items WHERE category = 'lap_siding';

-- ============================================================================
-- PHASE 5: ADD GUTTER ACCESSORIES
-- ============================================================================

SELECT 'PHASE 5: Adding gutter accessories' as phase;

DO $$
DECLARE
  v_snapshot_id uuid := '0a0cc4ac-0b7f-4e4c-ae6a-af79c624ae53';
BEGIN

  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    -- Elbows
    ('GUT-ELBOW-A-5', 'Gutter Elbow A Style 5" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 4.50, 2.00, 'Amerimax', 'Front discharge'),
    ('GUT-ELBOW-B-5', 'Gutter Elbow B Style 5" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 4.50, 2.00, 'Amerimax', 'Side discharge'),
    ('GUT-ELBOW-A-6', 'Gutter Elbow A Style 6" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 5.50, 2.00, 'Amerimax', 'Front discharge'),
    ('GUT-ELBOW-B-6', 'Gutter Elbow B Style 6" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 5.50, 2.00, 'Amerimax', 'Side discharge'),
    -- End caps
    ('GUT-ENDCAP-L-5', 'Gutter End Cap Left 5" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 3.25, 1.50, 'Amerimax', 'Left hand'),
    ('GUT-ENDCAP-R-5', 'Gutter End Cap Right 5" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 3.25, 1.50, 'Amerimax', 'Right hand'),
    ('GUT-ENDCAP-L-6', 'Gutter End Cap Left 6" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 4.00, 1.50, 'Amerimax', 'Left hand'),
    ('GUT-ENDCAP-R-6', 'Gutter End Cap Right 6" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 4.00, 1.50, 'Amerimax', 'Right hand'),
    -- Hangers
    ('GUT-HANGER-HD', 'Hidden Gutter Hanger Heavy Duty', 'gutter_accessories', 'gutters', 'ea', 1.85, 0.50, 'Amerimax', 'Installs inside gutter'),
    ('GUT-HANGER-SCREW', 'Gutter Hanger with Screw', 'gutter_accessories', 'gutters', 'ea', 2.25, 0.50, 'Amerimax', 'Traditional spike style'),
    ('GUT-HANGER-STRAP', 'Gutter Strap Hanger', 'gutter_accessories', 'gutters', 'ea', 2.50, 0.75, 'Amerimax', 'Wraps around gutter'),
    -- Splash blocks and extensions
    ('GUT-SPLASH-BLK', 'Splash Block - Black', 'gutter_accessories', 'gutters', 'ea', 8.50, 3.00, 'Amerimax', 'Plastic, 24" length'),
    ('GUT-SPLASH-GRN', 'Splash Block - Green', 'gutter_accessories', 'gutters', 'ea', 8.50, 3.00, 'Amerimax', 'Plastic, 24" length'),
    ('GUT-EXTENSION-WHT', 'Downspout Extension Flexible 4ft - White', 'gutter_accessories', 'gutters', 'ea', 12.00, 5.00, 'Amerimax', 'Flexible vinyl'),
    ('GUT-EXTENSION-BLK', 'Downspout Extension Flexible 4ft - Black', 'gutter_accessories', 'gutters', 'ea', 12.00, 5.00, 'Amerimax', 'Flexible vinyl'),
    -- Guards and screens
    ('GUT-GUARD-5-4FT', 'Gutter Guard 5" - 4ft Section Mesh', 'gutter_accessories', 'gutters', 'ea', 8.00, 3.00, 'Amerimax', 'Snap-in aluminum mesh'),
    ('GUT-GUARD-6-4FT', 'Gutter Guard 6" - 4ft Section Mesh', 'gutter_accessories', 'gutters', 'ea', 10.00, 3.50, 'Amerimax', 'Snap-in aluminum mesh'),
    ('GUT-SCREEN-5-3FT', 'Gutter Screen 5" - 3ft Roll Mesh', 'gutter_accessories', 'gutters', 'ea', 4.50, 1.50, 'Amerimax', 'Expandable plastic mesh'),
    ('GUT-SCREEN-6-3FT', 'Gutter Screen 6" - 3ft Roll Mesh', 'gutter_accessories', 'gutters', 'ea', 5.50, 1.50, 'Amerimax', 'Expandable plastic mesh'),
    -- Connectors and miters
    ('GUT-CONNECTOR-5', 'Gutter Connector 5" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 4.00, 2.00, 'Amerimax', 'Slip connector'),
    ('GUT-CONNECTOR-6', 'Gutter Connector 6" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 5.00, 2.00, 'Amerimax', 'Slip connector'),
    ('GUT-MITER-IN-5', 'Gutter Miter Inside 5" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 8.00, 3.00, 'Amerimax', 'Inside corner'),
    ('GUT-MITER-OUT-5', 'Gutter Miter Outside 5" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 8.00, 3.00, 'Amerimax', 'Outside corner'),
    ('GUT-MITER-IN-6', 'Gutter Miter Inside 6" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 10.00, 3.50, 'Amerimax', 'Inside corner'),
    ('GUT-MITER-OUT-6', 'Gutter Miter Outside 6" - Aluminum', 'gutter_accessories', 'gutters', 'ea', 10.00, 3.50, 'Amerimax', 'Outside corner'),
    -- Outlet/drop
    ('GUT-OUTLET-5', 'Gutter Outlet Drop 5" to 2x3"', 'gutter_accessories', 'gutters', 'ea', 6.00, 2.50, 'Amerimax', 'Connects to downspout'),
    ('GUT-OUTLET-6', 'Gutter Outlet Drop 6" to 3x4"', 'gutter_accessories', 'gutters', 'ea', 8.00, 3.00, 'Amerimax', 'Connects to downspout')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);
END $$;

-- Verify gutter accessories added
SELECT 'Gutter accessory products:' as check_type, COUNT(*) as count
FROM pricing_items WHERE category = 'gutter_accessories';

-- ============================================================================
-- PHASE 6: ADD SOFFIT ALTERNATIVES
-- ============================================================================

SELECT 'PHASE 6: Adding soffit alternatives' as phase;

DO $$
DECLARE
  v_snapshot_id uuid := '0a0cc4ac-0b7f-4e4c-ae6a-af79c624ae53';
BEGIN

  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, coverage_value, coverage_unit, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    -- Vinyl Soffit
    ('SOFFIT-VNL-VENT-12', 'Vinyl Soffit Vented 12" x 12ft - White', 'soffit', 'siding', 'ea', 14.00, 6.00, 'CertainTeed', 12.0, 'SF', 'Triple 4" profile'),
    ('SOFFIT-VNL-SOLID-12', 'Vinyl Soffit Solid 12" x 12ft - White', 'soffit', 'siding', 'ea', 12.50, 6.00, 'CertainTeed', 12.0, 'SF', 'Triple 4" profile'),
    ('SOFFIT-VNL-BEADED-12', 'Vinyl Soffit Beaded 12" x 12ft - White', 'soffit', 'siding', 'ea', 15.50, 6.50, 'CertainTeed', 12.0, 'SF', 'Beaded center bead'),
    ('SOFFIT-VNL-VENT-16', 'Vinyl Soffit Vented 16" x 12ft - White', 'soffit', 'siding', 'ea', 18.00, 7.00, 'CertainTeed', 16.0, 'SF', 'Double 8" profile'),
    ('SOFFIT-VNL-SOLID-16', 'Vinyl Soffit Solid 16" x 12ft - White', 'soffit', 'siding', 'ea', 16.50, 7.00, 'CertainTeed', 16.0, 'SF', 'Double 8" profile'),
    -- Aluminum Soffit
    ('SOFFIT-ALU-VENT-12', 'Aluminum Soffit Vented 12" x 12ft - White', 'soffit', 'siding', 'ea', 20.00, 7.00, 'Rollex', 12.0, 'SF', 'Baked enamel finish'),
    ('SOFFIT-ALU-SOLID-12', 'Aluminum Soffit Solid 12" x 12ft - White', 'soffit', 'siding', 'ea', 18.00, 7.00, 'Rollex', 12.0, 'SF', 'Baked enamel finish'),
    ('SOFFIT-ALU-VENT-16', 'Aluminum Soffit Vented 16" x 12ft - White', 'soffit', 'siding', 'ea', 24.00, 8.00, 'Rollex', 16.0, 'SF', 'Baked enamel finish'),
    ('SOFFIT-ALU-SOLID-16', 'Aluminum Soffit Solid 16" x 12ft - White', 'soffit', 'siding', 'ea', 22.00, 8.00, 'Rollex', 16.0, 'SF', 'Baked enamel finish'),
    -- Hardie Soffit additions (if not already present)
    ('SOFFIT-HS-VENT-12-PR', 'HardieSoffit Vented 12" x 12ft Primed', 'soffit', 'siding', 'ea', 28.00, 8.00, 'James Hardie', 12.0, 'SF', 'Smooth texture'),
    ('SOFFIT-HS-SOLID-12-PR', 'HardieSoffit Non-Vented 12" x 12ft Primed', 'soffit', 'siding', 'ea', 26.00, 8.00, 'James Hardie', 12.0, 'SF', 'Smooth texture'),
    ('SOFFIT-HS-VENT-12-CP', 'HardieSoffit Vented 12" x 12ft ColorPlus', 'soffit', 'siding', 'ea', 36.00, 8.00, 'James Hardie', 12.0, 'SF', 'Factory painted'),
    ('SOFFIT-HS-SOLID-12-CP', 'HardieSoffit Non-Vented 12" x 12ft ColorPlus', 'soffit', 'siding', 'ea', 34.00, 8.00, 'James Hardie', 12.0, 'SF', 'Factory painted')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, coverage_value, coverage_unit, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);
END $$;

-- Verify soffit products
SELECT 'Soffit products:' as check_type, COUNT(*) as count
FROM pricing_items WHERE category = 'soffit';

-- ============================================================================
-- PHASE 7: ADD HARDIE TRIM WIDTHS
-- ============================================================================

SELECT 'PHASE 7: Adding HardieTrim widths' as phase;

DO $$
DECLARE
  v_snapshot_id uuid := '0a0cc4ac-0b7f-4e4c-ae6a-af79c624ae53';
BEGIN

  INSERT INTO pricing_items (snapshot_id, sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, texture, coverage_value, coverage_unit, is_colorplus, notes)
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    -- 4/4 (1") thickness - Primed
    ('HT-35-12-PR', 'HardieTrim 4/4 x 3.5" x 12ft Primed', 'trim', 'siding', 'ea', 12.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', false, '3.5" width nominal 1x4'),
    ('HT-55-12-PR', 'HardieTrim 4/4 x 5.5" x 12ft Primed', 'trim', 'siding', 'ea', 16.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', false, '5.5" width nominal 1x6'),
    ('HT-725-12-PR', 'HardieTrim 4/4 x 7.25" x 12ft Primed', 'trim', 'siding', 'ea', 22.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', false, '7.25" width nominal 1x8'),
    ('HT-925-12-PR', 'HardieTrim 4/4 x 9.25" x 12ft Primed', 'trim', 'siding', 'ea', 28.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', false, '9.25" width nominal 1x10'),
    ('HT-1125-12-PR', 'HardieTrim 4/4 x 11.25" x 12ft Primed', 'trim', 'siding', 'ea', 34.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', false, '11.25" width nominal 1x12'),
    -- 4/4 (1") thickness - ColorPlus
    ('HT-35-12-CP', 'HardieTrim 4/4 x 3.5" x 12ft ColorPlus', 'trim', 'siding', 'ea', 16.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', true, '3.5" width nominal 1x4'),
    ('HT-55-12-CP', 'HardieTrim 4/4 x 5.5" x 12ft ColorPlus', 'trim', 'siding', 'ea', 22.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', true, '5.5" width nominal 1x6'),
    ('HT-725-12-CP', 'HardieTrim 4/4 x 7.25" x 12ft ColorPlus', 'trim', 'siding', 'ea', 30.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', true, '7.25" width nominal 1x8'),
    ('HT-925-12-CP', 'HardieTrim 4/4 x 9.25" x 12ft ColorPlus', 'trim', 'siding', 'ea', 38.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', true, '9.25" width nominal 1x10'),
    ('HT-1125-12-CP', 'HardieTrim 4/4 x 11.25" x 12ft ColorPlus', 'trim', 'siding', 'ea', 46.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', true, '11.25" width nominal 1x12'),
    -- 5/4 (1.25") thickness - Primed
    ('HT-54-35-12-PR', 'HardieTrim 5/4 x 3.5" x 12ft Primed', 'trim', 'siding', 'ea', 15.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', false, '5/4 thickness for window/door jambs'),
    ('HT-54-55-12-PR', 'HardieTrim 5/4 x 5.5" x 12ft Primed', 'trim', 'siding', 'ea', 20.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', false, '5/4 thickness for window/door jambs'),
    ('HT-54-725-12-PR', 'HardieTrim 5/4 x 7.25" x 12ft Primed', 'trim', 'siding', 'ea', 28.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', false, '5/4 thickness for window/door jambs'),
    -- 5/4 (1.25") thickness - ColorPlus
    ('HT-54-35-12-CP', 'HardieTrim 5/4 x 3.5" x 12ft ColorPlus', 'trim', 'siding', 'ea', 20.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', true, '5/4 thickness for window/door jambs'),
    ('HT-54-55-12-CP', 'HardieTrim 5/4 x 5.5" x 12ft ColorPlus', 'trim', 'siding', 'ea', 27.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', true, '5/4 thickness for window/door jambs'),
    ('HT-54-725-12-CP', 'HardieTrim 5/4 x 7.25" x 12ft ColorPlus', 'trim', 'siding', 'ea', 38.00, 0.00, 'James Hardie', 'smooth', 12.0, 'LF', true, '5/4 thickness for window/door jambs'),
    -- Rustic Grain texture options
    ('HT-55-12-RG-PR', 'HardieTrim 4/4 x 5.5" x 12ft Rustic Grain Primed', 'trim', 'siding', 'ea', 18.00, 0.00, 'James Hardie', 'rustic_grain', 12.0, 'LF', false, 'Wood grain texture'),
    ('HT-55-12-RG-CP', 'HardieTrim 4/4 x 5.5" x 12ft Rustic Grain ColorPlus', 'trim', 'siding', 'ea', 25.00, 0.00, 'James Hardie', 'rustic_grain', 12.0, 'LF', true, 'Wood grain texture')
  ) AS vals(sku, product_name, category, trade, unit, material_cost, base_labor_cost, manufacturer, texture, coverage_value, coverage_unit, is_colorplus, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);
END $$;

-- Verify trim products
SELECT 'Trim products:' as check_type, COUNT(*) as count
FROM pricing_items WHERE category = 'trim';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

SELECT 'VERIFICATION' as phase;

-- Final product counts by category
SELECT category, COUNT(*) as count
FROM pricing_items
GROUP BY category
ORDER BY count DESC;

-- Check for any remaining duplicates
SELECT 'Remaining duplicates:' as check_type, COUNT(*) as count
FROM (SELECT sku FROM pricing_items GROUP BY sku HAVING COUNT(*) > 1) dups;

-- Verify architectural products
SELECT 'Architectural products breakdown:' as check_type;
SELECT
  CASE
    WHEN sku LIKE 'CORBEL%' THEN 'Corbels'
    WHEN sku LIKE 'BRACKET%' THEN 'Brackets'
    WHEN sku LIKE 'SHUTTER%' THEN 'Shutters'
    WHEN sku LIKE 'POST%' THEN 'Posts'
    WHEN sku LIKE 'COLUMN%' THEN 'Columns'
    WHEN sku LIKE 'GVENT%' THEN 'Gable Vents'
    ELSE 'Other'
  END as product_type,
  COUNT(*) as count
FROM pricing_items
WHERE category = 'architectural'
GROUP BY 1
ORDER BY 2 DESC;

-- Summary
SELECT 'MIGRATION COMPLETE' as status;
SELECT COUNT(*) as total_products FROM pricing_items;
SELECT COUNT(DISTINCT category) as total_categories FROM pricing_items;
SELECT COUNT(DISTINCT sku) as unique_skus FROM pricing_items;
