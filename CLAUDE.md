# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Estimator is a Next.js 16 application built with React 19, TypeScript, and Tailwind CSS 4. The project uses shadcn/ui components for the UI layer and Supabase for backend services. It appears to be designed for AI-powered estimation and project management.

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

## Database Schema (4 Core Tables)

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

### project_configurations
- Saves form data as JSONB

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
4. **PDFUploadStep** - Upload HOVER PDF to Supabase Storage
5. **ReviewSubmitStep** - Review data and submit to n8n webhook

Form state is managed via React useState and lifted to parent component. Each step receives `data` and `onUpdate` props.

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
Fields can be shown/hidden based on other field values using `show_if_conditions`:

```typescript
// Example condition from database:
show_if_conditions: {
  field: "primary_siding",
  operator: "equals",
  value: "HardiePlank Lap Siding"
}
```

### Product Catalog Grouping
When displaying products from `product_catalog`, group by category:

```typescript
const grouped = products.reduce((acc, product) => {
  if (!acc[product.category]) acc[product.category] = [];
  acc[product.category].push(product);
  return acc;
}, {} as Record<string, ProductCatalog[]>);
```

### Project Submission Workflow
When user submits the final form:

1. **Save to Database:**
   ```typescript
   // Insert project record
   const { data: project } = await supabase
     .from('projects')
     .insert({
       project_name, customer_name, address,
       selected_trades, hover_pdf_url,
       status: 'processing'
     })
     .select()
     .single();

   // Insert configuration for each trade
   for (const trade of selectedTrades) {
     await supabase.from('project_configurations').insert({
       project_id: project.id,
       trade,
       configuration_data: configurations[trade]
     });
   }
   ```

2. **Trigger n8n Webhook:**
   Send POST request to n8n with `project_id`
   n8n will process in background (30-60 seconds)

3. **Subscribe to Realtime Updates:**
   ```typescript
   supabase
     .channel('project-updates')
     .on('postgres_changes', {
       event: 'UPDATE',
       schema: 'public',
       table: 'projects',
       filter: `id=eq.${projectId}`
     }, (payload) => {
       if (payload.new.status === 'complete') {
         // Show download button with excel_url
       }
     })
     .subscribe();
   ```

## Development Commands

```bash
# Start development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Install dependencies
npm install
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

**Backend & Data:**
- Supabase (@supabase/ssr, @supabase/supabase-js)
- React Hook Form with Zod validation
- date-fns for date utilities

**Build Tools:**
- ESLint 9 with Next.js config
- TypeScript with strict mode enabled

## Project Structure

```
/app                    # Next.js App Router directory
  layout.tsx           # Root layout with Geist fonts and global styles
  page.tsx             # Home page
  globals.css          # Global styles with Tailwind theme configuration

/components
  /ui                  # shadcn/ui components (auto-generated, don't edit manually)
    button.tsx
    card.tsx
    checkbox.tsx
    form.tsx           # React Hook Form integration
    input.tsx
    label.tsx
    progress.tsx
    select.tsx
    separator.tsx
    textarea.tsx
  /project-form        # Multi-step form components
    ProjectInfoStep.tsx
    TradeSelectionStep.tsx
    ProductConfigStep.tsx
    PDFUploadStep.tsx
    ReviewSubmitStep.tsx

/lib
  utils.ts             # Utility functions (cn helper for className merging)
  /supabase
    client.ts          # Browser client for Client Components
    server.ts          # Server client for Server Components/Actions
  /types
    database.ts        # Complete TypeScript database schema

/migrations            # SQL migration files
  add_roofing_configurations.sql
  add_windows_configurations.sql
  add_gutters_configurations.sql
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
import { createClient } from '@/lib/supabase/client';
// Client is automatically typed with Database schema
const supabase = createClient();
const { data } = await supabase.from('trade_configurations').select('*');
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

## Current Implementation Status

**Completed:**
- ✅ Landing page with call-to-action (`/`)
- ✅ Multi-step form scaffold (`/app/project/new/page.tsx`)
- ✅ All 5 form step components created
- ✅ Supabase client setup (browser and server)
- ✅ Complete TypeScript database schema
- ✅ shadcn/ui component library installed
- ✅ ProductConfigStep with dynamic field loading

**Not Yet Implemented:**
- ⏳ Form validation with Zod schemas
- ⏳ PDF file upload to Supabase Storage
- ⏳ Project submission handler
- ⏳ n8n webhook integration
- ⏳ Realtime subscription for status updates
- ⏳ Excel download functionality
- ⏳ Error handling and loading states
- ⏳ Database initialization/seeding

## Important Notes

- **React 19 & Next.js 16**: Uses latest stable versions with breaking changes from previous versions
- **Tailwind v4**: Uses new inline `@theme` syntax in CSS, not `tailwind.config.js`
- **No test setup yet**: Testing framework not configured (consider adding Vitest or Jest)
- **Environment variables**: All `.env*` files are gitignored; ensure `.env.local` is configured with Supabase credentials
- **shadcn/ui files**: Don't manually edit files in `/components/ui` - regenerate via CLI if needed
- **Database-first development**: Always check database schema before adding features
