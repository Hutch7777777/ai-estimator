---
name: material-onboard
description: Complete workflow for onboarding new materials, products, or manufacturers into EstimatePros.ai. Use this skill whenever adding a new siding product line, trim product, accessory, or entire manufacturer. Covers all 10 phases from the Material Onboarding SOP — pricing_items insertion, auto-scope rule creation, labor configuration, calculation formulas, overhead costs, trade configuration UI, verification, and testing. Use when someone says "add a new manufacturer", "onboard Nichiha products", "add LP SmartSide", or any time new products are being integrated into the system.
---

# /material-onboard — Material Onboarding Workflow

You are following the Material Onboarding SOP. This is a 10-phase process and NO phase should be skipped. Track progress with the checklist below.

## Master Checklist

Mark each phase as you complete it:

```
Phase 1:  [ ] Information Gathering (installation guide PDF, product specs)
Phase 2:  [ ] Database Product Catalog (pricing_items entries)
Phase 3:  [ ] Auto-Scope Rules (siding_auto_scope_rules entries)
Phase 4:  [ ] Labor Configuration (labor_class linkage)
Phase 5:  [ ] Calculation Formulas (if new formulas needed)
Phase 6:  [ ] Overhead Costs (verify existing rates apply)
Phase 7:  [ ] Trade Configuration UI (manufacturer dropdown)
Phase 8:  [ ] Verification Queries (all products discoverable)
Phase 9:  [ ] Frontend Integration (Detection Editor options)
Phase 10: [ ] Documentation (update change log)
```

---

## Phase 1: Information Gathering

Before writing any SQL, collect:

- [ ] Installation guide PDF from manufacturer
- [ ] Product catalog with SKUs, dimensions, coverage
- [ ] Pricing (material cost per unit)
- [ ] Available textures (smooth, cedarmill, stucco, etc.)
- [ ] Available sizes (6.25", 8.25", etc. for lap siding; 4x8, 4x10 for panels)
- [ ] ColorPlus / factory-painted options and pricing
- [ ] Trim product line and sizes
- [ ] Manufacturer-specific accessories (starter strips, flashing, etc.)

**Key question:** Does this manufacturer require different auto-scope rules than James Hardie? If yes, you'll need manufacturer-filtered rules.

---

## Phase 2: Product Catalog

### Pre-flight
```sql
-- Get current active pricing snapshot
SELECT id, name, active FROM pricing_snapshots WHERE active = true;

-- Check existing products for this manufacturer
SELECT sku, product_name, category, unit, material_cost 
FROM pricing_items 
WHERE manufacturer ILIKE '%manufacturer_name%'
  AND active = true;
```

### Required Products (minimum viable set)

For a siding manufacturer, you need at minimum:

| Category | Example | Required |
|----------|---------|----------|
| Lap siding (each width) | 8.25" x 12ft | Yes |
| Panel siding (if offered) | 4x8 Smooth | If applicable |
| Board & batten (if offered) | 4x8 Grooved | If applicable |
| Outside corner | 3/4" x 3/4" x 10ft | Yes |
| Inside corner | - | If manufacturer makes them |
| Trim boards (each width) | 3.5", 5.5", 7.25", 11.25" | Yes |
| Starter strip | - | If manufacturer-specific |
| Touch-up paint | - | If ColorPlus |

### Insert Template

```sql
DO $$
DECLARE
  v_snapshot_id uuid := '[SNAPSHOT_ID]';
BEGIN
  INSERT INTO pricing_items (
    snapshot_id, sku, product_name, category, trade, unit,
    material_cost, manufacturer, texture, coverage_value, coverage_unit,
    reveal_inches, is_colorplus, labor_class, notes, active
  ) VALUES
    (v_snapshot_id, 'MFG-LAP-825-PR', 'Manufacturer Lap 8.25" x 12ft Primed',
     'lap_siding', 'siding', 'ea', 15.25, 'Manufacturer Name', 'smooth',
     7.0, 'SF', 7.0, false, 'Lap Siding Installation', 'Standard', true)
  ON CONFLICT (sku) DO NOTHING;
END $$;
```

**Critical:** Every product MUST have `labor_class` set. This links to `labor_rates.rate_name` for labor cost calculation.

---

## Phase 3: Auto-Scope Rules

Use the `/rule-add` skill for each rule. At minimum, a new manufacturer needs:

| Rule Type | Example | When |
|-----------|---------|------|
| WRB / Housewrap | HardieWrap or Tyvek | Always |
| Nails / Fasteners | Siding nails per SF | Always |
| Caulk | Color-match caulk | Always |
| Starter strip | Manufacturer starter | If manufacturer-specific |
| Outside corner trim | Manufacturer corners | If manufacturer corners exist |
| Touch-up paint | Factory paint touch-up | If ColorPlus/factory-painted |

**Manufacturer-specific rules** need `manufacturer_filter = ARRAY['Manufacturer Name']`.

**Generic rules** (WRB, nails, caulk) usually don't need manufacturer filtering — they fire for all manufacturers.

---

## Phase 4: Labor Configuration

```sql
-- Verify labor_class exists for each product category
SELECT DISTINCT labor_class 
FROM pricing_items 
WHERE manufacturer = 'Manufacturer Name';

-- Each labor_class must match a labor_rates.rate_name
SELECT rate_name, trade, unit, base_rate 
FROM labor_rates 
WHERE rate_name IN ('Lap Siding Installation', 'Trim Installation', 'Panel Installation');
```

If a new labor class is needed:
```sql
INSERT INTO labor_rates (rate_name, trade, unit, base_rate, description)
VALUES ('New Labor Class', 'siding', 'SF', 3.50, 'Description');
```

---

## Phase 5: Calculation Formulas

Usually NOT needed for new manufacturers if they use standard siding types. Only add formulas if the manufacturer has a unique installation method.

Check existing formulas:
```sql
SELECT formula_name, trade, parameters 
FROM calculation_formulas 
WHERE trade = 'siding';
```

---

## Phase 6: Overhead Costs

Verify existing overhead rates apply (they usually do — overhead is not manufacturer-specific):
```sql
SELECT cost_name, cost_type, rate, unit 
FROM overhead_costs 
WHERE trade = 'siding' AND active = true;
```

---

## Phase 7: Trade Configuration UI

Update the manufacturer dropdown in the frontend:
```sql
-- Check current trade configuration
SELECT config_key, config_value 
FROM trade_configurations 
WHERE trade = 'siding' 
  AND config_key = 'available_manufacturers';

-- Add new manufacturer to the JSONB array
UPDATE trade_configurations 
SET config_value = config_value || '"Manufacturer Name"'
WHERE trade = 'siding' 
  AND config_key = 'available_manufacturers';
```

---

## Phase 8: Verification

Run ALL verification queries:

```sql
-- 1. All products are discoverable
SELECT COUNT(*) as product_count, 
       COUNT(DISTINCT category) as categories
FROM pricing_items 
WHERE manufacturer = 'Manufacturer Name' AND active = true;

-- 2. All products have labor_class
SELECT sku, product_name, labor_class 
FROM pricing_items 
WHERE manufacturer = 'Manufacturer Name' 
  AND labor_class IS NULL 
  AND active = true;
-- Should return 0 rows

-- 3. All auto-scope rules are active
SELECT rule_id, rule_name, active, manufacturer_filter 
FROM siding_auto_scope_rules 
WHERE manufacturer_filter @> ARRAY['Manufacturer Name']
   OR rule_name ILIKE '%manufacturer%';

-- 4. SKUs referenced in rules exist in pricing_items
SELECT r.rule_name, r.material_sku, p.id as pricing_id
FROM siding_auto_scope_rules r
LEFT JOIN pricing_items p ON p.sku = r.material_sku
WHERE r.manufacturer_filter @> ARRAY['Manufacturer Name']
  AND p.id IS NULL;
-- Should return 0 rows (no orphaned SKUs)
```

---

## Phase 9: Frontend Integration

If new detection classes are needed:
- Add to Detection Editor class options
- Add `detection_class_material_mapping` entries
- Follow `{trade}_{class_name}` naming convention

---

## Phase 10: Documentation

Log the change:
```markdown
## Change: Added [Manufacturer Name] to Siding Trade
**Date:** [DATE]
**Products Added:** [COUNT]
**Rules Added:** [COUNT]
**Testing:** Verified with [PROJECT_NAME]
```

## REMINDER

All SQL must be run manually in Supabase SQL Editor. The Supabase MCP is read-only.
