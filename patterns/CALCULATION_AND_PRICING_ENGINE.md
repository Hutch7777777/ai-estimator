# Calculation and Pricing Engine Documentation

> Complete technical reference for the exterior estimation calculation pipeline.

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI ESTIMATOR CALCULATION PIPELINE                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────────────┐   │
│  │   Frontend   │───▶│ Railway APIs     │───▶│  PostgreSQL Database     │   │
│  │  (Next.js)   │    │ (Express/n8n)    │    │     (Supabase)           │   │
│  └──────────────┘    └──────────────────┘    └──────────────────────────┘   │
│         │                    │                         │                     │
│         │                    │                         │                     │
│         ▼                    ▼                         ▼                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────────────┐   │
│  │ Detection    │    │ Auto-Scope V2    │    │  Pricing Tables          │   │
│  │ Editor       │    │ Rules Engine     │    │  - pricing_items         │   │
│  │ (Konva.js)   │    │                  │    │  - labor_rates           │   │
│  └──────────────┘    └──────────────────┘    │  - overhead_costs        │   │
│         │                    │               │  - auto_scope_rules      │   │
│         │                    │               └──────────────────────────┘   │
│         ▼                    ▼                                               │
│  ┌──────────────┐    ┌──────────────────┐                                   │
│  │ ExcelJS      │◀───│ Mike Skjei       │                                   │
│  │ Export       │    │ Methodology      │                                   │
│  └──────────────┘    └──────────────────┘                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Railway API Endpoints

The calculation engine runs on Railway as a separate Express.js service at:
- **Production**: `https://n8n-production-293e.up.railway.app`
- **Source Code**: `~/projects/exterior-estimation-api/src/`

### 1.1 Primary Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/siding-estimator` | POST | Main calculation endpoint for siding takeoffs |
| `/webhook/calculate-siding` | POST | Alias endpoint (same functionality) |
| `/webhook/detection-edit-sync` | POST | Sync detection edits from frontend |
| `/webhook/validate-detections` | POST | Validate detection data before calculation |
| `/webhook/health` | GET | Health check endpoint |

### 1.2 Webhook Request Format

**File Reference**: [webhook.ts:94-156](~/projects/exterior-estimation-api/src/types/webhook.ts#L94-L156)

```typescript
interface WebhookRequest {
  // Required
  project_id: string;

  // Optional project info
  project_name?: string;
  client_name?: string;
  address?: string;
  trade?: 'siding';

  // Siding configuration
  siding?: WebhookSidingConfig;

  // Measurements (from HOVER extraction)
  measurements?: WebhookMeasurements;

  // Trim totals (aggregated from Detection Editor)
  trim?: {
    total_head_lf?: number;
    total_jamb_lf?: number;
    total_sill_lf?: number;
    total_trim_lf?: number;
  };

  // Detection counts by class (corbels, brackets, belly_bands, etc.)
  detection_counts?: Record<string, {
    count: number;
    total_lf?: number;
    display_name: string;
    measurement_type: 'count' | 'area' | 'linear';
    unit: string;
  }>;

  // Material assignments (ID-based pricing path)
  material_assignments?: MaterialAssignment[];

  // Organization context for multi-tenant pricing
  organization_id?: string;

  // Options
  include_pricing?: boolean;
  include_labor?: boolean;
  markup_rate?: number;  // Default: 0.15 (15%)

  // V8.0: Spatial containment for per-manufacturer calculations
  per_material_measurements?: PerMaterialMeasurements;
  spatial_containment?: {
    enabled: boolean;
    matched_openings: number;
    total_openings: number;
    unmatched_openings: number;
  };
}
```

### 1.3 Material Assignment Structure

**File Reference**: [webhook.ts:10-18](~/projects/exterior-estimation-api/src/types/webhook.ts#L10-L18)

```typescript
interface MaterialAssignment {
  detection_id: string;           // UUID of the detection
  detection_class: string;        // e.g., 'siding', 'window', 'door'
  pricing_item_id: string;        // UUID from pricing_items.id
  quantity: number;               // Numeric quantity
  unit: 'SF' | 'LF' | 'EA';       // Unit of measure
  area_sf?: number | null;        // Optional area override
  perimeter_lf?: number | null;   // Optional perimeter override
}
```

### 1.4 Dual Pricing Paths

The webhook supports two pricing methods:

#### PATH 1: ID-Based Pricing (Material Assignments)
When `material_assignments` array is provided:
- Uses `pricing_item_id` UUIDs to look up exact pricing
- Supports organization-specific price overrides
- Combines with Auto-Scope V2 for accessories

#### PATH 2: SKU-Based Pricing (Measurements Only)
When only `measurements` are provided:
- Uses HOVER measurements to calculate quantities
- Looks up pricing by product SKU
- Traditional flow for projects without Detection Editor

---

## 2. Calculation Engine Components

### 2.1 Orchestrator V2

**File Reference**: [orchestrator-v2.ts](~/projects/exterior-estimation-api/src/calculations/siding/orchestrator-v2.ts)

The orchestrator coordinates the calculation pipeline:

```typescript
export async function calculateWithAutoScopeV2(
  materialAssignments: MaterialAssignment[],
  extractionId?: string,
  webhookMeasurements?: WebhookMeasurements,
  organizationId?: string,
  markupRate: number = 0.15,
  detectionCounts?: Record<string, {...}>,
  perMaterialMeasurements?: PerMaterialMeasurements,
  spatialContainment?: {...}
): Promise<V2CalculationResult>
```

**Pipeline Steps**:
1. Fetch labor rates and overhead costs from database
2. Process material assignments (ID-based pricing)
3. Generate auto-scope items (SKU-based pricing)
4. Build manufacturer groups for per-manufacturer rules
5. Calculate installation labor using labor_class grouping
6. Calculate overhead costs (L&I, unemployment, etc.)
7. Apply markup and calculate project totals

### 2.2 Auto-Scope V2 Engine

**File Reference**: [autoscope-v2.ts](~/projects/exterior-estimation-api/src/calculations/siding/autoscope-v2.ts)

Database-driven rules engine for automatic line item generation.

#### Rule Structure

```typescript
interface DbAutoScopeRule {
  rule_id: number;
  rule_name: string;
  description: string | null;
  material_category: string;
  material_sku: string;
  quantity_formula: string;        // JavaScript expression
  unit: string;
  output_unit: string | null;
  trigger_condition: DbTriggerCondition | null;
  presentation_group: string;
  group_order: number;
  item_order: number;
  priority: number;
  active: boolean;
  manufacturer_filter: string[] | null;  // Per-manufacturer rules
}
```

#### Trigger Conditions

```typescript
interface DbTriggerCondition {
  always?: boolean;           // Always apply
  min_corners?: number;       // Minimum corner count
  min_openings?: number;      // Minimum opening count
  min_net_area?: number;      // Minimum net area (SF)
  min_facade_area?: number;   // Minimum facade area (SF)
  min_belly_band_lf?: number; // Minimum belly band (LF)
  min_trim_total_lf?: number; // Minimum total trim (LF)
  trim_total_lf_gt?: number;  // Trim > value (alternative syntax)
}
```

#### Quantity Formulas

Formulas are JavaScript expressions with access to `MeasurementContext`:

```javascript
// Examples from database:
"Math.ceil(facade_area_sqft / 1350)"           // Tyvek rolls
"Math.ceil((facade_area_sqft - openings_area_sqft) / 100)"  // Siding nails
"Math.ceil(openings_perimeter_lf / 25)"        // Caulk tubes
"CEILING(trim_total_lf / 12 * 1.10)"           // Trim boards
"Math.ceil(outside_corners_count)"             // Corner posts
```

### 2.3 Measurement Context

**File Reference**: [autoscope-v2.ts:167-331](~/projects/exterior-estimation-api/src/calculations/siding/autoscope-v2.ts#L167-L331)

The `MeasurementContext` provides all variables for formula evaluation:

```typescript
interface MeasurementContext {
  // Primary areas
  facade_sqft: number;
  facade_area_sqft: number;         // Alias
  gross_wall_area_sqft: number;
  net_siding_area_sqft: number;

  // Windows
  window_count: number;
  window_area_sqft: number;
  window_perimeter_lf: number;
  window_head_lf: number;
  window_sill_lf: number;
  window_jamb_lf: number;

  // Doors
  door_count: number;
  door_area_sqft: number;
  door_perimeter_lf: number;
  door_head_lf: number;
  door_jamb_lf: number;

  // Garages
  garage_count: number;
  garage_area_sqft: number;
  garage_perimeter_lf: number;

  // Corners
  outside_corner_count: number;
  outside_corners_count: number;    // Alias
  outside_corner_lf: number;
  inside_corner_count: number;
  inside_corners_count: number;     // Alias
  inside_corner_lf: number;

  // Gables
  gable_count: number;
  gable_area_sqft: number;
  gable_rake_lf: number;

  // Belly Band
  belly_band_count: number;
  belly_band_lf: number;

  // Other
  level_starter_lf: number;
  avg_wall_height_ft: number;
  facade_perimeter_lf: number;
  facade_height_ft: number;         // Alias

  // Computed totals
  total_opening_perimeter_lf: number;
  total_corner_lf: number;
  total_openings_area_sqft: number;
  total_openings_count: number;
  openings_area_sqft: number;       // Alias
  openings_perimeter_lf: number;    // Alias
  openings_count: number;           // Alias

  // Trim totals
  trim_total_lf: number;
  trim_head_lf: number;
  trim_jamb_lf: number;
  trim_sill_lf: number;
}
```

### 2.4 Manufacturer-Aware Rules (V8.0)

**File Reference**: [autoscope-v2.ts:362-600](~/projects/exterior-estimation-api/src/calculations/siding/autoscope-v2.ts#L362-L600)

Rules can be filtered by manufacturer for per-manufacturer calculations:

```typescript
// Rule with manufacturer_filter = null (generic)
// → Applies to total project area

// Rule with manufacturer_filter = ['James Hardie']
// → Only applies to James Hardie products using Hardie's SF

// Rule with manufacturer_filter = ['Engage Building Products']
// → Only applies to FastPlank products using FastPlank's SF
```

#### Manufacturer Grouping

```typescript
export async function buildManufacturerGroups(
  materialAssignments: MaterialAssignmentForGrouping[],
  organizationId?: string,
  perMaterialMeasurements?: PerMaterialMeasurements
): Promise<ManufacturerGroups>
```

Groups material assignments by manufacturer and aggregates:
- `area_sqft`: Total area for this manufacturer
- `linear_ft`: Total linear feet
- `piece_count`: Total piece count
- `detection_ids`: Array of detection IDs for provenance

#### Spatial Containment (V8.0/V8.1)

When spatial containment is enabled, per-material measurements include:
- Window/door/garage perimeters within each material's facades
- Corner counts and linear feet
- Trim measurements
- Belly band linear feet

---

## 3. Pricing Service

### 3.1 Pricing Lookup

**File Reference**: [pricing.ts](~/projects/exterior-estimation-api/src/services/pricing.ts)

```typescript
interface PricingItem {
  id?: string;              // UUID primary key
  sku: string;
  product_name: string;
  manufacturer: string;
  category: string;
  trade: string;
  unit: string;
  material_cost: number;
  base_labor_cost: number;
  li_insurance_cost: number;
  unemployment_cost: number;
  total_labor_cost: number;
  equipment_cost: number;
  total_cost: number;
  labor_class?: string;     // Links to labor_rates.rate_name
  // Coverage fields
  reveal_inches?: number;
  pieces_per_square?: number;
  coverage_value?: number;
  coverage_unit?: string;
}
```

### 3.2 Lookup Methods

#### By UUID (ID-Based)

```typescript
export async function getPricingByIds(
  pricingItemIds: string[],
  organizationId?: string
): Promise<Map<string, PricingItem>>
```

#### By SKU (SKU-Based)

```typescript
export async function getPricingBySkus(
  skus: string[],
  organizationId?: string
): Promise<Map<string, PricingItem>>
```

### 3.3 Organization Overrides

Multi-tenant pricing with organization-specific overrides:

```sql
-- Table: organization_pricing_overrides
pricing_item_id UUID,
organization_id UUID,
material_cost_override DECIMAL,
labor_rate_override DECIMAL,
markup_percent_override DECIMAL
```

---

## 4. Labor Calculation (Mike Skjei Methodology)

### 4.1 Constants

**File Reference**: [orchestrator-v2.ts:119-129](~/projects/exterior-estimation-api/src/calculations/siding/orchestrator-v2.ts#L119-L129)

```typescript
const MARKUP_RATE = 0.26;                    // 26% markup
const SOC_UNEMPLOYMENT_RATE = 0.1265;        // 12.65% L&I + Unemployment
const LI_HOURLY_RATE = 3.56;                 // L&I hourly rate
const INSURANCE_RATE_PER_THOUSAND = 24.38;   // Project insurance
const DEFAULT_CREW_SIZE = 4;
const DEFAULT_ESTIMATED_WEEKS = 2;
```

### 4.2 Total Labor Cost Formula

**File Reference**: [labor.ts](~/projects/exterior-estimation-api/src/services/labor.ts)

```typescript
export const LI_INSURANCE_RATE = 0.1265;     // 12.65%
export const UNEMPLOYMENT_RATE = 0.013;       // 1.3%

export function calculateLaborCost(
  baseRate: number,
  quantity: number
): LaborCost {
  const base_labor_cost = baseRate * quantity;
  const li_insurance_cost = base_labor_cost * 0.1265;
  const unemployment_cost = base_labor_cost * 0.013;
  const total_labor_cost = base_labor_cost + li_insurance_cost + unemployment_cost;

  return { base_labor_cost, li_insurance_cost, unemployment_cost, total_labor_cost };
}
```

### 4.3 Labor Auto-Scope Rules

**File Reference**: [orchestrator-v2.ts:55-72](~/projects/exterior-estimation-api/src/calculations/siding/orchestrator-v2.ts#L55-L72)

```typescript
interface LaborAutoScopeRule {
  id: number;
  rule_id: string;
  rule_name: string;
  trade: string;
  trigger_type: 'always' | 'material_category' | 'material_sku_pattern' | 'detection_class';
  trigger_value: string | null;
  trigger_condition: Record<string, any> | null;
  labor_rate_id: number | null;
  quantity_source: 'facade_sqft' | 'material_sqft' | 'material_count' | 'detection_count' | 'material_lf';
  quantity_formula: string | null;
  quantity_unit: string;
  priority: number;
  active: boolean;
}
```

### 4.4 Labor Class Grouping

Materials are grouped by `labor_class` from `pricing_items` for separate labor lines:

```typescript
// Example labor classes:
// - "Lap Siding Installation"    → $180/SQ
// - "Panel Siding Installation"  → $220/SQ
// - "Shingle Siding Installation"→ $200/SQ
// - "ColorPlus Premium"          → Additional labor for ColorPlus products
```

### 4.5 Overhead Calculation

**File Reference**: [orchestrator-v2.ts:548-632](~/projects/exterior-estimation-api/src/calculations/siding/orchestrator-v2.ts#L548-L632)

```typescript
interface OverheadCost {
  cost_name: string;
  category: string;
  cost_type: 'percentage' | 'calculated' | 'flat_fee' | 'per_day';
  base_rate: string | null;
  calculation_formula: string | null;
  default_quantity: string;
  applies_to_trade: string[] | null;
}

// Calculation types:
// - percentage: e.g., L&I insurance 12.65% of labor subtotal
// - calculated: e.g., L&I hourly = crew_size × weeks × 40 × $3.56/hr
// - flat_fee: Fixed amount
// - per_day: rate × days
```

### 4.6 Project Totals

**File Reference**: [orchestrator-v2.ts:634-683](~/projects/exterior-estimation-api/src/calculations/siding/orchestrator-v2.ts#L634-L683)

```typescript
interface ProjectTotals {
  // Materials
  material_cost: number;
  material_markup_rate: number;      // 0.26
  material_markup_amount: number;
  material_total: number;

  // Labor
  installation_labor_subtotal: number;
  overhead_subtotal: number;
  labor_cost_before_markup: number;
  labor_markup_rate: number;         // 0.26
  labor_markup_amount: number;
  labor_total: number;

  // Final
  subtotal: number;                  // material_total + labor_total
  project_insurance: number;         // $24.38 per $1,000
  grand_total: number;               // subtotal + project_insurance
}
```

---

## 5. PostgreSQL Database Functions

### 5.1 Takeoff Totals Auto-Recalculation

**File Reference**: [migrations/create_takeoffs_schema.sql](migrations/create_takeoffs_schema.sql)

```sql
-- Function: Recalculate section totals
CREATE OR REPLACE FUNCTION recalculate_section_totals(section_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE takeoff_sections SET
    total_material_cost = (
      SELECT COALESCE(SUM(material_extended), 0)
      FROM takeoff_line_items WHERE section_id = section_uuid
    ),
    total_labor_cost = (
      SELECT COALESCE(SUM(labor_extended), 0)
      FROM takeoff_line_items WHERE section_id = section_uuid
    ),
    total_cost = (
      SELECT COALESCE(SUM(line_total), 0)
      FROM takeoff_line_items WHERE section_id = section_uuid
    )
  WHERE id = section_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function: Recalculate takeoff totals
CREATE OR REPLACE FUNCTION recalculate_takeoff_totals(takeoff_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE takeoffs SET
    total_material_cost = (
      SELECT COALESCE(SUM(total_material_cost), 0)
      FROM takeoff_sections WHERE takeoff_id = takeoff_uuid
    ),
    total_labor_cost = (
      SELECT COALESCE(SUM(total_labor_cost), 0)
      FROM takeoff_sections WHERE takeoff_id = takeoff_uuid
    ),
    total_cost = (
      SELECT COALESCE(SUM(total_cost), 0)
      FROM takeoff_sections WHERE takeoff_id = takeoff_uuid
    ),
    updated_at = NOW()
  WHERE id = takeoff_uuid;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-recalculate on line item changes
CREATE OR REPLACE FUNCTION auto_recalculate_totals()
RETURNS trigger AS $$
DECLARE
  section_uuid UUID;
  takeoff_uuid UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    section_uuid := OLD.section_id;
  ELSE
    section_uuid := NEW.section_id;
  END IF;

  SELECT takeoff_id INTO takeoff_uuid
  FROM takeoff_sections WHERE id = section_uuid;

  PERFORM recalculate_section_totals(section_uuid);
  PERFORM recalculate_takeoff_totals(takeoff_uuid);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger attachment
CREATE TRIGGER trigger_recalculate_totals
AFTER INSERT OR UPDATE OR DELETE ON takeoff_line_items
FOR EACH ROW EXECUTE FUNCTION auto_recalculate_totals();
```

### 5.2 Auto-Scope Rule Evaluation

The auto-scope rules use JSONB containment for trigger matching:

```sql
-- Example: Check if configuration matches trigger condition
SELECT * FROM siding_auto_scope_rules
WHERE active = true
  AND (
    trigger_condition IS NULL
    OR trigger_condition @> '{"always": true}'
    OR (trigger_condition ? 'min_corners'
        AND (trigger_condition->>'min_corners')::int <= :corner_count)
  )
ORDER BY group_order, item_order;
```

---

## 6. Frontend Detection Editor Integration

### 6.1 useDetectionSync Hook

**File Reference**: [lib/hooks/useDetectionSync.ts](lib/hooks/useDetectionSync.ts)

```typescript
const WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
  'https://n8n-production-293e.up.railway.app';

const SYNC_ENDPOINT = `${WEBHOOK_URL}/webhook/detection-edit-sync`;
const VALIDATE_ENDPOINT = `${WEBHOOK_URL}/webhook/validate-detections`;
```

### 6.2 Validation Payload

```typescript
interface ValidationDetection {
  id: string;
  class: string;
  confidence?: number;
  points?: number[][];
  polygon?: { x: number; y: number }[];
  dimensions?: {
    area_sqft?: number;
    perimeter_lf?: number;
    height_ft?: number;
    width_ft?: number;
  };
  material_assignment?: {
    pricing_item_id: string;
    product_name?: string;
    manufacturer?: string;
    quantity: number;
    unit: string;
    price_override?: number;
    labor_override?: number;
    color_override?: string;
    notes?: string;
  };
  is_suppressed?: boolean;
  suppressed_reason?: string;
}
```

### 6.3 Data Flow

```
Detection Editor (Konva.js)
         │
         ▼
  useDetectionSync.ts
         │
         ├─── POST /webhook/validate-detections
         │         (Validate detection data)
         │
         └─── POST /webhook/detection-edit-sync
                   (Sync changes to database)
                          │
                          ▼
                 Railway API (Express)
                          │
                          ├─── calculateWithAutoScopeV2()
                          │
                          ├─── Auto-Scope V2 Rules
                          │
                          └─── Save to takeoff_line_items
```

---

## 7. ExcelJS Generation

### 7.1 Professional Export

**File Reference**: [lib/utils/excelExportProfessional.ts](lib/utils/excelExportProfessional.ts)

```typescript
export async function exportProfessionalEstimate(options: {
  takeoff: Takeoff;
  sections: TakeoffSection[];
  lineItems: TakeoffLineItem[];
  projectInfo: ProjectInfo;
  filename?: string;
}): Promise<void>
```

**Features**:
- Company header with logo
- Project information section
- Color-coded section headers
- Alternating row colors
- Currency formatting
- Mike Skjei methodology calculations
- L&I insurance: `baseLabor * 1.1265` (12.65%)
- Summary totals with formulas

### 7.2 Vendor Takeoff Export

```typescript
export async function exportVendorTakeoff(options: {
  lineItems: TakeoffLineItem[];
  projectInfo: ProjectInfo;
  filename?: string;
}): Promise<void>
```

**Features**:
- Material-only takeoff for vendor ordering
- SKU and quantity columns
- Grouped by presentation_group
- No labor or markup columns

### 7.3 Presentation Groups

Line items are organized by `presentation_group` for consistent Excel output:

| Group | Order | Contents |
|-------|-------|----------|
| Siding | 1 | Siding panels, lap siding, shingles |
| Trim | 2 | Window/door trim, corner trim |
| Accessories | 3 | J-channel, starter strips, vents |
| Fasteners | 4 | Nails, screws, staples |
| Flashing | 5 | Z-flashing, drip edge |
| Caulk | 6 | Sealants, caulk |
| Water Barrier | 7 | House wrap, WRB |
| Labor | 8 | Installation labor items |
| Overhead | 9 | L&I, unemployment, insurance |

---

## 8. Database Tables Reference

### 8.1 Core Tables

```sql
-- pricing_items: Product catalog with pricing
pricing_items (
  id UUID PRIMARY KEY,
  sku TEXT UNIQUE,
  product_name TEXT,
  manufacturer TEXT,
  category TEXT,
  trade TEXT,
  unit TEXT,
  material_cost DECIMAL,
  base_labor_cost DECIMAL,
  li_insurance_cost DECIMAL,
  unemployment_cost DECIMAL,
  total_labor_cost DECIMAL,
  labor_class TEXT  -- Links to labor_rates.rate_name
)

-- siding_auto_scope_rules: Auto-scope rules
siding_auto_scope_rules (
  rule_id SERIAL PRIMARY KEY,
  rule_name TEXT,
  material_sku TEXT,
  quantity_formula TEXT,
  trigger_condition JSONB,
  presentation_group TEXT,
  manufacturer_filter TEXT[],
  active BOOLEAN
)

-- labor_rates: Labor rate definitions
labor_rates (
  id UUID PRIMARY KEY,
  rate_name TEXT,           -- e.g., "Lap Siding Installation"
  trade TEXT,
  unit TEXT,                -- "SQ" (square = 100 SF)
  base_rate DECIMAL,        -- $/SQ
  difficulty_multiplier DECIMAL,
  min_charge DECIMAL
)

-- labor_auto_scope_rules: Labor rule engine
labor_auto_scope_rules (
  id SERIAL PRIMARY KEY,
  rule_name TEXT,
  trade TEXT,
  trigger_type TEXT,        -- 'always', 'material_category', etc.
  trigger_value TEXT,
  labor_rate_id INTEGER,
  quantity_source TEXT,
  quantity_formula TEXT
)

-- overhead_costs: Overhead cost definitions
overhead_costs (
  id UUID PRIMARY KEY,
  cost_name TEXT,
  category TEXT,
  cost_type TEXT,           -- 'percentage', 'calculated', 'flat_fee'
  base_rate DECIMAL,
  calculation_formula TEXT,
  applies_to_trade TEXT[]
)
```

### 8.2 Takeoff Tables

```sql
-- takeoffs: Main takeoff record
takeoffs (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  total_material_cost DECIMAL,
  total_labor_cost DECIMAL,
  total_cost DECIMAL,
  status TEXT
)

-- takeoff_sections: Section groupings
takeoff_sections (
  id UUID PRIMARY KEY,
  takeoff_id UUID REFERENCES takeoffs(id),
  section_name TEXT,
  display_order INTEGER,
  total_material_cost DECIMAL,
  total_labor_cost DECIMAL,
  total_cost DECIMAL
)

-- takeoff_line_items: Individual line items
takeoff_line_items (
  id UUID PRIMARY KEY,
  section_id UUID REFERENCES takeoff_sections(id),
  item_name TEXT,
  description TEXT,
  sku TEXT,
  quantity DECIMAL,
  unit TEXT,
  material_unit_cost DECIMAL,
  material_extended DECIMAL,
  labor_unit_cost DECIMAL,
  labor_extended DECIMAL,
  line_total DECIMAL,
  source_measurement JSONB,  -- Provenance tracking
  calculation_source TEXT,
  presentation_group TEXT
)
```

---

## 9. Debugging Guide

### 9.1 Webhook Logging

The Railway API logs extensively:

```
📥 Webhook received (V2 hybrid): project_id=xxx, assignments=15
🔍 detection_counts from webhook: {...}
🎯 [V8.0] Spatial containment ENABLED
📋 Evaluating 45 auto-scope rules...
   Total project area: 2500.00 SF
   Manufacturer groups: James Hardie, Nichiha
✓ Rule 1: Tyvek House Wrap [GENERIC: 2500 SF] → 2 ROLL
✓ Rule 5: J-Channel [James Hardie: 1800 SF] → 48 EA
✅ Auto-scope V2 complete: 12/45 rules triggered
```

### 9.2 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Missing line items | Rule not triggered | Check trigger_condition matches context |
| Wrong quantities | Formula error | Verify variable names match MeasurementContext |
| No manufacturer-specific items | Empty manufacturer groups | Check material_assignments have valid pricing_item_id |
| Labor not calculated | Missing labor_class | Add labor_class to pricing_items |
| Pricing = $0 | Missing SKU in pricing_items | Add SKU to database |

### 9.3 Testing Endpoints

```bash
# Health check
curl https://n8n-production-293e.up.railway.app/webhook/health

# Test calculation with sample data
curl -X POST https://n8n-production-293e.up.railway.app/webhook/test \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 10. Version History

| Version | Date | Changes |
|---------|------|---------|
| V8.1 | 2024-01 | Per-material corners, trim, belly band |
| V8.0 | 2024-01 | Spatial containment for per-manufacturer openings |
| V6.0 | 2023-12 | Mike Skjei methodology, labor_class grouping |
| V5.0 | 2023-11 | Manufacturer-aware auto-scope rules |
| V2.0 | 2023-10 | Database-driven auto-scope engine |
| V1.0 | 2023-09 | Initial SKU-based calculation |
