-- ============================================================================
-- STONE VENEER AUTO-SCOPE RULES MIGRATION
-- From: auto_scope_rules (wrong) → To: siding_auto_scope_rules (correct)
--
-- The Railway API queries siding_auto_scope_rules, but stone veneer rules
-- were mistakenly added to auto_scope_rules.
-- ============================================================================

-- Insert stone veneer rules into the correct table
INSERT INTO siding_auto_scope_rules (
    rule_name,
    description,
    material_category,
    quantity_formula,
    unit,
    output_unit,
    trigger_condition,
    priority,
    active,
    material_sku,
    presentation_group,
    group_order,
    item_order,
    manufacturer_filter
)
SELECT
    rule_name,
    description,
    category AS material_category,
    quantity_formula,
    quantity_unit AS unit,
    quantity_unit AS output_unit,
    CASE
        WHEN condition_type = 'always' THEN '{"always": true}'::jsonb
        WHEN condition_type = 'measurement_based' THEN
            CASE
                WHEN rule_name LIKE '%corner%' THEN '{"min_corners": 1}'::jsonb
                WHEN rule_name LIKE '%window%' OR rule_name LIKE '%sill%' THEN '{"min_openings": 1}'::jsonb
                WHEN rule_name LIKE '%flashing%' THEN '{"min_openings": 1}'::jsonb
                ELSE '{"always": true}'::jsonb
            END
        ELSE '{"always": true}'::jsonb
    END AS trigger_condition,
    priority,
    active,
    material_sku,
    CASE
        WHEN category IN ('substrate', 'wrb') THEN 'Substrate & WRB'
        WHEN category IN ('mortar', 'grout') THEN 'Mortar & Grout'
        WHEN category LIKE '%corner%' THEN 'Trim & Corners'
        WHEN category IN ('stone_sills', 'stone_caps') THEN 'Sills & Caps'
        WHEN category = 'flashing' THEN 'Flashing'
        WHEN category IN ('fastener', 'fasteners') THEN 'Fasteners & Accessories'
        WHEN category IN ('sealer', 'sealant') THEN 'Caulk & Sealants'
        ELSE 'Other Materials'
    END AS presentation_group,
    CASE
        WHEN category IN ('substrate', 'wrb') THEN 10
        WHEN category IN ('mortar', 'grout') THEN 20
        WHEN category LIKE '%corner%' THEN 30
        WHEN category IN ('stone_sills', 'stone_caps') THEN 40
        WHEN category = 'flashing' THEN 50
        WHEN category IN ('fastener', 'fasteners') THEN 60
        WHEN category IN ('sealer', 'sealant') THEN 70
        ELSE 80
    END AS group_order,
    priority AS item_order,
    manufacturer_filter
FROM auto_scope_rules
WHERE rule_name LIKE 'stone_veneer%';

-- ============================================================================
-- VERIFICATION QUERY
-- Run this after migration to confirm 14 rules were migrated
-- ============================================================================

-- SELECT rule_name, material_sku, presentation_group, manufacturer_filter
-- FROM siding_auto_scope_rules
-- WHERE rule_name LIKE '%stone_veneer%' OR manufacturer_filter::text LIKE '%Coronado%'
-- ORDER BY priority;

-- Expected: 14 rules migrated
