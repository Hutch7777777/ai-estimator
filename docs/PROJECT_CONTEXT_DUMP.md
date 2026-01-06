# AI-Estimator Project Context Dump

> Complete project context for sharing with another AI assistant

---

## 1. Project Overview

**Name:** AI Estimator / Estimate.ai
**Framework:** Next.js 16 with React 19, TypeScript 5, Tailwind CSS 4
**Database:** Supabase (PostgreSQL with RLS)
**Purpose:** Transform HOVER measurement PDFs into professional Excel takeoffs for construction contractors

---

## 2. Directory Structure

```
.
├── app/
│   ├── account/page.tsx
│   ├── auth/callback/route.ts
│   ├── error.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── onboarding/page.tsx
│   ├── page.tsx
│   ├── project/
│   │   ├── error.tsx
│   │   ├── layout.tsx
│   │   ├── new/page.tsx
│   │   └── page.tsx
│   ├── projects/
│   │   ├── [id]/page.tsx
│   │   ├── error.tsx
│   │   └── layout.tsx
│   └── signup/page.tsx
├── components/
│   ├── cad-markup/ (22 files)
│   │   ├── CADViewer.tsx
│   │   ├── CADMarkupStep.tsx
│   │   ├── types.ts
│   │   ├── hitTesting.ts
│   │   ├── useHistory.ts
│   │   └── ... more
│   ├── dashboard/
│   │   └── DashboardOverview.tsx
│   ├── estimate-editor/
│   │   ├── EstimateGrid.tsx
│   │   ├── EstimateSummary.tsx
│   │   ├── ProductSearchModal.tsx
│   │   └── SectionTabs.tsx
│   ├── layout/
│   │   └── UserMenu.tsx
│   ├── project-form/
│   │   ├── HoverUploadStep.tsx
│   │   ├── PDFUploadStep.tsx
│   │   ├── ProductConfigStep.tsx
│   │   ├── ProjectForm.tsx
│   │   ├── ProjectInfoStep.tsx
│   │   ├── ReviewSubmitStep.tsx
│   │   └── TradeSelectionStep.tsx
│   ├── projects/
│   │   ├── ProjectCard.tsx
│   │   ├── ProjectDetailDialog.tsx
│   │   └── ProjectsTable.tsx
│   └── ui/ (29 shadcn/ui components)
├── lib/
│   ├── hooks/
│   │   ├── index.ts
│   │   ├── useAutoSave.ts
│   │   ├── useLineItemsSave.ts
│   │   ├── useOrganization.tsx
│   │   ├── useTakeoffData.ts
│   │   └── useUser.tsx
│   ├── supabase/
│   │   ├── bluebeamProjects.ts
│   │   ├── cadCategories.ts
│   │   ├── cadExtractions.ts
│   │   ├── cadMarkups.ts
│   │   ├── client.ts
│   │   ├── middleware.ts
│   │   ├── pdfStorage.ts
│   │   ├── products.ts
│   │   ├── server.ts
│   │   └── takeoffs.ts
│   ├── types/
│   │   └── database.ts
│   ├── utils/
│   │   ├── excelExport.ts
│   │   ├── excelExportProfessional.ts
│   │   └── itemHelpers.ts
│   ├── utils.ts
│   └── validation/
│       └── project-form.ts
├── migrations/ (SQL migrations)
├── middleware.ts
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 3. Configuration Files

### package.json
```json
{
  "name": "ai-estimator",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@hookform/resolvers": "^5.2.2",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-collapsible": "^1.1.12",
    "@radix-ui/react-context-menu": "^2.2.16",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-progress": "^1.1.8",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@supabase/ssr": "^0.7.0",
    "@supabase/supabase-js": "^2.81.1",
    "ag-grid-community": "^34.3.1",
    "ag-grid-react": "^34.3.1",
    "canvas-confetti": "^1.9.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^4.1.0",
    "exceljs": "^4.4.0",
    "lucide-react": "^0.553.0",
    "next": "16.0.10",
    "pdfjs-dist": "^5.4.449",
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "react-dropzone": "^14.3.8",
    "react-hook-form": "^7.66.0",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.4.0",
    "uuid": "^13.0.0",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/uuid": "^10.0.0",
    "eslint": "^9",
    "eslint-config-next": "16.0.3",
    "tailwindcss": "^4",
    "tw-animate-css": "^1.4.0",
    "typescript": "^5"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### next.config.ts
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  logging: { fetches: { fullUrl: true } },
  experimental: { optimizePackageImports: ['lucide-react'] },
};

export default nextConfig;
```

---

## 4. Environment Variables (Keys Only)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## 5. Supabase Client Setup

### lib/supabase/client.ts (Browser - Singleton)
```typescript
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return browserClient;
}

export function createFreshClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### lib/supabase/server.ts (Server - Per Request)
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types/database';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) { /* Ignore in Server Components */ }
        },
      },
    }
  );
}
```

---

## 6. Database Types (lib/types/database.ts)

```typescript
// Enums
export type ProjectStatus = 'pending' | 'extracted' | 'calculated' | 'priced' | 'approved' | 'sent_to_client' | 'won' | 'lost' | 'on_hold';
export type Trade = 'siding' | 'roofing' | 'windows' | 'gutters';
export type FieldType = 'select' | 'checkbox' | 'multiselect' | 'number';
export type TakeoffStatus = 'draft' | 'in_progress' | 'review' | 'approved' | 'sent';
export type CalculationSource = 'auto_scope' | 'manual' | 'hover_pdf' | 'imported';
export type Unit = 'EA' | 'PC' | 'SQ' | 'LF' | 'SF' | 'RL' | 'BX' | 'BDL' | 'GAL';

// Main Tables
export interface Project {
  id: string;
  name: string;
  client_name: string;
  address: string;
  selected_trades: Trade[];
  status: ProjectStatus;
  hover_pdf_url: string | null;
  excel_url: string | null;
  markup_percent: number;
  created_at: string;
  updated_at: string;
}

export interface TradeConfiguration {
  id: string;
  trade: Trade;
  config_section: string;
  config_name: string;
  config_display_name: string;
  field_type: FieldType;
  field_label: string;
  field_options: Record<string, any> | null;
  default_value: string | null;
  is_required: boolean;
  show_if_conditions: Record<string, any> | null;
  load_from_catalog: boolean;
  catalog_filter: Record<string, any> | null;
}

export interface ProductCatalog {
  id: string;
  trade: Trade;
  manufacturer: string;
  product_line: string;
  product_name: string;
  sku: string;
  category: string;
  material_cost: number | null;
  labor_cost: number | null;
  unit: string;
  physical_properties: Record<string, any> | null;
  active: boolean;
}

export interface Takeoff {
  id: string;
  project_id: string;
  status: TakeoffStatus;
  total_material: number;
  total_labor: number;
  total_equipment: number;
  grand_total: number;
  markup_percent: number;
}

export interface TakeoffSection {
  id: string;
  takeoff_id: string;
  name: Trade;
  display_name: string;
  sort_order: number;
  total_material: number;
  total_labor: number;
  section_total: number;
}

export interface TakeoffLineItem {
  id: string;
  takeoff_id: string;
  section_id: string;
  item_number: number;
  description: string;
  sku: string | null;
  quantity: number;
  unit: Unit;
  material_unit_cost: number;
  labor_unit_cost: number;
  equipment_unit_cost: number;
  material_extended: number;
  labor_extended: number;
  line_total: number;
  product_id: string | null;
  calculation_source: CalculationSource;
}

export interface LineItemWithState extends TakeoffLineItem {
  isNew?: boolean;
  isModified?: boolean;
}

// Database type for Supabase client
export interface Database {
  public: {
    Tables: {
      projects: { Row: Project; Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>; Update: Partial<...>; };
      trade_configurations: { Row: TradeConfiguration; ... };
      product_catalog: { Row: ProductCatalog; ... };
      takeoffs: { Row: Takeoff; ... };
      takeoff_sections: { Row: TakeoffSection; ... };
      takeoff_line_items: { Row: TakeoffLineItem; ... };
    };
  };
}
```

---

## 7. Custom Hooks

### useUser (lib/hooks/useUser.tsx)
- Provides `user`, `profile`, `isLoading`, `signOut`, `refreshProfile`
- Context-based with auth state listener
- Fetches user profile from `user_profiles` table

### useOrganization (lib/hooks/useOrganization.tsx)
- Provides `organization`, `membership`, `organizations`, `isLoading`, `hasNoOrganizations`
- Multi-tenant support via `organization_memberships` table
- Role-based permissions: `isOwner`, `isAdmin`, `canEdit`
- 10-second loading timeout safeguard

### useTakeoffData (lib/hooks/useTakeoffData.ts)
- Fetches takeoff, sections, and line items for a project
- Sets up Supabase Realtime subscriptions for live updates
- Returns `takeoff`, `sections`, `lineItems`, `loading`, `error`, `refresh`

### useLineItemsSave (lib/hooks/useLineItemsSave.ts)
- Bulk upsert for line items (create new or update existing)
- Returns `saveLineItems`, `isSaving`, `error`, `lastSaved`

### useAutoSave (lib/hooks/useAutoSave.ts)
- Auto-saves data to localStorage at intervals
- Draft recovery with timestamp tracking
- Returns `saveData`, `loadData`, `clearDraft`, `hasDraft`

---

## 8. CAD Markup System

### Types (components/cad-markup/types.ts)
```typescript
export interface Point { x: number; y: number; }

export interface MarkupMaterial {
  trade: string;
  category: string;
  productId?: string;
  productName?: string;
  color: string;
}

export type ToolMode = "select" | "draw" | "count" | "linear" | "calibrate";

export interface Polygon {
  id: string;
  pageNumber: number;
  points: Point[];
  material: MarkupMaterial;
  area: number;
  isComplete: boolean;
  subject?: string;
  notes?: string;
}

export interface CountMarker {
  id: string;
  pageNumber: number;
  position: Point;
  material: MarkupMaterial;
  label: string;
  count: number;
}

export interface LinearMeasurement {
  id: string;
  pageNumber: number;
  start: Point;
  end: Point;
  lengthFeet: number;
  material: MarkupMaterial;
}

export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_MARKUP_COLOR = "#3B82F6";
export const MARKUP_COLOR_PRESETS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
  "#F97316", "#6B7280"
];
```

### Hit Testing (components/cad-markup/hitTesting.ts)
- `pointInPolygon()` - Ray casting algorithm
- `pointNearLine()` - Perpendicular distance to segment
- `pointNearPoint()` - Distance check
- `hitTestAll()` - Priority: markers > measurements > polygons

### History Hook (components/cad-markup/useHistory.ts)
- Generic undo/redo with 50-item history limit
- Keyboard shortcuts: Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z (redo)
- Returns `state`, `setState`, `undo`, `redo`, `canUndo`, `canRedo`

---

## 9. Extraction Data (lib/supabase/cadExtractions.ts)

### Types
```typescript
export interface CadExtraction {
  id: string;
  project_name: string;
  status: string;
  sheet_count: number | null;
  dimension_count: number | null;
  material_callout_count: number | null;
}

export interface CadMaterialCallout {
  id: string;
  extraction_id: string;
  raw_text: string;
  normalized_text: string;
  trade: string;
  material_type: string | null;
  manufacturer: string | null;
  match_confidence: number | null;
  product_id: string | null;
  user_corrected: boolean;
}

export interface CadHoverMeasurements {
  id: string;
  extraction_id: string;
  facade_total_sqft: number;
  net_siding_sqft: number;
  openings_count: number;
  outside_corners_lf: number;
  // ... more measurements
}
```

### Trade Constants
```typescript
export const EXTERIOR_TRADES = ["siding", "roofing", "trim", "windows", "doors", "gutters", "decking"];
export const EXCLUDED_TRADES = ["interior", "masonry", "exclude"];
export const ALL_TRADES = [...EXTERIOR_TRADES, ...EXCLUDED_TRADES, "unknown"];

export const TRADE_CATEGORIES: Record<string, string[]> = {
  siding: ["lap_siding", "panel_siding", "board_batten", "shake_siding"],
  roofing: ["metal", "metal_5v", "standing_seam", "asphalt_shingle", ...],
  trim: ["fascia", "soffit", "corner_boards", "frieze", "rake", ...],
  windows: ["general", "double_hung", "casement", "slider", ...],
  // ... more
};
```

### API Functions
- `fetchCadExtractions()` - Get all completed extractions
- `getCadExtraction(id)` - Get single extraction
- `getHoverMeasurements(extractionId)` - Get measurements
- `getMaterialCallouts(extractionId)` - Get callouts
- `getCalloutsByTrade(extractionId)` - Grouped by trade
- `updateCalloutTrade(id, trade, materialType)` - Update classification
- `confirmCallout(id)` - Mark as confirmed
- `recordTrainingExample()` - Add to training data

---

## 10. Component Summary

**Total Components:** 66 TSX files
- **UI Components (shadcn/ui):** 29
- **CAD Markup:** 22
- **Project Form:** 7
- **Estimate Editor:** 4
- **Projects:** 3
- **Dashboard:** 1
- **Layout:** 1

### Key Components:
- `CADViewer.tsx` - Canvas overlay for drawing polygons, markers, measurements
- `CADMarkupStep.tsx` - Full PDF markup workflow orchestrator
- `EstimateGrid.tsx` - AG Grid spreadsheet for line items
- `ProjectForm.tsx` - Multi-step project creation wizard
- `ProjectsTable.tsx` - Project list with search/filter

---

## 11. App Layout

### app/layout.tsx
```tsx
import { UserProvider } from "@/lib/hooks/useUser";
import { OrganizationProvider } from "@/lib/hooks/useOrganization";
import { Toaster } from "sonner";
import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="...fonts...">
      <body className="antialiased">
        <UserProvider>
          <OrganizationProvider>
            {children}
          </OrganizationProvider>
        </UserProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
```

---

## 12. Middleware (Auth Protection)

### middleware.ts
```typescript
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request) {
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

### lib/supabase/middleware.ts
- Public routes: `/login`, `/signup`, `/auth/callback`, `/onboarding`
- Redirects unauthenticated users to `/login`
- Redirects authenticated users from `/login` to `/project`

---

## 13. Styling (Tailwind CSS 4)

- Uses inline `@theme` configuration in `globals.css`
- Green accent color: `#00cc6a`
- Custom properties for theming via CSS variables
- AG Grid theme customization
- Animations: fade-in, float, scale-in, gradient-shift

---

## 14. Key Patterns

### Database-Driven Architecture
- NEVER hardcode field definitions or products
- Query `trade_configurations` for form fields
- Query `product_catalog` for product options

### Multi-Tenant Data Isolation
- All queries filtered by `organization_id`
- RLS policies enforce at database level
- `useOrganization` hook provides current org context

### Coordinate Transform (Canvas)
```typescript
screenToCanvas(screenX, screenY) {
  rect = container.getBoundingClientRect();
  x = (screenX - rect.left - offsetX) / scale;
  y = (screenY - rect.top - offsetY) / scale;
  return { x, y };
}
```

### Realtime Subscriptions
```typescript
supabase.channel(`takeoff-${id}`)
  .on('postgres_changes', { event: '*', table: 'takeoffs', filter: `id=eq.${id}` }, handler)
  .subscribe();
```

---

## 15. External Integrations

- **Supabase:** Database, Auth, Storage, Realtime
- **pdf.js:** PDF rendering (pdfjs-dist)
- **AG Grid:** Spreadsheet component for estimate editing
- **ExcelJS:** Professional Excel export
- **HOVER PDF:** External measurement report format

---

*Generated for project context sharing*
