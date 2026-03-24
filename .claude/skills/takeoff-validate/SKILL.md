---
name: takeoff-validate
description: End-to-end validation of takeoff output against known-good baselines. Use this skill after ANY change to the calculation engine, auto-scope rules, pricing data, or detection pipeline. It runs the MN568 reference project through the full pipeline and diffs the output against expected totals by category. Use when someone says "validate the takeoff", "check MN568", "did that change break anything", "regression test", or after any deploy that touches calculations. Also use proactively after any /calc-engine or /rule-add session.
---

# /takeoff-validate — Takeoff Regression Validation

You are the QA engineer for takeoff accuracy. Your job is to catch regressions before they reach contractors. A wrong number means a bad bid.

## Reference Project: MN568

```
Project ID:    f7e2fc2b-...
Extraction ID: 240e222e-0419-421c-97fa-18a691b40cdb
Organization:  45aaa69c-8146-43b2-aef1-e2fe6fabcd86 (Exterior Finishes LLC)
```

This project is the primary validation target because it has a known manual takeoff to compare against.

---

## Baseline Totals (Update After Each Validated Change)

```
Last validated: [DATE]
Last validated by: [WHO]

Material totals by category:
  Siding materials:    $______
  Trim materials:      $______
  Accessories:         $______
  Flashing:            $______
  Fasteners:           $______
  WRB:                 $______
  Consumables:         $______
  
Labor totals:
  Installation labor:  $______
  Overhead (L&I):      $______
  
Project totals:
  Subtotal:            $______
  Markup:              $______
  Grand total:         $______
  
Known gap vs manual:   ~$2,343 (as of last session)
Gap breakdown:
  - WRB labor formula:          $______
  - Belly band LF (81 vs 340):  $______
  - Corner trim rules:          $______
  - Specialty labor:            $______
```

---

## Validation Steps

### Step 1: Query Current Output

```sql
-- Get latest takeoff for MN568
SELECT t.id as takeoff_id, t.created_at, t.status,
       t.total_material_cost, t.total_labor_cost, t.grand_total
FROM takeoffs t
JOIN extractions e ON e.id = t.extraction_id
WHERE e.id = '240e222e-0419-421c-97fa-18a691b40cdb'
ORDER BY t.created_at DESC
LIMIT 1;
```

### Step 2: Line Item Breakdown

```sql
-- Get all line items grouped by presentation_group
SELECT 
  presentation_group,
  COUNT(*) as item_count,
  SUM(extended_material_cost) as material_total,
  SUM(extended_labor_cost) as labor_total
FROM takeoff_line_items
WHERE takeoff_id = '[TAKEOFF_ID]'
GROUP BY presentation_group
ORDER BY presentation_group;
```

### Step 3: Diff Against Baseline

For each category, compute:
```
Category         | Baseline | Current | Delta    | Status
─────────────────┼──────────┼─────────┼──────────┼────────
Siding           | $X       | $Y      | +/-$Z    | ✅/🔴
Trim             | $X       | $Y      | +/-$Z    | ✅/🔴
Accessories      | $X       | $Y      | +/-$Z    | ✅/🔴
Flashing         | $X       | $Y      | +/-$Z    | ✅/🔴
Fasteners        | $X       | $Y      | +/-$Z    | ✅/🔴
WRB              | $X       | $Y      | +/-$Z    | ✅/🔴
Labor            | $X       | $Y      | +/-$Z    | ✅/🔴
─────────────────┼──────────┼─────────┼──────────┼────────
TOTAL            | $X       | $Y      | +/-$Z    | ✅/🔴
Gap vs manual    | $2,343   | $?      | +/-$Z    | ✅/🔴
```

### Step 4: Check for Missing Items

```sql
-- Items that should exist but don't
-- Check against expected presentation groups
SELECT DISTINCT presentation_group 
FROM takeoff_line_items 
WHERE takeoff_id = '[TAKEOFF_ID]';

-- Expected groups: siding, trim, accessories, flashing, 
--                  fasteners, wrb, consumables, labor
```

### Step 5: Check for New/Unexpected Items

```sql
-- Items that weren't in the baseline
SELECT description, quantity, unit, extended_material_cost, presentation_group
FROM takeoff_line_items
WHERE takeoff_id = '[TAKEOFF_ID]'
  AND description NOT IN (
    -- List of expected items from baseline
    -- Update this list as baseline evolves
  );
```

### Step 6: Quantity Sanity Checks

```sql
-- Flag any items with suspicious quantities
SELECT description, quantity, unit, extended_material_cost
FROM takeoff_line_items
WHERE takeoff_id = '[TAKEOFF_ID]'
  AND (
    quantity <= 0
    OR quantity > 10000
    OR extended_material_cost <= 0
    OR extended_material_cost IS NULL
  );
```

---

## Pass/Fail Criteria

| Condition | Result |
|-----------|--------|
| Total gap decreased or unchanged | ✅ PASS |
| Total gap increased by < $100 | ⚠️ REVIEW — might be acceptable |
| Total gap increased by > $100 | 🔴 FAIL — investigate before deploying |
| Any category went to $0 | 🔴 FAIL — rules stopped firing |
| Any NaN or NULL in totals | 🔴 FAIL — formula error |
| New items appeared unexpectedly | ⚠️ REVIEW — might be intentional |
| Items disappeared | 🔴 FAIL — rule or presentation_group regression |

---

## Output Format

```
## Takeoff Validation: [Date] — [What Changed]

**Result:** ✅ PASS / ⚠️ REVIEW / 🔴 FAIL

**Gap vs Manual Takeoff:**
- Before: $2,343
- After: $X
- Direction: IMPROVED / REGRESSED / SAME

**Category Diff:**
[Table from Step 3]

**Issues Found:**
- [None / List issues]

**Recommendation:** SAFE TO DEPLOY / DO NOT DEPLOY / DEPLOY WITH CAVEAT

**Baseline Updated:** YES — new baseline recorded / NO — using previous baseline
```

---

## Updating the Baseline

When a change is validated and deployed, update the baseline totals at the top of this file. Include the date and what changed. The baseline is the source of truth for future regressions.
