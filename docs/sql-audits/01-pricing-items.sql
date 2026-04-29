-- ============================================================================
-- 01 — Pricing items audit
-- Phase 1.1 — Database Truth Audit
-- Read-only. No mutations.
--
-- Goal: confirm whether DET-CORBEL, DET-BRACKET, DET-SHUTTER, and belly-band
-- SKUs exist in pricing_items, and surface their material/labor values so the
-- Phase 1 seed work can compare against the n8n hardcoded values flagged in
-- ARCHITECTURE_VIOLATION_REPORT.md (corbel $45, bracket $35, shutter $120).
-- ============================================================================

-- 1a. Check by SKU literal (the canonical detection-driven SKUs).
SELECT
  sku,
  product_name,
  manufacturer,
  category,
  trade,
  unit,
  material_cost,
  base_labor_cost,
  total_labor_cost,
  is_colorplus
FROM pricing_items
WHERE sku IN ('DET-CORBEL', 'DET-BRACKET', 'DET-SHUTTER')
ORDER BY sku;

-- 1b. Check belly-band SKUs by category and product_name pattern. The exact
--     SKU naming may vary; this query surfaces every row that looks like a
--     belly-band so the audit can record the actual SKU set.
SELECT
  sku,
  product_name,
  manufacturer,
  category,
  trade,
  unit,
  material_cost,
  base_labor_cost,
  total_labor_cost,
  is_colorplus
FROM pricing_items
WHERE
  category ILIKE '%belly%band%'
  OR category ILIKE '%band%board%'
  OR product_name ILIKE '%belly%band%'
  OR sku ILIKE '%BELLY%'
  OR sku ILIKE '%BAND-BOARD%'
ORDER BY sku;

-- 1c. Detection class → default product SKU mapping. Confirms each detection
--     class has a default SKU and that the SKU resolves to a pricing_items row.
SELECT
  m.class_name,
  m.display_name,
  m.measurement_type,
  m.default_product_sku,
  p.sku            AS resolves_to_sku,
  p.product_name,
  p.material_cost,
  p.total_labor_cost,
  CASE
    WHEN m.default_product_sku IS NULL THEN 'NO_SKU_MAPPED'
    WHEN p.sku IS NULL THEN 'SKU_MISSING_IN_PRICING_ITEMS'
    ELSE 'OK'
  END AS status
FROM detection_class_material_mapping m
LEFT JOIN pricing_items p ON p.sku = m.default_product_sku
WHERE m.active = true
ORDER BY status, m.class_name;

-- 1d. Cross-reference: which detection classes are in the orchestrator's
--     handledDetectionKeys set (corbel, bracket, shutter, post, column,
--     belly_band, soffit, fascia, gutter, downspout, gable_topout, vent,
--     gable_vent, outlet, hose_bib, light_fixture)? Surface gaps.
SELECT
  expected.class_name,
  m.display_name,
  m.default_product_sku,
  p.sku IS NOT NULL AS has_pricing_row,
  m.class_name IS NOT NULL AS has_mapping_row
FROM (
  VALUES
    ('corbel'), ('bracket'), ('shutter'), ('post'), ('column'),
    ('belly_band'), ('soffit'), ('fascia'), ('gutter'), ('downspout'),
    ('gable_topout'), ('vent'), ('gable_vent'), ('outlet'),
    ('hose_bib'), ('light_fixture')
) AS expected(class_name)
LEFT JOIN detection_class_material_mapping m
  ON m.class_name = expected.class_name AND m.active = true
LEFT JOIN pricing_items p
  ON p.sku = m.default_product_sku
ORDER BY expected.class_name;
