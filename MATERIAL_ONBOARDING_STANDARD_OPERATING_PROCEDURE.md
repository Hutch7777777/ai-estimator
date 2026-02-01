# Material Onboarding Standard Operating Procedure

## Exterior Estimation System - Complete Material Integration Guide

**Version:** 1.0
**Last Updated:** 2026-01-31
**Author:** System Documentation
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#1-overview)
2. [Phase 1: Information Gathering](#2-phase-1-information-gathering)
3. [Phase 2: Database Product Catalog](#3-phase-2-database-product-catalog)
4. [Phase 3: Auto-Scope Rules Configuration](#4-phase-3-auto-scope-rules-configuration)
5. [Phase 4: Labor Configuration](#5-phase-4-labor-configuration)
6. [Phase 5: Calculation Formulas](#6-phase-5-calculation-formulas)
7. [Phase 6: Overhead Costs](#7-phase-6-overhead-costs)
8. [Phase 7: Trade Configuration UI](#8-phase-7-trade-configuration-ui)
9. [Phase 8: Verification & Testing](#9-phase-8-verification-testing)
10. [Phase 9: Frontend Integration](#10-phase-9-frontend-integration)
11. [Phase 10: Documentation](#11-phase-10-documentation)
12. [Troubleshooting Guide](#12-troubleshooting-guide)
13. [Appendix: SQL Templates & Reference Tables](#13-appendix-sql-templates--reference-tables)

---

## 1. Overview

### 1.1 Purpose

This document provides a complete, repeatable process for adding new materials (siding, roofing, windows, gutters), their accessories, auto-scope rules, labor rates, and pricing to the Exterior Estimation System.

### 1.2 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js + React)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │ ProductConfigStep│  │ Detection Editor│  │ Estimate Editor (AG Grid)  │ │
│  │ (Dynamic Forms)  │  │ (Measurements)  │  │ (Takeoff Line Items)       │ │
│  └────────┬─────────┘  └────────┬────────┘  └──────────────┬──────────────┘ │
└───────────┼─────────────────────┼───────────────────────────┼───────────────┘
            │                     │                           │
            ▼                     ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            RAILWAY API                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    Calculation Pipeline                               │  │
│  │  1. /webhook/siding-estimator → Receive measurements + config        │  │
│  │  2. /webhook/calculate-siding → Auto-scope engine + pricing          │  │
│  │  3. Return: Takeoff line items with full cost breakdown              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE DATABASE                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────────────┐  │
│  │ pricing_items   │  │ auto_scope_rules│  │ labor_rates                │  │
│  │ (Product SKUs)  │  │ (Material Rules)│  │ (Installation Costs)       │  │
│  └─────────────────┘  └─────────────────┘  └────────────────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────────────┐  │
│  │ product_catalog │  │ labor_auto_scope│  │ overhead_costs             │  │
│  │ (UI Options)    │  │ (Labor Rules)   │  │ (Permits, Equipment, etc.) │  │
│  └─────────────────┘  └─────────────────┘  └────────────────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────────────┐  │
│  │ trade_config    │  │ takeoff_line_   │  │ calculation_formulas       │  │
│  │ (Form Fields)   │  │ items (Output)  │  │ (Quantity Calculations)    │  │
│  └─────────────────┘  └─────────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Database Tables Reference

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `pricing_items` | Material SKUs with costs | sku, material_cost, labor_class, manufacturer |
| `siding_auto_scope_rules` | V1 auto-scope rules (siding) | rule_name, material_sku, quantity_formula, trigger_condition |
| `auto_scope_rules_v2` | V2 auto-scope rules (all trades) | rule_name, material_sku, quantity_formula, manufacturer_filter |
| `product_catalog` | Frontend dropdown options | product_name, category, physical_properties |
| `product_options` | Product variant options | parent_product_id, option_type, option_value |
| `material_components` | BOM component relationships | parent_sku, component_sku, quantity_formula |
| `labor_rates` | Labor cost rates by type | rate_name, base_rate, presentation_group |
| `labor_auto_scope_rules` | Labor calculation rules | trigger_type, trigger_value, labor_rate_id |
| `calculation_formulas` | Named calculation formulas | formula_name, formula_expression, variables |
| `overhead_costs` | Overhead cost items | cost_type, calculation_method, rate |
| `trade_configurations` | UI form field definitions | config_name, field_type, show_if_conditions |

### 1.4 Key Relationships

```
pricing_items.labor_class ──────────────► labor_rates.rate_name
     │
     │ (SKU reference)
     ▼
siding_auto_scope_rules.material_sku ───► pricing_items.sku
     │
     │ (manufacturer filter)
     ▼
auto_scope_rules_v2.manufacturer_filter ─► pricing_items.manufacturer
     │
     │ (labor calculation)
     ▼
labor_auto_scope_rules.labor_rate_id ───► labor_rates.id
     │
     │ (UI integration)
     ▼
trade_configurations.catalog_filter ────► product_catalog.category
```

---

## 2. Phase 1: Information Gathering

### 2.1 Manufacturer Data Collection Checklist

Before adding any new material to the system, gather the following information:

#### Product Information
- [ ] Official manufacturer product name
- [ ] Product SKU/model numbers
- [ ] Available sizes (width, length, thickness)
- [ ] Available textures (smooth, cedarmill, stucco, etc.)
- [ ] Available finishes (primed, factory-painted, ColorPlus equivalent)
- [ ] Coverage specifications (SF per unit, reveal dimensions)
- [ ] Waste factor recommendations (typically 10-15%)

#### Pricing Information
- [ ] Material cost per unit (from distributor)
- [ ] Bulk pricing tiers (if applicable)
- [ ] Color upcharge (if any)
- [ ] Special handling fees

#### Color Palette (for factory-finished products)
- [ ] Official color names
- [ ] Hex codes for UI display (request from manufacturer or sample)
- [ ] Color groupings (earth tones, neutrals, bold colors)

#### Accessories & Trim
- [ ] Compatible trim products
- [ ] Required starter strips/channels
- [ ] Corner pieces (inside/outside)
- [ ] Flashing requirements
- [ ] Caulk/sealant recommendations

#### Installation Requirements
- [ ] Installation method (nail, screw, clip system)
- [ ] Fastener specifications
- [ ] Substrate requirements (WRB, sheathing)
- [ ] Special tools required
- [ ] Labor difficulty factor (1.0 = standard, 1.2 = moderate, 1.5 = complex)

### 2.2 Example: James Hardie Product Data

```yaml
Manufacturer: James Hardie
Product Line: HardiePlank Lap Siding

Products:
  - SKU: HP-825-CM-CP
    Name: HardiePlank 8.25" x 12ft Cedarmill ColorPlus
    Width: 8.25"
    Length: 12ft
    Thickness: 0.312"
    Texture: Cedarmill
    Finish: ColorPlus (factory-painted)
    Coverage: 7.0 SF (7" reveal)
    Material_Cost: $20.50/ea
    Waste_Factor: 1.10

Colors (ColorPlus Palette):
  - Name: Arctic White, Hex: #F5F5F0
  - Name: Statement Collection Iron Gray, Hex: #4A4A4A
  - Name: Evening Blue, Hex: #2D3E50
  # ... (25 total colors)

Accessories:
  - HardieTrim 4/4 x 3.5" x 12ft (corners, casings)
  - HardieTrim 4/4 x 5.5" x 12ft (wide casings)
  - ColorMatch Caulk (color-matched sealant)
```

### 2.3 Example: Nichiha Product Data

```yaml
Manufacturer: Nichiha
Product Line: Architectural Wall Panels (AWP)

Products:
  - SKU: NICHIHA-AWP-VG-48
    Name: Nichiha VintageWood 4" x 8ft Panel
    Width: 4"
    Length: 8ft
    Thickness: 5/8"
    Texture: Wood Grain
    Finish: Factory Primed
    Coverage: 2.67 SF/panel
    Material_Cost: $12.50/ea
    Installation: Clip System (requires clips + starter track)

Accessories:
  - AWP Starter Track (required for first course)
  - AWP Metal Clips (2 per panel)
  - AWP Outside Corner (aluminum, painted)
  - AWP Inside Corner (aluminum, painted)
```

### 2.4 Example: Allura Fiber Cement Data

```yaml
Manufacturer: Allura (Ply Gem)
Product Line: Allura Fiber Cement Lap Siding

Products:
  - SKU: ALLURA-LAP-825-PR
    Name: Allura Lap Siding 8.25" x 12ft Primed
    Width: 8.25"
    Length: 12ft
    Texture: Smooth/Woodgrain
    Finish: Primed (field paint required)
    Coverage: 7.0 SF
    Material_Cost: $14.00/ea (budget alternative to Hardie)

Notes:
  - Uses same accessories as James Hardie (HardieTrim, corners)
  - Lower price point, similar installation
  - No factory-painted option
```

### 2.5 Example: FastPlank Composite Data

```yaml
Manufacturer: Engage Building Products
Product Line: FastPlank Composite Cladding

Products:
  - SKU: FASTPLANK-8-16-GRY
    Name: FastPlank 8" x 16ft Slate Gray
    Width: 8"
    Length: 16ft
    Thickness: 7/16"
    Texture: Wood Grain
    Finish: Through-body color (no painting needed)
    Coverage: 10.67 SF
    Material_Cost: $32.00/ea (premium)
    Installation: Concealed fastener system

Accessories:
  - FastPlank H-Mold (horizontal joints)
  - FastPlank J-Channel (perimeter)
  - FastPlank Starter Strip
  - FastPlank Color-Matched Screws
```

---

## 3. Phase 2: Database Product Catalog

### 3.1 Overview

The `pricing_items` table is the primary source of truth for all material SKUs, costs, and labor classifications. The `product_catalog` table drives the frontend UI dropdowns.

### 3.2 pricing_items Table Structure

```sql
-- Full pricing_items table structure
CREATE TABLE pricing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES pricing_snapshots(id),

  -- Product identification
  sku TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  manufacturer TEXT,
  category TEXT,            -- 'lap_siding', 'panel', 'trim', 'flashing', etc.
  trade TEXT DEFAULT 'siding',

  -- Dimensions & Coverage
  unit TEXT,                -- 'ea', 'LF', 'SF', 'box', 'tube'
  coverage_value DECIMAL,   -- Coverage amount
  coverage_unit TEXT,       -- 'SF', 'LF'
  reveal_inches DECIMAL,    -- Exposure for lap siding

  -- Costs
  material_cost DECIMAL NOT NULL,
  base_labor_cost DECIMAL DEFAULT 0,

  -- Mike Skjei Labor Methodology
  labor_class TEXT,         -- Links to labor_rates.rate_name
  li_insurance_cost DECIMAL,
  unemployment_cost DECIMAL,
  total_labor_cost DECIMAL,

  -- Product attributes
  texture TEXT,             -- 'smooth', 'cedarmill', 'stucco'
  is_colorplus BOOLEAN DEFAULT false,

  -- Presentation
  presentation_group TEXT,  -- Excel output grouping

  -- Metadata
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 SQL Template: Add New Siding Product Line

```sql
-- ============================================================================
-- TEMPLATE: Add New Manufacturer Siding Products
-- Replace: [MANUFACTURER], [PRODUCT_LINE], costs, dimensions
-- ============================================================================

DO $$
DECLARE
  v_snapshot_id uuid := '0a0cc4ac-0b7f-4e4c-ae6a-af79c624ae53'; -- Current snapshot
BEGIN

  -- LAP SIDING PRODUCTS
  INSERT INTO pricing_items (
    snapshot_id, sku, product_name, category, trade, unit,
    material_cost, base_labor_cost, manufacturer,
    texture, coverage_value, coverage_unit, reveal_inches,
    is_colorplus, labor_class, notes
  )
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    -- Primed Products
    ('MFGR-LAP-625-PR', 'Manufacturer Lap Siding 6.25" x 12ft Primed',
     'lap_siding', 'siding', 'ea', 13.50, 0.00, 'Manufacturer Name',
     'smooth', 5.25, 'SF', 5.0, false, 'Lap Siding Installation',
     'Standard lap profile'),

    ('MFGR-LAP-825-PR', 'Manufacturer Lap Siding 8.25" x 12ft Primed',
     'lap_siding', 'siding', 'ea', 15.25, 0.00, 'Manufacturer Name',
     'smooth', 7.0, 'SF', 7.0, false, 'Lap Siding Installation',
     'Most popular width'),

    -- Factory Painted Products (if applicable)
    ('MFGR-LAP-825-FP', 'Manufacturer Lap Siding 8.25" x 12ft Factory Painted',
     'lap_siding', 'siding', 'ea', 20.50, 0.00, 'Manufacturer Name',
     'smooth', 7.0, 'SF', 7.0, true, 'Lap Siding Installation',
     'Factory finished, 15-year paint warranty')

  ) AS vals(sku, product_name, category, trade, unit, material_cost,
            base_labor_cost, manufacturer, texture, coverage_value,
            coverage_unit, reveal_inches, is_colorplus, labor_class, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

END $$;
```

### 3.4 SQL Template: Add Trim Products

```sql
-- ============================================================================
-- TEMPLATE: Add Trim Products for Manufacturer
-- ============================================================================

DO $$
DECLARE
  v_snapshot_id uuid := '0a0cc4ac-0b7f-4e4c-ae6a-af79c624ae53';
BEGIN

  INSERT INTO pricing_items (
    snapshot_id, sku, product_name, category, trade, unit,
    material_cost, manufacturer, coverage_value, coverage_unit,
    labor_class, notes
  )
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    -- Standard Trim Widths
    ('MFGR-TRIM-35-12', 'Manufacturer Trim 1x4 (3.5") x 12ft Primed',
     'trim', 'siding', 'ea', 12.00, 'Manufacturer Name',
     12.0, 'LF', 'Trim Installation', 'Window/door casing'),

    ('MFGR-TRIM-55-12', 'Manufacturer Trim 1x6 (5.5") x 12ft Primed',
     'trim', 'siding', 'ea', 16.00, 'Manufacturer Name',
     12.0, 'LF', 'Trim Installation', 'Wide casing, fascia'),

    ('MFGR-TRIM-725-12', 'Manufacturer Trim 1x8 (7.25") x 12ft Primed',
     'trim', 'siding', 'ea', 22.00, 'Manufacturer Name',
     12.0, 'LF', 'Trim Installation', 'Frieze board, rake trim'),

    -- Corners
    ('MFGR-CORNER-4-10', 'Manufacturer Outside Corner 4" x 10ft',
     'corner', 'siding', 'ea', 28.00, 'Manufacturer Name',
     10.0, 'LF', 'Trim Installation', 'Standard outside corner'),

    ('MFGR-CORNER-6-10', 'Manufacturer Outside Corner 6" x 10ft',
     'corner', 'siding', 'ea', 38.00, 'Manufacturer Name',
     10.0, 'LF', 'Trim Installation', 'Wide outside corner')

  ) AS vals(sku, product_name, category, trade, unit, material_cost,
            manufacturer, coverage_value, coverage_unit, labor_class, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

END $$;
```

### 3.5 SQL Template: Add Accessory Products

```sql
-- ============================================================================
-- TEMPLATE: Add Accessory/Fastener Products
-- ============================================================================

DO $$
DECLARE
  v_snapshot_id uuid := '0a0cc4ac-0b7f-4e4c-ae6a-af79c624ae53';
BEGIN

  INSERT INTO pricing_items (
    snapshot_id, sku, product_name, category, trade, unit,
    material_cost, manufacturer, labor_class, notes
  )
  SELECT v_snapshot_id, vals.*
  FROM (VALUES
    -- Fasteners
    ('MFGR-NAILS-SS-5LB', 'Stainless Steel Siding Nails 2.5" 5lb Box',
     'fasteners', 'siding', 'box', 45.00, 'Manufacturer Name',
     NULL, 'Ring shank, 316 SS for coastal'),

    -- Caulk/Sealants
    ('MFGR-CAULK-MATCH', 'Color-Match Caulk 10.1oz Tube',
     'sealants', 'siding', 'tube', 8.50, 'Manufacturer Name',
     NULL, 'Matches factory paint colors'),

    -- Flashing
    ('MFGR-ZFLASH-10', 'Z-Flashing 2" x 10ft Aluminum',
     'flashing', 'siding', 'ea', 12.50, 'Generic',
     NULL, 'Pre-painted, horizontal transitions'),

    -- WRB (Weather Resistant Barrier)
    ('WRB-TYVEK-9X150', 'Tyvek HomeWrap 9ft x 150ft Roll',
     'wrb', 'siding', 'roll', 185.00, 'DuPont',
     NULL, 'Covers 1,350 SF')

  ) AS vals(sku, product_name, category, trade, unit, material_cost,
            manufacturer, labor_class, notes)
  WHERE NOT EXISTS (SELECT 1 FROM pricing_items WHERE pricing_items.sku = vals.sku);

END $$;
```

### 3.6 product_catalog Integration

The `product_catalog` table drives the frontend dropdown options:

```sql
-- ============================================================================
-- TEMPLATE: Add Products to Frontend Catalog
-- ============================================================================

INSERT INTO product_catalog (
  trade, manufacturer, product_line, product_name, sku,
  category, tier, physical_properties, material_cost,
  unit, sort_order, active
)
SELECT vals.*
FROM (VALUES
  ('siding', 'Manufacturer Name', 'Product Line',
   'Product Display Name', 'MFGR-LAP-825-PR',
   'LAP SIDING - SMOOTH', 'Standard',
   '{"is_colorplus": false, "texture": "smooth"}'::jsonb,
   15.25, 'ea', 100, true),

  ('siding', 'Manufacturer Name', 'Product Line ColorPlus',
   'Product Display Name - Factory Painted', 'MFGR-LAP-825-FP',
   'LAP SIDING - SMOOTH', 'Premium',
   '{"is_colorplus": true, "texture": "smooth", "hex_code": "#FFFFFF"}'::jsonb,
   20.50, 'ea', 101, true)

) AS vals(trade, manufacturer, product_line, product_name, sku,
          category, tier, physical_properties, material_cost, unit, sort_order, active)
WHERE NOT EXISTS (SELECT 1 FROM product_catalog WHERE product_catalog.sku = vals.sku);
```

### 3.7 Verification Queries

```sql
-- Verify products were added correctly
SELECT sku, product_name, category, manufacturer, material_cost, labor_class
FROM pricing_items
WHERE manufacturer = 'Manufacturer Name'
ORDER BY category, sku;

-- Check for missing labor_class assignments
SELECT sku, product_name, category
FROM pricing_items
WHERE trade = 'siding'
  AND labor_class IS NULL
  AND category NOT IN ('fasteners', 'sealants', 'flashing');

-- Verify catalog integration
SELECT product_name, sku, category, physical_properties
FROM product_catalog
WHERE manufacturer = 'Manufacturer Name';
```

---

## 4. Phase 3: Auto-Scope Rules Configuration

### 4.1 Overview

Auto-scope rules automatically generate material line items based on project measurements. The system uses two rule tables:
- `siding_auto_scope_rules` - V1 engine (siding-specific)
- `auto_scope_rules_v2` - V2 engine (all trades, manufacturer-aware)

### 4.2 MeasurementContext Variables

These variables are available in quantity formulas:

```typescript
interface MeasurementContext {
  // Area measurements
  facade_sqft: number;           // Total facade area
  facade_area_sqft: number;      // Alias for facade_sqft
  gross_wall_area_sqft: number;  // Gross wall area before deductions
  net_siding_area_sqft: number;  // Net area after window/door deductions
  siding_squares: number;        // facade_sqft / 100

  // Window measurements
  window_count: number;
  window_area_sqft: number;
  window_perimeter_lf: number;
  window_head_lf: number;
  window_sill_lf: number;
  window_jamb_lf: number;

  // Door measurements
  door_count: number;
  door_area_sqft: number;
  door_perimeter_lf: number;
  door_head_lf: number;
  door_jamb_lf: number;

  // Garage measurements
  garage_count: number;
  garage_head_lf: number;

  // Corner measurements
  outside_corner_count: number;
  outside_corner_lf: number;
  inside_corner_count: number;
  inside_corner_lf: number;

  // Trim aggregate measurements
  trim_total_lf: number;         // Sum of all trim LF
  trim_head_lf: number;          // All head trim
  trim_jamb_lf: number;          // All jamb trim
  trim_sill_lf: number;          // All sill trim

  // Gable/Roof measurements
  gable_rake_lf: number;
  roof_eave_lf: number;
  roof_rake_lf: number;

  // Counts
  openings_count: number;        // window_count + door_count
}
```

### 4.3 Trigger Conditions

Trigger conditions determine when a rule fires:

```typescript
// Simple equality (most common)
trigger_condition: {
  "siding_manufacturer": "james_hardie"
}

// Greater than check
trigger_condition: {
  "facade_sqft_gt": 0
}

// Contains check (for arrays)
trigger_condition: {
  "selected_products": {
    "contains": "lap_siding"
  }
}

// Multiple conditions (AND logic)
trigger_condition: {
  "siding_manufacturer": "james_hardie",
  "siding_texture": "cedarmill"
}

// Always trigger (no conditions)
trigger_condition: null
```

### 4.4 siding_auto_scope_rules Structure

```sql
CREATE TABLE siding_auto_scope_rules (
  rule_id SERIAL PRIMARY KEY,
  rule_name TEXT UNIQUE NOT NULL,
  description TEXT,

  -- Material reference
  material_category TEXT,
  material_sku TEXT,           -- References pricing_items.sku

  -- Quantity calculation
  quantity_formula TEXT,       -- JavaScript/SQL expression
  unit TEXT,
  output_unit TEXT,

  -- Triggering
  trigger_condition JSONB,     -- When to apply rule
  manufacturer_filter TEXT[],  -- Array of manufacturer slugs

  -- Presentation
  presentation_group TEXT,     -- Excel section: 'siding', 'trim', 'flashing', 'fasteners'
  group_order INTEGER,
  item_order INTEGER,
  size_description TEXT,

  -- Status
  priority INTEGER DEFAULT 100,
  active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.5 SQL Template: Primary Siding Material Rule

```sql
-- ============================================================================
-- RULE: Primary Siding Material (Manufacturer-Specific)
-- This rule generates the main siding material based on facade area
-- ============================================================================

INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  manufacturer_filter,
  presentation_group,
  group_order,
  item_order,
  priority,
  active
) VALUES (
  'Manufacturer Lap Siding',
  'Primary lap siding boards based on net siding area. Formula includes 10% waste.',
  'lap_siding',
  'MFGR-LAP-825-PR',
  'CEILING(net_siding_area_sqft / 7.0 * 1.10)',  -- 7 SF coverage, 10% waste
  'ea',
  'ea',
  '{"siding_manufacturer": "manufacturer_name"}'::jsonb,
  ARRAY['manufacturer_name'],
  'siding',
  1,
  1,
  10,
  true
)
ON CONFLICT (rule_name) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  trigger_condition = EXCLUDED.trigger_condition,
  manufacturer_filter = EXCLUDED.manufacturer_filter,
  updated_at = NOW();
```

### 4.6 SQL Template: Trim/Casing Rules

```sql
-- ============================================================================
-- RULE: Window/Door Casing Trim
-- ============================================================================

INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  manufacturer_filter,
  presentation_group,
  group_order,
  item_order,
  priority,
  active
) VALUES (
  'Manufacturer Window/Door Casing',
  'Trim boards for window and door casings. Based on total trim LF.',
  'trim',
  'MFGR-TRIM-55-12',
  'CEILING(trim_total_lf / 12 * 1.10)',  -- 12ft boards, 10% waste
  'ea',
  'ea',
  '{"trim_total_lf_gt": 0, "siding_manufacturer": "manufacturer_name"}'::jsonb,
  ARRAY['manufacturer_name'],
  'trim',
  2,
  1,
  50,
  true
);

-- ============================================================================
-- RULE: Outside Corners
-- ============================================================================

INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  manufacturer_filter,
  presentation_group,
  group_order,
  item_order,
  priority,
  active
) VALUES (
  'Manufacturer Outside Corners',
  'Corner trim for outside building corners.',
  'corner',
  'MFGR-CORNER-4-10',
  'CEILING(outside_corner_lf / 10 * 1.05)',  -- 10ft pieces, 5% waste
  'ea',
  'ea',
  '{"outside_corner_lf_gt": 0, "siding_manufacturer": "manufacturer_name"}'::jsonb,
  ARRAY['manufacturer_name'],
  'trim',
  2,
  2,
  55,
  true
);
```

### 4.7 SQL Template: Accessory Rules

```sql
-- ============================================================================
-- RULE: Siding Nails (per square)
-- ============================================================================

INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  manufacturer_filter,
  presentation_group,
  group_order,
  item_order,
  priority,
  active
) VALUES (
  'Manufacturer Siding Nails',
  'Stainless steel siding nails. 1 box per 2 squares.',
  'fasteners',
  'MFGR-NAILS-SS-5LB',
  'CEILING(siding_squares / 2)',
  'box',
  'box',
  '{"siding_manufacturer": "manufacturer_name", "siding_squares_gt": 0}'::jsonb,
  ARRAY['manufacturer_name'],
  'fasteners',
  4,
  1,
  80,
  true
);

-- ============================================================================
-- RULE: Color-Match Caulk
-- ============================================================================

INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  manufacturer_filter,
  presentation_group,
  group_order,
  item_order,
  priority,
  active
) VALUES (
  'Manufacturer Color-Match Caulk',
  'Color-matched caulk for trim joints. 1 tube per 40 LF of trim.',
  'sealants',
  'MFGR-CAULK-MATCH',
  'CEILING(trim_total_lf / 40)',
  'tube',
  'tube',
  '{"trim_total_lf_gt": 0, "siding_manufacturer": "manufacturer_name"}'::jsonb,
  ARRAY['manufacturer_name'],
  'fasteners',
  4,
  5,
  90,
  true
);

-- ============================================================================
-- RULE: Z-Flashing (for horizontal transitions)
-- ============================================================================

INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  manufacturer_filter,
  presentation_group,
  group_order,
  item_order,
  priority,
  active
) VALUES (
  'Head Flashing - Doors/Windows',
  'Z-flashing above window and door heads. Based on head trim LF.',
  'flashing',
  'ZFLASH-10',
  'CEILING(trim_head_lf / 10 * 1.10)',
  'ea',
  'ea',
  '{"trim_head_lf_gt": 0}'::jsonb,
  NULL,  -- Generic, applies to all manufacturers
  'flashing',
  3,
  1,
  70,
  true
);
```

### 4.8 SQL Template: WRB (Weather Barrier) Rule

```sql
-- ============================================================================
-- RULE: Weather Resistant Barrier (WRB)
-- Always applies based on facade area
-- ============================================================================

INSERT INTO siding_auto_scope_rules (
  rule_name,
  description,
  material_category,
  material_sku,
  quantity_formula,
  unit,
  output_unit,
  trigger_condition,
  manufacturer_filter,
  presentation_group,
  group_order,
  item_order,
  priority,
  active
) VALUES (
  'Tyvek House Wrap',
  'Weather resistant barrier for entire facade. 1 roll covers 1,350 SF.',
  'wrb',
  'WRB-TYVEK-9X150',
  'CEILING(facade_sqft / 1350 * 1.10)',  -- 10% waste/overlap
  'roll',
  'roll',
  '{"facade_sqft_gt": 0}'::jsonb,
  NULL,  -- Applies to all manufacturers
  'wrb',
  0,
  1,
  5,
  true
);
```

### 4.9 Presentation Groups Reference

| Group | Description | Order | Typical Items |
|-------|-------------|-------|---------------|
| `wrb` | Weather Resistant Barrier | 0 | Housewrap, tape, staples |
| `siding` | Primary Siding Materials | 1 | Lap siding, panels, shingles |
| `trim` | Trim & Corners | 2 | Casing, corners, frieze, rake |
| `flashing` | Flashing Materials | 3 | Z-flashing, drip edge, kickout |
| `fasteners` | Fasteners & Sealants | 4 | Nails, screws, caulk, adhesive |
| `accessories` | Accessories | 5 | Vents, utility blocks, mounts |

### 4.10 Verification Queries

```sql
-- List all rules for a manufacturer
SELECT
  rule_name,
  material_sku,
  quantity_formula,
  trigger_condition,
  presentation_group,
  priority
FROM siding_auto_scope_rules
WHERE manufacturer_filter @> ARRAY['manufacturer_name']
   OR manufacturer_filter IS NULL
ORDER BY priority, presentation_group;

-- Check for orphaned SKU references
SELECT rule_name, material_sku
FROM siding_auto_scope_rules
WHERE material_sku NOT IN (SELECT sku FROM pricing_items)
  AND active = true;

-- Test quantity formula (dry run)
SELECT
  rule_name,
  material_sku,
  quantity_formula,
  -- Example with test values
  CEILING(2500.0 / 7.0 * 1.10) as example_quantity_2500sf
FROM siding_auto_scope_rules
WHERE rule_name = 'Manufacturer Lap Siding';
```

---

## 5. Phase 4: Labor Configuration

### 5.1 Overview

Labor costs are calculated using the Mike Skjei methodology:
- Base labor rate per unit (square, LF, EA)
- L&I Insurance rate: 12.65%
- Unemployment rate: 4.5%
- Total = Base + (Base × L&I) + (Base × Unemployment)

### 5.2 labor_rates Table Structure

```sql
CREATE TABLE labor_rates (
  id SERIAL PRIMARY KEY,
  rate_name TEXT UNIQUE NOT NULL,      -- Must match pricing_items.labor_class
  description TEXT,
  trade TEXT DEFAULT 'siding',
  presentation_group TEXT,
  unit TEXT,                           -- 'square', 'linear_foot', 'each'
  base_rate DECIMAL NOT NULL,          -- Base labor rate
  difficulty_multiplier DECIMAL DEFAULT 1.00,
  li_insurance_rate DECIMAL DEFAULT 0.1265,  -- 12.65%
  unemployment_rate DECIMAL DEFAULT 0.045,    -- 4.5%
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.3 SQL Template: Add Labor Rates

```sql
-- ============================================================================
-- TEMPLATE: Labor Rates for Manufacturer Products
-- ============================================================================

INSERT INTO labor_rates (
  rate_name,
  description,
  trade,
  presentation_group,
  unit,
  base_rate,
  difficulty_multiplier,
  active,
  notes
) VALUES
  -- Siding Installation Rates
  ('Lap Siding Installation',
   'Standard horizontal lap siding installation',
   'siding', 'siding', 'square',
   250.00, 1.00, true,
   'Standard rate for fiber cement and composite lap siding'),

  ('Panel Siding Installation',
   'Large format panel siding installation',
   'siding', 'siding', 'square',
   200.00, 1.00, true,
   'Faster installation due to larger panels'),

  ('Shingle Siding Installation',
   'Individual shingle/shake siding installation',
   'siding', 'siding', 'square',
   400.00, 1.00, true,
   'More time-intensive pattern installation'),

  ('Board & Batten Installation',
   'Vertical board and batten siding',
   'siding', 'siding', 'square',
   350.00, 1.00, true,
   'Includes batten strips'),

  ('Nichiha AWP Installation',
   'Nichiha Architectural Wall Panel with clip system',
   'siding', 'siding', 'square',
   380.00, 1.00, true,
   'Clip system requires additional time'),

  ('Composite Plank Installation',
   'Composite cladding installation (FastPlank, etc.)',
   'siding', 'siding', 'square',
   280.00, 1.00, true,
   'Concealed fastener systems'),

  -- Trim Installation Rates
  ('Trim Installation',
   'Window/door casing and corner trim',
   'siding', 'trim', 'linear_foot',
   6.00, 1.00, true,
   'Standard trim board installation'),

  ('Fascia Installation',
   'Fascia board installation',
   'siding', 'fascia', 'linear_foot',
   8.00, 1.00, true,
   'Requires ladder/scaffold'),

  ('Soffit Installation',
   'Soffit panel installation',
   'siding', 'soffit', 'square',
   180.00, 1.00, true,
   'Overhead work, vented or solid'),

  -- Prep/Demo Rates
  ('WRB Installation',
   'Weather resistant barrier installation',
   'siding', 'wrb', 'square',
   45.00, 1.00, true,
   'Housewrap, tape, flashings'),

  ('Demo/Cleanup',
   'Remove existing siding and debris cleanup',
   'siding', 'demo', 'square',
   75.00, 1.00, true,
   'Includes dumpster disposal')

ON CONFLICT (rate_name) DO UPDATE SET
  base_rate = EXCLUDED.base_rate,
  difficulty_multiplier = EXCLUDED.difficulty_multiplier,
  updated_at = NOW();
```

### 5.4 labor_auto_scope_rules Structure

```sql
CREATE TABLE labor_auto_scope_rules (
  id SERIAL PRIMARY KEY,
  rule_id TEXT UNIQUE NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT,
  trade TEXT NOT NULL DEFAULT 'siding',

  -- Trigger configuration
  trigger_type TEXT NOT NULL CHECK (
    trigger_type IN ('always', 'material_category', 'material_sku_pattern', 'detection_class')
  ),
  trigger_value TEXT,          -- Comma-separated categories, patterns, or classes
  trigger_condition JSONB,     -- Additional conditions

  -- Labor rate reference
  labor_rate_id INTEGER REFERENCES labor_rates(id),

  -- Quantity calculation
  quantity_source TEXT NOT NULL CHECK (
    quantity_source IN ('facade_sqft', 'material_sqft', 'material_count',
                        'detection_count', 'material_lf')
  ),
  quantity_formula TEXT,       -- Optional formula
  quantity_unit TEXT DEFAULT 'square',

  -- Rule ordering
  priority INTEGER DEFAULT 100,
  active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.5 SQL Template: Add Labor Auto-Scope Rules

```sql
-- ============================================================================
-- TEMPLATE: Labor Auto-Scope Rules
-- ============================================================================

INSERT INTO labor_auto_scope_rules (
  rule_id,
  rule_name,
  description,
  trade,
  trigger_type,
  trigger_value,
  labor_rate_id,
  quantity_source,
  quantity_formula,
  quantity_unit,
  priority
) VALUES
  -- Always-apply rules
  ('LABOR-WRB-INSTALL', 'WRB Installation',
   'Weather resistant barrier - applies to all siding jobs',
   'siding', 'always', NULL,
   (SELECT id FROM labor_rates WHERE rate_name = 'WRB Installation'),
   'facade_sqft', 'facade_sqft / 100', 'square', 10),

  ('LABOR-DEMO-CLEANUP', 'Demo/Cleanup',
   'Remove existing siding and debris cleanup',
   'siding', 'always', NULL,
   (SELECT id FROM labor_rates WHERE rate_name = 'Demo/Cleanup'),
   'facade_sqft', 'facade_sqft / 100', 'square', 5),

  -- Material category-based rules
  ('LABOR-LAP-SIDING', 'Lap Siding Installation',
   'Install lap siding materials',
   'siding', 'material_category', 'lap_siding,siding',
   (SELECT id FROM labor_rates WHERE rate_name = 'Lap Siding Installation'),
   'material_sqft', 'material_sqft / 100', 'square', 20),

  ('LABOR-PANEL-SIDING', 'Panel Siding Installation',
   'Install panel siding materials',
   'siding', 'material_category', 'panel,panel_siding',
   (SELECT id FROM labor_rates WHERE rate_name = 'Panel Siding Installation'),
   'material_sqft', 'material_sqft / 100', 'square', 20),

  ('LABOR-TRIM', 'Trim Installation',
   'Install trim boards and corners',
   'siding', 'material_category', 'trim,corner,corners',
   (SELECT id FROM labor_rates WHERE rate_name = 'Trim Installation'),
   'material_lf', NULL, 'linear_foot', 30),

  ('LABOR-SOFFIT', 'Soffit Installation',
   'Install soffit panels',
   'siding', 'material_category', 'soffit',
   (SELECT id FROM labor_rates WHERE rate_name = 'Soffit Installation'),
   'material_sqft', 'material_sqft / 100', 'square', 30),

  ('LABOR-FASCIA', 'Fascia Installation',
   'Install fascia boards',
   'siding', 'material_category', 'fascia',
   (SELECT id FROM labor_rates WHERE rate_name = 'Fascia Installation'),
   'material_lf', NULL, 'linear_foot', 30)

ON CONFLICT (rule_id) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  trigger_type = EXCLUDED.trigger_type,
  trigger_value = EXCLUDED.trigger_value,
  labor_rate_id = EXCLUDED.labor_rate_id,
  quantity_source = EXCLUDED.quantity_source,
  quantity_formula = EXCLUDED.quantity_formula,
  quantity_unit = EXCLUDED.quantity_unit,
  priority = EXCLUDED.priority,
  updated_at = NOW();
```

### 5.6 Link pricing_items to Labor Rates

```sql
-- ============================================================================
-- Update pricing_items.labor_class for New Manufacturer
-- ============================================================================

-- Lap siding products
UPDATE pricing_items
SET labor_class = 'Lap Siding Installation'
WHERE manufacturer = 'Manufacturer Name'
  AND category IN ('lap_siding', 'siding')
  AND labor_class IS NULL;

-- Panel products
UPDATE pricing_items
SET labor_class = 'Panel Siding Installation'
WHERE manufacturer = 'Manufacturer Name'
  AND category IN ('panel', 'panel_siding')
  AND labor_class IS NULL;

-- Trim products
UPDATE pricing_items
SET labor_class = 'Trim Installation'
WHERE manufacturer = 'Manufacturer Name'
  AND category IN ('trim', 'corner', 'corners')
  AND labor_class IS NULL;

-- Verify assignments
SELECT labor_class, COUNT(*) as product_count
FROM pricing_items
WHERE manufacturer = 'Manufacturer Name'
GROUP BY labor_class
ORDER BY product_count DESC;
```

### 5.7 Verification Queries

```sql
-- Check labor rate coverage
SELECT
  p.sku,
  p.product_name,
  p.labor_class,
  lr.base_rate,
  lr.unit as labor_unit
FROM pricing_items p
LEFT JOIN labor_rates lr ON p.labor_class = lr.rate_name
WHERE p.manufacturer = 'Manufacturer Name'
  AND p.trade = 'siding';

-- Find products without labor rates
SELECT sku, product_name, category, labor_class
FROM pricing_items
WHERE trade = 'siding'
  AND labor_class IS NOT NULL
  AND labor_class NOT IN (SELECT rate_name FROM labor_rates);

-- Labor rule coverage summary
SELECT
  trigger_type,
  trigger_value,
  COUNT(*) as rule_count
FROM labor_auto_scope_rules
WHERE active = true
GROUP BY trigger_type, trigger_value
ORDER BY trigger_type;
```

---

## 6. Phase 5: Calculation Formulas

### 6.1 Formula Syntax

Formulas use JavaScript-like expressions evaluated against the MeasurementContext:

```javascript
// Simple calculation
"facade_sqft / 100"

// With waste factor
"CEILING(net_siding_area_sqft / 7.0 * 1.10)"

// Conditional logic
"window_count > 0 ? CEILING(window_perimeter_lf / 12) : 0"

// Complex formula
"CEILING((trim_head_lf + trim_jamb_lf + trim_sill_lf) / 12 * 1.10)"
```

### 6.2 Common Formula Patterns

```sql
-- ============================================================================
-- COMMON FORMULA PATTERNS
-- ============================================================================

-- Squares from square feet
"CEILING(facade_sqft / 100)"

-- Boards from linear feet (12ft boards with waste)
"CEILING(outside_corner_lf / 12 * 1.05)"

-- Boxes of fasteners per square
"CEILING(siding_squares / 2)"

-- Rolls of housewrap (1350 SF coverage)
"CEILING(facade_sqft / 1350 * 1.10)"

-- Tubes of caulk per 40 LF of trim
"CEILING(trim_total_lf / 40)"

-- Pieces of flashing per 10ft
"CEILING(trim_head_lf / 10 * 1.10)"

-- Each item per opening
"window_count + door_count"

-- Coverage-based (siding piece covers 7 SF)
"CEILING(net_siding_area_sqft / 7.0 * 1.10)"
```

### 6.3 Waste Factor Guidelines

| Material Type | Waste Factor | Notes |
|---------------|--------------|-------|
| Lap Siding | 1.10 (10%) | Standard cutting waste |
| Panel Siding | 1.08 (8%) | Less waste, larger pieces |
| Shingle Siding | 1.15 (15%) | More cutting at corners |
| Trim Boards | 1.10 (10%) | Joint cuts |
| Corners | 1.05 (5%) | Minimal waste |
| Housewrap | 1.10 (10%) | Overlap allowance |
| Fasteners | 1.00 (0%) | Boxes are complete |
| Caulk | 1.00 (0%) | Tubes are complete |

---

## 7. Phase 6: Overhead Costs

### 7.1 overhead_costs Table Structure

```sql
CREATE TABLE overhead_costs (
  id SERIAL PRIMARY KEY,
  cost_type TEXT NOT NULL,        -- 'permit', 'equipment', 'dumpster', etc.
  description TEXT,
  trade TEXT DEFAULT 'siding',
  calculation_method TEXT CHECK (
    calculation_method IN ('fixed', 'per_square', 'percentage')
  ),
  rate DECIMAL NOT NULL,
  minimum_charge DECIMAL,
  maximum_charge DECIMAL,
  trigger_condition JSONB,
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.2 SQL Template: Add Overhead Costs

```sql
-- ============================================================================
-- TEMPLATE: Overhead Costs Configuration
-- ============================================================================

INSERT INTO overhead_costs (
  cost_type,
  description,
  trade,
  calculation_method,
  rate,
  minimum_charge,
  maximum_charge,
  trigger_condition,
  active,
  notes
) VALUES
  -- Permits
  ('permit', 'Building Permit Fee',
   'siding', 'per_square', 15.00,
   150.00, 500.00, NULL, true,
   '$15/square, min $150, max $500'),

  -- Equipment Rental
  ('equipment', 'Scaffold Rental (2 weeks)',
   'siding', 'fixed', 450.00,
   NULL, NULL,
   '{"facade_sqft_gt": 1000}'::jsonb, true,
   'Required for jobs over 1,000 SF'),

  ('equipment', 'Lift Rental (1 week)',
   'siding', 'fixed', 850.00,
   NULL, NULL,
   '{"max_height_ft_gt": 25}'::jsonb, true,
   'Required for 3+ story buildings'),

  -- Waste Disposal
  ('dumpster', 'Dumpster Rental (20 yard)',
   'siding', 'fixed', 650.00,
   NULL, NULL, NULL, true,
   'Standard job disposal'),

  ('dumpster', 'Dumpster Rental (30 yard)',
   'siding', 'fixed', 850.00,
   NULL, NULL,
   '{"facade_sqft_gt": 2500}'::jsonb, true,
   'Large job disposal'),

  -- Fuel/Travel
  ('fuel', 'Fuel Surcharge',
   'siding', 'percentage', 0.02,
   50.00, 200.00, NULL, true,
   '2% of material cost, min $50, max $200'),

  -- Safety Equipment
  ('safety', 'Fall Protection Equipment',
   'siding', 'fixed', 125.00,
   NULL, NULL,
   '{"max_height_ft_gt": 12}'::jsonb, true,
   'Required for 2+ story work')

ON CONFLICT DO NOTHING;
```

---

## 8. Phase 7: Trade Configuration UI

### 8.1 Overview

The `trade_configurations` table defines form fields that appear in the ProductConfigStep component. Fields are dynamically loaded from the database.

### 8.2 trade_configurations Structure

```sql
CREATE TABLE trade_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade TEXT NOT NULL,            -- 'siding', 'roofing', 'windows', 'gutters'
  config_section TEXT,            -- 'General', 'Materials', 'Colors', 'Trim'
  config_name TEXT NOT NULL,      -- Unique field identifier
  config_display_name TEXT,
  field_type TEXT,                -- 'select', 'checkbox', 'multiselect', 'number'
  field_label TEXT,
  field_placeholder TEXT,
  field_help_text TEXT,
  field_options JSONB,            -- Options for select fields
  default_value TEXT,
  is_required BOOLEAN DEFAULT false,
  validation_rules JSONB,
  show_if_conditions JSONB,       -- Conditional visibility
  show_if_product_attributes JSONB,
  hide_if_conditions JSONB,
  triggers_auto_scope BOOLEAN DEFAULT false,
  auto_scope_rule_id UUID,
  section_order INTEGER,
  field_order INTEGER,
  group_name TEXT,
  active BOOLEAN DEFAULT true,
  load_from_catalog BOOLEAN DEFAULT false,
  catalog_filter JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(trade, config_name)
);
```

### 8.3 SQL Template: Add Manufacturer Selection Field

```sql
-- ============================================================================
-- Add Manufacturer to Siding Trade Configuration
-- ============================================================================

-- First, update the existing manufacturer field to include new option
UPDATE trade_configurations
SET field_options = field_options ||
  '{"options": [{"value": "manufacturer_name", "label": "Manufacturer Display Name"}]}'::jsonb
WHERE trade = 'siding'
  AND config_name = 'siding_manufacturer';

-- Or insert if creating new field
INSERT INTO trade_configurations (
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_placeholder,
  field_help_text,
  field_options,
  is_required,
  triggers_auto_scope,
  section_order,
  field_order,
  active
) VALUES (
  'siding',
  'General',
  'siding_manufacturer',
  'Siding Manufacturer',
  'select',
  'Select Manufacturer',
  'Choose siding manufacturer',
  'The manufacturer determines available products and auto-scope rules',
  '{
    "options": [
      {"value": "james_hardie", "label": "James Hardie"},
      {"value": "allura", "label": "Allura (Ply Gem)"},
      {"value": "nichiha", "label": "Nichiha"},
      {"value": "lp_smartside", "label": "LP SmartSide"},
      {"value": "fastplank", "label": "FastPlank (Engage)"},
      {"value": "manufacturer_name", "label": "New Manufacturer"}
    ]
  }'::jsonb,
  true,
  true,
  1,
  1,
  true
)
ON CONFLICT (trade, config_name) DO UPDATE SET
  field_options = EXCLUDED.field_options,
  updated_at = NOW();
```

### 8.4 SQL Template: Add Product Selection Field

```sql
-- ============================================================================
-- Add Product Type Selection (loads from product_catalog)
-- ============================================================================

INSERT INTO trade_configurations (
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_help_text,
  is_required,
  triggers_auto_scope,
  section_order,
  field_order,
  show_if_conditions,
  load_from_catalog,
  catalog_filter,
  active
) VALUES (
  'siding',
  'Materials',
  'siding_product_type',
  'Siding Product',
  'select',
  'Select Siding Product',
  'Choose the primary siding product for this project',
  true,
  true,
  2,
  1,
  '{"siding_manufacturer": "manufacturer_name"}'::jsonb,
  true,
  '{"category": "lap_siding", "manufacturer": "Manufacturer Name"}'::jsonb,
  true
)
ON CONFLICT (trade, config_name) DO UPDATE SET
  show_if_conditions = EXCLUDED.show_if_conditions,
  catalog_filter = EXCLUDED.catalog_filter,
  updated_at = NOW();
```

### 8.5 SQL Template: Add Color Selection Field

```sql
-- ============================================================================
-- Add Color Selection (for factory-finished products)
-- ============================================================================

INSERT INTO trade_configurations (
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_help_text,
  is_required,
  section_order,
  field_order,
  show_if_product_attributes,
  field_options,
  active
) VALUES (
  'siding',
  'Colors',
  'siding_color',
  'Siding Color',
  'select',
  'Select Color',
  'Choose factory color for ColorPlus/factory-painted products',
  false,
  3,
  1,
  '{"is_colorplus": true}'::jsonb,  -- Only show for factory-painted products
  '{
    "options": [
      {"value": "arctic_white", "label": "Arctic White", "hex": "#F5F5F0"},
      {"value": "iron_gray", "label": "Iron Gray", "hex": "#4A4A4A"},
      {"value": "evening_blue", "label": "Evening Blue", "hex": "#2D3E50"},
      {"value": "manufacturer_color_1", "label": "New Color 1", "hex": "#XXXXXX"},
      {"value": "manufacturer_color_2", "label": "New Color 2", "hex": "#XXXXXX"}
    ]
  }'::jsonb,
  true
)
ON CONFLICT (trade, config_name) DO UPDATE SET
  field_options = EXCLUDED.field_options,
  updated_at = NOW();
```

### 8.6 Conditional Visibility Patterns

```sql
-- Show field when manufacturer is selected
show_if_conditions: '{"siding_manufacturer": "manufacturer_name"}'

-- Show field when checkbox is checked
show_if_conditions: '{"belly_band_include": true}'

-- Show field when multiple conditions match
show_if_conditions: '{
  "siding_manufacturer": "manufacturer_name",
  "siding_texture": "cedarmill"
}'

-- Show based on product attribute (from product_catalog.physical_properties)
show_if_product_attributes: '{"is_colorplus": true}'

-- Show when field is not empty
show_if_conditions: '{
  "siding_product_type": {
    "operator": "not_equals",
    "value": ""
  }
}'
```

### 8.7 Verification Queries

```sql
-- List all siding configuration fields
SELECT
  config_section,
  config_name,
  field_type,
  field_label,
  show_if_conditions,
  load_from_catalog,
  section_order,
  field_order
FROM trade_configurations
WHERE trade = 'siding'
  AND active = true
ORDER BY section_order, field_order;

-- Check catalog filter configuration
SELECT
  config_name,
  catalog_filter,
  show_if_conditions
FROM trade_configurations
WHERE load_from_catalog = true
  AND trade = 'siding';
```

---

## 9. Phase 8: Verification & Testing

### 9.1 Pre-Deployment Checklist

#### Database Verification

- [ ] All pricing_items have valid SKUs (no duplicates)
- [ ] All pricing_items have material_cost > 0
- [ ] All siding products have labor_class assigned
- [ ] All labor_class values match labor_rates.rate_name
- [ ] All auto_scope rules reference valid pricing_items.sku
- [ ] All trade_configurations have valid field_type values
- [ ] Catalog filters reference valid categories

#### Auto-Scope Rule Verification

- [ ] Primary siding rule generates correct quantities
- [ ] Trim rules use correct linear foot measurements
- [ ] Fastener rules calculate appropriate box counts
- [ ] WRB rule applies to all siding jobs
- [ ] Manufacturer filter restricts rules correctly

#### Labor Calculation Verification

- [ ] Labor rates exist for all siding types
- [ ] Labor auto-scope rules fire for material categories
- [ ] L&I and unemployment percentages are correct
- [ ] Demo/cleanup labor applies to all jobs

### 9.2 SQL Verification Queries

```sql
-- ============================================================================
-- VERIFICATION SUITE
-- Run all queries and check for empty results (errors) or expected counts
-- ============================================================================

-- 1. Check for duplicate SKUs
SELECT sku, COUNT(*) as count
FROM pricing_items
GROUP BY sku
HAVING COUNT(*) > 1;
-- Expected: No results

-- 2. Check for missing material costs
SELECT sku, product_name
FROM pricing_items
WHERE material_cost IS NULL OR material_cost <= 0;
-- Expected: No results

-- 3. Check for orphaned labor_class references
SELECT DISTINCT p.labor_class
FROM pricing_items p
WHERE p.labor_class IS NOT NULL
  AND p.labor_class NOT IN (SELECT rate_name FROM labor_rates);
-- Expected: No results

-- 4. Check for orphaned auto_scope SKU references
SELECT rule_name, material_sku
FROM siding_auto_scope_rules
WHERE material_sku NOT IN (SELECT sku FROM pricing_items)
  AND active = true;
-- Expected: No results

-- 5. Verify manufacturer coverage
SELECT
  manufacturer,
  COUNT(*) as product_count,
  COUNT(DISTINCT category) as categories,
  COUNT(DISTINCT labor_class) as labor_classes
FROM pricing_items
WHERE trade = 'siding'
GROUP BY manufacturer
ORDER BY product_count DESC;
-- Expected: New manufacturer appears with expected counts

-- 6. Verify presentation group coverage
SELECT
  presentation_group,
  COUNT(*) as rule_count,
  array_agg(DISTINCT manufacturer_filter) as manufacturers
FROM siding_auto_scope_rules
WHERE active = true
GROUP BY presentation_group
ORDER BY presentation_group;
-- Expected: All groups represented

-- 7. Verify labor rate completeness
SELECT
  rate_name,
  base_rate,
  unit,
  (SELECT COUNT(*) FROM pricing_items WHERE labor_class = rate_name) as product_count
FROM labor_rates
WHERE trade = 'siding'
ORDER BY rate_name;
-- Expected: All rates have products linked

-- 8. Test quantity formula (example with 2000 SF facade)
WITH test_values AS (
  SELECT
    2000.0 as facade_sqft,
    1800.0 as net_siding_area_sqft,
    20.0 as siding_squares,
    12 as window_count,
    85.0 as trim_total_lf,
    40.0 as outside_corner_lf
)
SELECT
  r.rule_name,
  r.material_sku,
  r.quantity_formula,
  -- Manual calculation for verification
  CASE
    WHEN r.rule_name LIKE '%Lap Siding%' THEN
      CEILING(t.net_siding_area_sqft / 7.0 * 1.10)
    WHEN r.rule_name LIKE '%Corner%' THEN
      CEILING(t.outside_corner_lf / 10 * 1.05)
    WHEN r.rule_name LIKE '%Casing%' THEN
      CEILING(t.trim_total_lf / 12 * 1.10)
  END as calculated_qty
FROM siding_auto_scope_rules r
CROSS JOIN test_values t
WHERE r.manufacturer_filter @> ARRAY['manufacturer_name']
  AND r.active = true
ORDER BY r.priority;
```

### 9.3 Integration Test Checklist

- [ ] Create test project with new manufacturer selected
- [ ] Verify ProductConfigStep shows correct product options
- [ ] Verify color options appear only for ColorPlus products
- [ ] Submit test project to calculation API
- [ ] Verify auto-scope generates expected line items
- [ ] Verify labor calculations are included
- [ ] Verify presentation group ordering in output
- [ ] Export to Excel and verify formatting

### 9.4 Common Test Scenarios

| Scenario | Expected Outcome |
|----------|------------------|
| 2,000 SF facade with 10 windows | ~290 siding boards, ~30 trim boards, ~6 corner pieces |
| ColorPlus product selected | Color selection field visible |
| Non-ColorPlus product selected | Color selection field hidden |
| Manufacturer A selected | Only Manufacturer A rules fire |
| Mixed manufacturer job | Error or warning shown |

---

## 10. Phase 9: Frontend Integration

### 10.1 ProductConfigStep Integration

The frontend automatically loads configuration from `trade_configurations`. No code changes required if:

1. Field types match supported types (`select`, `checkbox`, `multiselect`, `number`)
2. `catalog_filter` correctly references `product_catalog` categories
3. `show_if_conditions` use valid field references

### 10.2 Required Frontend Patterns

```typescript
// ProductConfigStep.tsx - Dynamic field rendering
const filteredProducts = useMemo(() => {
  if (!field.load_from_catalog) return null;

  let products = allProducts.filter(p => {
    // Apply catalog_filter from trade_configurations
    if (field.catalog_filter?.category) {
      const categories = Array.isArray(field.catalog_filter.category)
        ? field.catalog_filter.category
        : [field.catalog_filter.category];
      if (!categories.includes(p.category)) return false;
    }

    if (field.catalog_filter?.manufacturer) {
      const manufacturers = Array.isArray(field.catalog_filter.manufacturer)
        ? field.catalog_filter.manufacturer
        : [field.catalog_filter.manufacturer];
      if (!manufacturers.includes(p.manufacturer)) return false;
    }

    return true;
  });

  // For manufacturer-dependent fields, also filter by selected manufacturer
  if (field.config_name === 'siding_product_type') {
    const selectedMfgr = configurations[trade]?.siding_manufacturer;
    if (selectedMfgr) {
      products = products.filter(p =>
        p.manufacturer.toLowerCase().includes(selectedMfgr.replace('_', ' '))
      );
    }
  }

  return products;
}, [field, allProducts, configurations, trade]);
```

### 10.3 Color Swatch Integration

For factory-painted products, ensure hex codes are in `product_catalog.physical_properties`:

```sql
UPDATE product_catalog
SET physical_properties = physical_properties ||
  '{"hex_code": "#XXXXXX"}'::jsonb
WHERE sku = 'PRODUCT-SKU'
  AND physical_properties->>'is_colorplus' = 'true';
```

The ColorSwatch component reads hex codes automatically:

```typescript
const hexCode = selectedProduct?.physical_properties?.hex_code;
<ColorSwatch
  color={option.value}
  label={option.label}
  hex={hexCode}
  selected={isSelected}
/>
```

---

## 11. Phase 10: Documentation

### 11.1 Required Documentation Updates

After adding a new manufacturer, update:

- [ ] This SOP document (add manufacturer example if unique)
- [ ] `CLAUDE.md` - Add manufacturer to product catalog section
- [ ] Database ERD if schema changed
- [ ] API documentation if new endpoints added

### 11.2 Changelog Entry Template

```markdown
## [Date] - Add [Manufacturer Name] Support

### Added
- **pricing_items**: Added X new products for [Manufacturer]
  - [N] lap siding products (SKU prefix: MFGR-LAP-*)
  - [N] trim products (SKU prefix: MFGR-TRIM-*)
  - [N] accessory products

- **siding_auto_scope_rules**: Added X new rules
  - Primary siding calculation
  - Trim/casing calculation
  - Corner calculation
  - Fastener calculation

- **labor_rates**: Added specialized rate (if applicable)
  - [Rate Name]: $X.XX/[unit]

- **trade_configurations**: Updated manufacturer dropdown

### Changed
- Updated `siding_manufacturer` field options

### Notes
- [Any special installation considerations]
- [Unique product characteristics]
```

---

## 12. Troubleshooting Guide

### 12.1 Common Issues & Solutions

#### Issue: Auto-scope rules not firing

**Symptoms**: No line items generated for new manufacturer

**Diagnosis**:
```sql
-- Check if rules exist and are active
SELECT rule_name, trigger_condition, manufacturer_filter, active
FROM siding_auto_scope_rules
WHERE manufacturer_filter @> ARRAY['manufacturer_name'];
```

**Solutions**:
1. Verify `manufacturer_filter` array contains exact manufacturer slug
2. Check `trigger_condition` matches form field values
3. Ensure `active = true`

---

#### Issue: Products not appearing in dropdown

**Symptoms**: Empty product selection dropdown

**Diagnosis**:
```sql
-- Check product_catalog entries
SELECT * FROM product_catalog
WHERE manufacturer = 'Manufacturer Name'
  AND active = true;

-- Check trade_configurations catalog_filter
SELECT config_name, catalog_filter
FROM trade_configurations
WHERE config_name = 'siding_product_type';
```

**Solutions**:
1. Add products to `product_catalog` with correct `category`
2. Verify `catalog_filter` in `trade_configurations` matches
3. Ensure `active = true` on all records

---

#### Issue: Labor costs not calculating

**Symptoms**: $0.00 labor on line items

**Diagnosis**:
```sql
-- Check labor_class assignments
SELECT sku, product_name, labor_class
FROM pricing_items
WHERE manufacturer = 'Manufacturer Name'
  AND labor_class IS NULL;

-- Check labor_rates exist
SELECT rate_name, base_rate
FROM labor_rates
WHERE rate_name IN (
  SELECT DISTINCT labor_class FROM pricing_items
  WHERE manufacturer = 'Manufacturer Name'
);
```

**Solutions**:
1. Assign `labor_class` to all siding products
2. Add missing `labor_rates` entries
3. Create `labor_auto_scope_rules` for material categories

---

#### Issue: Wrong quantities calculated

**Symptoms**: Line item quantities too high or low

**Diagnosis**:
```sql
-- Check formula syntax
SELECT rule_name, quantity_formula
FROM siding_auto_scope_rules
WHERE rule_name LIKE '%Manufacturer%';
```

**Common Formula Errors**:
- Missing `CEILING()` function
- Wrong waste factor (1.10 = 10%, not 110%)
- Wrong coverage value (7.0 SF, not 7 boards)
- Using `facade_sqft` instead of `net_siding_area_sqft`

**Solution**: Correct formula and test with known values

---

#### Issue: Presentation group ordering wrong

**Symptoms**: Line items in wrong Excel sections

**Diagnosis**:
```sql
SELECT rule_name, presentation_group, group_order, item_order
FROM siding_auto_scope_rules
WHERE manufacturer_filter @> ARRAY['manufacturer_name']
ORDER BY presentation_group, group_order, item_order;
```

**Solutions**:
1. Verify `presentation_group` matches expected values
2. Adjust `group_order` and `item_order` for proper sequencing
3. Reference: wrb=0, siding=1, trim=2, flashing=3, fasteners=4

---

#### Issue: Conditional visibility not working

**Symptoms**: Fields show/hide incorrectly

**Diagnosis**:
```sql
SELECT config_name, show_if_conditions, show_if_product_attributes
FROM trade_configurations
WHERE config_name = 'field_name';
```

**Common Errors**:
- JSON syntax errors in conditions
- Wrong field name reference
- Missing quotes around string values

**Solution**: Verify JSON syntax and field references

---

### 12.2 Debug Query Collection

```sql
-- ============================================================================
-- DEBUG QUERIES
-- Copy-paste these to diagnose issues
-- ============================================================================

-- Debug: Show all data for a manufacturer
\echo 'pricing_items'
SELECT sku, product_name, category, labor_class, material_cost
FROM pricing_items WHERE manufacturer = 'Manufacturer Name';

\echo 'siding_auto_scope_rules'
SELECT rule_name, material_sku, quantity_formula, trigger_condition
FROM siding_auto_scope_rules
WHERE manufacturer_filter @> ARRAY['manufacturer_name'] AND active = true;

\echo 'labor_rates for manufacturer products'
SELECT DISTINCT lr.rate_name, lr.base_rate, lr.unit
FROM labor_rates lr
JOIN pricing_items p ON p.labor_class = lr.rate_name
WHERE p.manufacturer = 'Manufacturer Name';

\echo 'trade_configurations for manufacturer'
SELECT config_name, show_if_conditions, catalog_filter
FROM trade_configurations
WHERE trade = 'siding'
  AND (show_if_conditions::text LIKE '%manufacturer_name%'
       OR catalog_filter::text LIKE '%Manufacturer%');
```

---

## 13. Appendix: SQL Templates & Reference Tables

### 13.1 Complete Manufacturer Onboarding Script Template

```sql
-- ============================================================================
-- COMPLETE MANUFACTURER ONBOARDING SCRIPT
-- Replace all [MANUFACTURER_*] placeholders before running
-- ============================================================================

-- Variables (edit these)
-- [MANUFACTURER_SLUG] = lowercase_with_underscores (e.g., 'james_hardie')
-- [MANUFACTURER_NAME] = Display Name (e.g., 'James Hardie')
-- [SNAPSHOT_ID] = current pricing snapshot UUID

BEGIN;

-- ============================================================================
-- PHASE 1: PRICING ITEMS
-- ============================================================================

DO $$
DECLARE
  v_snapshot_id uuid := '[SNAPSHOT_ID]';
BEGIN

  -- Lap Siding Products
  INSERT INTO pricing_items (
    snapshot_id, sku, product_name, category, trade, unit,
    material_cost, manufacturer, texture, coverage_value, coverage_unit,
    reveal_inches, is_colorplus, labor_class, notes
  ) VALUES
    (v_snapshot_id, '[MFGR]-LAP-625-PR', '[MANUFACTURER_NAME] Lap 6.25" x 12ft Primed',
     'lap_siding', 'siding', 'ea', 13.50, '[MANUFACTURER_NAME]', 'smooth',
     5.25, 'SF', 5.0, false, 'Lap Siding Installation', 'Standard lap'),

    (v_snapshot_id, '[MFGR]-LAP-825-PR', '[MANUFACTURER_NAME] Lap 8.25" x 12ft Primed',
     'lap_siding', 'siding', 'ea', 15.25, '[MANUFACTURER_NAME]', 'smooth',
     7.0, 'SF', 7.0, false, 'Lap Siding Installation', 'Most popular')
  ON CONFLICT (sku) DO NOTHING;

  -- Trim Products
  INSERT INTO pricing_items (
    snapshot_id, sku, product_name, category, trade, unit,
    material_cost, manufacturer, coverage_value, coverage_unit, labor_class
  ) VALUES
    (v_snapshot_id, '[MFGR]-TRIM-55-12', '[MANUFACTURER_NAME] Trim 5.5" x 12ft',
     'trim', 'siding', 'ea', 16.00, '[MANUFACTURER_NAME]', 12.0, 'LF', 'Trim Installation'),

    (v_snapshot_id, '[MFGR]-CORNER-4-10', '[MANUFACTURER_NAME] Corner 4" x 10ft',
     'corner', 'siding', 'ea', 28.00, '[MANUFACTURER_NAME]', 10.0, 'LF', 'Trim Installation')
  ON CONFLICT (sku) DO NOTHING;

END $$;

-- ============================================================================
-- PHASE 2: AUTO-SCOPE RULES
-- ============================================================================

INSERT INTO siding_auto_scope_rules (
  rule_name, description, material_category, material_sku,
  quantity_formula, unit, output_unit, trigger_condition,
  manufacturer_filter, presentation_group, group_order, item_order, priority, active
) VALUES
  ('[MANUFACTURER_NAME] Lap Siding',
   'Primary lap siding boards', 'lap_siding', '[MFGR]-LAP-825-PR',
   'CEILING(net_siding_area_sqft / 7.0 * 1.10)', 'ea', 'ea',
   '{"siding_manufacturer": "[MANUFACTURER_SLUG]"}'::jsonb,
   ARRAY['[MANUFACTURER_SLUG]'], 'siding', 1, 1, 10, true),

  ('[MANUFACTURER_NAME] Window/Door Trim',
   'Trim for openings', 'trim', '[MFGR]-TRIM-55-12',
   'CEILING(trim_total_lf / 12 * 1.10)', 'ea', 'ea',
   '{"siding_manufacturer": "[MANUFACTURER_SLUG]", "trim_total_lf_gt": 0}'::jsonb,
   ARRAY['[MANUFACTURER_SLUG]'], 'trim', 2, 1, 50, true),

  ('[MANUFACTURER_NAME] Outside Corners',
   'Corner trim', 'corner', '[MFGR]-CORNER-4-10',
   'CEILING(outside_corner_lf / 10 * 1.05)', 'ea', 'ea',
   '{"siding_manufacturer": "[MANUFACTURER_SLUG]", "outside_corner_lf_gt": 0}'::jsonb,
   ARRAY['[MANUFACTURER_SLUG]'], 'trim', 2, 2, 55, true)
ON CONFLICT (rule_name) DO UPDATE SET
  material_sku = EXCLUDED.material_sku,
  quantity_formula = EXCLUDED.quantity_formula,
  trigger_condition = EXCLUDED.trigger_condition,
  manufacturer_filter = EXCLUDED.manufacturer_filter,
  updated_at = NOW();

-- ============================================================================
-- PHASE 3: PRODUCT CATALOG (UI)
-- ============================================================================

INSERT INTO product_catalog (
  trade, manufacturer, product_line, product_name, sku,
  category, physical_properties, material_cost, unit, sort_order, active
) VALUES
  ('siding', '[MANUFACTURER_NAME]', '[PRODUCT_LINE]',
   '[MANUFACTURER_NAME] Lap Siding 8.25"', '[MFGR]-LAP-825-PR',
   'LAP SIDING', '{"is_colorplus": false, "texture": "smooth"}'::jsonb,
   15.25, 'ea', 100, true)
ON CONFLICT (sku) DO NOTHING;

-- ============================================================================
-- PHASE 4: TRADE CONFIGURATION (Add to manufacturer dropdown)
-- ============================================================================

UPDATE trade_configurations
SET field_options = jsonb_set(
  field_options,
  '{options}',
  field_options->'options' ||
    '[{"value": "[MANUFACTURER_SLUG]", "label": "[MANUFACTURER_NAME]"}]'::jsonb
)
WHERE trade = 'siding'
  AND config_name = 'siding_manufacturer'
  AND NOT (field_options->'options' @> '[{"value": "[MANUFACTURER_SLUG]"}]'::jsonb);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check pricing_items
SELECT 'pricing_items' as table_name, COUNT(*) as count
FROM pricing_items WHERE manufacturer = '[MANUFACTURER_NAME]';

-- Check auto_scope rules
SELECT 'siding_auto_scope_rules' as table_name, COUNT(*) as count
FROM siding_auto_scope_rules
WHERE manufacturer_filter @> ARRAY['[MANUFACTURER_SLUG]'];

-- Check product_catalog
SELECT 'product_catalog' as table_name, COUNT(*) as count
FROM product_catalog WHERE manufacturer = '[MANUFACTURER_NAME]';

-- Check trade_configurations
SELECT 'trade_configurations' as table_name,
  field_options->'options' @> '[{"value": "[MANUFACTURER_SLUG]"}]'::jsonb as has_option
FROM trade_configurations
WHERE trade = 'siding' AND config_name = 'siding_manufacturer';

COMMIT;
```

### 13.2 Presentation Group Reference

| Group | Order | Purpose | Example Items |
|-------|-------|---------|---------------|
| `wrb` | 0 | Weather barrier | Housewrap, tape, staples |
| `siding` | 1 | Primary siding | Lap boards, panels, shingles |
| `trim` | 2 | Trim & corners | Casings, corners, frieze, rake |
| `flashing` | 3 | Flashing | Z-flash, drip edge, step flashing |
| `fasteners` | 4 | Fasteners & sealants | Nails, screws, caulk |
| `accessories` | 5 | Accessories | Vents, mounts, utility boxes |
| `soffit` | 6 | Soffit & fascia | Soffit panels, fascia boards |
| `labor` | 7 | Labor items | Installation labor, demo |

### 13.3 Unit Reference

| Unit | Meaning | Used For |
|------|---------|----------|
| `ea` | Each/piece | Individual items, boards, panels |
| `LF` | Linear Foot | Trim, corners, gutters |
| `SF` | Square Foot | Area-based coverage |
| `square` | 100 SF | Roofing, siding squares |
| `roll` | Roll | Housewrap, membranes |
| `box` | Box | Fasteners, nails |
| `tube` | Tube | Caulk, sealant |
| `BDL` | Bundle | Shingles |
| `GAL` | Gallon | Paint, primer |

### 13.4 Labor Class Reference

| Labor Class | Base Rate | Unit | Description |
|-------------|-----------|------|-------------|
| Lap Siding Installation | $250/sq | square | Standard horizontal lap |
| Panel Siding Installation | $200/sq | square | Large format panels |
| Shingle Siding Installation | $400/sq | square | Individual shingles |
| Board & Batten Installation | $350/sq | square | Vertical B&B |
| Nichiha AWP Installation | $380/sq | square | Clip system panels |
| Composite Plank Installation | $280/sq | square | Concealed fastener |
| Trim Installation | $6/LF | linear_foot | Standard trim |
| Fascia Installation | $8/LF | linear_foot | Fascia boards |
| Soffit Installation | $180/sq | square | Soffit panels |
| WRB Installation | $45/sq | square | Housewrap |
| Demo/Cleanup | $75/sq | square | Removal & disposal |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-31 | System | Initial document creation |

---

**End of Document**
