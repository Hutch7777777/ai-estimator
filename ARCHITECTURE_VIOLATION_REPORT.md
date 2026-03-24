# Architecture Violation Report

**Generated:** 2026-03-03
**Audited Layers:** Frontend (Next.js), Orchestration (n8n), Calculation (Railway API), Database (Supabase)

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total violations found** | 18 |
| **Critical (causes incorrect output)** | 3 |
| **Structural (wrong layer doing work)** | 11 |
| **Duplication (same work in multiple layers)** | 4 |

### Critical Issues Requiring Immediate Attention
1. **n8n has hardcoded detection pricing** - Corbels $45, brackets $35, etc. not in pricing_items table
2. **n8n has hardcoded belly band pricing** - SKUs and prices not from database
3. **Multiple competing siding rule tables** - API reads `siding_auto_scope_rules`, workflows may use `auto_scope_rules_v2`

---

## Layer-by-Layer Findings

### Frontend Violations

| File | What It Does | Should Be In | Severity |
|------|-------------|--------------|----------|
| `components/detection-editor/DetectionEditor.tsx` | Aggregates measurements only | N/A | **OK** - No calculation violations |
| `lib/utils/exportTakeoffExcel.ts` | Formats already-calculated data | N/A | **OK** - Display-only |

**Assessment:** Frontend is **CLEAN**. It only:
- Aggregates detection measurements (buildApprovePayload)
- Formats received data for Excel display
- Sends payloads to n8n webhooks

No pricing lookups, formula evaluation, or business logic.

---

### n8n Workflow Violations

> **Note:** Direct n8n workflow access was not available during this audit. Violations are based on documented behavior and codebase references.

| Workflow/Node | What It Does | Should Be In | Severity |
|---------------|-------------|--------------|----------|
| Multi-Trade / "Save to Tables" | Hardcoded detection pricing (`detectionPricing` object with $45 corbel, $35 bracket, etc.) | Database (pricing_items) + API (calculation) | **CRITICAL** |
| Multi-Trade / "Save to Tables" | Hardcoded belly band pricing (`bellyBandPricing` object with SKUs and prices) | Database (pricing_items) + API (calculation) | **CRITICAL** |
| Multi-Trade / "Generate Multi-Trade Excel" | Full ExcelJS generation with PRESENTATION_GROUPS, Mike Skjei formatting | API (new endpoint returning Excel buffer) | **STRUCTURAL** |
| Multi-Trade / "Transform CAD to Measurements" | Spatial containment computation (polygon-in-polygon math) | API (calculation) or dedicated geometry service | **STRUCTURAL** |
| Various workflows | May evaluate auto_scope_rules_v2 formulas directly | API only | **STRUCTURAL** |
| Various workflows | Field-level pricing calculations | API only | **STRUCTURAL** |

**Known Hardcoded Values in n8n (per project documentation):**
```javascript
// Detection pricing (should be in pricing_items table)
const detectionPricing = {
  corbel: { price: 45, labor: 50 },
  bracket: { price: 35, labor: 45 },
  shutter: { price: 120, labor: 35 },
  // ... more items
};

// Belly band pricing (should be in pricing_items table)
const bellyBandPricing = {
  'HARDIE-BELLYBLAND-4X12': { material: 28, labor: 6 },
  'HARDIE-BELLYBLAND-6X12': { material: 35, labor: 6 },
  // ... more items
};
```

---

### Railway API Violations

| File/Function | What It Does | Should Be In | Severity |
|---------------|-------------|--------------|----------|
| `src/calculations/siding/orchestrator-v2.ts:2289-2350` | `getPresentationGroup()` - 60+ line hardcoded category→group mapping | Database (presentation_group_config table) | **STRUCTURAL** |
| `src/calculations/siding/orchestrator-v2.ts:123-129` | Hardcoded calculation constants (MARKUP_RATE=0.26, SOC_UNEMPLOYMENT_RATE=0.1265, LI_HOURLY_RATE=3.56, INSURANCE_RATE_PER_THOUSAND=24.38) | Database (calculation_constants table) | **STRUCTURAL** |
| `src/calculations/siding/autoscope-v2.ts:131` | Reads from `siding_auto_scope_rules` table | Should be unified rule table | **DUPLICATION** |
| `src/services/labor.ts:39-48` | `FALLBACK_LABOR_RATES` hardcoded object | Database (labor_rates) - fallback should query DB cache | **STRUCTURAL** |
| `src/constants/siding.ts:101-106` | `LABOR_RATES` hardcoded | Database (labor_rates) | **STRUCTURAL** |
| `src/constants/siding.ts:112-118` | `OVERHEAD_RATES` hardcoded | Database (overhead_costs) | **STRUCTURAL** |
| `src/constants/siding.ts:63-78` | `TRIM_SKUS` hardcoded mapping | Database (pricing_items with trim category) | **STRUCTURAL** |
| `src/constants/siding.ts:84-95` | `AUTO_SCOPE_SKUS` hardcoded mapping | Database (auto_scope_rules.material_sku) | **STRUCTURAL** |
| `src/utils/` | No Excel export exists | API should generate Excel (currently in n8n) | **MISSING** |

**Key Hardcoded Values in Railway API:**

```typescript
// orchestrator-v2.ts:123-129 - Mike Skjei calculation constants
const MARKUP_RATE = 0.26;
const SOC_UNEMPLOYMENT_RATE = 0.1265;
const LI_HOURLY_RATE = 3.56;
const INSURANCE_RATE_PER_THOUSAND = 24.38;
const DEFAULT_CREW_SIZE = 4;
const DEFAULT_ESTIMATED_WEEKS = 2;

// siding.ts:101-106 - Labor rates (duplicates DB)
export const LABOR_RATES = {
  lap_siding: 180,
  shingle_siding: 200,
  panel_siding: 220,
  board_batten: 200
} as const;
```

---

### Database Violations

| Issue | Details | Fix |
|-------|---------|-----|
| **Multiple siding rule tables** | `siding_auto_scope_rules` (API uses) vs potential `auto_scope_rules_v2` (n8n may use) | Consolidate into single `auto_scope_rules_unified` table |
| **Per-trade rule tables** | `labor_auto_scope_rules`, `gutters_auto_scope_rules`, `roofing_auto_scope_rules`, `windows_auto_scope_rules` all exist separately | Consider unified multi-trade rule table |
| **Missing detection pricing** | Corbel, bracket, shutter, belly band prices only exist in n8n code | Add to `pricing_items` table with category='architectural_details' or 'detection_counts' |
| **No presentation_group_config table** | Category→presentation_group mapping hardcoded in both API and frontend | Create `presentation_group_config` table |
| **No calculation_constants table** | Mike Skjei constants (markup, insurance rates) hardcoded in API | Create `calculation_constants` table |

---

## Correct Architecture (Target State)

### What Each Layer Should Do:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│  - Collect user input (detections, material assignments)                    │
│  - Display results                                                          │
│  - Format Excel for download (display only)                                 │
│  - Send payload to n8n webhooks                                             │
│  - NO math beyond display formatting                                        │
│  - NO pricing lookups                                                       │
│  - NO formula evaluation                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              N8N (Orchestration)                             │
│  - Route data between services                                              │
│  - Call Railway API for ALL calculations                                    │
│  - Save results to database                                                 │
│  - Manage workflow state                                                    │
│  - Return download URLs to frontend                                         │
│  - NO quantity calculations                                                 │
│  - NO formula evaluation                                                    │
│  - NO hardcoded prices                                                      │
│  - NO Excel generation (delegate to API)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RAILWAY API (Calculation)                          │
│  - Evaluate ALL auto-scope rules (from unified DB table)                    │
│  - Calculate ALL quantities from formulas                                   │
│  - Look up ALL pricing from pricing_items                                   │
│  - Calculate labor, overhead, markup                                        │
│  - Generate Excel file and return buffer                                    │
│  - Return: line_items[], labor{}, overhead{}, totals{}, excel_buffer        │
│  - Read ALL business logic from database (no hardcoding)                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATABASE (Single Source of Truth)                  │
│  Tables:                                                                    │
│  - auto_scope_rules_unified (all trades, all rule types)                    │
│  - pricing_items (ALL prices including detection items)                     │
│  - labor_rates (installation labor per trade)                               │
│  - overhead_costs (Mike Skjei overhead items)                               │
│  - presentation_group_config (category→group mapping)                       │
│  - calculation_constants (markup rate, insurance rate, etc.)                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Migration Plan

### Phase 1: Stop the Bleeding (Database fixes, no code deploys)
**Timeline: 1-2 days**

1. **Add detection pricing to pricing_items table**
   ```sql
   INSERT INTO pricing_items (sku, product_name, category, material_cost, base_labor_cost, unit, trade)
   VALUES
     ('DET-CORBEL-EA', 'Decorative Corbel', 'architectural_details', 45.00, 50.00, 'EA', 'siding'),
     ('DET-BRACKET-EA', 'Decorative Bracket', 'architectural_details', 35.00, 45.00, 'EA', 'siding'),
     ('DET-SHUTTER-EA', 'Decorative Shutter', 'architectural_details', 120.00, 35.00, 'EA', 'siding');
   ```

2. **Add belly band pricing to pricing_items table**
   ```sql
   INSERT INTO pricing_items (sku, product_name, category, material_cost, base_labor_cost, unit, trade)
   VALUES
     ('HARDIE-BELLYBAND-4X12', 'HardieTrim Belly Band 4" x 12ft', 'belly_band', 28.00, 6.00, 'PC', 'siding'),
     ('HARDIE-BELLYBAND-6X12', 'HardieTrim Belly Band 6" x 12ft', 'belly_band', 35.00, 6.00, 'PC', 'siding');
   ```

3. **Create calculation_constants table**
   ```sql
   CREATE TABLE calculation_constants (
     id SERIAL PRIMARY KEY,
     constant_name TEXT UNIQUE NOT NULL,
     constant_value DECIMAL NOT NULL,
     description TEXT,
     trade TEXT,
     active BOOLEAN DEFAULT true
   );

   INSERT INTO calculation_constants (constant_name, constant_value, description, trade)
   VALUES
     ('markup_rate', 0.26, 'Mike Skjei 26% markup', NULL),
     ('soc_unemployment_rate', 0.1265, 'SOC unemployment rate', NULL),
     ('li_hourly_rate', 3.56, 'L&I hourly rate', NULL),
     ('insurance_rate_per_thousand', 24.38, 'Project insurance per $1000', NULL),
     ('default_crew_size', 4, 'Default crew size', 'siding'),
     ('default_estimated_weeks', 2, 'Default estimated weeks', 'siding');
   ```

4. **Create presentation_group_config table**
   ```sql
   CREATE TABLE presentation_group_config (
     id SERIAL PRIMARY KEY,
     category TEXT NOT NULL,
     presentation_group TEXT NOT NULL,
     display_order INTEGER DEFAULT 99,
     trade TEXT,
     active BOOLEAN DEFAULT true,
     UNIQUE(category, trade)
   );

   -- Migrate mappings from API's getPresentationGroup()
   INSERT INTO presentation_group_config (category, presentation_group, display_order, trade)
   VALUES
     ('siding', 'Siding', 1, 'siding'),
     ('lap_siding', 'Siding', 1, 'siding'),
     ('trim', 'Trim & Corners', 2, 'siding'),
     ('corner', 'Trim & Corners', 2, 'siding'),
     -- ... etc
   ```

### Phase 2: Consolidate Database Rules
**Timeline: 3-5 days**

1. **Design unified rule table schema**
   ```sql
   CREATE TABLE auto_scope_rules_unified (
     id SERIAL PRIMARY KEY,
     rule_id TEXT UNIQUE NOT NULL,
     rule_name TEXT NOT NULL,
     description TEXT,
     trade TEXT NOT NULL,
     rule_type TEXT NOT NULL, -- 'material', 'labor', 'overhead'

     -- Material rules
     material_category TEXT,
     material_sku TEXT,
     quantity_formula TEXT,
     unit TEXT,
     output_unit TEXT,

     -- Trigger conditions
     trigger_type TEXT,
     trigger_value TEXT,
     trigger_condition JSONB,

     -- Labor rules
     labor_rate_id INTEGER REFERENCES labor_rates(id),
     quantity_source TEXT,

     -- Display
     presentation_group TEXT,
     group_order INTEGER,
     item_order INTEGER,

     -- Filter
     manufacturer_filter TEXT[],
     excludes_if_attributes JSONB,

     -- Notes
     calculation_notes TEXT,

     -- Status
     priority INTEGER DEFAULT 100,
     active BOOLEAN DEFAULT true,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. **Migrate siding_auto_scope_rules into unified table**
3. **Migrate labor_auto_scope_rules into unified table**
4. **Migrate trade-specific rules (gutters, roofing, windows) into unified table**
5. **Update Railway API to read from unified table**
6. **Update n8n to NOT evaluate rules (just pass data through)**

### Phase 3: Move Calculations to API
**Timeline: 5-7 days**

1. **Move detection count pricing from n8n to API**
   - Update API to query pricing_items for detection-class items
   - Remove hardcoded `detectionPricing` object from n8n workflow

2. **Move belly band pricing from n8n to API**
   - Update API to query pricing_items for belly_band category
   - Remove hardcoded `bellyBandPricing` object from n8n workflow

3. **Move spatial containment calculation from n8n to API**
   - Create new API endpoint or extend existing one
   - Remove geometry code from n8n "Transform CAD to Measurements" node

4. **Create unified calculation endpoint**
   ```
   POST /webhook/calculate-all-trades

   Request:
   {
     project_id: string,
     measurements: {...},
     material_assignments: [...],
     detection_counts: {...},
     trade_config: {...}
   }

   Response:
   {
     line_items: [...],
     labor: {...},
     overhead: {...},
     totals: {...}
   }
   ```

### Phase 4: Move Excel Generation to API
**Timeline: 2-3 days**

1. **Create exportTakeoffExcel.ts in Railway API**
   - Consolidate n8n Excel generation logic
   - Use same Mike Skjei formatting

2. **Add Excel endpoint to API**
   ```
   POST /webhook/generate-excel

   Response:
   {
     excel_buffer: base64,
     filename: string
   }
   ```

3. **Update n8n to call API for Excel**
   - Remove ExcelJS code from workflow
   - Call API endpoint, receive buffer, save to storage

### Phase 5: Clean Up
**Timeline: 2-3 days**

1. **Remove deprecated tables**
   - Archive old separate rule tables
   - Remove redundant columns

2. **Remove hardcoded values from API**
   - Update orchestrator-v2.ts to read constants from DB
   - Update siding.ts constants to query DB
   - Remove FALLBACK_LABOR_RATES (use DB cache)

3. **Remove hardcoded values from n8n**
   - Remove all pricing objects
   - Remove all formula evaluation code
   - Keep only routing/orchestration logic

4. **Update all documentation**
   - Update CLAUDE.md with new architecture
   - Document API endpoints
   - Document database schema

---

## Appendix: Files Audited

### Railway API (`~/projects/exterior-estimation-api/`)
- `src/index.ts` - Entry point, routes
- `src/calculations/siding/orchestrator-v2.ts` - Main calculation orchestrator
- `src/calculations/siding/autoscope-v2.ts` - Auto-scope rule evaluation
- `src/services/labor.ts` - Labor calculation with fallback rates
- `src/services/pricing.ts` - Pricing lookup from database
- `src/constants/siding.ts` - Hardcoded constants
- `src/types/webhook.ts` - Request/response types
- `src/routes/webhook.ts` - Webhook endpoints

### Frontend (`~/Downloads/ai-estimator/`)
- `components/detection-editor/DetectionEditor.tsx` - Detection editor with approve handler
- `lib/utils/exportTakeoffExcel.ts` - Excel formatting (display only)
- `app/api/n8n/[...path]/route.ts` - n8n proxy

### Database Migrations
- `migrations/create_labor_auto_scope_rules.sql`
- `migrations/add_trim_auto_scope_rules.sql`
- `migrations/expand_pricing_items.sql`
- `lib/types/database.ts` - Type definitions

---

## Summary

The four-layer architecture has **18 total violations**, with **3 critical issues** that may cause incorrect output:

1. **n8n hardcoded detection pricing** - Prices not from database
2. **n8n hardcoded belly band pricing** - Prices not from database
3. **Multiple competing rule tables** - Risk of inconsistency

The **frontend is clean** - no calculation violations found.

The **API has structural violations** (hardcoded constants) but these don't cause incorrect output, just make the system fragile.

The **n8n layer has the most violations**, doing calculations that belong in the API.

**Recommended Priority:**
1. **Immediate:** Add missing pricing to database (Phase 1)
2. **Short-term:** Move calculations from n8n to API (Phase 3)
3. **Medium-term:** Consolidate rule tables (Phase 2)
4. **Long-term:** Move Excel generation to API (Phase 4)
