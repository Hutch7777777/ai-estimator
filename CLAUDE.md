# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Estimator is a Next.js 16 application built with React 19, TypeScript, and Tailwind CSS 4. The project uses shadcn/ui components for the UI layer and Supabase for backend services. It appears to be designed for AI-powered estimation and project management.

## Quick Start Guide

**First Time Setup:**
```bash
npm install
# Create .env.local with Supabase credentials (see Environment Setup section)
npm run dev  # Start at http://localhost:3000
```

**Common Development Tasks:**
- **Add new form field:** Update `trade_configurations` table in Supabase (NEVER hardcode!)
- **Add new product:** Insert into `product_catalog` table
- **Add shadcn component:** `npx shadcn@latest add [component-name]`
- **Update types after DB changes:** `npx supabase gen types typescript --project-id ID > lib/types/database.ts`
- **Check types:** `npx tsc --noEmit`

## Construction Estimator - Business Context

**Goal**: Transform HOVER measurement PDFs into professional Excel takeoffs for Exterior Finishes, a construction company specializing in James Hardie siding installations ($20,000-25,000 projects).

**Key Metric**: Reduce estimation time from 45 minutes to 5 minutes (89% efficiency improvement).

## 🔴 CRITICAL ARCHITECTURE PRINCIPLES

### PRINCIPLE #1: DATABASE-DRIVEN ARCHITECTURE (MOST IMPORTANT!)

**The Golden Rule**: NEVER hardcode field definitions, product options, or business logic.

❌ **NEVER:**
```typescript
const fields = [{ name: 'primary_siding', label: 'Primary Siding' }];
```

✅ **ALWAYS:**
```typescript
const { data: fields } = await supabase
  .from('trade_configurations')
  .select('*')
  .eq('trade', 'siding');
```

### PRINCIPLE #2: ASYNC PROCESSING PATTERN

Excel generation takes 30-60 seconds → Use async processing + Supabase Realtime:

1. Save to DB → Trigger n8n webhook (instant response)
2. n8n processes in background
3. Update DB status → Realtime notifies frontend
4. Show download button

### PRINCIPLE #3: FULL PROVENANCE TRACKING

Every line item must be traceable to its source.

## Database Schema (7 Core Tables)

### projects
- id, project_name, customer_name, address
- selected_trades[] (array: 'siding', 'roofing', 'windows', 'gutters')
- status ('draft' | 'processing' | 'complete' | 'error')
- hover_pdf_url, excel_url

### trade_configurations (17 siding fields exist!)
- Defines ALL form fields dynamically
- field_type: 'select' | 'checkbox' | 'multiselect' | 'number'
- show_if_conditions (JSONB) - conditional visibility
- load_from_catalog (boolean) - if true, load from product_catalog

### product_catalog (76+ products)
- product_name, category, subcategory
- Must be grouped by category in UI!
- physical_properties (JSONB) - contains is_colorplus, hex_code, etc.

### project_configurations
- Saves form data as JSONB

### takeoffs (NEW - Estimate Data)
- Links to projects (one-to-one)
- Stores extracted measurements from HOVER PDFs
- total_material_cost, total_labor_cost, total_cost

### takeoff_sections (NEW)
- Organizes line items into sections (e.g., "Siding", "Trim", "Accessories")
- Each section has a display_order for consistent presentation

### takeoff_line_items (NEW)
- Individual line items with quantities and costs
- item_name, description, quantity, unit
- material_unit_cost, labor_unit_cost, equipment_unit_cost
- Extended costs calculated: material_extended, labor_extended, line_total
- source_measurement (JSONB) - provenance tracking to HOVER data

## Development Rules

1. **Never hardcode fields or products** - Query database
2. **Implement show_if_conditions** - Conditional field visibility
3. **Group products by category** - Visual hierarchy in dropdowns
4. **Use async processing** - No synchronous Excel generation
5. **Mobile-first** - All components responsive

## Multi-Step Form Architecture

The project uses a 5-step wizard form located at `/app/project/new/page.tsx`:

1. **ProjectInfoStep** - Basic project information (name, customer, address)
2. **TradeSelectionStep** - Select which trades to include (siding, roofing, windows, gutters)
3. **ProductConfigStep** - Dynamic product configuration (MOST COMPLEX!)
   - Queries `trade_configurations` table to build form fields dynamically
   - Loads product options from `product_catalog` table
   - Implements conditional field visibility via `show_if_conditions`
   - Groups products by category in dropdowns
   - Uses ColorSwatch component for visual color selection
4. **HoverUploadStep** - Upload HOVER PDF to Supabase Storage (uses react-dropzone)
5. **ReviewSubmitStep** - Review data and submit to n8n webhook

Form state is managed via React useState and lifted to parent component. Each step receives `data` and `onUpdate` props.

## Estimate Editor Architecture

After a project is processed, users can view/edit the estimate at `/app/projects/[id]`:

**Key Components:**
- **EstimateGrid** - AG Grid-based spreadsheet for editing line items
  - Real-time calculation of extended costs (quantity × unit cost)
  - Editable cells for quantities, unit costs, descriptions
  - Row highlighting for modified/new items
  - Delete multiple rows with selection
- **SectionTabs** - Tabbed interface for different estimate sections (Siding, Trim, etc.)
- **EstimateSummary** - Summary card showing totals and margin calculations
- **useTakeoffData** - Custom hook for fetching takeoff data with Realtime subscriptions
- **useLineItemsSave** - Custom hook for saving line items with optimistic UI updates

**Data Flow:**
1. Page loads → useTakeoffData fetches takeoff + sections + line items
2. User edits grid → AG Grid updates local state
3. Calculations run → Extended costs recalculated automatically
4. User clicks Save → useLineItemsSave batch updates database
5. Realtime subscription → Other users see updates instantly

## Critical Implementation Patterns

### Dynamic Form Field Rendering
The `ProductConfigStep` component demonstrates the database-driven architecture:

```typescript
// ❌ NEVER do this:
const fields = [{ name: 'siding_color', label: 'Siding Color' }];

// ✅ ALWAYS do this:
const { data: fields } = await supabase
  .from('trade_configurations')
  .select('*')
  .eq('trade', selectedTrade)
  .order('section_order', { ascending: true });
```

**Key implementation details:**
1. Query `trade_configurations` table filtered by selected trades
2. Sort by `section_order` and `field_order` for consistent display
3. Check `load_from_catalog` field - if true, load options from `product_catalog`
4. Group products by `category` field for hierarchical dropdowns
5. Evaluate `show_if_conditions` JSONB to show/hide fields dynamically
6. Store all form values in `configurations` object keyed by `config_name`

### Conditional Field Visibility
Fields can be shown/hidden based on other field values using `show_if_conditions`.

**Simple Format (most common):**
```typescript
// Simple equality check
show_if_conditions: {
  belly_band_include: true
}

// Multiple conditions (all must match)
show_if_conditions: {
  window_manufacturer: "milgard",
  upgrade_options: "yes"
}
```

**Complex Format (with operators):**
```typescript
// Using operator syntax
show_if_conditions: {
  field_name: {
    operator: "not_equals",
    value: ""  // Show if field is not empty
  }
}

// Contains check (for multiselect fields)
show_if_conditions: {
  accessories: {
    contains: "flashing"
  }
}
```

**Special Cases:**
- `colorplus_color` field: Frontend checks if selected product has `physical_properties.is_colorplus = true`
- Empty string checks: Use `{operator: "not_equals", value: ""}` to show when field is filled
- The `isFieldVisible()` function in ProductConfigStep.tsx implements all visibility logic

### Product Catalog Grouping and Deduplication
When displaying products from `product_catalog`, apply filtering, deduplication, and grouping:

**1. Filter by catalog_filter (from field configuration):**
```typescript
const filterProductsByCatalogFilter = (
  products: ProductCatalog[],
  catalogFilter: Record<string, any> | null
): ProductCatalog[] => {
  if (!catalogFilter) return products;

  return products.filter(product => {
    // Check category (can be array)
    if (catalogFilter.category) {
      const categories = Array.isArray(catalogFilter.category)
        ? catalogFilter.category
        : [catalogFilter.category];
      if (!categories.includes(product.category)) return false;
    }

    // Check manufacturer (important for windows)
    if (catalogFilter.manufacturer) {
      const manufacturers = Array.isArray(catalogFilter.manufacturer)
        ? catalogFilter.manufacturer
        : [catalogFilter.manufacturer];
      if (!manufacturers.includes(product.manufacturer)) return false;
    }

    return true;
  });
};
```

**2. Deduplicate by product line (for roofing/windows only):**
```typescript
// Shows only unique product series (e.g., "Tuscany" not "Tuscany - Weathered Wood")
const deduplicateProducts = (products: ProductCatalog[]): ProductCatalog[] => {
  const seen = new Set<string>();
  const unique: ProductCatalog[] = [];

  for (const product of products) {
    const displayName = product.product_line || product.product_name.split(' - ')[0];
    if (!seen.has(displayName)) {
      seen.add(displayName);
      unique.push(product);
    }
  }

  return unique;
};
```

**3. Group by category for hierarchical display:**
```typescript
const grouped = products.reduce((acc, product) => {
  const category = product.category || 'Other';
  if (!acc[category]) acc[category] = [];
  acc[category].push(product);
  return acc;
}, {} as Record<string, ProductCatalog[]>);
```

**Trade-Specific Behavior:**
- **Siding**: No deduplication - shows full product names with colors
- **Roofing**: Deduplicates to show series only (e.g., "Landmark", "Duration")
- **Windows**: Deduplicates to show series only (e.g., "Tuscany", "Essence")
- **Gutters**: No deduplication - shows complete product names

### Parent-Child Field Grouping (Trim Accessories)
The `trim_accessories` section uses a special parent-child pattern where checkbox fields ending in `_include` control visibility of related child fields.

**Pattern Recognition:**
```typescript
// Parent field naming: {prefix}_include
belly_band_include: checkbox

// Child fields: {prefix}_*
belly_band_color: select
belly_band_material: select
```

**Grouping Logic:**
```typescript
const groupFieldsByParent = (fields: TradeConfiguration[]) => {
  const parentFields = new Map<string, TradeConfiguration>();
  const childFields = new Map<string, TradeConfiguration[]>();

  fields.forEach(field => {
    // Check if field is a parent (ends with _include)
    const match = field.config_name.match(/^(.+)_include$/);

    if (match && field.field_type === 'checkbox') {
      const prefix = match[1]; // e.g., "belly_band"
      parentFields.set(prefix, field);
      childFields.set(prefix, []);
    } else {
      // Check if this field belongs to a parent
      for (const prefix of parentFields.keys()) {
        if (field.config_name.startsWith(prefix + '_')) {
          childFields.get(prefix)!.push(field);
        }
      }
    }
  });

  return { parentFields, childFields };
};
```

**Rendering Pattern:**
```tsx
{group.parent && (
  <div className="space-y-3">
    {/* Parent checkbox - full width */}
    {renderField(group.parent, trade)}

    {/* Child fields - indented, only shown if parent is checked */}
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

**Example Groupings:**
- `belly_band_include` → `belly_band_color`, `belly_band_material`
- `corner_trim_include` → `corner_trim_product`, `corner_trim_color`
- `j_channel_include` → `j_channel_product`, `j_channel_color`

### Dynamic Manufacturer Filtering (Windows)
The windows trade implements cascading filtering where selecting a manufacturer dynamically filters the available window series.

**Implementation:**
```typescript
// When rendering the window_series field, check if window_manufacturer is selected
if (field.config_name === 'window_series' && field.load_from_catalog) {
  const selectedManufacturer = tradeValues['window_manufacturer'];

  if (selectedManufacturer) {
    // Dynamically add manufacturer filter to catalog_filter
    effectiveCatalogFilter = {
      ...field.catalog_filter,
      manufacturer: selectedManufacturer  // e.g., "milgard", "ply_gem", "marvin"
    };
  }
}

// Use effectiveCatalogFilter instead of field.catalog_filter
const selectOptions = field.load_from_catalog
  ? getGroupedProducts(field.trade, effectiveCatalogFilter)
  : null;
```

**Database Configuration:**
```sql
-- window_manufacturer field
{
  "config_name": "window_manufacturer",
  "field_type": "select",
  "field_options": {
    "options": [
      {"value": "milgard", "label": "Milgard"},
      {"value": "ply_gem", "label": "Ply Gem"},
      {"value": "marvin", "label": "Marvin"}
    ]
  }
}

-- window_series field (loads from catalog)
{
  "config_name": "window_series",
  "field_type": "select",
  "load_from_catalog": true,
  "catalog_filter": {
    "category": "windows"
    // manufacturer added dynamically in frontend
  }
}
```

**User Experience:**
1. User selects "Milgard" from manufacturer dropdown
2. Window series dropdown automatically shows only Milgard products (Tuscany, Essence, etc.)
3. Changing manufacturer updates the series list in real-time

### ColorSwatch Component (Visual Color Selection)
The ColorSwatch component provides visual color selection with hex code mapping for James Hardie ColorPlus colors.

**Implementation ([components/ui/color-swatch.tsx](components/ui/color-swatch.tsx)):**
```typescript
<ColorSwatch
  color="arctic white"
  label="Arctic White"
  hex="#F5F5F0"  // From product_catalog.physical_properties.hex_code
  selected={selectedColor === "arctic white"}
  onClick={() => setSelectedColor("arctic white")}
/>
```

**Features:**
- Displays color swatch with actual hex color background
- Shows checkmark when selected
- Hover effects for better UX
- Fallback color map for common colors without hex codes
- 25 official James Hardie ColorPlus colors with accurate hex codes

**Integration with Product Catalog:**
```typescript
// In ProductConfigStep.tsx
const selectedProduct = products.find(p => p.id === selectedProductId);
const hexCode = selectedProduct?.physical_properties?.hex_code;

<ColorSwatch color={option.value} label={option.label} hex={hexCode} />
```

### AG Grid Integration (Estimate Editor)
The EstimateGrid component uses AG Grid Community for spreadsheet-like estimate editing.

**Key Configuration:**
```typescript
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

// Register modules ONCE at module level
ModuleRegistry.registerModules([AllCommunityModule]);

const columnDefs: ColDef[] = [
  { field: "item_name", headerName: "Item", editable: true },
  { field: "quantity", headerName: "Qty", editable: true, valueParser: numberParser },
  { field: "material_unit_cost", headerName: "Material Unit", editable: true, valueFormatter: currencyFormatter },
  { field: "material_extended", headerName: "Material Ext", editable: false, valueFormatter: currencyFormatter },
  // ... more columns
];
```

**Real-Time Calculations:**
```typescript
const onCellValueChanged = (event: CellValueChangedEvent) => {
  // When quantity or unit cost changes, recalculate extended costs
  const recalcFields = ["quantity", "material_unit_cost", "labor_unit_cost"];

  if (recalcFields.includes(event.colDef.field)) {
    const updatedRow = recalculateRow(event.data);
    event.node.setData(updatedRow);  // Update grid immediately
    onItemsChange(updatedItems);      // Sync to parent state
  }
};

const recalculateRow = (data: LineItem) => ({
  ...data,
  material_extended: data.quantity * data.material_unit_cost,
  labor_extended: data.quantity * data.labor_unit_cost,
  line_total: material_extended + labor_extended + equipment_extended,
  isModified: true  // Flag for unsaved changes
});
```

**Row Styling (Visual Feedback):**
```typescript
const rowClassRules = {
  'bg-blue-50': (params: RowClassParams) => params.data?.isNew === true,
  'bg-yellow-50': (params: RowClassParams) => params.data?.isModified === true,
};
```

### Complete Project Submission Workflow

The full workflow implemented in [HoverUploadStep.tsx](components/project-form/HoverUploadStep.tsx):

**1. Upload PDF to Storage:**
```typescript
const fileName = `${tempProjectId}/${Date.now()}_${file.name}`;
const { data, error } = await supabase.storage
  .from('hover-pdfs')
  .upload(fileName, file, {
    cacheControl: '3600',
    upsert: false
  });

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('hover-pdfs')
  .getPublicUrl(data.path);
```

**2. Save Project to Database:**
```typescript
// Insert project record with status 'pending'
const { data: project, error } = await supabase
  .from('projects')
  .insert({
    name: projectName,
    client_name: customerName,
    address,
    selected_trades: selectedTrades,
    hover_pdf_url: publicUrl,
    status: 'pending' // Initial status
  })
  .select()
  .single();
```

**3. Save Trade Configurations:**
```typescript
// Insert configuration for each selected trade
for (const trade of selectedTrades) {
  await supabase.from('project_configurations').insert({
    project_id: project.id,
    trade,
    configuration_data: configurations[trade] // All form field values as JSONB
  });
}
```

**4. Trigger Processing (n8n webhook - future):**
```typescript
// Send webhook to trigger Excel generation
await fetch(process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: project.id,
    // n8n will fetch full project data from database
  })
});
```

**5. Monitor Processing Status (Realtime - future):**
```typescript
// Subscribe to status updates
const channel = supabase
  .channel(`project-${projectId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'projects',
    filter: `id=eq.${projectId}`
  }, (payload) => {
    // payload.new.status transitions:
    // pending → extracted → calculated → priced → approved
    if (payload.new.excel_url) {
      // Show download button
      setExcelUrl(payload.new.excel_url);
    }
  })
  .subscribe();
```

**Status Flow:**
1. `pending` - Project created, queued for processing
2. `extracted` - HOVER PDF measurements extracted
3. `calculated` - Material quantities calculated
4. `priced` - Pricing applied to all line items
5. `approved` - Ready for client (Excel generated)
6. `sent_to_client` - Proposal sent
7. `won` / `lost` / `on_hold` - Final states

## Environment Setup

Create a `.env.local` file in the project root with the following variables:

```bash
# Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# n8n Webhook (OPTIONAL - for Excel generation)
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/process-project
```

**Getting Supabase Credentials:**
1. Go to [supabase.com](https://supabase.com) and create a project
2. Navigate to Settings → API
3. Copy "Project URL" → `NEXT_PUBLIC_SUPABASE_URL`
4. Copy "anon public" key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Required Supabase Setup:**
1. Run all migration files in `/migrations` folder to create tables
2. Create storage bucket named `hover-pdfs` with public access
3. Enable Realtime on `projects` table (for status updates)

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Type check
npx tsc --noEmit

# Generate database types (after schema changes)
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/types/database.ts
```

## Technology Stack

**Core Framework:**
- Next.js 16 (App Router with React Server Components)
- React 19.2.0
- TypeScript 5

**Styling:**
- Tailwind CSS 4 (with PostCSS)
- tw-animate-css for animations
- OKLCH color space for theme tokens
- CSS custom properties for theming

**UI Components:**
- shadcn/ui (New York variant, with CSS variables)
- Radix UI primitives
- lucide-react for icons
- AG Grid Community (ag-grid-react, ag-grid-community) - Spreadsheet interface

**Backend & Data:**
- Supabase (@supabase/ssr, @supabase/supabase-js)
- React Hook Form with Zod validation
- date-fns for date utilities
- ExcelJS - Professional Excel export
- uuid - Unique ID generation

**Build Tools:**
- ESLint 9 with Next.js config
- TypeScript with strict mode enabled

## Project Structure

```
/app                    # Next.js App Router directory
  layout.tsx           # Root layout with Geist fonts and global styles
  page.tsx             # Landing page with CTA
  globals.css          # Global styles with Tailwind theme configuration
  /project
    page.tsx           # Project dashboard (tabbed: New | Past Projects)
    /new
      page.tsx         # Legacy standalone form route

/components
  /ui                  # shadcn/ui components (auto-generated, don't edit manually)
    alert.tsx
    badge.tsx
    button.tsx
    card.tsx
    checkbox.tsx
    collapsible.tsx
    dialog.tsx
    form.tsx           # React Hook Form integration
    input.tsx
    label.tsx
    progress.tsx
    select.tsx
    separator.tsx
    skeleton.tsx
    table.tsx
    tabs.tsx
    textarea.tsx
    tooltip.tsx
  /project-form        # Multi-step form components
    ProjectForm.tsx           # Standalone form wrapper (used in dashboard)
    ProjectInfoStep.tsx       # Step 1: Basic project info
    TradeSelectionStep.tsx    # Step 2: Select trades
    ProductConfigStep.tsx     # Step 3: Configure products (MOST COMPLEX!)
    HoverUploadStep.tsx       # Step 4: PDF upload with drag-and-drop
    ReviewSubmitStep.tsx      # Step 5: Review and submit
  /projects            # Project management components
    ProjectsTable.tsx         # Browse past projects
    ProjectDetailDialog.tsx   # View project details modal
    ProjectCard.tsx           # Card view for individual projects
  /estimate-editor     # Estimate editing components (NEW!)
    EstimateGrid.tsx          # AG Grid spreadsheet for line items
    SectionTabs.tsx           # Tabbed interface for sections
    EstimateSummary.tsx       # Summary card with totals
  /dashboard           # Dashboard components (NEW!)
    DashboardOverview.tsx     # Statistics and overview cards

/lib
  utils.ts             # Utility functions (cn helper for className merging)
  /supabase
    client.ts          # Browser client for Client Components
    server.ts          # Server client for Server Components/Actions
    takeoffs.ts        # Takeoff data queries (NEW!)
  /types
    database.ts        # Complete TypeScript database schema
  /hooks               # Custom React hooks (NEW!)
    useTakeoffData.ts        # Fetch takeoff with Realtime subscriptions
    useLineItemsSave.ts      # Save line items with optimistic updates
    useAutoSave.ts           # Auto-save functionality
    index.ts                 # Hook exports
  /utils               # Utility functions (NEW!)
    excelExport.ts           # Basic Excel export
    excelExportProfessional.ts  # Professional Excel with formatting
    itemHelpers.ts           # Line item calculations
  /validation          # Form validation schemas (NEW!)
    project-form.ts          # Zod schemas for form validation

/migrations            # SQL migration files
  create_takeoffs_schema.sql      # Takeoffs, sections, line items (NEW!)
  add_siding_configurations.sql
  add_roofing_configurations.sql
  add_windows_configurations.sql
  add_gutters_configurations.sql
  add_colorplus_color_options.sql
  add_belly_band_color_colorplus.sql
  update_colorplus_conditional.sql

/public                # Static assets

components.json        # shadcn/ui configuration
```

## Architecture & Patterns

### Path Aliases
TypeScript is configured with `@/*` path alias mapping to the root directory:
- `@/components` → `/components`
- `@/lib` → `/lib`
- `@/ui` → `/components/ui`
- `@/hooks` → `/hooks` (configured but not yet created)

### Styling System
- **Tailwind v4** uses inline `@theme` configuration in `globals.css`
- Theme tokens defined as CSS custom properties with OKLCH color space for better perceptual uniformity
- Dark mode via `.dark` class with custom variant: `@custom-variant dark (&:is(.dark *))`
- The `cn()` utility in `lib/utils.ts` combines clsx and tailwind-merge for className composition
- CSS variables for colors: `--color-*` tokens map to Tailwind utilities

### Font Configuration
Uses `next/font` with Geist Sans and Geist Mono, loaded via Google Fonts API and exposed as CSS variables:
- `--font-geist-sans`
- `--font-geist-mono`

### Component Patterns
**shadcn/ui Components:**
- Installed via shadcn CLI (configured in `components.json`)
- Style variant: "new-york"
- RSC-compatible (React Server Components)
- Located in `/components/ui`
- Use Radix UI primitives as foundation

**Form Handling:**
The project uses a complete form validation stack:
- `react-hook-form` for form state management
- `zod` (v4.1.12) for runtime schema validation
- `@hookform/resolvers` for integration
- Custom Form components in `components/ui/form.tsx` with error handling

Form components pattern:
```tsx
<Form>
  <FormField>
    <FormItem>
      <FormLabel />
      <FormControl>
        <Input />
      </FormControl>
      <FormDescription />
      <FormMessage />
    </FormItem>
  </FormField>
</Form>
```

### Supabase Integration
The project includes Supabase client libraries:
- `@supabase/supabase-js` (v2.81.1) - JavaScript client
- `@supabase/ssr` (v0.7.0) - Server-Side Rendering support for Next.js

**Environment Setup:**
Supabase configuration requires environment variables in `.env.local` (gitignored):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Supabase Client Files:**
- `/lib/supabase/client.ts` - Browser client for Client Components (uses `createBrowserClient`)
- `/lib/supabase/server.ts` - Server client with cookie handling for Server Components/Actions
- `/lib/types/database.ts` - Complete TypeScript database schema with helper types

**Type-Safe Database Access:**
```typescript
// Client Components (browser)
import { createClient } from '@/lib/supabase/client';
const supabase = createClient();
const { data } = await supabase.from('trade_configurations').select('*');

// Server Components/Actions
import { createClient } from '@/lib/supabase/server';
const supabase = await createClient();
const { data } = await supabase.from('projects').select('*');
```

**File Upload to Storage:**
```typescript
// Upload file to Supabase Storage
const { data, error } = await supabase.storage
  .from('hover-pdfs')
  .upload(`${projectId}/${file.name}`, file, {
    cacheControl: '3600',
    upsert: false
  });

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('hover-pdfs')
  .getPublicUrl(data.path);
```

### TypeScript Configuration
- Strict mode enabled
- Target: ES2017
- Module resolution: bundler (modern ESM)
- JSX: react-jsx (new JSX transform)
- Incremental compilation enabled

### ESLint Configuration
Uses flat config format (`eslint.config.mjs`) with:
- `eslint-config-next/core-web-vitals`
- `eslint-config-next/typescript`
- Custom ignore patterns for build outputs

## Adding New Features

### Adding shadcn/ui Components
Use the shadcn CLI to add new components (they'll auto-configure):
```bash
npx shadcn@latest add [component-name]
```

### Creating New Pages
Add files to `/app` directory following App Router conventions:
- `page.tsx` - Route page
- `layout.tsx` - Shared layout
- `loading.tsx` - Loading UI
- `error.tsx` - Error UI

### Database Types
When working with Supabase, generate TypeScript types from the database schema:
```bash
npx supabase gen types typescript --project-id [project-id] > lib/types/database.ts
```

## Custom React Hooks

### useTakeoffData ([lib/hooks/useTakeoffData.ts](lib/hooks/useTakeoffData.ts))
Fetches takeoff data with Realtime subscriptions for live updates.

```typescript
const {
  takeoff,      // Main takeoff record
  sections,     // Array of TakeoffSection
  lineItems,    // Array of LineItemWithState
  loading,      // Loading state
  error,        // Error message
  refresh       // Manual refresh function
} = useTakeoffData(projectId);
```

**Features:**
- Fetches all related data in single call via `getTakeoffByProjectId`
- Sets up Realtime subscription to `takeoff_line_items` table
- Auto-refreshes when other users make changes
- Returns typed data with proper state management

### useLineItemsSave ([lib/hooks/useLineItemsSave.ts](lib/hooks/useLineItemsSave.ts))
Handles saving line items with optimistic UI updates.

```typescript
const {
  saveLineItems,  // async function to save
  isSaving,       // Saving state
  error,          // Error message
  lastSaved       // Timestamp of last successful save
} = useLineItemsSave();

await saveLineItems(modifiedLineItems);
```

**Features:**
- Batch upserts for modified/new items
- Batch deletes for removed items
- Transaction-safe (all or nothing)
- Error handling with rollback
- Optimistic UI updates

### useAutoSave ([lib/hooks/useAutoSave.ts](lib/hooks/useAutoSave.ts))
Auto-saves data after a debounce period.

```typescript
useAutoSave({
  data: lineItems,
  onSave: async () => await saveLineItems(lineItems),
  delay: 3000  // 3 second debounce
});
```

## Excel Export Utilities

### excelExportProfessional.ts ([lib/utils/excelExportProfessional.ts](lib/utils/excelExportProfessional.ts))
Generates professional Excel workbooks with formatting using ExcelJS.

**Features:**
- Company header with logo
- Project information section
- Sections with color-coded headers
- Line items with alternating row colors
- Currency formatting
- Border styling
- Summary totals with formulas
- Professional appearance matching industry standards

**Usage:**
```typescript
import { exportTakeoffToExcel } from "@/lib/utils/excelExportProfessional";

await exportTakeoffToExcel({
  takeoff,
  sections,
  lineItems,
  projectInfo: {
    clientName: "John Doe",
    address: "123 Main St",
    projectName: "Siding Installation"
  },
  filename: "Estimate_JohnDoe_2024.xlsx"
});
```

**Output Structure:**
```
┌─────────────────────────────────────┐
│   COMPANY LOGO & HEADER             │
├─────────────────────────────────────┤
│   Project: Siding Installation      │
│   Client:  John Doe                 │
│   Address: 123 Main St              │
├─────────────────────────────────────┤
│   SECTION: Siding                   │ ← Blue header
├──────┬─────┬────────┬───────┬──────┤
│ Item │ Qty │ Unit   │ Ext   │ Total│
├──────┼─────┼────────┼───────┼──────┤
│ ...  │ ... │ ...    │ ...   │ ...  │ ← Alternating colors
└──────┴─────┴────────┴───────┴──────┘
```

## HoverUploadStep Implementation

The PDF upload step ([HoverUploadStep.tsx](components/project-form/HoverUploadStep.tsx)) implements a complete file upload workflow with drag-and-drop.

**Key Features:**
- Drag-and-drop interface using react-dropzone
- PDF validation (type check, 25MB size limit)
- Upload to Supabase Storage bucket `hover-pdfs`
- Progress tracking during upload
- Error handling with user-friendly messages
- File preview with size display
- Ability to remove/replace uploaded file

**Upload Flow:**
1. User drags PDF or clicks to browse
2. Client validates file type and size
3. File uploads to Supabase Storage: `hover-pdfs/${projectId}/${timestamp}_${filename}`
4. Public URL retrieved and stored in form data
5. URL saved to database when project is submitted

## ProjectsTable Component

The projects table ([ProjectsTable.tsx](components/projects/ProjectsTable.tsx)) provides a comprehensive interface for managing past projects.

**Features:**
- Real-time project listing from Supabase
- Client-side search/filter by name, client, or address
- Status badges with semantic colors:
  - `pending` - Gray (initial state)
  - `extracted` - Blue (measurements extracted)
  - `calculated` - Purple (quantities calculated)
  - `priced` - Orange (pricing applied)
  - `approved` - Green (ready to send)
  - `sent_to_client` - Teal (sent)
  - `won` - Green (project won)
  - `lost` - Red (project lost)
  - `on_hold` - Yellow (paused)
- View project details in modal dialog
- Download Excel output when available
- Delete projects with confirmation
- Format dates with date-fns
- Responsive table design with mobile support

**Integration with Realtime (future):**
```typescript
// Subscribe to project updates
supabase
  .channel('projects-table')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'projects'
  }, (payload) => {
    // Update local state when projects change
    handleRealtimeUpdate(payload);
  })
  .subscribe();
```

## Application Routes

The application has four main routes:

1. **`/`** - Landing page with CTA to start new project
2. **`/app/project`** - Project dashboard (primary interface)
   - Tab 1: "New Project" - Complete 5-step form
   - Tab 2: "Past Projects" - Browse/search existing projects with status tracking
3. **`/app/project/new`** - Legacy standalone form (same as dashboard tab 1)
4. **`/app/projects/[id]`** - Individual project estimate editor (NEW!)
   - View/edit takeoff data in AG Grid spreadsheet
   - Real-time cost calculations
   - Export to professional Excel format
   - Approve and send estimates to clients

## Project Dashboard (`/app/project/page.tsx`)

The dashboard uses shadcn/ui Tabs to switch between creating new projects and viewing past projects.

**Key Features:**
- Tabbed interface (New Project | Past Projects)
- ProjectForm component for creation
- ProjectsTable component for browsing with search/filter
- Realtime status updates via Supabase subscriptions

## Current Implementation Status

**Completed (Production Ready):**
- ✅ Landing page with call-to-action (`/`)
- ✅ Project dashboard with tabbed interface (`/app/project`)
- ✅ Multi-step form (ProjectForm component)
  - ✅ Step 1: ProjectInfoStep (name, customer, address)
  - ✅ Step 2: TradeSelectionStep (select trades)
  - ✅ Step 3: ProductConfigStep (database-driven configuration)
  - ✅ Step 4: HoverUploadStep (PDF upload with drag-and-drop)
  - ✅ Step 5: ReviewSubmitStep (review and submit)
- ✅ Supabase client setup (browser and server)
- ✅ Complete TypeScript database schema
- ✅ shadcn/ui component library (25+ components including ColorSwatch, EmptyState, StatCard, StatusBadge)
- ✅ ProductConfigStep features:
  - ✅ Dynamic field loading from database
  - ✅ Conditional field visibility (show_if_conditions)
  - ✅ Product catalog integration with category grouping
  - ✅ Parent-child field relationships for trim accessories
  - ✅ Manufacturer filtering for windows
  - ✅ Product deduplication for roofing/windows
  - ✅ ColorSwatch component for visual color selection with hex codes
- ✅ HoverUploadStep features:
  - ✅ Drag-and-drop PDF upload with react-dropzone
  - ✅ File validation (PDF only, 25MB max)
  - ✅ Upload to Supabase Storage (hover-pdfs bucket)
  - ✅ Progress tracking and error handling
- ✅ ProjectsTable component:
  - ✅ List all projects with search/filter
  - ✅ Status badges with color coding
  - ✅ View project details in dialog
  - ✅ Download Excel outputs when ready
  - ✅ Delete projects functionality
- ✅ Project submission workflow:
  - ✅ Save project to database
  - ✅ Save configurations for each trade
  - ✅ Upload PDF to storage
  - ✅ Trigger processing workflow
- ✅ **Estimate Editor** (`/app/projects/[id]`) - NEW!
  - ✅ AG Grid integration for spreadsheet-like editing
  - ✅ Real-time cost calculations (quantity × unit cost)
  - ✅ Section-based organization with tabs
  - ✅ Add/delete line items
  - ✅ Row highlighting for new/modified items
  - ✅ Batch save with optimistic UI updates
  - ✅ Professional Excel export with formatting
- ✅ **Custom React Hooks** - NEW!
  - ✅ useTakeoffData - Fetch with Realtime subscriptions
  - ✅ useLineItemsSave - Batch save with error handling
  - ✅ useAutoSave - Auto-save with debounce
- ✅ **Takeoffs Schema** - NEW!
  - ✅ takeoffs, takeoff_sections, takeoff_line_items tables
  - ✅ Migration files for schema creation
  - ✅ Provenance tracking with source_measurement field
- ✅ **Excel Export** - NEW!
  - ✅ ExcelJS integration for professional exports
  - ✅ Color-coded sections
  - ✅ Currency formatting
  - ✅ Company branding
  - ✅ Summary totals with formulas

**Pending/Future Enhancements:**
- ⏳ n8n webhook integration for Excel generation
- ⏳ Supabase Realtime subscription for live multi-user editing (hooks prepared)
- ⏳ Form validation with Zod schemas (schemas created, need integration)
- ⏳ Edit existing project configurations
- ⏳ Duplicate/clone project feature
- ⏳ Export project data as JSON
- ⏳ Bulk operations (multi-select, batch delete)
- ⏳ Project templates for common configurations
- ⏳ Email sending for estimates
- ⏳ Client approval workflow
- ⏳ Profit margin calculator
- ⏳ Labor rate management

## Important Notes

- **React 19 & Next.js 16**: Uses latest stable versions with breaking changes from previous versions
- **Tailwind v4**: Uses new inline `@theme` syntax in CSS, not `tailwind.config.js`
- **AG Grid Community**: Free version - do NOT import from `ag-grid-enterprise`
  - Always register modules: `ModuleRegistry.registerModules([AllCommunityModule])`
  - Import CSS in components: `import "ag-grid-community/styles/ag-grid.css"`
  - Use Alpine theme: `import "ag-grid-community/styles/ag-theme-alpine.css"`
- **No test setup yet**: Testing framework not configured (consider adding Vitest or Jest)
- **Environment variables**: All `.env*` files are gitignored; ensure `.env.local` is configured with Supabase credentials
- **shadcn/ui files**: Don't manually edit files in `/components/ui` - regenerate via CLI if needed
- **Database-first development**: Always check database schema before adding features
- **ExcelJS for exports**: Use `excelExportProfessional.ts` for client-facing exports, not basic version
