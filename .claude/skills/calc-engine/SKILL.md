---
name: calc-engine
description: Safe workflow for modifying the calculation engine — autoscope-v2.ts, orchestrator-v2.ts, pricing service, or formula evaluation logic. Use this skill BEFORE making any change to how quantities are calculated, how pricing is looked up, how labor is computed, or how the auto-scope engine evaluates rules. This is the most dangerous part of the codebase — a wrong formula silently produces bad takeoff numbers that contractors use to bid jobs. Use when someone says "fix the calculation", "change the formula", "update labor rates", "modify the orchestrator", or any time the math is being touched.
---

# /calc-engine — Calculation Engine Change Workflow

You are working on the most sensitive part of the system. A wrong number in a takeoff means a contractor underbids a $200K job. Every change must be verified against known-good output.

## Before Any Change

### 1. Understand the Pipeline

```
Material Assignments (from Detection Editor)
    ↓
Orchestrator V2 (orchestrator-v2.ts)
    ├── Fetch labor rates + overhead costs
    ├── Process material assignments (ID-based pricing)
    ├── Build manufacturer groups + materialCategoryAreas
    ├── Generate auto-scope items (autoscope-v2.ts)
    ├── Calculate installation labor (labor_class grouping)
    ├── Calculate overhead (L&I, unemployment, etc.)
    └── Apply markup → Project totals
    ↓
ExcelJS Export (exportTakeoffExcel.ts)
```

### 2. Identify What You're Changing

| Change Type | Risk | Files Affected |
|------------|------|----------------|
| Auto-scope rule formula | HIGH | autoscope-v2.ts |
| shouldApplyRule() logic | CRITICAL | autoscope-v2.ts |
| Material assignment pricing | HIGH | orchestrator-v2.ts, pricing.ts |
| Labor calculation | HIGH | orchestrator-v2.ts |
| Overhead rates | MEDIUM | orchestrator-v2.ts |
| Markup calculation | LOW | orchestrator-v2.ts |
| Excel formatting only | LOW | exportTakeoffExcel.ts |
| Presentation group mapping | MEDIUM | orchestrator-v2.ts |

### 3. Record Current State

Before changing anything, run MN568 through the pipeline and record:
```
Project: MN568
Extraction ID: 240e222e-0419-421c-97fa-18a691b40cdb
Org ID: 45aaa69c-8146-43b2-aef1-e2fe6fabcd86

Current totals (record before change):
- Total materials: $______
- Total labor: $______
- Total overhead: $______
- Grand total: $______
- Known gap: ~$2,343
```

---

## Change Checklist

### For Formula Changes

- [ ] **Variable names are correct** — Use `facade_sqft` not `measurements.facade_sqft`
- [ ] **Math functions are JavaScript** — `Math.ceil()`, `Math.round()`, `Math.floor()`
- [ ] **Waste factors are applied** — Standard: `* 1.10` (10% waste). Check existing rules for the category's convention.
- [ ] **Coverage calculation is correct** — Verify denominator matches the product's actual coverage per unit
- [ ] **Units are consistent** — If formula produces LF, rule unit must be LF. If SF, unit must be SF.
- [ ] **Edge cases handled** — What happens when the measurement is 0? When it's very large?

### For shouldApplyRule() Changes

Run the /arch-review checklist for Auto-Scope Engine. This is the #1 source of bugs.

### For Labor Changes

- [ ] **labor_class linkage** — Each pricing_item has a `labor_class` that maps to `labor_rates.rate_name`
- [ ] **Rate units match** — If labor rate is per SF, the quantity passed must be in SF
- [ ] **Mike Skjei methodology** — Labor is per-square (100 SF), not per-piece
- [ ] **L&I and overhead are separate** — Don't fold overhead into the labor rate

### For Pricing Service Changes

- [ ] **Organization-specific overrides** — The pricing service checks for org-specific prices first, then falls back to default
- [ ] **Immutable snapshots** — Never modify historical pricing. Create new snapshot if prices change.
- [ ] **pricing_item_id vs SKU** — ID-based pricing (material assignments) uses UUID. SKU-based (measurements only) uses string match.

---

## MeasurementContext Interface

When modifying formula evaluation, here's the complete context:

```typescript
{
  // Area
  facade_sqft, facade_area_sqft, gross_wall_area_sqft,
  net_siding_area_sqft, siding_squares,
  
  // Windows
  window_count, window_area_sqft, window_perimeter_lf,
  window_head_lf, window_sill_lf, window_jamb_lf,
  
  // Doors
  door_count, door_area_sqft, door_perimeter_lf,
  door_head_lf, door_jamb_lf,
  
  // Garage
  garage_count, garage_head_lf,
  
  // Corners
  outside_corner_count, outside_corner_lf,
  inside_corner_count, inside_corner_lf,
  
  // Trim aggregates
  trim_total_lf, trim_head_lf, trim_jamb_lf, trim_sill_lf,
  
  // Gable/Roof
  gable_rake_lf, roof_eave_lf, roof_rake_lf,
  
  // Other
  belly_band_lf, openings_count
}
```

**Category-scoped rules** override `facade_sqft` with the category-specific area from `materialCategoryAreas`.

---

## After Making the Change

### 1. Run MN568 Again
```
Post-change totals:
- Total materials: $______
- Total labor: $______
- Total overhead: $______
- Grand total: $______
- Gap change: Better / Same / Worse by $______
```

### 2. Verify No Regressions
- [ ] No line items disappeared
- [ ] No quantities went to 0 or negative
- [ ] No NaN values in output
- [ ] Presentation groups still correct
- [ ] Labor categories still populated

### 3. Spot-Check Specific Items
For the items your change affects, verify the math by hand:
```
Item: [NAME]
Formula: [FORMULA]
Inputs: [VALUES]
Expected: [HAND CALCULATION]
Actual: [API OUTPUT]
Match: YES / NO
```

---

## Output Format

```
## Calc Engine Change: [Description]

**Risk Level:** 🔴 HIGH / 🟡 MEDIUM / 🟢 LOW

**Before (MN568):**
- Materials: $X | Labor: $Y | Total: $Z

**After (MN568):**
- Materials: $X | Labor: $Y | Total: $Z

**Gap Change:** Improved by $X / Regressed by $X / No change

**Hand-Verified Items:**
- [Item 1]: Expected $X, Got $X ✅
- [Item 2]: Expected $Y, Got $Y ✅

**Ready to Deploy:** YES / NO — [reason if no]
```
