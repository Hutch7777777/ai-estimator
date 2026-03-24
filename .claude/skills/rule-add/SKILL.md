---
name: rule-add
description: Structured workflow for adding auto-scope rules to siding_auto_scope_rules or auto_scope_rules_v2. Use this skill whenever adding a new material rule, accessory rule, consumable rule, or modifying an existing auto-scope rule. It prevents the most common failures — wrong presentation_group, missing manufacturer_filter syntax, serial PK collisions, and trigger_condition JSONB errors. Use when someone says "add a rule for...", "new auto-scope rule", "add material for...", or any time siding_auto_scope_rules is being modified.
---

# /rule-add — Auto-Scope Rule Addition Workflow

You are a database specialist who has added hundreds of auto-scope rules to this system. You know every gotcha and hidden constraint. Your job is to guide the addition of new rules without silent failures.

## Step 1: Gather Rule Requirements

Before writing any SQL, answer these questions:

1. **What material does this rule generate?**
   - Product name and SKU
   - Unit of measure (SF, LF, EA, pieces, box, tube, roll)

2. **When should this rule fire?**
   - Always? Only for specific manufacturers? Only when certain detections exist?
   - What measurement threshold triggers it? (min_corners, min_facade_area, etc.)

3. **How is the quantity calculated?**
   - What measurement variables are needed? (facade_sqft, outside_corner_count, window_perimeter_lf, etc.)
   - What waste factor applies?
   - What's the coverage per unit?

4. **Where does this appear in the takeoff?**
   - Which presentation_group? (siding, trim, accessories, flashing, fasteners, wrb, consumables)

## Step 2: Query Existing Rules (MANDATORY)

ALWAYS run these queries before inserting. Never skip this step.

```sql
-- 1. Get next rule_id
SELECT MAX(rule_id) as max_id FROM siding_auto_scope_rules;

-- 2. Find similar rules to match patterns
SELECT rule_id, rule_name, material_category, material_sku, 
       presentation_group, manufacturer_filter, trigger_condition,
       quantity_formula, unit, active
FROM siding_auto_scope_rules 
WHERE material_category LIKE '%similar_category%'
   OR presentation_group = 'target_group'
ORDER BY rule_id
LIMIT 5;

-- 3. Verify the SKU exists in pricing_items
SELECT id, sku, product_name, category, manufacturer, unit, material_cost
FROM pricing_items 
WHERE sku = 'TARGET-SKU' 
  AND active = true;

-- 4. Check for duplicate rule names
SELECT rule_id, rule_name 
FROM siding_auto_scope_rules 
WHERE rule_name ILIKE '%partial_name%';
```

## Step 3: Validate Before Insert

Check each field against known constraints:

### Column Validation

| Column | Type | Constraint | Common Mistake |
|--------|------|-----------|----------------|
| `rule_id` | serial | Must be MAX+1 or omit for auto | Assuming auto-increment is gap-free |
| `rule_name` | text | UNIQUE, NOT NULL | Duplicate names fail silently |
| `material_category` | text | Convention: `{trade}_{class}` | Not matching existing patterns |
| `material_sku` | text | Must exist in `pricing_items` | Typo in SKU |
| `quantity_formula` | text | JavaScript expression | Using `measurements.` prefix |
| `unit` | text | Must match pricing_items.unit | Mismatch causes wrong calculations |
| `trigger_condition` | jsonb | NULL = always fire | Forgetting `::jsonb` cast |
| `presentation_group` | text | Must match pipeline query | Wrong group = item disappears |
| `manufacturer_filter` | text[] | `ARRAY['Name']` syntax | Using JSON array or wrong case |
| `active` | boolean | Column is `active` NOT `is_active` | Wrong column name |
| `group_order` | integer | Controls section ordering | Missing = random placement |
| `item_order` | integer | Controls item ordering within group | Missing = random placement |

### Formula Variable Reference

Available variables in `quantity_formula` (no `measurements.` prefix):

```
facade_sqft, facade_area_sqft, gross_wall_area_sqft, net_siding_area_sqft
siding_squares (= facade_sqft / 100)
window_count, window_area_sqft, window_perimeter_lf
window_head_lf, window_sill_lf, window_jamb_lf
door_count, door_area_sqft, door_perimeter_lf
door_head_lf, door_jamb_lf
garage_count, garage_head_lf
outside_corner_count, outside_corner_lf
inside_corner_count, inside_corner_lf
trim_total_lf, trim_head_lf, trim_jamb_lf, trim_sill_lf
gable_rake_lf, roof_eave_lf, roof_rake_lf
belly_band_lf
openings_count (= window_count + door_count)
```

### Presentation Groups (must match exactly)

```
siding, board_and_batten, panel
trim, window_trim, corner_trim
accessories, flashing, fasteners
wrb, consumables, labor
```

## Step 4: Generate SQL

Use this template. All fields shown — omit only truly optional ones.

```sql
INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  presentation_group,
  group_order,
  item_order,
  priority,
  manufacturer_filter,
  active
) VALUES (
  'Rule Name Here',                              -- UNIQUE
  'Human-readable description of what this does',
  'trade_classname',                              -- e.g., 'siding_outside_corner'
  'SKU-HERE',                                     -- Must exist in pricing_items
  'Math.ceil(variable * waste_factor / coverage)', -- JavaScript expression
  'lf',                                           -- Unit of the calculated quantity
  NULL,                                           -- Output unit override (usually NULL)
  '{"min_facade_area": 1}'::jsonb,               -- NULL = always fire
  'trim',                                         -- Must match pipeline groups
  20,                                             -- Section order in takeoff
  1,                                              -- Item order within section
  50,                                             -- Priority (lower = evaluated first)
  ARRAY['James Hardie'],                          -- NULL = all manufacturers
  true                                            -- Column is `active`, NOT `is_active`
);
```

## Step 5: Verify After Insert

```sql
-- Confirm rule was inserted
SELECT rule_id, rule_name, active, presentation_group, manufacturer_filter
FROM siding_auto_scope_rules
WHERE rule_name = 'Rule Name Here';

-- Dry-run the formula with test values
SELECT 
  rule_name,
  quantity_formula,
  -- Mentally evaluate: if facade_sqft=4494, does the formula produce a reasonable number?
  presentation_group
FROM siding_auto_scope_rules
WHERE rule_id = [NEW_ID];
```

## Common Rule Patterns

### Consumable Rule (WhiteWood trim system)
```sql
-- Fires when trim_system = 'whitewood' and consumable toggle is enabled
trigger_condition: '{"trim_system": "whitewood", "consumables": true}'::jsonb
```

### Manufacturer-Specific Rule
```sql
-- Only fires for James Hardie products
manufacturer_filter: ARRAY['James Hardie']
-- Uses manufacturer-specific SF, not project total
```

### Detection-Count Rule
```sql
-- Based on detection counts (corners, gable topouts)
quantity_formula: 'outside_corner_count * facade_height_ft * 1.05'
trigger_condition: '{"min_corners": 1}'::jsonb
```

### Area-Scoped Rule (material_category)
```sql
-- Only uses area from specific material category
trigger_condition: '{"material_category": "board_batten", "min_facade_area": 1}'::jsonb
-- Formula will use board_batten SF, not total facade SF
```

## REMINDER

All SQL must be run manually in Supabase SQL Editor. The Supabase MCP is read-only.
