-- ============================================================================
-- POPULATE COVERAGE_VALUE FOR TRIM AND CORNER PRODUCTS
-- Ensures piece_length is dynamically available from pricing_items
-- ============================================================================

-- James Hardie trim products (12ft standard)
UPDATE pricing_items
SET coverage_value = 12.0, coverage_unit = 'LF'
WHERE manufacturer ILIKE '%hardie%'
  AND category IN ('trim', 'corner', 'outside_corner_trim', 'inside_corner_trim',
                   'outside_corner', 'inside_corner', 'frieze', 'fascia')
  AND (coverage_value IS NULL OR coverage_value = 0);

-- James Hardie 10ft products (some J-channel and starter)
UPDATE pricing_items
SET coverage_value = 10.0, coverage_unit = 'LF'
WHERE manufacturer ILIKE '%hardie%'
  AND (LOWER(product_name) LIKE '%10ft%' OR LOWER(product_name) LIKE '%10 ft%')
  AND (coverage_value IS NULL OR coverage_value = 0);

-- Nichiha trim products (typically 10ft)
UPDATE pricing_items
SET coverage_value = 10.0, coverage_unit = 'LF'
WHERE manufacturer ILIKE '%nichiha%'
  AND category IN ('trim', 'corner', 'j_channel', 'j_mold', 'starter')
  AND (coverage_value IS NULL OR coverage_value = 0);

-- LP SmartSide (12ft standard)
UPDATE pricing_items
SET coverage_value = 12.0, coverage_unit = 'LF'
WHERE manufacturer ILIKE '%lp%smartside%'
  AND category IN ('trim', 'corner')
  AND (coverage_value IS NULL OR coverage_value = 0);

-- Generic aluminum flashing (10ft standard)
UPDATE pricing_items
SET coverage_value = 10.0, coverage_unit = 'LF'
WHERE category IN ('flashing', 'z_flashing', 'drip_edge', 'head_flashing')
  AND (coverage_value IS NULL OR coverage_value = 0);

-- J-Channel typically 12.5ft
UPDATE pricing_items
SET coverage_value = 12.5, coverage_unit = 'LF'
WHERE category IN ('j_channel', 'jchannel')
  AND (coverage_value IS NULL OR coverage_value = 0);

-- Starter strip (12ft standard)
UPDATE pricing_items
SET coverage_value = 12.0, coverage_unit = 'LF'
WHERE category IN ('starter', 'starter_strip')
  AND (coverage_value IS NULL OR coverage_value = 0);

-- Default for any remaining trim/corner products without coverage
UPDATE pricing_items
SET coverage_value = 12.0, coverage_unit = 'LF'
WHERE category IN ('trim', 'corner', 'outside_corner_trim', 'inside_corner_trim',
                   'outside_corner', 'inside_corner', 'frieze', 'fascia')
  AND (coverage_value IS NULL OR coverage_value = 0);

-- ============================================================================
-- Verify updates - show products with coverage_value set
-- ============================================================================

SELECT
  manufacturer,
  category,
  COUNT(*) as product_count,
  MIN(coverage_value) as min_coverage,
  MAX(coverage_value) as max_coverage
FROM pricing_items
WHERE category IN ('trim', 'corner', 'outside_corner_trim', 'inside_corner_trim',
                   'outside_corner', 'inside_corner', 'frieze', 'fascia',
                   'j_channel', 'starter', 'flashing')
  AND coverage_value IS NOT NULL
GROUP BY manufacturer, category
ORDER BY manufacturer, category;

-- Check for any products still missing coverage_value
SELECT sku, product_name, manufacturer, category, coverage_value
FROM pricing_items
WHERE category IN ('trim', 'corner', 'outside_corner_trim', 'inside_corner_trim',
                   'outside_corner', 'inside_corner', 'frieze', 'fascia',
                   'j_channel', 'starter', 'flashing')
  AND (coverage_value IS NULL OR coverage_value = 0)
ORDER BY manufacturer, category;
