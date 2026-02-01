# Trade Configuration System

**AUTHORITATIVE REFERENCE** for the dynamic trade configuration system in AI Estimator.

This document answers:
- How do trade configurations work?
- How do I add/modify/debug configuration fields?
- How do fields connect to products, auto-scope rules, and pricing?
- What are all the field types and visibility options?

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Trade Configuration Schema Reference](#2-trade-configuration-schema-reference)
3. [Frontend Implementation Details](#3-frontend-implementation-details)
4. [Auto-Scope Rule Integration](#4-auto-scope-rule-integration)
5. [Recipes: Common Tasks](#5-recipes-common-tasks)
6. [Debugging Guide](#6-debugging-guide)
7. [Best Practices](#7-best-practices)
8. [Reference: All Current Configurations](#8-reference-all-current-configurations)
9. [Reference: All Product Attributes](#9-reference-all-product-attributes)
10. [Appendix: SQL Templates](#10-appendix-sql-templates)

---

## 1. System Overview

### 1.1 What is a Trade Configuration?

A trade configuration is a **database-driven form field definition** that controls project options for each trade (siding, roofing, windows, gutters). Instead of hardcoding form fields in React components, all field definitions are stored in the `trade_configurations` table.

**Benefits:**
- Add/modify/remove fields without code changes
- Conditional visibility based on other field values or product attributes
- Dynamic product catalog integration
- Automatic auto-scope rule triggering
- Consistent field behavior across the application

**Golden Rule:** NEVER hardcode field definitions in frontend code. ALL fields come from the database.

### 1.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TRADE CONFIGURATION FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐         ┌─────────────────────────────────────┐   │
│  │ trade_configurations│         │      ProductConfigStep.tsx          │   │
│  │     (database)      │────────▶│      (frontend component)           │   │
│  │                     │         │                                      │   │
│  │ • Field definitions │         │ • Fetches configs on mount           │   │
│  │ • Visibility rules  │         │ • Evaluates show_if_* conditions     │   │
│  │ • Catalog filters   │         │ • Renders appropriate field type     │   │
│  └─────────────────────┘         └──────────────┬──────────────────────┘   │
│                                                  │                          │
│  ┌─────────────────────┐                        │                          │
│  │   product_catalog   │                        │                          │
│  │     (database)      │────────────────────────┤                          │
│  │                     │                        │                          │
│  │ • Product options   │         ┌──────────────▼──────────────────────┐   │
│  │ • physical_props    │         │     User makes selections           │   │
│  │ • Categories        │         │                                      │   │
│  └─────────────────────┘         │ • Dropdown selections                │   │
│                                  │ • Checkbox toggles                   │   │
│                                  │ • Multiselect choices                │   │
│                                  └──────────────┬──────────────────────┘   │
│                                                  │                          │
│  ┌─────────────────────┐         ┌──────────────▼──────────────────────┐   │
│  │project_configurations│◀────────│     Form values saved               │   │
│  │     (database)      │         │                                      │   │
│  │                     │         │ Stored as JSONB per project/trade:   │
│  │ • User selections   │         │ {                                    │   │
│  │ • Per project       │         │   "siding_product_type": "uuid",     │   │
│  │ • JSONB format      │         │   "belly_band_include": true,        │   │
│  └─────────────────────┘         │   "belly_band_color": "arctic_white" │   │
│                                  │ }                                    │   │
│           │                      └─────────────────────────────────────┘   │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────┐         ┌─────────────────────────────────────┐   │
│  │siding_auto_scope_   │         │      Takeoff Generation             │   │
│  │      rules          │────────▶│                                      │   │
│  │labor_auto_scope_    │         │ • trigger_condition evaluated        │   │
│  │      rules          │         │ • Matching rules generate items      │   │
│  │                     │         │ • Line items created in takeoff      │   │
│  └─────────────────────┘         └─────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Tables Involved

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `trade_configurations` | Field definitions for all trades | `config_name`, `field_type`, `show_if_*`, `load_from_catalog` |
| `product_catalog` | Products for dropdown options | `physical_properties`, `category`, `manufacturer` |
| `project_configurations` | User selections per project | `configuration_data` (JSONB) |
| `siding_auto_scope_rules` | Material generation rules | `trigger_condition`, `pricing_item_id` |
| `labor_auto_scope_rules` | Labor generation rules | `trigger_condition`, `labor_rate_id` |
| `pricing_items` | Pricing lookup | `sku`, `material_cost`, `labor_cost` |

### 1.4 Data Flow Summary

1. **Page Load:** `ProductConfigStep.tsx` fetches all `trade_configurations` for selected trades
2. **Product Fetch:** All `product_catalog` entries for selected trades are fetched
3. **Field Render:** Each config is evaluated for visibility, then rendered as appropriate field type
4. **User Input:** Form values stored in component state, keyed by `trade.config_name`
5. **Save:** Values saved to `project_configurations.configuration_data` as JSONB
6. **Takeoff:** Auto-scope rules evaluate `trigger_condition` against saved configuration data
7. **Line Items:** Matching rules generate `takeoff_line_items` with pricing

---

## 2. Trade Configuration Schema Reference

### 2.1 Complete Column Reference

**Table: `trade_configurations`**

| Column | Type | Required | Purpose | Example |
|--------|------|----------|---------|---------|
| `id` | UUID | Yes | Primary key | Auto-generated |
| `trade` | TEXT | Yes | Which trade this field belongs to | `'siding'`, `'roofing'`, `'windows'`, `'gutters'` |
| `config_section` | TEXT | Yes | Groups fields into collapsible sections | `'primary_siding'`, `'trim_accessories'` |
| `config_name` | TEXT | Yes | Unique identifier for storage (snake_case) | `'siding_product_type'`, `'belly_band_include'` |
| `config_display_name` | TEXT | No | Display name for section headers | `'Primary Siding Options'` |
| `field_type` | TEXT | Yes | How field renders | `'select'`, `'checkbox'`, `'multiselect'`, `'number'` |
| `field_label` | TEXT | Yes | Human-readable label | `'Primary Siding Product'` |
| `field_placeholder` | TEXT | No | Placeholder text for inputs | `'Select a product...'` |
| `field_help_text` | TEXT | No | Help text shown below field | `'Choose your main siding product'` |
| `field_options` | JSONB | No | Static options (if not load_from_catalog) | `{"options": [{"value": "yes", "label": "Yes"}]}` |
| `default_value` | TEXT | No | Default value when field first renders | `'arctic_white'` |
| `is_required` | BOOLEAN | Yes | Whether field must be filled | `true` or `false` |
| `validation_rules` | JSONB | No | Validation constraints | `{"min": 0, "max": 100, "step": 1}` |
| `show_if_conditions` | JSONB | No | Show based on OTHER field values | `{"belly_band_include": true}` |
| `show_if_product_attributes` | JSONB | No | Show based on product's physical_properties | `{"is_colorplus": true}` |
| `hide_if_conditions` | JSONB | No | Hide based on conditions (inverse of show_if) | `{"upgrade_option": "none"}` |
| `triggers_auto_scope` | BOOLEAN | No | Whether this triggers auto-scope rules | `true` |
| `auto_scope_rule_id` | UUID | No | Direct link to auto-scope rule | FK reference |
| `section_order` | INTEGER | Yes | Display order of sections (1, 2, 3...) | `1` |
| `field_order` | INTEGER | Yes | Display order within section | `1`, `2`, `3`... |
| `group_name` | TEXT | No | Sub-grouping (for parent-child fields) | `'belly_band'` |
| `active` | BOOLEAN | Yes | Whether config is active | `true` |
| `load_from_catalog` | BOOLEAN | No | Load options from product_catalog | `true` |
| `catalog_filter` | JSONB | No | Filter criteria for product_catalog | `{"category": ["LAP SIDING"]}` |
| `created_at` | TIMESTAMP | Yes | Creation timestamp | Auto-generated |
| `updated_at` | TIMESTAMP | Yes | Last update timestamp | Auto-updated |

### 2.2 Field Types

Only **4 field types** are supported:

#### `select` - Single Selection Dropdown

```sql
-- Example: Primary siding product (loads from catalog)
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  is_required, section_order, field_order, load_from_catalog, catalog_filter, active
) VALUES (
  'siding', 'primary_siding', 'siding_product_type', 'select', 'Primary Siding Product',
  true, 1, 1, true,
  '{"active": true, "category": ["LAP SIDING - SMOOTH", "LAP SIDING - CEDARMILL", "PANEL SIDING"]}'::jsonb,
  true
);

-- Example: Static options (not from catalog)
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  field_options, is_required, section_order, field_order, active
) VALUES (
  'siding', 'trim_accessories', 'window_trim_finish', 'select', 'Trim Finish',
  '{"options": [
    {"value": "primed", "label": "Primed"},
    {"value": "colorplus", "label": "ColorPlus"}
  ]}'::jsonb,
  false, 2, 52, true
);
```

**UI Rendering:**
- If `load_from_catalog = true` → `SearchableSelect` with grouped products
- If `field_options` provided → Standard `Select` dropdown

**Stored Value:** Product UUID (if from catalog) or option value string

#### `checkbox` - Boolean Toggle

```sql
-- Example: Parent checkbox for trim accessory
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  is_required, section_order, field_order, triggers_auto_scope, active
) VALUES (
  'siding', 'trim_accessories', 'belly_band_include', 'checkbox', 'Include Belly Band',
  false, 2, 1, true, true
);
```

**UI Rendering:** Single checkbox with label

**Stored Value:** `true` or `false` (boolean)

#### `multiselect` - Multiple Selections

```sql
-- Example: Multiple upgrade options
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  field_options, is_required, section_order, field_order, active
) VALUES (
  'roofing', 'optional_upgrades', 'upgrade_options', 'multiselect', 'Optional Upgrades',
  '{"options": [
    {"value": "ice_water", "label": "Ice & Water Shield"},
    {"value": "synthetic_felt", "label": "Synthetic Underlayment"},
    {"value": "ridge_vent", "label": "Ridge Vent"}
  ]}'::jsonb,
  false, 2, 1, true
);
```

**UI Rendering:** Multiple checkboxes in bordered container

**Stored Value:** Array of selected values `["ice_water", "ridge_vent"]`

#### `number` - Numeric Input

```sql
-- Example: Markup percentage
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  validation_rules, default_value, is_required, section_order, field_order, active
) VALUES (
  'siding', 'primary_siding', 'markup_percent', 'number', 'Markup Percentage',
  '{"min": 0, "max": 100, "step": 1}'::jsonb,
  '25', true, 1, 10, true
);
```

**UI Rendering:** Number input with optional min/max/step validation

**Stored Value:** Number as string (e.g., `"25"`)

### 2.3 Visibility Conditions

Three mechanisms control field visibility, evaluated in order:

#### 2.3.1 `show_if_product_attributes` (Evaluated FIRST)

**Purpose:** Show field only if the selected product has specific `physical_properties`.

**Structure:**
```json
{
  "property_name": expected_value,
  "another_property": expected_value
}
```

**How it works:**
1. Get the selected product ID from the trade's main product field
2. Look up product in `product_catalog`
3. Check ALL key-value pairs against `product.physical_properties`
4. ALL conditions must match for field to show

**Product Field Mapping:**
| Trade | Product Field Name |
|-------|-------------------|
| siding | `siding_product_type` |
| roofing | `roofing_product` |
| windows | `window_series` |
| gutters | `gutter_product` |

**Example:**
```sql
-- Show colorplus_color only when selected product is ColorPlus
show_if_product_attributes = '{"is_colorplus": true}'::jsonb
```

**Type Coercion:**
- Boolean `true` matches: `true`, `"true"`, `1`
- Boolean `false` matches: `false`, `"false"`, `0`, `""`, `undefined`

#### 2.3.2 `show_if_conditions` (Evaluated SECOND)

**Purpose:** Show field based on OTHER form field values.

**Simple Equality Format:**
```json
{
  "other_field_name": expected_value
}
```

**Examples:**
```json
// Show when belly_band_include checkbox is checked
{"belly_band_include": true}

// Show when window_trim_finish is "colorplus"
{"window_trim_finish": "colorplus"}

// Multiple conditions (ALL must match)
{"window_trim_include": true, "window_trim_finish": "colorplus"}
```

**Operator Format:**
```json
{
  "field_name": {
    "operator": "equals|not_equals|contains|not_contains",
    "value": expected_value
  }
}
```

**Supported Operators:**

| Operator | Purpose | Example |
|----------|---------|---------|
| `equals` | Exact match (with empty string handling) | `{"operator": "equals", "value": "premium"}` |
| `not_equals` | Not equal (with empty string handling) | `{"operator": "not_equals", "value": ""}` |
| `contains` | Array contains value (for multiselect) | `{"operator": "contains", "value": "ice_water"}` |
| `not_contains` | Array does not contain | `{"operator": "not_contains", "value": "basic"}` |

**Shorthand Contains Format:**
```json
{
  "accessories": {"contains": "flashing"}
}
```

#### 2.3.3 `hide_if_conditions` (Evaluated THIRD)

**Purpose:** Hide field based on conditions (inverse of show_if).

**Structure:** Same as `show_if_conditions`

**Example:**
```json
// Hide when upgrade_option is "none"
{"upgrade_option": "none"}
```

#### 2.3.4 Condition Evaluation Order

```typescript
function isFieldVisible(field, trade) {
  // PHASE 1: Check show_if_product_attributes FIRST
  if (field.show_if_product_attributes) {
    const product = getSelectedProduct(trade);
    if (!product) return false;  // No product selected = hide

    for (const [attr, expected] of Object.entries(field.show_if_product_attributes)) {
      if (!matches(product.physical_properties[attr], expected)) {
        return false;  // Any mismatch = hide
      }
    }
  }

  // PHASE 2: Check show_if_conditions SECOND
  if (field.show_if_conditions) {
    for (const [fieldName, condition] of Object.entries(field.show_if_conditions)) {
      const fieldValue = formValues[trade][fieldName];
      if (!evaluateCondition(fieldValue, condition)) {
        return false;  // Any unmet condition = hide
      }
    }
  }

  // PHASE 3: Check hide_if_conditions LAST
  if (field.hide_if_conditions) {
    for (const [fieldName, condition] of Object.entries(field.hide_if_conditions)) {
      const fieldValue = formValues[trade][fieldName];
      if (evaluateCondition(fieldValue, condition)) {
        return false;  // Any met hide condition = hide
      }
    }
  }

  return true;  // All checks passed = show
}
```

### 2.4 Product Catalog Integration

#### `load_from_catalog`

When `true`, field options are loaded from `product_catalog` instead of `field_options`.

#### `catalog_filter` Structure

```json
{
  "active": true,
  "discontinued": false,
  "category": ["LAP SIDING - SMOOTH", "PANEL SIDING"],
  "manufacturer": "James Hardie"
}
```

**Supported Filter Keys:**

| Key | Type | Purpose |
|-----|------|---------|
| `active` | boolean | Filter by `product_catalog.active` |
| `discontinued` | boolean | Filter by `product_catalog.discontinued` |
| `category` | string \| string[] | Filter by `product_catalog.category` |
| `manufacturer` | string \| string[] | Filter by `product_catalog.manufacturer` |

**How Filter is Applied:**
```typescript
// ProductConfigStep.tsx lines 486-527
function filterProductsByCatalogFilter(products, catalogFilter) {
  if (!catalogFilter) return products;

  return products.filter(product => {
    // Check active
    if (catalogFilter.active !== undefined && product.active !== catalogFilter.active) {
      return false;
    }

    // Check category (supports array)
    if (catalogFilter.category) {
      const categories = Array.isArray(catalogFilter.category)
        ? catalogFilter.category
        : [catalogFilter.category];
      if (!categories.includes(product.category)) {
        return false;
      }
    }

    // Check manufacturer (supports array)
    if (catalogFilter.manufacturer) {
      const manufacturers = Array.isArray(catalogFilter.manufacturer)
        ? catalogFilter.manufacturer
        : [catalogFilter.manufacturer];
      if (!manufacturers.includes(product.manufacturer)) {
        return false;
      }
    }

    return true;
  });
}
```

#### Product Display & Grouping

Products are grouped by `category` for hierarchical display:

```typescript
// Returns: { "LAP SIDING - SMOOTH": [...products], "PANEL SIDING": [...products] }
const grouped = getGroupedProducts(trade, catalogFilter);
```

**Trade-Specific Behavior:**

| Trade | Deduplication | Display Name |
|-------|---------------|--------------|
| Siding | None - shows full names with colors | Full `product_name` |
| Roofing | Deduplicates to series only | First word or `product_line` |
| Windows | Deduplicates to series only | First word or `product_line` |
| Gutters | None - shows complete names | Full `product_name` |

#### What Value is Stored

**IMPORTANT:** The stored value is always the **Product UUID**, not the name or SKU.

```typescript
// Stored in project_configurations.configuration_data:
{
  "siding_product_type": "a1b2c3d4-e5f6-7g8h-i9j0-k1l2m3n4o5p6",  // UUID!
  "belly_band_include": true,
  "belly_band_color": "arctic_white"  // This is option value, not UUID
}
```

### 2.5 Section and Field Ordering

#### Config Sections

Groups fields visually into collapsible sections within each trade.

**Current Sections:**

| Trade | Section | section_order | Purpose |
|-------|---------|---------------|---------|
| siding | `primary_siding` | 1 | Main siding product selection |
| siding | `trim_accessories` | 2 | Trim options (belly band, corners, etc.) |
| roofing | `primary_roofing` | 1 | Main roofing product |
| roofing | `optional_upgrades` | 2 | Upgrade options |
| windows | `primary_windows` | 1 | Window manufacturer & series |
| windows | `trim_options` | 2 | Window trim customization |
| gutters | `primary_gutters` | 1 | Gutter material & style |

#### Ordering Rules

1. **section_order:** Controls order of sections (1, 2, 3...)
2. **field_order:** Controls order within section (1, 2, 3...)
3. **Parent fields:** Should have lower `field_order` than their children

**Example Ordering for Parent-Child:**
```
belly_band_include   → field_order: 1  (parent)
belly_band_color     → field_order: 2  (child)
belly_band_material  → field_order: 3  (child)
corner_trim_include  → field_order: 4  (next parent)
```

---

## 3. Frontend Implementation Details

### 3.1 ProductConfigStep.tsx Analysis

**File:** [components/project-form/ProductConfigStep.tsx](../components/project-form/ProductConfigStep.tsx)

#### Data Loading (Lines 128-185)

```typescript
useEffect(() => {
  const fetchConfigurations = async () => {
    // Fetch trade configurations for all selected trades
    const { data: configs } = await supabase
      .from('trade_configurations')
      .select('*')
      .in('trade', data.selectedTrades)
      .eq('active', true)
      .order('section_order', { ascending: true })
      .order('field_order', { ascending: true });

    // Fetch product catalog
    const { data: products } = await supabase
      .from('product_catalog')
      .select('*')
      .in('trade', data.selectedTrades)
      .eq('active', true)
      .eq('discontinued', false)
      .order('sort_order', { ascending: true })
      .order('product_name', { ascending: true });

    setConfigurations(configs || []);
    setProductCatalog(products || []);
  };

  fetchConfigurations();
}, [data.selectedTrades]);
```

**Key Points:**
- Only fetches `active = true` configs
- Sorts by `section_order`, then `field_order`
- Products fetched for ALL selected trades upfront
- Both datasets cached in component state

#### Visibility Evaluation (Lines 273-481)

The complete `isFieldVisible()` function handles all visibility logic:

```typescript
const isFieldVisible = (field: TradeConfiguration, trade: string): boolean => {
  const tradeValues = formValues[trade] || {};

  // PHASE 1: Check show_if_product_attributes
  if (field.show_if_product_attributes) {
    const productFieldMap: Record<string, string> = {
      siding: 'siding_product_type',
      roofing: 'roofing_product',
      windows: 'window_series',
      gutters: 'gutter_product',
    };
    const productFieldName = productFieldMap[trade];
    const selectedProductId = tradeValues[productFieldName];

    if (!selectedProductId) return false;

    const product = productCatalog.find(p => p.id === selectedProductId);
    if (!product) return false;

    const physicalProps = product.physical_properties || {};

    for (const [attrKey, expectedValue] of Object.entries(field.show_if_product_attributes)) {
      const actualValue = physicalProps[attrKey];

      // Boolean type coercion
      let matches = false;
      if (typeof expectedValue === 'boolean') {
        matches = actualValue === expectedValue ||
                  actualValue === String(expectedValue) ||
                  (expectedValue === true && actualValue === 1) ||
                  (expectedValue === false && (actualValue === 0 || actualValue === ''));
      } else {
        matches = actualValue === expectedValue;
      }

      if (!matches) return false;
    }
  }

  // PHASE 2: Check show_if_conditions
  if (!field.show_if_conditions) return true;

  // ... operator handling, simple equality checks
  // See full implementation in source file

  return true;
};
```

#### Product Lookup

**Which field stores the product selection per trade?**

| Trade | Field Name | Lookup Key |
|-------|------------|------------|
| siding | `siding_product_type` | Product UUID |
| roofing | `roofing_product` or `shingle_product_id` | Product UUID |
| windows | `window_series` | Product UUID |
| gutters | `gutter_product` | Product UUID |

**Where does productCatalog state come from?**

Fetched at component mount and stored in `productCatalog` state variable.

#### Value Storage

```typescript
// Local state during editing
const [formValues, setFormValues] = useState<Record<string, Record<string, any>>>({});

// Structure:
{
  siding: {
    siding_product_type: "uuid-here",
    belly_band_include: true,
    belly_band_color: "arctic_white"
  },
  roofing: {
    shingle_product: "uuid-here"
  }
}

// On change:
const handleFieldChange = (trade: string, fieldName: string, value: any) => {
  setFormValues(prev => ({
    ...prev,
    [trade]: {
      ...(prev[trade] || {}),
      [fieldName]: value
    }
  }));
};

// Sync to parent:
useEffect(() => {
  onUpdate({ configurations: formValues });
}, [formValues]);
```

### 3.2 Rendering Logic

#### Select Fields (Lines 638-843)

```typescript
if (field.field_type === 'select') {
  if (field.load_from_catalog) {
    // SearchableSelect with grouped products
    const grouped = getGroupedProducts(trade, field.catalog_filter);
    return (
      <SearchableSelect
        value={value}
        onValueChange={(v) => handleFieldChange(trade, field.config_name, v)}
        groups={grouped}
        placeholder={field.field_placeholder}
      />
    );
  } else {
    // Standard Select with field_options
    return (
      <Select value={value} onValueChange={(v) => handleFieldChange(trade, field.config_name, v)}>
        {field.field_options?.options?.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </Select>
    );
  }
}
```

#### Checkbox Fields (Lines 845-882)

```typescript
if (field.field_type === 'checkbox') {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={field.config_name}
        checked={!!value}
        onCheckedChange={(checked) => handleFieldChange(trade, field.config_name, checked)}
      />
      <Label htmlFor={field.config_name}>{field.field_label}</Label>
    </div>
  );
}
```

#### Multiselect Fields (Lines 884-951)

```typescript
if (field.field_type === 'multiselect') {
  const selectedValues = Array.isArray(value) ? value : [];
  return (
    <div className="space-y-2">
      {field.field_options?.options?.map(opt => (
        <div key={opt.value} className="flex items-center space-x-2">
          <Checkbox
            checked={selectedValues.includes(opt.value)}
            onCheckedChange={(checked) => {
              const newValues = checked
                ? [...selectedValues, opt.value]
                : selectedValues.filter(v => v !== opt.value);
              handleFieldChange(trade, field.config_name, newValues);
            }}
          />
          <Label>{opt.label}</Label>
        </div>
      ))}
    </div>
  );
}
```

#### Number Fields (Lines 953-1064)

```typescript
if (field.field_type === 'number') {
  const rules = field.validation_rules || {};
  return (
    <Input
      type="number"
      value={value || ''}
      onChange={(e) => handleFieldChange(trade, field.config_name, e.target.value)}
      min={rules.min}
      max={rules.max}
      step={rules.step}
      placeholder={field.field_placeholder}
    />
  );
}
```

### 3.3 Parent-Child Field Patterns

**Pattern Recognition:**
- Parent field: `{prefix}_include` (checkbox type)
- Child fields: `{prefix}_*` (any type starting with same prefix)

**Example Groupings:**
| Parent | Children |
|--------|----------|
| `belly_band_include` | `belly_band_color`, `belly_band_material` |
| `corner_trim_include` | `corner_trim_product`, `corner_trim_color` |
| `window_trim_include` | `window_trim_width`, `window_trim_finish`, `window_trim_colorplus_color` |

**Grouping Logic (Lines 1088-1142):**

```typescript
const groupFieldsByParent = (fields: TradeConfiguration[]) => {
  const parentFields = new Map<string, TradeConfiguration>();
  const childFields = new Map<string, TradeConfiguration[]>();

  fields.forEach(field => {
    const match = field.config_name.match(/^(.+)_include$/);

    if (match && field.field_type === 'checkbox') {
      const prefix = match[1];
      parentFields.set(prefix, field);
      childFields.set(prefix, []);
    } else {
      // Check if belongs to a parent
      for (const prefix of parentFields.keys()) {
        if (field.config_name.startsWith(prefix + '_')) {
          childFields.get(prefix)!.push(field);
          break;
        }
      }
    }
  });

  return { parentFields, childFields };
};
```

**Rendering Pattern (Lines 1261-1298):**

```tsx
{group.parent && (
  <div className="space-y-3">
    {/* Parent checkbox - full width */}
    {renderField(group.parent, trade)}

    {/* Child fields - indented, only when parent checked */}
    {parentValue && group.children.length > 0 && (
      <div className="ml-8 pl-4 border-l-2 border-muted space-y-3">
        <div className="grid gap-4 md:grid-cols-2">
          {group.children.map(child => renderField(child, trade))}
        </div>
      </div>
    )}
  </div>
)}
```

### 3.4 Dynamic Manufacturer Filtering (Windows)

For windows, the `window_series` dropdown is dynamically filtered based on selected `window_manufacturer`:

```typescript
// Lines 643-658
let effectiveCatalogFilter = field.catalog_filter;

if (field.config_name === 'window_series' && field.load_from_catalog) {
  const selectedManufacturer = tradeValues['window_manufacturer'];

  if (selectedManufacturer) {
    effectiveCatalogFilter = {
      ...field.catalog_filter,
      manufacturer: selectedManufacturer
    };
  }
}

const selectOptions = getGroupedProducts(trade, effectiveCatalogFilter);
```

**User Flow:**
1. User selects "Milgard" from `window_manufacturer`
2. `window_series` dropdown re-renders with only Milgard products
3. Changing manufacturer instantly updates available series

---

## 4. Auto-Scope Rule Integration

### 4.1 How Configurations Trigger Rules

```
User selects:
  add_battens = true
  batten_spacing = "16"
         │
         ▼
Stored in project_configurations.configuration_data:
{
  "add_battens": true,
  "batten_spacing": "16"
}
         │
         ▼
During takeoff generation, rules evaluated:
SELECT * FROM siding_auto_scope_rules
WHERE trigger_condition @> '{"add_battens": true}'::jsonb
         │
         ▼
Matching rules generate line items with:
  - pricing_item_id → pricing lookup
  - quantity_formula → calculated quantity
```

### 4.2 Auto-Scope Rule Tables

#### `siding_auto_scope_rules`

```sql
CREATE TABLE siding_auto_scope_rules (
  id UUID PRIMARY KEY,
  rule_name TEXT NOT NULL,
  trigger_condition JSONB NOT NULL,     -- Matches against config data
  trigger_type TEXT DEFAULT 'config',   -- 'config', 'detection', 'always'
  pricing_item_id UUID REFERENCES pricing_items(id),
  quantity_source TEXT,                 -- 'facade_sqft', 'detection_lf', etc.
  quantity_formula TEXT,                -- 'facade_sqft / 100', etc.
  priority INTEGER DEFAULT 100,
  active BOOLEAN DEFAULT true
);
```

#### `labor_auto_scope_rules`

```sql
CREATE TABLE labor_auto_scope_rules (
  id SERIAL PRIMARY KEY,
  rule_id TEXT UNIQUE NOT NULL,
  rule_name TEXT NOT NULL,
  trade TEXT NOT NULL,

  trigger_type TEXT CHECK (trigger_type IN ('always', 'material_category', 'material_sku_pattern', 'detection_class')),
  trigger_value TEXT,
  trigger_condition JSONB,

  labor_rate_id INTEGER REFERENCES labor_rates(id),

  quantity_source TEXT CHECK (quantity_source IN ('facade_sqft', 'material_sqft', 'material_count', 'detection_count', 'material_lf')),
  quantity_formula TEXT,
  quantity_unit TEXT DEFAULT 'square',

  priority INTEGER DEFAULT 100,
  active BOOLEAN DEFAULT true
);
```

### 4.3 trigger_condition Matching

Uses PostgreSQL JSONB containment operator `@>`:

```sql
-- This query finds rules where trigger_condition is contained in config_data
SELECT * FROM siding_auto_scope_rules
WHERE config_data @> trigger_condition
AND active = true
ORDER BY priority;
```

**Matching Examples:**

| trigger_condition | config_data | Match? |
|-------------------|-------------|--------|
| `{"add_battens": true}` | `{"add_battens": true, "color": "white"}` | YES |
| `{"add_battens": true, "batten_spacing": "16"}` | `{"add_battens": true, "batten_spacing": "16", "color": "white"}` | YES |
| `{"add_battens": true, "batten_spacing": "24"}` | `{"add_battens": true, "batten_spacing": "16"}` | NO |

**Type Sensitivity:**
- `{"field": true}` ≠ `{"field": "true"}` (boolean vs string)
- Always use correct JSON types in trigger_condition

### 4.4 Connecting a Configuration to a Rule

**Step 1:** Create the configuration field
```sql
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  triggers_auto_scope, is_required, section_order, field_order, active
) VALUES (
  'siding', 'trim_accessories', 'add_battens', 'checkbox', 'Add Battens',
  true, false, 2, 20, true
);
```

**Step 2:** Create the auto-scope rule
```sql
INSERT INTO siding_auto_scope_rules (
  rule_name, trigger_condition, trigger_type,
  pricing_item_id, quantity_source, quantity_formula, priority, active
) VALUES (
  'Batten Installation',
  '{"add_battens": true}'::jsonb,
  'config',
  (SELECT id FROM pricing_items WHERE sku = 'BATTEN-INSTALL'),
  'detection_lf',
  'detection_lf * 1.10',  -- 10% waste factor
  100,
  true
);
```

**Step 3:** Ensure pricing_item exists
```sql
INSERT INTO pricing_items (sku, name, unit, material_cost, labor_cost)
VALUES ('BATTEN-INSTALL', 'Batten Installation', 'LF', 2.50, 1.25);
```

---

## 5. Recipes: Common Tasks

### Recipe 5.1: Add a Simple Checkbox Field

**Goal:** Add "Include Starter Strip" checkbox to siding trim section.

```sql
INSERT INTO trade_configurations (
  trade,
  config_section,
  config_name,
  field_type,
  field_label,
  field_help_text,
  is_required,
  triggers_auto_scope,
  section_order,
  field_order,
  active
) VALUES (
  'siding',
  'trim_accessories',
  'include_starter_strip',
  'checkbox',
  'Include Starter Strip',
  'Add metal starter strip at bottom of siding',
  false,
  true,
  2,
  80,  -- After existing trim fields
  true
);
```

**Verify:**
```sql
SELECT config_name, field_label, field_type, active
FROM trade_configurations
WHERE config_name = 'include_starter_strip';
```

### Recipe 5.2: Add a Dropdown That Loads from Product Catalog

**Goal:** Add "Soffit Product" dropdown that loads panel products.

```sql
INSERT INTO trade_configurations (
  trade,
  config_section,
  config_name,
  field_type,
  field_label,
  is_required,
  section_order,
  field_order,
  load_from_catalog,
  catalog_filter,
  active
) VALUES (
  'siding',
  'trim_accessories',
  'soffit_product',
  'select',
  'Soffit Product',
  false,
  2,
  90,
  true,
  '{"active": true, "category": ["SOFFIT PANELS", "PANEL SIDING"]}'::jsonb,
  true
);
```

**Verify:**
```sql
-- Check config exists
SELECT * FROM trade_configurations WHERE config_name = 'soffit_product';

-- Check products will appear
SELECT product_name, category FROM product_catalog
WHERE category IN ('SOFFIT PANELS', 'PANEL SIDING') AND active = true;
```

### Recipe 5.3: Add a Conditional Field (Shows Based on Another Field)

**Goal:** Add "Soffit Color" that only shows when "Soffit Product" is selected.

```sql
INSERT INTO trade_configurations (
  trade,
  config_section,
  config_name,
  field_type,
  field_label,
  field_options,
  is_required,
  section_order,
  field_order,
  show_if_conditions,
  active
) VALUES (
  'siding',
  'trim_accessories',
  'soffit_color',
  'select',
  'Soffit Color',
  '{"options": [
    {"value": "arctic_white", "label": "Arctic White"},
    {"value": "light_mist", "label": "Light Mist"},
    {"value": "cobblestone", "label": "Cobblestone"}
  ]}'::jsonb,
  false,
  2,
  91,
  '{"soffit_product": {"operator": "not_equals", "value": ""}}'::jsonb,
  true
);
```

### Recipe 5.4: Add a Field That Shows Based on Product Attributes

**Goal:** Add "ColorPlus Soffit Color" that only shows when selected soffit is ColorPlus.

```sql
INSERT INTO trade_configurations (
  trade,
  config_section,
  config_name,
  field_type,
  field_label,
  is_required,
  section_order,
  field_order,
  show_if_product_attributes,
  load_from_catalog,
  catalog_filter,
  active
) VALUES (
  'siding',
  'trim_accessories',
  'soffit_colorplus_color',
  'select',
  'ColorPlus Soffit Color',
  false,
  2,
  92,
  '{"is_colorplus": true}'::jsonb,
  true,
  '{"category": ["COLORPLUS COLORS"]}'::jsonb,
  true
);
```

**IMPORTANT:** The product selected in `soffit_product` must have `physical_properties.is_colorplus = true` for this field to appear.

### Recipe 5.5: Add a Parent-Child Field Group

**Goal:** Add "Fascia Board" with include checkbox and child fields.

```sql
-- Parent checkbox
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  is_required, triggers_auto_scope, section_order, field_order, active
) VALUES (
  'siding', 'trim_accessories', 'fascia_board_include', 'checkbox', 'Include Fascia Board',
  false, true, 2, 100, true
);

-- Child: Material
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  field_options, is_required, section_order, field_order,
  show_if_conditions, active
) VALUES (
  'siding', 'trim_accessories', 'fascia_board_material', 'select', 'Fascia Material',
  '{"options": [
    {"value": "hardie_trim", "label": "HardieTrim"},
    {"value": "aluminum", "label": "Aluminum"},
    {"value": "pvc", "label": "PVC"}
  ]}'::jsonb,
  false, 2, 101,
  '{"fascia_board_include": true}'::jsonb,
  true
);

-- Child: Width
INSERT INTO trade_configurations (
  trade, config_section, config_name, field_type, field_label,
  field_options, is_required, section_order, field_order,
  show_if_conditions, active
) VALUES (
  'siding', 'trim_accessories', 'fascia_board_width', 'select', 'Fascia Width',
  '{"options": [
    {"value": "6", "label": "6 inch"},
    {"value": "8", "label": "8 inch"},
    {"value": "10", "label": "10 inch"}
  ]}'::jsonb,
  false, 2, 102,
  '{"fascia_board_include": true}'::jsonb,
  true
);
```

### Recipe 5.6: Add a New Product with Custom Attributes

**Goal:** Add a new ColorPlus siding product with color attributes.

```sql
INSERT INTO product_catalog (
  trade,
  manufacturer,
  category,
  product_name,
  product_line,
  sku,
  unit,
  physical_properties,
  active,
  discontinued
) VALUES (
  'siding',
  'James Hardie',
  'LAP SIDING - SMOOTH',
  'HardiePlank Smooth - Midnight Blue',
  'HardiePlank Smooth',
  'HP-SMOOTH-MIDBLUE',
  'SF',
  '{
    "is_colorplus": true,
    "hex_code": "#1E3A5F",
    "width": 8.25,
    "length": 144,
    "coverage_sf": 8.25,
    "material_cost": 4.50,
    "labor_cost": 3.25
  }'::jsonb,
  true,
  false
);
```

### Recipe 5.7: Connect a Configuration to Auto-Scope Rules

**Goal:** When "fascia_board_include" is checked, generate fascia material line item.

```sql
-- First, ensure pricing item exists
INSERT INTO pricing_items (sku, name, unit, material_cost, labor_cost, equipment_cost)
VALUES ('FASCIA-HARDIE-8', 'HardieTrim Fascia 8"', 'LF', 3.25, 2.50, 0.00)
ON CONFLICT (sku) DO NOTHING;

-- Then create the auto-scope rule
INSERT INTO siding_auto_scope_rules (
  rule_name,
  trigger_condition,
  trigger_type,
  pricing_item_id,
  quantity_source,
  quantity_formula,
  priority,
  active
) VALUES (
  'Fascia Board - HardieTrim',
  '{"fascia_board_include": true, "fascia_board_material": "hardie_trim"}'::jsonb,
  'config',
  (SELECT id FROM pricing_items WHERE sku = 'FASCIA-HARDIE-8'),
  'detection_lf',
  'fascia_lf * 1.10',  -- 10% waste
  100,
  true
);
```

### Recipe 5.8: Add a New Trade Section

**Goal:** Add "Optional Upgrades" section to siding trade.

```sql
-- Add multiple fields in the new section
INSERT INTO trade_configurations (
  trade, config_section, config_display_name, config_name, field_type, field_label,
  is_required, section_order, field_order, active
) VALUES
  ('siding', 'optional_upgrades', 'Optional Upgrades', 'rainscreen_system', 'checkbox', 'Rainscreen System',
   false, 3, 1, true),
  ('siding', 'optional_upgrades', 'Optional Upgrades', 'furring_strips', 'checkbox', 'Furring Strips',
   false, 3, 2, true),
  ('siding', 'optional_upgrades', 'Optional Upgrades', 'enhanced_wrb', 'checkbox', 'Enhanced Weather Barrier',
   false, 3, 3, true);
```

---

## 6. Debugging Guide

### 6.1 Field Not Appearing

**Checklist:**
- [ ] Is `active = true`?
- [ ] Is `config_section` correct for where you expect it?
- [ ] Is `section_order` / `field_order` set correctly?
- [ ] If using `show_if_conditions`:
  - [ ] Is the parent field value matching?
  - [ ] Is the type correct (boolean `true` vs string `"true"`)?
- [ ] If using `show_if_product_attributes`:
  - [ ] Is a product being selected correctly?
  - [ ] Does the product have the required `physical_property`?
  - [ ] Is the type correct (boolean vs string)?
  - [ ] Is frontend looking up by the right key (ID vs SKU)?

**Debug SQL:**
```sql
-- Check the config exists and is active
SELECT config_name, config_section, field_order,
       show_if_conditions, show_if_product_attributes, active
FROM trade_configurations
WHERE config_name = 'YOUR_FIELD_NAME';

-- Check product has the attribute
SELECT id, sku, product_name, physical_properties
FROM product_catalog
WHERE id = 'SELECTED_PRODUCT_UUID';

-- Check what products match a catalog_filter
SELECT product_name, category, physical_properties
FROM product_catalog
WHERE category IN ('LAP SIDING - SMOOTH')
  AND active = true;
```

**Debug Frontend (add to ProductConfigStep.tsx):**
```typescript
// Add temporary logging inside isFieldVisible()
console.log(`[${field.config_name}] Visibility check:`);
console.log(`  show_if_conditions:`, field.show_if_conditions);
console.log(`  show_if_product_attributes:`, field.show_if_product_attributes);
console.log(`  Current form values:`, tradeValues);

if (field.show_if_product_attributes) {
  const productId = tradeValues['siding_product_type'];
  const product = productCatalog.find(p => p.id === productId);
  console.log(`  Selected product:`, product?.product_name);
  console.log(`  physical_properties:`, product?.physical_properties);
}
```

### 6.2 Field Showing When It Shouldn't

**Checklist:**
- [ ] Check `show_if_conditions` - is condition too permissive?
- [ ] Check `show_if_product_attributes` - is it missing or null?
- [ ] Check if there's a `hide_if_conditions` that should be added
- [ ] Verify condition types match (boolean vs string)

**Debug SQL:**
```sql
-- Check all visibility conditions
SELECT config_name,
       show_if_conditions,
       show_if_product_attributes,
       hide_if_conditions
FROM trade_configurations
WHERE config_name = 'FIELD_THAT_SHOWS_INCORRECTLY';
```

### 6.3 Wrong Options in Dropdown

**Checklist:**
- [ ] Check `load_from_catalog` is `true`
- [ ] Check `catalog_filter` matches products in database
- [ ] Verify products exist with matching category/manufacturer
- [ ] Check products are `active = true` and `discontinued = false`

**Debug SQL:**
```sql
-- See what the catalog_filter is
SELECT config_name, catalog_filter
FROM trade_configurations
WHERE config_name = 'YOUR_DROPDOWN_FIELD';

-- Check what products should appear
SELECT id, product_name, category, manufacturer, active
FROM product_catalog
WHERE trade = 'siding'
  AND category = 'LAP SIDING - SMOOTH'  -- From catalog_filter
  AND active = true
  AND discontinued = false;
```

### 6.4 Value Not Saving

**Checklist:**
- [ ] Check browser console for errors
- [ ] Verify `handleFieldChange` is being called
- [ ] Check `formValues` state is updating
- [ ] Verify `onUpdate` is syncing to parent
- [ ] Check `project_configurations` table after submit

**Debug SQL:**
```sql
-- Check saved configuration
SELECT project_id, trade, configuration_data
FROM project_configurations
WHERE project_id = 'YOUR_PROJECT_UUID';
```

### 6.5 Auto-Scope Rule Not Triggering

**Checklist:**
- [ ] Is the rule `active = true`?
- [ ] Does `trigger_condition` match EXACTLY?
- [ ] Are types correct (boolean vs string)?
- [ ] Is `pricing_item_id` valid?
- [ ] Check rule priority (lower = higher priority)

**Debug SQL:**
```sql
-- Check rule exists and is active
SELECT rule_name, trigger_condition, active, priority
FROM siding_auto_scope_rules
WHERE trigger_condition @> '{"add_battens": true}'::jsonb;

-- Test JSONB containment manually
SELECT '{"add_battens": true, "color": "white"}'::jsonb @> '{"add_battens": true}'::jsonb;
-- Should return: true

-- Check if types match
SELECT '{"add_battens": "true"}'::jsonb @> '{"add_battens": true}'::jsonb;
-- Returns: false (string vs boolean!)
```

---

## 7. Best Practices

### 7.1 Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| `config_name` | snake_case, descriptive | `belly_band_include`, `window_trim_colorplus_color` |
| `config_display_name` | Title Case | `"Primary Siding Options"` |
| `field_label` | Title Case, user-friendly | `"Include Belly Band"` |
| Parent checkbox | `{prefix}_include` | `belly_band_include`, `fascia_board_include` |
| Child fields | `{prefix}_{detail}` | `belly_band_color`, `belly_band_material` |

### 7.2 Field Organization

1. **Group related fields** in same `config_section`
2. **Use field_order** to create logical flow
3. **Parent checkboxes** should have lower `field_order` than children
4. **Section order**: Primary options first (1), accessories second (2), upgrades last (3)

**Example:**
```
section_order: 1 → Primary Siding
  field_order: 1 → siding_product_type
  field_order: 2 → colorplus_color

section_order: 2 → Trim Accessories
  field_order: 1 → belly_band_include (parent)
  field_order: 2 → belly_band_color (child)
  field_order: 3 → belly_band_material (child)
  field_order: 4 → corner_trim_include (next parent)
```

### 7.3 Product Attributes

1. **Use consistent names** across products
2. **Use actual booleans** for boolean attributes (`true`, not `"true"`)
3. **Document all custom attributes** in this guide
4. **Include hex_code** for color products

**Standard Attributes:**
```json
{
  "is_colorplus": true,           // Boolean - enables ColorPlus color selection
  "hex_code": "#F5F5F0",          // String - color display in swatches
  "material_cost": 4.50,          // Number - cost per unit
  "labor_cost": 3.25,             // Number - labor per unit
  "width": 8.25,                  // Number - product width in inches
  "length": 144,                  // Number - product length in inches
  "coverage_sf": 8.25             // Number - coverage per piece in SF
}
```

### 7.4 Auto-Scope Rules

1. **One rule per specific combination** (not one rule for many scenarios)
2. **Use priority** for execution order (lower = runs first)
3. **Include default/fallback rules** at higher priority numbers
4. **Test JSONB containment** before deploying

### 7.5 Testing Changes

**Always verify:**
1. Database record is correct (`SELECT * FROM trade_configurations WHERE ...`)
2. Frontend displays field correctly (check browser)
3. Value saves to `project_configurations` (check database after submit)
4. Auto-scope rules trigger (if applicable)
5. Takeoff includes expected line items

---

## 8. Reference: All Current Configurations

### 8.1 Siding Configurations

```sql
SELECT config_name, config_section, field_type, field_order,
       show_if_conditions, show_if_product_attributes, load_from_catalog
FROM trade_configurations
WHERE trade = 'siding' AND active = true
ORDER BY section_order, field_order;
```

**Section: primary_siding (section_order: 1)**

| config_name | field_type | Purpose |
|-------------|------------|---------|
| `siding_product_type` | select | Main siding product (from catalog) |
| `colorplus_color` | select | ColorPlus color (when product is ColorPlus) |

**Section: trim_accessories (section_order: 2)**

| config_name | field_type | Purpose | Visibility |
|-------------|------------|---------|------------|
| `belly_band_include` | checkbox | Include belly band | Always |
| `belly_band_color` | select | Belly band color | `belly_band_include = true` |
| `belly_band_material` | select | Belly band material | `belly_band_include = true` |
| `corner_trim_include` | checkbox | Include corner trim | Always |
| `corner_trim_product` | select | Corner product | `corner_trim_include = true` |
| `corner_trim_color` | select | Corner color | `corner_trim_include = true` |
| `j_channel_include` | checkbox | Include J-channel | Always |
| `window_trim_include` | checkbox | Include window trim | Always |
| `window_trim_width` | select | Trim width | `window_trim_include = true` |
| `window_trim_finish` | select | Trim finish | `window_trim_include = true` |
| `window_trim_colorplus_color` | select | Trim color | `window_trim_include = true` AND `window_trim_finish = "colorplus"` |
| `door_trim_include` | checkbox | Include door trim | Always |
| `garage_trim_include` | checkbox | Include garage trim | Always |
| `add_battens` | checkbox | Add battens | Always |

### 8.2 Roofing Configurations

```sql
SELECT config_name, config_section, field_type, field_order,
       show_if_conditions, load_from_catalog
FROM trade_configurations
WHERE trade = 'roofing' AND active = true
ORDER BY section_order, field_order;
```

**Section: primary_roofing (section_order: 1)**

| config_name | field_type | Purpose |
|-------------|------------|---------|
| `shingle_product` | select | Main shingle product (from catalog) |
| `shingle_color` | select | Shingle color |

**Section: optional_upgrades (section_order: 2)**

| config_name | field_type | Purpose |
|-------------|------------|---------|
| `upgrade_options` | multiselect | Ice & water shield, synthetic felt, etc. |

### 8.3 Windows Configurations

```sql
SELECT config_name, config_section, field_type, field_order,
       show_if_conditions, load_from_catalog
FROM trade_configurations
WHERE trade = 'windows' AND active = true
ORDER BY section_order, field_order;
```

**Section: primary_windows (section_order: 1)**

| config_name | field_type | Purpose |
|-------------|------------|---------|
| `window_manufacturer` | select | Manufacturer (Milgard, Ply Gem, Marvin) |
| `window_series` | select | Window series (filtered by manufacturer) |

**Section: trim_options (section_order: 2)**

| config_name | field_type | Purpose |
|-------------|------------|---------|
| `window_trim_style` | select | Trim style |
| `window_trim_color` | select | Trim color |

### 8.4 Gutters Configurations

```sql
SELECT config_name, config_section, field_type, field_order,
       show_if_conditions, load_from_catalog
FROM trade_configurations
WHERE trade = 'gutters' AND active = true
ORDER BY section_order, field_order;
```

**Section: primary_gutters (section_order: 1)**

| config_name | field_type | Purpose |
|-------------|------------|---------|
| `gutter_material` | select | Material (aluminum, copper) |
| `gutter_style` | select | Style (K-style, half-round) |
| `gutter_color` | select | Color |

---

## 9. Reference: All Product Attributes

```sql
SELECT DISTINCT
  jsonb_object_keys(physical_properties) as attribute,
  COUNT(*) as product_count
FROM product_catalog
WHERE physical_properties IS NOT NULL
GROUP BY jsonb_object_keys(physical_properties)
ORDER BY attribute;
```

| Attribute | Type | Used In | Purpose |
|-----------|------|---------|---------|
| `is_colorplus` | boolean | `show_if_product_attributes` | Identifies ColorPlus pre-painted products |
| `is_panel` | boolean | `show_if_product_attributes` | Identifies panel products vs lap siding |
| `hex_code` | string | Color swatches | Display color in UI |
| `material_cost` | number | Pricing | Material cost per unit |
| `labor_cost` | number | Pricing | Labor cost per unit |
| `equipment_cost` | number | Pricing | Equipment cost |
| `width` | number | Calculations | Product width in inches |
| `length` | number | Calculations | Product length in inches |
| `coverage_sf` | number | Calculations | Coverage per piece in square feet |
| `exposure` | number | Calculations | Exposure for lap siding |
| `pieces_per_box` | number | Ordering | Pieces per box/bundle |

---

## 10. Appendix: SQL Templates

### Template: Add New Configuration Field

```sql
INSERT INTO trade_configurations (
  trade,
  config_section,
  config_name,
  config_display_name,
  field_type,
  field_label,
  field_placeholder,
  field_help_text,
  field_options,          -- NULL if load_from_catalog = true
  default_value,
  is_required,
  validation_rules,
  show_if_conditions,
  show_if_product_attributes,
  hide_if_conditions,
  triggers_auto_scope,
  section_order,
  field_order,
  group_name,
  load_from_catalog,
  catalog_filter,
  active
) VALUES (
  'siding',                           -- trade
  'trim_accessories',                  -- config_section
  'new_field_name',                    -- config_name
  NULL,                                -- config_display_name (optional)
  'select',                            -- field_type
  'New Field Label',                   -- field_label
  'Select an option...',               -- field_placeholder
  'Help text for the field',           -- field_help_text
  NULL,                                -- field_options (NULL if using catalog)
  NULL,                                -- default_value
  false,                               -- is_required
  NULL,                                -- validation_rules
  NULL,                                -- show_if_conditions
  NULL,                                -- show_if_product_attributes
  NULL,                                -- hide_if_conditions
  false,                               -- triggers_auto_scope
  2,                                   -- section_order
  50,                                  -- field_order
  NULL,                                -- group_name
  true,                                -- load_from_catalog
  '{"category": ["SOME CATEGORY"]}'::jsonb,  -- catalog_filter
  true                                 -- active
);
```

### Template: Update Field Visibility

```sql
-- Add show_if_conditions
UPDATE trade_configurations
SET show_if_conditions = '{"parent_field": true}'::jsonb
WHERE config_name = 'child_field_name';

-- Add show_if_product_attributes
UPDATE trade_configurations
SET show_if_product_attributes = '{"is_colorplus": true}'::jsonb
WHERE config_name = 'colorplus_color_field';

-- Clear visibility conditions
UPDATE trade_configurations
SET show_if_conditions = NULL,
    show_if_product_attributes = NULL
WHERE config_name = 'field_to_always_show';
```

### Template: Add Product Attribute

```sql
-- Add attribute to specific product
UPDATE product_catalog
SET physical_properties = physical_properties || '{"is_colorplus": true}'::jsonb
WHERE sku = 'PRODUCT-SKU';

-- Add attribute to multiple products by category
UPDATE product_catalog
SET physical_properties = COALESCE(physical_properties, '{}'::jsonb) || '{"is_panel": true}'::jsonb
WHERE category = 'PANEL SIDING';

-- Remove an attribute
UPDATE product_catalog
SET physical_properties = physical_properties - 'attribute_to_remove'
WHERE sku = 'PRODUCT-SKU';
```

### Template: Add Auto-Scope Rule

```sql
-- Material rule (siding_auto_scope_rules)
INSERT INTO siding_auto_scope_rules (
  rule_name,
  trigger_condition,
  trigger_type,
  pricing_item_id,
  quantity_source,
  quantity_formula,
  priority,
  active
) VALUES (
  'Rule Name - Description',
  '{"config_field": true}'::jsonb,  -- What config value triggers this
  'config',                          -- 'config', 'detection', 'always'
  (SELECT id FROM pricing_items WHERE sku = 'ITEM-SKU'),
  'facade_sqft',                     -- 'facade_sqft', 'detection_lf', 'detection_count'
  'facade_sqft * 1.10',              -- Formula for quantity
  100,                               -- Priority (lower = runs first)
  true
);

-- Labor rule (labor_auto_scope_rules)
INSERT INTO labor_auto_scope_rules (
  rule_id,
  rule_name,
  trade,
  trigger_type,
  trigger_value,
  trigger_condition,
  labor_rate_id,
  quantity_source,
  quantity_formula,
  quantity_unit,
  priority,
  active
) VALUES (
  'LABOR-NEW-RULE',
  'New Labor Rule',
  'siding',
  'config',                          -- 'always', 'material_category', 'config'
  NULL,
  '{"config_field": true}'::jsonb,
  (SELECT id FROM labor_rates WHERE rate_code = 'RATE-CODE'),
  'facade_sqft',
  'facade_sqft / 100',
  'square',
  100,
  true
);
```

### Template: Deactivate Configuration

```sql
-- Soft delete (recommended)
UPDATE trade_configurations
SET active = false
WHERE config_name = 'field_to_hide';

-- Hard delete (use with caution)
DELETE FROM trade_configurations
WHERE config_name = 'field_to_delete';
```

### Template: Reorder Fields

```sql
-- Update field order within section
UPDATE trade_configurations
SET field_order = 5
WHERE config_name = 'field_to_move';

-- Bulk reorder
UPDATE trade_configurations
SET field_order = CASE config_name
  WHEN 'first_field' THEN 1
  WHEN 'second_field' THEN 2
  WHEN 'third_field' THEN 3
END
WHERE config_name IN ('first_field', 'second_field', 'third_field');
```

---

## Document Maintenance

**Last Updated:** 2026-01-31

**Key Files Referenced:**
- [components/project-form/ProductConfigStep.tsx](../components/project-form/ProductConfigStep.tsx) - Frontend implementation
- [lib/types/database.ts](../lib/types/database.ts) - TypeScript types
- [migrations/add_siding_configurations.sql](../migrations/add_siding_configurations.sql) - Siding configs
- [migrations/add_roofing_configurations.sql](../migrations/add_roofing_configurations.sql) - Roofing configs
- [migrations/add_windows_configurations.sql](../migrations/add_windows_configurations.sql) - Windows configs
- [migrations/add_gutters_configurations.sql](../migrations/add_gutters_configurations.sql) - Gutters configs
- [migrations/create_labor_auto_scope_rules.sql](../migrations/create_labor_auto_scope_rules.sql) - Labor rules

**When to Update This Document:**
- Adding new field types
- Changing visibility evaluation logic
- Adding new product attributes
- Modifying auto-scope rule structure
- Adding new trades or sections
