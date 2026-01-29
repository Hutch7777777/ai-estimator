# N8N Workflow: Trim Calculation Implementation Guide

## Overview

This document describes the changes needed in the n8n workflow to support proper trim material calculations from window/door/garage opening measurements.

## Current State (Problem)

The Detection Editor correctly calculates and sends trim measurements in the payload:

```typescript
// DetectionEditor.tsx:2633-2647
trim: {
  total_head_lf: windowHeadLf + doorHeadLf + garageHeadLf,
  total_jamb_lf: windowJambLf + doorJambLf + garageJambLf,
  total_sill_lf: windowSillLf,
  total_trim_lf: <sum of all above>
}
```

**But the n8n workflow doesn't map these to variables for auto-scope formulas.**

The current "Window/Door Casing" rule uses a simplified formula:
```
Math.ceil(openings_count * 5 / 12)
```
This assumes 5 LF per opening, which is inaccurate.

## Target State (Solution)

Map the `payload.trim` object to auto-scope formula variables:

| Payload Field | Variable Name | Description |
|---------------|---------------|-------------|
| `trim.total_trim_lf` | `trim_total_lf` | Total trim linear feet (all openings) |
| `trim.total_head_lf` | `trim_head_lf` | Total head (top) trim LF |
| `trim.total_jamb_lf` | `trim_jamb_lf` | Total jamb (side) trim LF |
| `trim.total_sill_lf` | `trim_sill_lf` | Total sill (bottom) trim LF |

## Implementation Steps

### Step 1: Locate the Variable Mapping Node

Find the Code node in the n8n workflow where payload variables are extracted and mapped for auto-scope formulas. Look for nodes named something like:

- "Extract Measurements"
- "Build Formula Context"
- "Map Payload to Variables"
- "Process Auto-Scope Rules"

### Step 2: Add Trim Variable Extraction

Add the following to extract trim measurements:

```javascript
// Extract trim measurements from payload
const trim_total_lf = parseFloat(payload.trim?.total_trim_lf) || 0;
const trim_head_lf = parseFloat(payload.trim?.total_head_lf) || 0;
const trim_jamb_lf = parseFloat(payload.trim?.total_jamb_lf) || 0;
const trim_sill_lf = parseFloat(payload.trim?.total_sill_lf) || 0;

// Log for debugging
console.log('[Trim Variables]', {
  trim_total_lf,
  trim_head_lf,
  trim_jamb_lf,
  trim_sill_lf
});
```

### Step 3: Add Variables to Formula Context

Find where the formula evaluation context is built and add the trim variables:

```javascript
// Build formula evaluation context
const formulaContext = {
  // Existing variables
  facade_area_sqft,
  facade_perimeter_lf,
  facade_height_ft,
  openings_count,
  openings_area_sqft,
  openings_perimeter_lf,
  outside_corners_count,
  inside_corners_count,
  belly_band_lf,
  // ... other existing variables

  // NEW: Trim variables
  trim_total_lf,
  trim_head_lf,
  trim_jamb_lf,
  trim_sill_lf,
};
```

### Step 4: Handle New Trigger Conditions

The new auto-scope rules use trigger conditions like:
```json
{"trim_total_lf_gt": 0}
{"trim_head_lf_gt": 0}
```

Add handlers for these in the trigger evaluation function:

```javascript
function evaluateTrigger(condition, context) {
  // Existing handlers
  if (condition.always === true) return true;
  if (condition.min_openings !== undefined) {
    return context.openings_count >= condition.min_openings;
  }
  if (condition.min_corners !== undefined) {
    return (context.outside_corners_count + context.inside_corners_count) >= condition.min_corners;
  }
  if (condition.belly_band_lf_gt !== undefined) {
    return context.belly_band_lf > condition.belly_band_lf_gt;
  }

  // NEW: Trim trigger handlers
  if (condition.trim_total_lf_gt !== undefined) {
    return context.trim_total_lf > condition.trim_total_lf_gt;
  }
  if (condition.trim_head_lf_gt !== undefined) {
    return context.trim_head_lf > condition.trim_head_lf_gt;
  }
  if (condition.trim_jamb_lf_gt !== undefined) {
    return context.trim_jamb_lf > condition.trim_jamb_lf_gt;
  }
  if (condition.trim_sill_lf_gt !== undefined) {
    return context.trim_sill_lf > condition.trim_sill_lf_gt;
  }

  // Default: trigger fires
  return true;
}
```

### Step 5: Verify Formula Evaluation

The formula engine should now be able to evaluate formulas like:
```javascript
CEILING(trim_total_lf / 12 * 1.10)
```

Ensure the formula evaluator can access all context variables.

## New Auto-Scope Rules

After running the migration (`migrations/add_trim_auto_scope_rules.sql`), these rules will exist:

### 1. Window/Door Casing (Updated)

| Field | Value |
|-------|-------|
| **Rule Name** | Window/Door Casing |
| **SKU** | CASING-5/4X4X12 |
| **Formula** | `CEILING(trim_total_lf / 12 * 1.10)` |
| **Trigger** | `{"trim_total_lf_gt": 0}` |
| **Description** | HardieTrim boards for window/door/garage openings |

**Example Calculation:**
- 10 windows × 14 LF each = 140 LF
- 2 doors × 17 LF each = 34 LF
- 1 garage × 46 LF = 46 LF
- **Total: 220 LF**
- Formula: `CEILING(220 / 12 * 1.10) = CEILING(20.17) = 21 boards`

### 2. Trim Caulk - ColorMatch (New)

| Field | Value |
|-------|-------|
| **Rule Name** | Trim Caulk - ColorMatch |
| **SKU** | CAULK-JH-COLORMATCH |
| **Formula** | `CEILING(trim_total_lf / 40)` |
| **Trigger** | `{"trim_total_lf_gt": 0}` |
| **Description** | ColorMatch caulk for trim board joints |

**Example:** 220 LF → 6 tubes

### 3. Trim Fasteners - SS Nails (New)

| Field | Value |
|-------|-------|
| **Rule Name** | Trim Fasteners - SS Nails |
| **SKU** | TRIM-NAILS-SS-1LB |
| **Formula** | `CEILING(trim_total_lf / 100)` |
| **Trigger** | `{"trim_total_lf_gt": 0}` |
| **Description** | Stainless steel ring shank nails |

**Example:** 220 LF → 3 boxes

### 4. Trim Head Flashing (New)

| Field | Value |
|-------|-------|
| **Rule Name** | Trim Head Flashing |
| **SKU** | ZFLASH-10 |
| **Formula** | `CEILING(trim_head_lf / 10 * 1.10)` |
| **Trigger** | `{"trim_head_lf_gt": 0}` |
| **Description** | Z-flashing above window/door heads |

**Example:** 73.5 LF head trim → 9 pieces

## Testing

### Test Payload

```json
{
  "job_id": "test-123",
  "facade": {
    "gross_area_sf": 1500,
    "net_siding_sf": 1200,
    "perimeter_lf": 160,
    "level_starter_lf": 80
  },
  "windows": {
    "count": 10,
    "area_sf": 150,
    "perimeter_lf": 140,
    "head_lf": 45.5,
    "jamb_lf": 91,
    "sill_lf": 45.5
  },
  "doors": {
    "count": 2,
    "area_sf": 42,
    "perimeter_lf": 34,
    "head_lf": 12,
    "jamb_lf": 14
  },
  "garages": {
    "count": 1,
    "area_sf": 112,
    "perimeter_lf": 46,
    "head_lf": 16,
    "jamb_lf": 18
  },
  "trim": {
    "total_head_lf": 73.5,
    "total_jamb_lf": 123,
    "total_sill_lf": 45.5,
    "total_trim_lf": 242
  }
}
```

### Expected Output

For trim rules with the test payload above (242 LF total trim):

| Line Item | Quantity | Unit | Calculation |
|-----------|----------|------|-------------|
| 5/4 x 4 x 12 Window/Door Casing | 23 | pieces | CEIL(242/12*1.10) = 23 |
| ColorMatch Caulk | 7 | tube | CEIL(242/40) = 7 |
| SS Trim Nails | 3 | box | CEIL(242/100) = 3 |
| Z-Flashing (head) | 9 | ea | CEIL(73.5/10*1.10) = 9 |

The Excel output should show:
```
TRIM & CORNERS
5/4 x 4 x 12 Window/Door Casing    23    pieces    $26.00    $598.00    From detection: 242.00 LF
ColorMatch Caulk                     7    tube      $8.50     $59.50    From detection: 242.00 LF
SS Trim Nails (1 lb box)             3    box       $7.50     $22.50    From detection: 242.00 LF
Z-Flashing 10ft                      9    ea       $12.50    $112.50    From detection: 73.50 LF
```

## Debugging

If trim materials still show 0 after implementing:

1. **Check payload console log:**
   ```
   [Approve] Sending payload: { trim: { total_trim_lf: 242, ... } }
   ```

2. **Check n8n execution log:**
   - Look for `[Trim Variables]` log output
   - Verify `trim_total_lf > 0`

3. **Check trigger evaluation:**
   - Verify `{"trim_total_lf_gt": 0}` evaluates to `true`

4. **Check formula evaluation:**
   - Verify `CEILING(trim_total_lf / 12 * 1.10)` returns expected value

5. **Check line item generation:**
   - Verify SKU `CASING-5/4X4X12` exists in pricing_items
   - Verify line item is created with correct quantity

## Files Modified

1. **Database Migration:**
   - `migrations/add_trim_auto_scope_rules.sql` - Updates and adds auto-scope rules

2. **N8N Workflow (external):**
   - Variable extraction node - Add trim variable mapping
   - Trigger evaluation function - Add trim trigger handlers
   - Formula context - Add trim variables

3. **No frontend changes needed:**
   - DetectionEditor.tsx already sends correct trim data
   - ApprovePayload interface already includes trim object
