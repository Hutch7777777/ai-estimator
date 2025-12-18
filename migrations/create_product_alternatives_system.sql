-- Migration: Create Product Alternatives/Substitutions System
-- Created: 2024-11-29
-- Purpose: Enable users to swap materials in estimates with equivalent, upgrade, or budget alternatives
--          Supports bidirectional lookups and automatic price impact calculation

-- =============================================================================
-- PRODUCT ALTERNATIVES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS product_alternatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  alternative_product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('equivalent', 'upgrade', 'downgrade', 'budget', 'premium')),
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent self-referencing
  CONSTRAINT no_self_reference CHECK (product_id != alternative_product_id),

  -- Prevent duplicate relationships
  CONSTRAINT unique_alternative UNIQUE (product_id, alternative_product_id)
);

-- Add helpful comment
COMMENT ON TABLE product_alternatives IS 'Maps products to their alternatives (equivalent, upgrade, budget) for estimate substitutions';
COMMENT ON COLUMN product_alternatives.relationship_type IS 'Type of relationship: equivalent, upgrade, downgrade, budget, premium';
COMMENT ON COLUMN product_alternatives.active IS 'Soft delete flag - set to false to disable an alternative without removing the record';

-- Create indexes for query performance
CREATE INDEX idx_product_alternatives_product_id ON product_alternatives(product_id) WHERE active = true;
CREATE INDEX idx_product_alternatives_alternative_id ON product_alternatives(alternative_product_id) WHERE active = true;
CREATE INDEX idx_product_alternatives_relationship ON product_alternatives(relationship_type) WHERE active = true;

-- =============================================================================
-- ROW-LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE product_alternatives ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read active alternatives
CREATE POLICY "Allow authenticated read access"
  ON product_alternatives
  FOR SELECT
  TO authenticated
  USING (active = true);

-- Future: Add policies for insert/update/delete based on roles
-- Example: CREATE POLICY "Allow admins to manage alternatives" ON product_alternatives FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');

-- =============================================================================
-- PRODUCT ALTERNATIVES VIEW (Denormalized for Easy Querying)
-- =============================================================================

CREATE OR REPLACE VIEW product_alternatives_view AS
SELECT
  pa.id,
  pa.relationship_type,
  pa.notes,
  pa.active,
  pa.created_at,

  -- Original product details
  p1.id AS product_id,
  p1.sku AS product_sku,
  p1.product_name AS product_name,
  p1.category AS product_category,
  p1.manufacturer AS product_manufacturer,

  -- Alternative product details
  p2.id AS alternative_id,
  p2.sku AS alternative_sku,
  p2.product_name AS alternative_name,
  p2.category AS alternative_category,
  p2.manufacturer AS alternative_manufacturer,

  -- Cost information (from physical_properties JSONB)
  COALESCE((p1.physical_properties->>'material_cost')::NUMERIC, 0) AS product_material_cost,
  COALESCE((p1.physical_properties->>'labor_cost')::NUMERIC, 0) AS product_labor_cost,
  COALESCE((p2.physical_properties->>'material_cost')::NUMERIC, 0) AS alternative_material_cost,
  COALESCE((p2.physical_properties->>'labor_cost')::NUMERIC, 0) AS alternative_labor_cost,

  -- Calculated price differences
  COALESCE((p2.physical_properties->>'material_cost')::NUMERIC, 0) -
    COALESCE((p1.physical_properties->>'material_cost')::NUMERIC, 0) AS material_cost_difference,
  COALESCE((p2.physical_properties->>'labor_cost')::NUMERIC, 0) -
    COALESCE((p1.physical_properties->>'labor_cost')::NUMERIC, 0) AS labor_cost_difference,

  -- Calculated price impact percentages
  CASE
    WHEN COALESCE((p1.physical_properties->>'material_cost')::NUMERIC, 0) > 0 THEN
      ROUND(
        ((COALESCE((p2.physical_properties->>'material_cost')::NUMERIC, 0) -
          COALESCE((p1.physical_properties->>'material_cost')::NUMERIC, 0)) /
         COALESCE((p1.physical_properties->>'material_cost')::NUMERIC, 1)) * 100,
        2
      )
    ELSE 0
  END AS material_cost_impact_percent,

  CASE
    WHEN COALESCE((p1.physical_properties->>'labor_cost')::NUMERIC, 0) > 0 THEN
      ROUND(
        ((COALESCE((p2.physical_properties->>'labor_cost')::NUMERIC, 0) -
          COALESCE((p1.physical_properties->>'labor_cost')::NUMERIC, 0)) /
         COALESCE((p1.physical_properties->>'labor_cost')::NUMERIC, 1)) * 100,
        2
      )
    ELSE 0
  END AS labor_cost_impact_percent

FROM product_alternatives pa
JOIN product_catalog p1 ON pa.product_id = p1.id
JOIN product_catalog p2 ON pa.alternative_product_id = p2.id
WHERE pa.active = true;

COMMENT ON VIEW product_alternatives_view IS 'Denormalized view of product alternatives with full product details and calculated price impacts';

-- =============================================================================
-- HELPER FUNCTION: Get Product Alternatives Grouped by Type
-- =============================================================================

CREATE OR REPLACE FUNCTION get_product_alternatives(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Build JSONB result grouped by relationship type
  SELECT jsonb_object_agg(
    relationship_type,
    alternatives
  ) INTO result
  FROM (
    SELECT
      relationship_type,
      jsonb_agg(
        jsonb_build_object(
          'id', alternative_id,
          'sku', alternative_sku,
          'name', alternative_name,
          'category', alternative_category,
          'manufacturer', alternative_manufacturer,
          'material_cost', alternative_material_cost,
          'labor_cost', alternative_labor_cost,
          'material_cost_difference', material_cost_difference,
          'labor_cost_difference', labor_cost_difference,
          'material_impact_percent', material_cost_impact_percent,
          'labor_impact_percent', labor_cost_impact_percent,
          'notes', notes
        ) ORDER BY alternative_name
      ) AS alternatives
    FROM product_alternatives_view
    WHERE product_id = p_product_id
    GROUP BY relationship_type
  ) grouped;

  -- Return empty object if no alternatives found
  RETURN COALESCE(result, '{}'::JSONB);
END;
$$;

COMMENT ON FUNCTION get_product_alternatives IS 'Returns all active alternatives for a product, grouped by relationship type (equivalent, upgrade, budget, etc.)';

-- Example usage:
-- SELECT get_product_alternatives('your-product-uuid-here');
-- Returns: {"equivalent": [...], "upgrade": [...], "budget": [...]}

-- =============================================================================
-- SAMPLE DATA: Common Product Substitutions
-- =============================================================================

-- HardiePlank ↔ LP SmartSide (Equivalent)
WITH hardie_plank AS (
  SELECT id FROM product_catalog
  WHERE product_name ILIKE '%HardiePlank%'
  LIMIT 1
),
lp_smartside AS (
  SELECT id FROM product_catalog
  WHERE product_name ILIKE '%LP SmartSide%' OR product_name ILIKE '%SmartSide%'
  LIMIT 1
)
INSERT INTO product_alternatives (product_id, alternative_product_id, relationship_type, notes, active)
SELECT
  hp.id,
  lp.id,
  'equivalent',
  'Similar quality fiber cement vs engineered wood siding - equivalent performance',
  true
FROM hardie_plank hp, lp_smartside lp
WHERE hp.id IS NOT NULL AND lp.id IS NOT NULL
ON CONFLICT (product_id, alternative_product_id) DO NOTHING;

-- Bidirectional: LP SmartSide → HardiePlank
WITH hardie_plank AS (
  SELECT id FROM product_catalog
  WHERE product_name ILIKE '%HardiePlank%'
  LIMIT 1
),
lp_smartside AS (
  SELECT id FROM product_catalog
  WHERE product_name ILIKE '%LP SmartSide%' OR product_name ILIKE '%SmartSide%'
  LIMIT 1
)
INSERT INTO product_alternatives (product_id, alternative_product_id, relationship_type, notes, active)
SELECT
  lp.id,
  hp.id,
  'equivalent',
  'Engineered wood vs fiber cement siding - equivalent performance',
  true
FROM lp_smartside lp, hardie_plank hp
WHERE lp.id IS NOT NULL AND hp.id IS NOT NULL
ON CONFLICT (product_id, alternative_product_id) DO NOTHING;

-- Primed → ColorPlus (Upgrade)
WITH primed_products AS (
  SELECT id FROM product_catalog
  WHERE product_name ILIKE '%Primed%'
    AND category = 'siding'
  LIMIT 1
),
colorplus_products AS (
  SELECT id FROM product_catalog
  WHERE (product_name ILIKE '%ColorPlus%' OR product_name ILIKE '%Color Plus%')
    AND category = 'siding'
  LIMIT 1
)
INSERT INTO product_alternatives (product_id, alternative_product_id, relationship_type, notes, active)
SELECT
  pr.id,
  cp.id,
  'upgrade',
  'Upgrade to pre-finished ColorPlus - eliminates need for field painting',
  true
FROM primed_products pr, colorplus_products cp
WHERE pr.id IS NOT NULL AND cp.id IS NOT NULL
ON CONFLICT (product_id, alternative_product_id) DO NOTHING;

-- ColorPlus → Primed (Budget/Downgrade)
WITH primed_products AS (
  SELECT id FROM product_catalog
  WHERE product_name ILIKE '%Primed%'
    AND category = 'siding'
  LIMIT 1
),
colorplus_products AS (
  SELECT id FROM product_catalog
  WHERE (product_name ILIKE '%ColorPlus%' OR product_name ILIKE '%Color Plus%')
    AND category = 'siding'
  LIMIT 1
)
INSERT INTO product_alternatives (product_id, alternative_product_id, relationship_type, notes, active)
SELECT
  cp.id,
  pr.id,
  'budget',
  'Budget alternative - requires field painting but lower material cost',
  true
FROM colorplus_products cp, primed_products pr
WHERE cp.id IS NOT NULL AND pr.id IS NOT NULL
ON CONFLICT (product_id, alternative_product_id) DO NOTHING;

-- HardiePlank → Allura (Budget Alternative)
WITH hardie_plank AS (
  SELECT id FROM product_catalog
  WHERE product_name ILIKE '%HardiePlank%'
  LIMIT 1
),
allura AS (
  SELECT id FROM product_catalog
  WHERE product_name ILIKE '%Allura%'
  LIMIT 1
)
INSERT INTO product_alternatives (product_id, alternative_product_id, relationship_type, notes, active)
SELECT
  hp.id,
  al.id,
  'budget',
  'Cost-effective fiber cement alternative with shorter warranty',
  true
FROM hardie_plank hp, allura al
WHERE hp.id IS NOT NULL AND al.id IS NOT NULL
ON CONFLICT (product_id, alternative_product_id) DO NOTHING;

-- Hardie Trim → PVC Trim (Equivalent/Budget)
WITH hardie_trim AS (
  SELECT id FROM product_catalog
  WHERE (product_name ILIKE '%Hardie%' AND product_name ILIKE '%Trim%')
    OR sku ILIKE '%TRIM%'
  LIMIT 1
),
pvc_trim AS (
  SELECT id FROM product_catalog
  WHERE product_name ILIKE '%PVC%Trim%'
    OR (category = 'trim' AND product_name ILIKE '%PVC%')
  LIMIT 1
)
INSERT INTO product_alternatives (product_id, alternative_product_id, relationship_type, notes, active)
SELECT
  ht.id,
  pt.id,
  'equivalent',
  'PVC trim - similar durability, lower weight, easier to install',
  true
FROM hardie_trim ht, pvc_trim pt
WHERE ht.id IS NOT NULL AND pt.id IS NOT NULL
ON CONFLICT (product_id, alternative_product_id) DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Count of product alternatives
SELECT COUNT(*) AS total_alternatives FROM product_alternatives;

-- View alternatives by relationship type
SELECT
  relationship_type,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE active = true) AS active_count
FROM product_alternatives
GROUP BY relationship_type
ORDER BY relationship_type;

-- Sample query using the view
SELECT
  product_name,
  alternative_name,
  relationship_type,
  material_cost_difference,
  material_cost_impact_percent,
  notes
FROM product_alternatives_view
ORDER BY product_name, relationship_type
LIMIT 10;

-- Test the function (replace with an actual product ID from your database)
-- SELECT get_product_alternatives((SELECT id FROM product_catalog LIMIT 1));
