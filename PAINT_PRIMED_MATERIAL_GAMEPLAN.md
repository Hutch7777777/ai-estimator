# Paint Primed Material - Implementation Gameplan

> **Feature Request:** Add ability to include painting costs for primed siding/trim materials. Sometimes done in-house, sometimes by subcontractor.

---

## Executive Summary

The system already distinguishes between **ColorPlus** (pre-finished, no painting needed) and **Primed** (requires field painting) products. This feature adds the ability to:
1. Optionally include painting line items when primed materials are selected
2. Track whether painting is done in-house or by subcontractor
3. Calculate paint material and labor costs based on surface area/linear feet
4. Show paint costs as separate line items for transparency

---

## Current System Analysis

### Existing Product Structure

**ColorPlus Products:**
- `is_colorplus = true` in `pricing_items`
- Factory-finished with baked-on color
- No painting required
- Shows "Pre-finished" badge in Detection Editor

**Primed Products:**
- `is_colorplus = false` in `pricing_items`
- Factory-primed, ready for paint
- Requires field painting (currently not priced)
- Examples: `HP-825-CM-PR`, `CORBEL-SM-PRIMED`, `BRACKET-MD-PRIMED`

### Existing Finish Selection

Already implemented in `trade_configurations`:
- `belly_band_finish`: ColorPlus | Primed
- `window_trim_finish`: ColorPlus | Primed
- `door_trim_finish`: ColorPlus | Primed
- `garage_trim_finish`: ColorPlus | Primed

When "Primed" is selected, the color field is hidden (see `show_if_conditions`).

---

## Proposed Solution Architecture

### Option A: Global Paint Service Toggle (Recommended)

Add a single "Paint Service" section that applies to all primed materials.

**Advantages:**
- Simple user experience
- One decision covers all primed products
- Easy to implement
- Matches how painting is actually bid (whole job, not per-product)

**User Flow:**
1. User selects siding/trim products (some may be primed)
2. After product selection, new "Paint Service" section appears
3. User chooses: "No Paint Service" | "In-House Painting" | "Subcontractor Painting"
4. If painting selected, user picks paint color
5. Calculation engine adds paint line items based on primed SF/LF

### Option B: Per-Product Paint Toggle

Each primed product selection has its own paint toggle.

**Advantages:**
- Maximum flexibility
- User can paint some areas, leave others for later

**Disadvantages:**
- More complex UI
- More user decisions
- Doesn't match real-world bidding

**Recommendation:** Start with **Option A** (Global Paint Service). Can add per-product later if needed.

---

## Database Changes

### 1. New Columns in `pricing_items`

```sql
ALTER TABLE pricing_items ADD COLUMN IF NOT EXISTS is_primed BOOLEAN DEFAULT false;
ALTER TABLE pricing_items ADD COLUMN IF NOT EXISTS requires_painting BOOLEAN DEFAULT false;
ALTER TABLE pricing_items ADD COLUMN IF NOT EXISTS sf_per_unit DECIMAL(10,4);  -- Coverage for paint calculation
```

### 2. New `trade_configurations` Fields

```sql
-- Paint service toggle
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  field_options, is_required, section_order, field_order, active,
  show_if_conditions
) VALUES (
  'siding',
  'paint_service',
  'paint_service_option',
  'select',
  'Paint Service for Primed Materials',
  '{
    "options": [
      {"value": "none", "label": "No Paint Service (Customer to Paint)"},
      {"value": "inhouse", "label": "In-House Painting (+labor)"},
      {"value": "subcontractor", "label": "Subcontractor Painting (+bid allowance)"}
    ]
  }'::jsonb,
  false, -- Not required - defaults to "none"
  8,     -- After trim_accessories section
  1,
  true,
  NULL   -- Always visible when primed products selected (frontend logic)
);

-- Paint color selection (shown when paint service selected)
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  field_options, is_required, section_order, field_order, active,
  show_if_conditions
) VALUES (
  'siding',
  'paint_service',
  'paint_color',
  'select',
  'Paint Color',
  '{
    "options": [
      {"value": "customer_supplied", "label": "Customer Supplied Color"},
      {"value": "arctic_white", "label": "Arctic White", "hex": "#F5F5F0"},
      {"value": "iron_gray", "label": "Iron Gray", "hex": "#5B5B5B"},
      {"value": "evening_blue", "label": "Evening Blue", "hex": "#2A4A6B"},
      {"value": "custom_match", "label": "Custom Color Match (+$)"}
    ]
  }'::jsonb,
  true,  -- Required when paint service is selected
  8,
  2,
  true,
  '{"paint_service_option": {"operator": "not_equals", "value": "none"}}'::jsonb
);

-- Subcontractor bid allowance (shown for subcontractor option)
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  field_placeholder, field_help_text, is_required, section_order, field_order, active,
  show_if_conditions
) VALUES (
  'siding',
  'paint_service',
  'paint_subcontractor_allowance',
  'number',
  'Subcontractor Paint Allowance ($)',
  'e.g., 3500',
  'Enter the quoted price from your painting subcontractor',
  true,
  8,
  3,
  true,
  '{"paint_service_option": "subcontractor"}'::jsonb
);
```

### 3. New `pricing_items` for Paint Materials/Labor

```sql
INSERT INTO pricing_items (
  snapshot_id, sku, product_name, category, trade, unit,
  material_cost, base_labor_cost, manufacturer, notes
) VALUES
-- Paint materials
('PAINT-EXT-GAL', 'Exterior Paint Premium Acrylic Latex Gallon', 'paint', 'siding', 'gal',
  55.00, 0.00, 'Sherwin-Williams', 'Coverage: ~350 SF per gallon, 2 coats'),
('PAINT-PRIMER-GAL', 'Exterior Primer/Sealer Gallon', 'paint', 'siding', 'gal',
  42.00, 0.00, 'Sherwin-Williams', 'Coverage: ~400 SF per gallon'),
('PAINT-CAULK', 'Paintable Caulk Tube 10.1oz', 'paint', 'siding', 'tube',
  6.50, 0.00, 'DAP', 'Siliconized acrylic latex'),

-- Paint labor (per SF for siding, per LF for trim)
('PAINT-LABOR-SIDING-SF', 'Paint Siding Labor (2 Coats)', 'paint_labor', 'siding', 'SF',
  0.00, 1.25, 'Labor', 'Includes prep, 2 coats, touch-up'),
('PAINT-LABOR-TRIM-LF', 'Paint Trim Labor (2 Coats)', 'paint_labor', 'siding', 'LF',
  0.00, 0.85, 'Labor', 'Includes prep, 2 coats, touch-up'),
('PAINT-LABOR-ACCENT-EA', 'Paint Architectural Accent Labor', 'paint_labor', 'siding', 'EA',
  0.00, 35.00, 'Labor', 'Corbels, brackets, decorative elements');
```

### 4. New Auto-Scope Rules for Paint

```sql
INSERT INTO siding_auto_scope_rules (
  rule_name, description, material_category, material_sku,
  quantity_formula, unit, output_unit, trigger_condition,
  presentation_group, group_order, item_order, priority, active
) VALUES
-- Paint for primed siding
(
  'paint_siding_material',
  'Exterior paint for primed siding - 2 coats',
  'paint',
  'PAINT-EXT-GAL',
  'Math.ceil(primed_siding_sf / 175)',  -- 350 SF/gal ÷ 2 coats
  'gal',
  'gal',
  '{"paint_service": true, "primed_siding_sf_gt": 0}'::jsonb,
  'paint_materials',
  90,
  1,
  100,
  true
),
(
  'paint_siding_labor',
  'Labor to paint primed siding - 2 coats',
  'paint_labor',
  'PAINT-LABOR-SIDING-SF',
  'primed_siding_sf',
  'SF',
  'SF',
  '{"paint_service_inhouse": true, "primed_siding_sf_gt": 0}'::jsonb,
  'paint_labor',
  91,
  1,
  100,
  true
),
-- Paint for primed trim
(
  'paint_trim_material',
  'Exterior paint for primed trim - 2 coats',
  'paint',
  'PAINT-EXT-GAL',
  'Math.ceil(primed_trim_lf * 0.5 / 175)',  -- ~0.5 SF/LF × 2 coats
  'gal',
  'gal',
  '{"paint_service": true, "primed_trim_lf_gt": 0}'::jsonb,
  'paint_materials',
  90,
  2,
  100,
  true
),
(
  'paint_trim_labor',
  'Labor to paint primed trim - 2 coats',
  'paint_labor',
  'PAINT-LABOR-TRIM-LF',
  'primed_trim_lf',
  'LF',
  'LF',
  '{"paint_service_inhouse": true, "primed_trim_lf_gt": 0}'::jsonb,
  'paint_labor',
  91,
  2,
  100,
  true
);
```

---

## Frontend Changes

### 1. ProductConfigStep.tsx Updates

Add logic to:
1. Track when primed products are selected
2. Show "Paint Service" section only when primed products exist
3. Handle paint_service_option visibility

```typescript
// In ProductConfigStep.tsx

// Check if any primed products are selected
const hasPrimedProducts = useMemo(() => {
  const tradeValues = formValues['siding'] || {};
  const selectedProductId = tradeValues['siding_product_type'];

  if (!selectedProductId) return false;

  const product = productCatalog.find(p => p.id === selectedProductId);
  return product && product.physical_properties?.is_colorplus !== true;
}, [formValues, productCatalog]);

// Conditionally show paint_service section
const isPaintSectionVisible = (section: string, trade: string): boolean => {
  if (section === 'paint_service' && trade === 'siding') {
    return hasPrimedProducts;
  }
  return true;
};
```

### 2. DetectionSidebar.tsx Updates

Show paint status indicator for primed materials:

```typescript
// Add badge for primed products needing paint
{!assignedMaterial.is_colorplus && (
  <Badge
    variant="outline"
    className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-600 border-amber-500/30"
  >
    Primed - Needs Paint
  </Badge>
)}
```

### 3. EstimateSummary.tsx Updates

Add paint section to summary card:

```typescript
// Show paint service summary
{hasPaintService && (
  <div className="border-t pt-3 mt-3">
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">Paint Service</span>
      <span className="font-medium">
        {paintServiceType === 'inhouse' ? 'In-House' : 'Subcontractor'}
      </span>
    </div>
    <div className="flex justify-between text-sm mt-1">
      <span className="text-muted-foreground">Paint Total</span>
      <span className="font-medium">${paintTotal.toFixed(2)}</span>
    </div>
  </div>
)}
```

---

## Railway API Changes

### 1. Update MeasurementContext

Add paint-related variables to `MeasurementContext`:

```typescript
interface MeasurementContext {
  // ... existing fields ...

  // Paint context
  primed_siding_sf: number;    // SF of primed siding material
  primed_trim_lf: number;      // LF of primed trim material
  primed_accent_count: number; // Count of primed architectural accents
  paint_service: boolean;      // Is paint service included?
  paint_service_inhouse: boolean; // Is it in-house painting?
}
```

### 2. Update Webhook Request

Add paint options to webhook payload:

```typescript
interface WebhookRequest {
  // ... existing fields ...

  // Paint service options
  paint_service?: {
    type: 'none' | 'inhouse' | 'subcontractor';
    color?: string;
    subcontractor_allowance?: number;
  };
}
```

### 3. Update Orchestrator

Calculate primed material quantities and generate paint line items:

```typescript
// In orchestrator-v2.ts

// Calculate primed material quantities from assignments
const primedQuantities = calculatePrimedQuantities(materialAssignments, pricingItems);

// Build measurement context with paint variables
const context: MeasurementContext = {
  ...existingContext,
  primed_siding_sf: primedQuantities.sidingSf,
  primed_trim_lf: primedQuantities.trimLf,
  primed_accent_count: primedQuantities.accentCount,
  paint_service: paintService?.type !== 'none',
  paint_service_inhouse: paintService?.type === 'inhouse',
};

// If subcontractor, add single line item
if (paintService?.type === 'subcontractor' && paintService.subcontractor_allowance) {
  lineItems.push({
    description: 'Painting Subcontractor',
    sku: 'PAINT-SUBCONTRACTOR',
    quantity: 1,
    unit: 'LS',  // Lump sum
    material_cost: paintService.subcontractor_allowance,
    labor_cost: 0,
    presentation_group: 'subcontractor',
  });
}
```

---

## Excel Export Updates

### New Section: "Paint Service"

Add a dedicated section for paint line items:

```typescript
// In exportTakeoffExcel.ts

const paintSection: ExcelSection = {
  name: 'Paint Service',
  items: [
    { description: 'Exterior Paint (2 coats)', qty: 8, unit: 'gal', material: 55.00 },
    { description: 'Paint Labor - Siding', qty: 1250, unit: 'SF', labor: 1.25 },
    { description: 'Paint Labor - Trim', qty: 340, unit: 'LF', labor: 0.85 },
  ],
  subtotal: { material: 440.00, labor: 1851.50, total: 2291.50 }
};
```

---

## Implementation Phases

### Phase 1: Database Setup (1-2 hours)
1. Add new `trade_configurations` for paint_service section
2. Add paint-related `pricing_items` (materials + labor)
3. Add basic auto_scope_rules for paint

### Phase 2: Frontend - ProductConfigStep (2-3 hours)
1. Add paint service section visibility logic
2. Implement paint_service_option field
3. Implement paint_color field with swatches
4. Implement subcontractor_allowance field
5. Add validation

### Phase 3: Railway API Updates (2-3 hours)
1. Update webhook request interface
2. Add primed quantity calculation helper
3. Update MeasurementContext
4. Add paint auto-scope rules processing
5. Handle subcontractor allowance

### Phase 4: UI Polish (1-2 hours)
1. Add "Primed - Needs Paint" badge in DetectionSidebar
2. Add paint summary to EstimateSummary
3. Add paint section to Excel export

### Phase 5: Testing & Validation (1-2 hours)
1. Test with all-ColorPlus project (paint section hidden)
2. Test with mixed ColorPlus/Primed project
3. Test in-house painting calculations
4. Test subcontractor allowance flow
5. Verify Excel output

---

## Cost Calculation Examples

### Example 1: In-House Painting (1,250 SF siding + 340 LF trim)

| Item | Qty | Unit | Material | Labor | Total |
|------|-----|------|----------|-------|-------|
| Exterior Paint (2 coats) | 8 | gal | $440.00 | - | $440.00 |
| Paint Primer/Sealer | 4 | gal | $168.00 | - | $168.00 |
| Paint Labor - Siding | 1,250 | SF | - | $1,562.50 | $1,562.50 |
| Paint Labor - Trim | 340 | LF | - | $289.00 | $289.00 |
| **Paint Service Total** | | | **$608.00** | **$1,851.50** | **$2,459.50** |

### Example 2: Subcontractor Painting

| Item | Qty | Unit | Material | Labor | Total |
|------|-----|------|----------|-------|-------|
| Painting Subcontractor | 1 | LS | $3,500.00 | - | $3,500.00 |

---

## Future Enhancements

1. **Per-Product Paint Toggle** - Allow painting some primed items but not others
2. **Paint Brand Selection** - Sherwin-Williams vs Benjamin Moore vs Behr
3. **Coat Count Option** - 1 coat vs 2 coats
4. **Touch-up Paint Line** - Include extra gallon for touch-ups
5. **Stain Option** - For wood products
6. **Color Preview** - Show color swatch preview on estimate

---

## Questions to Confirm

1. **Standard labor rates** - Is $1.25/SF for siding and $0.85/LF for trim accurate for your market?
2. **Paint coverage** - Assuming 350 SF/gallon for 1 coat. Does this match your experience?
3. **Subcontractor handling** - Should we track subcontractor vendor info?
4. **Color library** - Want to import James Hardie ColorPlus colors as paint options?

---

## Files to Modify

**Database:**
- `migrations/add_paint_service_feature.sql` (new)

**Frontend:**
- `components/project-form/ProductConfigStep.tsx`
- `components/detection-editor/DetectionSidebar.tsx`
- `components/estimate-editor/EstimateSummary.tsx`
- `lib/utils/exportTakeoffExcel.ts`

**API (Railway):**
- `src/types/webhook.ts`
- `src/calculations/siding/orchestrator-v2.ts`
- `src/calculations/siding/autoscope-v2.ts`
- `src/calculations/siding/measurement-context.ts`

---

*Document created: 2026-02-06*
*Author: Claude Opus 4.5*
