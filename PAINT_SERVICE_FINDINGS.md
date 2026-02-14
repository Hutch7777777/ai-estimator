# Paint Service Auto-Scope Investigation Findings

## Executive Summary

**The auto-scope engine is HARDCODED, not generic.** Paint service rules will NOT fire correctly without API code changes.

---

## Phase 1: Auto-Scope Engine Analysis

### Question 1: Is the auto-scope engine GENERIC or HARDCODED?

**Answer: HARDCODED**

**Location:** `exterior-estimation-api/src/calculations/siding/autoscope-v2.ts:988-1169`

The `shouldApplyRule()` function only handles these specific trigger_condition formats:

#### Measurement-based triggers (lines 1049-1156):
- `min_corners`, `min_openings`, `min_net_area`, `min_facade_area`
- `min_belly_band_lf`, `min_trim_total_lf`, `trim_total_lf_gt`
- Various trim LF conditions

#### Material-based triggers (lines 1013-1043):
- `material_category` - checks if assigned material has this category
- `sku_pattern` - checks if material SKU contains this pattern

#### Config field checks:
**NOT SUPPORTED** - There is NO code path to evaluate:
```json
[{"field": "paint_service_type", "equals": "in_house"}]
```

**Critical Issue:** Lines 1166-1168 show that unknown trigger formats DEFAULT TO APPLYING:
```typescript
// Unknown trigger condition format - log and apply by default
console.warn(`⚠️ Unknown trigger condition format for rule ${rule.rule_id}:`, tc);
return { applies: true, reason: 'unknown format - defaulting to apply' };
```

**Impact:** Your 8 paint service rules would ALL fire regardless of paint_service_type selection!

---

### Question 2: Can the formula evaluation handle quantity_formula strings?

**Answer: YES**

**Location:** `autoscope-v2.ts:1175-1198`

```typescript
export function evaluateFormula(
  formula: string,
  context: MeasurementContext
): { result: number; error?: string } {
  const fn = new Function(...contextKeys, `return ${formula};`);
  const result = fn(...contextValues);
  return { result: Math.max(0, numResult) };
}
```

The engine dynamically evaluates formulas against the MeasurementContext using JavaScript's `Function` constructor.

---

### Question 3: Are measurement variables (net_siding_sf, total_trim_lf) available?

**Answer: MOSTLY YES** (with caveats)

**Location:** `autoscope-v2.ts:179-343`

Available variables in MeasurementContext:

| Your Formula Variable | Actual Context Variable | Available? |
|----------------------|------------------------|------------|
| `net_siding_sf` | `net_siding_area_sqft` | **NEEDS RENAME** |
| `total_trim_lf` | `trim_total_lf` | **NEEDS RENAME** |
| `facade_sqft` | `facade_sqft` | ✓ |
| `openings_perimeter_lf` | `openings_perimeter_lf` | ✓ |

**Action Required:** Update your paint service quantity_formula values to use exact variable names from MeasurementContext.

---

### Question 4: Can excludes_if_attributes check product attributes like is_colorplus?

**Answer: NO**

**Evidence:** Grepped entire API codebase for `excludes_if`:
```
No matches found
```

The `is_colorplus` flag exists (`orchestrator-v2.ts:151, 268, 1099`) but is only used to flag items for ColorPlus premium labor rates - NOT for rule exclusion logic.

**Impact:** Your paint service rules cannot currently exclude ColorPlus products via `excludes_if_attributes`.

---

## Phase 2: Frontend Config Rendering

### Question 5: Will paint_service frontend section render automatically?

**Answer: YES**

**Location:** `ai-estimator/components/project-form/ProductConfigStep.tsx`

The component:
1. Fetches trade_configurations with `.in('trade', data.selectedTrades).eq('active', true)` (lines 141-147)
2. Groups by trade and section (lines 1072-1085)
3. Renders each section with its fields

**Requirements for paint_service to render:**
- Fields must have `trade: 'siding'`
- Fields must have `active: true`
- Fields must have `config_section: 'paint_service'` (for proper grouping)
- show_if_conditions work (evaluated in `isFieldVisible()` lines 273-481)

**Verification:** The icon selection (line 64) already handles "paint" sections:
```typescript
if (lowerSection.includes('color') || lowerSection.includes('paint')) {
  return Palette;
}
```

---

## Phase 3: Required Code Changes

### Summary Table

| Component | Change Required? | Details |
|-----------|-----------------|---------|
| **Frontend ProductConfigStep** | NO | Will render paint_service section automatically |
| **Database trade_configurations** | VERIFY | Ensure active=true, trade='siding' |
| **Database auto_scope_rules_v2** | RESTRUCTURE | Change trigger_condition format |
| **API shouldApplyRule()** | **YES - CRITICAL** | Add config field checking |
| **API webhook payload** | **YES** | Accept config values |
| **API orchestrator** | **YES** | Pass config to shouldApplyRule() |

---

## Detailed API Changes Required

### 1. Extend DbTriggerCondition Interface

**File:** `autoscope-v2.ts:70-89`

```typescript
interface DbTriggerCondition {
  // Existing measurement-based
  always?: boolean;
  min_corners?: number;
  min_openings?: number;
  // ... existing fields ...

  // NEW: Config field checking
  config_field?: string;        // e.g., "paint_service_type"
  config_equals?: string;       // e.g., "in_house"
  config_not_equals?: string;   // e.g., "subcontractor"

  // NEW: Product attribute exclusion
  excludes_if_colorplus?: boolean;  // Skip rule if material is ColorPlus
}
```

### 2. Update shouldApplyRule() Function

**File:** `autoscope-v2.ts:988-1169`

Add config checking after material-based triggers:

```typescript
// NEW: CONFIG-BASED TRIGGERS
if (tc.config_field !== undefined) {
  const configValue = config?.[tc.config_field];  // Need to pass config

  if (tc.config_equals !== undefined) {
    if (configValue !== tc.config_equals) {
      return { applies: false, reason: `config.${tc.config_field}='${configValue}' !== '${tc.config_equals}'` };
    }
    matchedConditions.push(`config.${tc.config_field}=${tc.config_equals}`);
  }

  if (tc.config_not_equals !== undefined) {
    if (configValue === tc.config_not_equals) {
      return { applies: false, reason: `config.${tc.config_field}='${configValue}' === '${tc.config_not_equals}'` };
    }
    matchedConditions.push(`config.${tc.config_field}!=${tc.config_not_equals}`);
  }
}

// NEW: COLORPLUS EXCLUSION
if (tc.excludes_if_colorplus === true) {
  const hasColorPlus = materials.some(m => m.is_colorplus === true);
  if (hasColorPlus) {
    return { applies: false, reason: 'excluded: material is ColorPlus' };
  }
  matchedConditions.push('!colorplus');
}
```

### 3. Update Function Signature

```typescript
export function shouldApplyRule(
  rule: DbAutoScopeRule,
  context: MeasurementContext,
  assignedMaterials?: AssignedMaterial[],
  config?: Record<string, any>  // NEW PARAMETER
): { applies: boolean; reason: string }
```

### 4. Update Orchestrator to Pass Config

Find where `shouldApplyRule` is called and pass the config object from the webhook payload.

### 5. Update Webhook Type to Include Config

**File:** `types/webhook.ts`

Ensure the webhook payload includes the full config object, not just specific siding fields.

---

## Database Rule Restructuring

### Current Format (NOT SUPPORTED):
```json
{"trigger_conditions": [{"field": "paint_service_type", "equals": "in_house"}]}
```

### Required Format (after code changes):
```json
{"trigger_condition": {"config_field": "paint_service_type", "config_equals": "in_house"}}
```

**Note:** Single object, not array. Uses new `config_field`/`config_equals` keys.

---

## Recommended Implementation Order

1. **API Changes First:**
   - Extend `DbTriggerCondition` interface
   - Update `shouldApplyRule()` function signature and logic
   - Update orchestrator to pass config
   - Test with hardcoded config values

2. **Database Rules Second:**
   - Update trigger_condition format on existing paint rules
   - Update quantity_formula variable names

3. **Webhook Integration Third:**
   - Ensure n8n passes full config object
   - Test end-to-end

4. **Frontend Already Works:**
   - Just verify paint_service fields have correct database values

---

## Quick Answer Summary

| Question | Answer |
|----------|--------|
| 1. Is auto-scope engine GENERIC? | **NO - HARDCODED** |
| 2. Can formula evaluation handle strings? | **YES** |
| 3. Are measurement variables available? | **YES (with renames)** |
| 4. Can excludes_if_attributes work? | **NO - NOT IMPLEMENTED** |
| 5. Will frontend render paint_service? | **YES - AUTOMATIC** |
| 6. Code changes needed? | **YES - API ONLY** |
