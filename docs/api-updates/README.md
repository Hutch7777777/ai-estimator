# Manufacturer-Aware Auto-Scope Implementation

This directory contains the implementation files for adding per-manufacturer auto-scope rules to the exterior-estimation-api.

## Overview

**Problem:** A single project can have multiple siding manufacturers on different facades:
- Facade A: James Hardie (800 SF) → nails, caulk, primer
- Facade B: FastPlank (700 SF) → clips, screws, connectors

Auto-scope rules must calculate quantities based on each manufacturer's square footage only, not total project area.

**Solution:** Add `manufacturer_filter` column to auto-scope rules:
- `NULL` = Generic rule (applies to total project SF)
- `['James Hardie']` = Only applies to James Hardie SF
- `['Engage Building Products']` = Only applies to FastPlank SF

## Files to Modify

### 1. `src/types/autoscope.ts`
Add the new types from `autoscope-types.ts`:
- `ManufacturerMeasurements` interface
- `ManufacturerGroups` type alias

### 2. `src/calculations/siding/autoscope-v2.ts`
Apply changes from `autoscope-v2-changes.ts`:
- Add `manufacturer_filter` to `DbAutoScopeRule` interface
- Add `buildManufacturerGroups()` function
- Add `buildManufacturerContext()` function
- Update `generateAutoScopeItemsV2()` to apply rules per-manufacturer

### 3. `src/calculations/siding/orchestrator-v2.ts`
Apply changes from `orchestrator-v2-changes.ts`:
- Import `buildManufacturerGroups`
- Build manufacturer groups before calling auto-scope
- Pass `manufacturerGroups` to `generateAutoScopeItemsV2()`

### 4. `src/services/pricing.ts`
Verify from `pricing-service-changes.ts`:
- `PricingItem` interface includes `manufacturer` field
- `getPricingByIds()` returns manufacturer in results

## Database Migration

Run this SQL to add the `manufacturer_filter` column:

```sql
-- Add manufacturer_filter column to auto_scope_rules table
ALTER TABLE siding_auto_scope_rules
ADD COLUMN IF NOT EXISTS manufacturer_filter TEXT[] DEFAULT NULL;

COMMENT ON COLUMN siding_auto_scope_rules.manufacturer_filter IS
  'Array of manufacturer names this rule applies to. NULL = generic rule (all manufacturers), specific values = manufacturer-specific rule.';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_auto_scope_rules_manufacturer_filter
ON siding_auto_scope_rules USING GIN (manufacturer_filter);
```

## Example Rules

### Generic Rules (apply to total project SF)

```sql
-- HardieWrap - applies to ALL siding (total 1500 SF in example)
INSERT INTO siding_auto_scope_rules (
  rule_name, material_sku, quantity_formula,
  manufacturer_filter, trigger_condition, presentation_group
) VALUES (
  'HardieWrap Weather Barrier',
  'HWRAP-9X100',
  'Math.ceil(facade_area_sqft / 1350)',
  NULL,  -- NULL = total project area
  '{"always": true}',
  'Flashing & Weatherproofing'
);

-- Head Flashing - applies to ALL openings
INSERT INTO siding_auto_scope_rules (
  rule_name, material_sku, quantity_formula,
  manufacturer_filter, trigger_condition, presentation_group
) VALUES (
  'Head Flashing',
  'FLASH-HEAD-10',
  'Math.ceil(trim_head_lf * 1.1 / 10)',
  NULL,
  '{"min_openings": 1}',
  'Flashing & Weatherproofing'
);
```

### James Hardie Rules (apply only to Hardie SF)

```sql
-- Siding Nails - only for James Hardie siding (800 SF in example)
INSERT INTO siding_auto_scope_rules (
  rule_name, material_sku, quantity_formula,
  manufacturer_filter, trigger_condition, presentation_group
) VALUES (
  'Siding Nails (Stainless Steel)',
  'NAIL-JH-SS-1LB',
  'Math.ceil(facade_area_sqft / 100)',
  ARRAY['James Hardie'],  -- Only for Hardie products
  '{"always": true}',
  'Fasteners'
);

-- ColorMatch Caulk - only for James Hardie
INSERT INTO siding_auto_scope_rules (
  rule_name, material_sku, quantity_formula,
  manufacturer_filter, trigger_condition, presentation_group
) VALUES (
  'ColorMatch Caulk',
  'CAULK-JH-COLORMATCH',
  'Math.ceil(openings_perimeter_lf / 25)',
  ARRAY['James Hardie'],
  '{"min_openings": 1}',
  'Accessories'
);

-- Starter Strip - only for James Hardie
INSERT INTO siding_auto_scope_rules (
  rule_name, material_sku, quantity_formula,
  manufacturer_filter, trigger_condition, presentation_group
) VALUES (
  'Starter Strip 12ft',
  'JH-START-12',
  'Math.ceil(level_starter_lf * 1.1 / 12)',
  ARRAY['James Hardie'],
  '{"always": true}',
  'Accessories'
);
```

### FastPlank Rules (apply only to FastPlank SF)

```sql
-- FastPlank Clips - only for FastPlank siding (700 SF in example)
INSERT INTO siding_auto_scope_rules (
  rule_name, material_sku, quantity_formula,
  manufacturer_filter, trigger_condition, presentation_group
) VALUES (
  'FastPlank Plank Clips (100/bag)',
  'FP-P22-CLIP',
  'Math.ceil(facade_area_sqft / 90)',
  ARRAY['Engage Building Products'],  -- FastPlank manufacturer
  '{"always": true}',
  'Fasteners'
);

-- FastPlank Wood Screws
INSERT INTO siding_auto_scope_rules (
  rule_name, material_sku, quantity_formula,
  manufacturer_filter, trigger_condition, presentation_group
) VALUES (
  'FastPlank Wood Screws (250/bag)',
  'FP-WS112',
  'Math.ceil(facade_area_sqft / 200)',
  ARRAY['Engage Building Products'],
  '{"always": true}',
  'Fasteners'
);

-- FastPlank Starter J
INSERT INTO siding_auto_scope_rules (
  rule_name, material_sku, quantity_formula,
  manufacturer_filter, trigger_condition, presentation_group
) VALUES (
  'FastPlank Perforated Starter J 12ft',
  'FP-P41-STARTER',
  'Math.ceil(level_starter_lf * 1.1 / 12)',
  ARRAY['Engage Building Products'],
  '{"always": true}',
  'Accessories'
);

-- FastPlank Top J-Trim
INSERT INTO siding_auto_scope_rules (
  rule_name, material_sku, quantity_formula,
  manufacturer_filter, trigger_condition, presentation_group
) VALUES (
  'FastPlank Top J-Trim 12ft',
  'FP-P11-JTRIM',
  'Math.ceil(level_starter_lf * 1.1 / 12)',
  ARRAY['Engage Building Products'],
  '{"always": true}',
  'Accessories'
);

-- FastPlank Corner
INSERT INTO siding_auto_scope_rules (
  rule_name, material_sku, quantity_formula,
  manufacturer_filter, trigger_condition, presentation_group
) VALUES (
  'FastPlank Outside Corner 12ft',
  'FP-P10-CORNER',
  'Math.ceil((outside_corners_count + inside_corners_count) * facade_height_ft / 12)',
  ARRAY['Engage Building Products'],
  '{"min_corners": 1}',
  'Corners'
);
```

## Expected Behavior

### Input: Mixed Project
- 800 SF James Hardie (HardiePlank)
- 700 SF FastPlank (aluminum siding)
- 220 LF total trim/starter

### Output: Auto-Scope Line Items

| Item | Quantity | Source |
|------|----------|--------|
| HardieWrap Weather Barrier | 2 rolls | 1500 SF total |
| Head Flashing | varies | Total openings |
| Siding Nails (Hardie) | 8 boxes | 800 SF Hardie |
| ColorMatch Caulk | 2 tubes | 800 SF Hardie openings |
| Starter Strip (Hardie) | 11 pcs | 120 LF Hardie |
| FastPlank Clips | 8 bags | 700 SF FastPlank |
| FastPlank Screws | 4 bags | 700 SF FastPlank |
| FastPlank Starter J | 10 pcs | 100 LF FastPlank |
| FastPlank Top J-Trim | 10 pcs | 100 LF FastPlank |
| FastPlank Corner | varies | FastPlank corners |

## Test Cases

### Test 1: Single Manufacturer (James Hardie Only)
```typescript
const materialAssignments = [
  { pricing_item_id: 'hardie-plank-uuid', quantity: 1500, unit: 'SF' }
];

// Expected: Hardie accessories + generic WRB
// Should NOT include FastPlank accessories
```

### Test 2: Single Manufacturer (FastPlank Only)
```typescript
const materialAssignments = [
  { pricing_item_id: 'fastplank-uuid', quantity: 1500, unit: 'SF' }
];

// Expected: FastPlank accessories + generic WRB
// Should NOT include Hardie accessories
```

### Test 3: Mixed Manufacturers
```typescript
const materialAssignments = [
  { pricing_item_id: 'hardie-plank-uuid', quantity: 800, unit: 'SF' },
  { pricing_item_id: 'fastplank-uuid', quantity: 700, unit: 'SF' }
];

// Expected:
// - Hardie accessories for 800 SF
// - FastPlank accessories for 700 SF
// - Generic WRB for 1500 SF total
```

### Test 4: No Material Assignments (Webhook Only)
```typescript
const webhookMeasurements = { facade_sqft: 1500 };
const materialAssignments = [];

// Expected: Generic rules only (no manufacturer-specific rules)
// No manufacturer groups = skip manufacturer-specific rules
```

## Verification

After implementation, verify with this console output:

```
🏭 Building manufacturer groups from material assignments...
[AutoScope] Fetched pricing for 2/2 items
[AutoScope] Built 2 manufacturer groups:
  James Hardie:
    - Area: 800.00 SF
    - Linear: 120.00 LF
    - Pieces: 0
    - Detections: 5
  Engage Building Products:
    - Area: 700.00 SF
    - Linear: 100.00 LF
    - Pieces: 0
    - Detections: 4

📋 Evaluating 25 auto-scope rules...
   Total project area: 1500.00 SF
   Manufacturer groups: James Hardie, Engage Building Products
  ✓ Rule 1: HardieWrap Weather Barrier [GENERIC: 1500 SF] → 2 ROLL (always=true)
  ✓ Rule 5: Siding Nails [James Hardie: 800 SF] → 8 BOX (always=true)
  ✓ Rule 6: ColorMatch Caulk [James Hardie: 800 SF] → 2 TUBE (openings >= 1)
  ✓ Rule 10: FastPlank Clips [Engage Building Products: 700 SF] → 8 BAG (always=true)
  ✓ Rule 11: FastPlank Screws [Engage Building Products: 700 SF] → 4 BAG (always=true)
  ...

✅ Auto-scope V2 complete: 15/25 rules triggered, 15 line items
```

## Rollback

If you need to rollback:

```sql
-- Remove manufacturer_filter column
ALTER TABLE siding_auto_scope_rules
DROP COLUMN IF EXISTS manufacturer_filter;

-- Drop index
DROP INDEX IF EXISTS idx_auto_scope_rules_manufacturer_filter;
```

Then revert the code changes to the previous version.
