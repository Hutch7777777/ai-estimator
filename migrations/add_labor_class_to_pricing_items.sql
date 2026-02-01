-- Migration: Add labor_class column to pricing_items table
-- This enables grouping labor by siding type (lap, panel, shingle, etc.)
-- The labor_class value should match rate_name in labor_rates table exactly

-- Step 1: Add the column
ALTER TABLE pricing_items
ADD COLUMN IF NOT EXISTS labor_class TEXT;

-- Step 2: Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pricing_items_labor_class ON pricing_items(labor_class);

-- Step 3: Update existing products with their labor class
-- Based on category and product characteristics

-- Lap Siding (HardiePlank, Nichiha Lap, etc.)
UPDATE pricing_items
SET labor_class = 'Lap Siding Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%lap%'
    OR category ILIKE '%plank%'
    OR product_name ILIKE '%HardiePlank%'
    OR product_name ILIKE '%lap siding%'
    OR (category = 'siding' AND product_name NOT ILIKE '%panel%' AND product_name NOT ILIKE '%shingle%' AND product_name NOT ILIKE '%shake%' AND product_name NOT ILIKE '%board%batten%')
  );

-- Panel Siding (HardiePanel, 4x8, 4x10 panels)
UPDATE pricing_items
SET labor_class = 'Panel Siding Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%panel%'
    OR product_name ILIKE '%HardiePanel%'
    OR product_name ILIKE '%panel siding%'
    OR product_name ILIKE '%4x8%'
    OR product_name ILIKE '%4x10%'
    OR product_name ILIKE '%sheet%'
  );

-- Shingle/Shake Siding
UPDATE pricing_items
SET labor_class = 'Shingle Siding Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%shingle%'
    OR category ILIKE '%shake%'
    OR product_name ILIKE '%HardieShingle%'
    OR product_name ILIKE '%shingle%'
    OR product_name ILIKE '%shake%'
  );

-- Board & Batten
UPDATE pricing_items
SET labor_class = 'Board & Batten Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%board%batten%'
    OR product_name ILIKE '%board%batten%'
    OR product_name ILIKE '%B&B%'
  );

-- Vertical Siding
UPDATE pricing_items
SET labor_class = 'Vertical Siding Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%vertical%'
    OR product_name ILIKE '%vertical%'
  );

-- Nichiha AWP (Architectural Wall Panel with clip system)
UPDATE pricing_items
SET labor_class = 'Nichiha AWP Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    product_name ILIKE '%Nichiha%AWP%'
    OR product_name ILIKE '%Nichiha%Architectural%'
    OR (manufacturer = 'Nichiha' AND product_name ILIKE '%clip%')
  );

-- Composite/FastPlank (Engage Building Products)
UPDATE pricing_items
SET labor_class = 'Composite Plank Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    manufacturer ILIKE '%Engage%'
    OR product_name ILIKE '%FastPlank%'
    OR product_name ILIKE '%composite%siding%'
  );

-- Default remaining siding to Lap Siding Installation
UPDATE pricing_items
SET labor_class = 'Lap Siding Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND category IN ('siding', 'lap_siding', 'fiber_cement_siding');

-- Trim products - use Trim Installation
UPDATE pricing_items
SET labor_class = 'Trim Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%trim%'
    OR category ILIKE '%corner%'
    OR category ILIKE '%j_channel%'
    OR product_name ILIKE '%trim%'
  );

-- Soffit products
UPDATE pricing_items
SET labor_class = 'Soffit Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%soffit%'
    OR product_name ILIKE '%soffit%'
  );

-- Fascia products
UPDATE pricing_items
SET labor_class = 'Fascia Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%fascia%'
    OR product_name ILIKE '%fascia%'
  );

-- Architectural details (corbels, brackets, etc.)
UPDATE pricing_items
SET labor_class = 'Corbel Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%corbel%'
    OR product_name ILIKE '%corbel%'
  );

UPDATE pricing_items
SET labor_class = 'Bracket Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%bracket%'
    OR product_name ILIKE '%bracket%'
  );

UPDATE pricing_items
SET labor_class = 'Shutter Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%shutter%'
    OR product_name ILIKE '%shutter%'
  );

UPDATE pricing_items
SET labor_class = 'Column Installation'
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND (
    category ILIKE '%column%'
    OR product_name ILIKE '%column%'
    OR product_name ILIKE '%post%wrap%'
  );

-- Add comment for documentation
COMMENT ON COLUMN pricing_items.labor_class IS 'Labor rate class that matches rate_name in labor_rates table. Used to determine installation labor cost per product type.';

-- Verify: Show distribution of labor classes
-- SELECT labor_class, COUNT(*) as product_count
-- FROM pricing_items
-- WHERE trade = 'siding'
-- GROUP BY labor_class
-- ORDER BY product_count DESC;
