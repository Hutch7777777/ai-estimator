# Frontend Architecture Documentation

> AI Estimator - Construction Estimation SaaS Platform
>
> Last Updated: January 2026

---

## Table of Contents

1. [Route Structure](#1-route-structure)
2. [Component Hierarchy](#2-component-hierarchy)
3. [State Management](#3-state-management)
4. [API Integration Points](#4-api-integration-points)
5. [Key Data Types](#5-key-data-types)
6. [Supabase Integration](#6-supabase-integration)
7. [Critical UI Flows](#7-critical-ui-flows)

---

## 1. Route Structure

### Overview

The application uses Next.js App Router with file-based routing. Routes are organized under `/app/`.

### Public Routes

| Route | File Path | Purpose | Key Components | API Calls |
|-------|-----------|---------|----------------|-----------|
| `/` | [app/page.tsx](app/page.tsx) | Landing page with hero, "How It Works", benefits, FAQs | Hero, FeatureCards, FAQ accordion | None |
| `/login` | [app/login/page.tsx](app/login/page.tsx) | User authentication | LoginForm with email/password, Google OAuth | Supabase Auth |
| `/signup` | [app/signup/page.tsx](app/signup/page.tsx) | New user registration | SignupForm, Google OAuth | Supabase Auth |
| `/onboarding` | [app/onboarding/page.tsx](app/onboarding/page.tsx) | First-time organization setup | OnboardingWizard | `organizations`, `organization_memberships` |
| `/auth/callback` | [app/auth/callback/route.ts](app/auth/callback/route.ts) | OAuth callback handler | N/A (Route Handler) | Supabase Auth session exchange |

### Protected Routes (Authentication Required)

| Route | File Path | Purpose | Key Components | API Calls |
|-------|-----------|---------|----------------|-----------|
| `/project` | [app/project/page.tsx](app/project/page.tsx) | Main project dashboard (tabbed interface) | DashboardOverview, ProjectForm, CADMarkupStep, ExtractionsTable, ProjectsTable | `projects`, `extraction_jobs`, `trade_configurations`, `product_catalog` |
| `/project/new` | [app/project/new/page.tsx](app/project/new/page.tsx) | Legacy standalone new project form | ProjectForm (5-step wizard) | Same as `/project` |
| `/projects/[id]` | [app/projects/[id]/page.tsx](app/projects/[id]/page.tsx) | Project estimate editor | EstimateGrid, SectionTabs, EstimateSummary | `takeoffs`, `takeoff_sections`, `takeoff_line_items` |
| `/projects/[id]/extraction/[jobId]` | [app/projects/[id]/extraction/[jobId]/page.tsx](app/projects/[id]/extraction/[jobId]/page.tsx) | Detection Editor for extraction review | DetectionEditor, KonvaDetectionCanvas, DetectionSidebar, PropertiesPanel | `extraction_jobs`, `extraction_pages`, `extraction_detections` |
| `/dashboard/extractions/[jobId]/classify` | [app/dashboard/extractions/[jobId]/classify/page.tsx](app/dashboard/extractions/[jobId]/classify/page.tsx) | Page classification interface | PageClassifier, PageGrid | `extraction_pages` |
| `/takeoffs/[id]` | [app/takeoffs/[id]/page.tsx](app/takeoffs/[id]/page.tsx) | Read-only takeoff view | TakeoffHeader, MaterialsTable, LaborTable, CostSummaryCard, PlanIntelligence | `GET /api/takeoffs/[id]` |
| `/account` | [app/account/page.tsx](app/account/page.tsx) | User account settings | AccountSettings, ProfileForm | `user_profiles` |
| `/test-konva` | [app/test-konva/page.tsx](app/test-konva/page.tsx) | Development test page | Konva canvas testing | None |

### Route Layouts

| Layout | File Path | Purpose |
|--------|-----------|---------|
| Root Layout | [app/layout.tsx](app/layout.tsx) | Global providers (UserProvider, OrganizationProvider), fonts, Toaster |
| Project Layout | [app/project/layout.tsx](app/project/layout.tsx) | Project dashboard navigation and sidebar |

---

## 2. Component Hierarchy

### 2.1 Detection Editor (`/components/detection-editor/`)

The Detection Editor is the core visual annotation tool for reviewing and editing ML-extracted detections.

```
DetectionEditor.tsx (main container - 1200+ lines)
├── State Management
│   ├── useExtractionData(jobId) - fetches job, pages, detections
│   ├── useDetectionSync(jobId, projectId) - syncs edits to DB
│   └── Local state: selectedTool, selectedDetectionId, viewTransform
│
├── Layout Structure
│   ├── DetectionSidebar.tsx (left panel)
│   │   ├── Page list with thumbnails
│   │   ├── Page navigation
│   │   ├── Detection filter/search
│   │   └── Page-level statistics
│   │
│   ├── Main Canvas Area (center)
│   │   ├── DetectionToolbar.tsx (top toolbar)
│   │   │   ├── Tool selection: select, create, pan, verify, calibrate, line, point, split
│   │   │   ├── Zoom controls
│   │   │   ├── Undo/Redo buttons
│   │   │   └── Save/Approve actions
│   │   │
│   │   ├── KonvaDetectionCanvas.tsx (Konva Stage)
│   │   │   ├── Image layer (page image)
│   │   │   ├── Detection layer
│   │   │   │   ├── KonvaDetectionPolygon.tsx - freeform polygon shapes
│   │   │   │   ├── KonvaDetectionRect.tsx - rectangle bounding boxes
│   │   │   │   ├── KonvaDetectionLine.tsx - linear measurements (LF)
│   │   │   │   └── KonvaDetectionPoint.tsx - point/count markers
│   │   │   └── Selection/hover overlay
│   │   │
│   │   └── CalibrationModal.tsx - scale calibration dialog
│   │
│   └── PropertiesPanel/ (right panel)
│       ├── index.tsx - main container
│       ├── SelectionProperties.tsx - selected item details
│       ├── ClassSelector.tsx - detection class dropdown
│       ├── ColorPicker.tsx - color override selection
│       ├── MaterialAssignment.tsx - product/material picker
│       ├── EditablePrice.tsx - price override inputs
│       ├── NotesField.tsx - user notes textarea
│       └── PageTotals.tsx - aggregated page statistics

Supporting Components:
├── DetectionBox.tsx - legacy rectangular detection component
├── DetectionCanvas.tsx - legacy canvas (pre-Konva)
├── MarkupToolbar.tsx - alternative toolbar variant
└── ToolClassSelector.tsx - tool + class combination selector
```

**Data Flow:**
```
useExtractionData(jobId)
    ↓
┌───────────────────────────────────────────────┐
│ Local State (detections Map<pageId, []>)      │
├───────────────────────────────────────────────┤
│ • updateDetectionLocally() - optimistic UI    │
│ • addDetectionLocally() - new detections      │
│ • removeDetectionLocally() - soft delete      │
│ • undo()/redo() - edit history                │
└───────────────────────────────────────────────┘
    ↓
useDetectionSync() → Supabase (on save/approve)
    ↓
Realtime subscription → UI updates
```

### 2.2 Project Form (`/components/project-form/`)

Multi-step wizard for creating new projects with database-driven configuration.

```
ProjectForm.tsx (wrapper - manages step state)
├── Step 1: ProjectInfoStep.tsx
│   ├── Project name input
│   ├── Customer name input
│   └── Address input
│
├── Step 2: TradeSelectionStep.tsx
│   └── Checkbox group for trades: siding, roofing, windows, gutters
│
├── Step 3: ProductConfigStep.tsx (MOST COMPLEX - 800+ lines)
│   ├── Dynamic Field Rendering
│   │   ├── Query trade_configurations table
│   │   ├── Sort by section_order, field_order
│   │   └── Render based on field_type
│   │
│   ├── Field Types
│   │   ├── select - dropdown (grouped by category)
│   │   ├── checkbox - toggle
│   │   ├── multiselect - multi-choice
│   │   └── number - numeric input
│   │
│   ├── Conditional Visibility (show_if_conditions)
│   │   ├── Simple equality: { field: value }
│   │   ├── Operators: equals, not_equals, contains
│   │   └── Product attributes: show_if_product_attributes
│   │
│   ├── Product Catalog Integration (load_from_catalog)
│   │   ├── Query product_catalog
│   │   ├── Apply catalog_filter
│   │   ├── Group by category
│   │   └── Deduplicate for roofing/windows
│   │
│   ├── Parent-Child Field Grouping (trim accessories)
│   │   ├── Pattern: {prefix}_include (parent checkbox)
│   │   └── Children: {prefix}_color, {prefix}_material
│   │
│   ├── Manufacturer Filtering (windows)
│   │   └── window_series dynamically filters by window_manufacturer
│   │
│   └── ColorSwatch Component
│       └── Visual color selection with hex codes
│
├── Step 4: HoverUploadStep.tsx
│   ├── react-dropzone for drag-and-drop
│   ├── PDF validation (type, 25MB limit)
│   ├── Supabase Storage upload
│   └── Progress tracking
│
├── Step 5: ReviewSubmitStep.tsx
│   ├── Summary display
│   ├── Markup percentage input
│   └── Submit to database + webhook
│
└── Variants:
    ├── ExtractionUploadStep.tsx - for extraction job uploads
    └── PDFUploadStep.tsx - older PDF upload variant
```

**Data Flow:**
```
Form State (parent component)
    ↓
┌─────────────────────────────────────┐
│ {                                   │
│   projectInfo: { name, customer, address },
│   selectedTrades: ['siding', ...],  │
│   configurations: {                 │
│     siding: { siding_color: '...', ...},
│     windows: { ... }                │
│   },                                │
│   hoverPdfUrl: '...'                │
│ }                                   │
└─────────────────────────────────────┘
    ↓
On Submit:
├── INSERT projects
├── INSERT project_configurations (per trade)
├── Upload PDF to Storage
└── Trigger n8n webhook
```

### 2.3 Estimate Editor (`/components/estimate-editor/`)

AG Grid-based spreadsheet for viewing and editing takeoff line items.

```
EstimateEditor (page component)
├── SectionTabs.tsx
│   ├── Tab per trade section (Siding, Trim, etc.)
│   └── Section totals in tab labels
│
├── EstimateGrid.tsx (per section)
│   ├── AG Grid Community integration
│   ├── Column Definitions:
│   │   ├── item_name (editable)
│   │   ├── description (editable)
│   │   ├── quantity (editable, triggers recalc)
│   │   ├── unit (dropdown)
│   │   ├── material_unit_cost (editable, triggers recalc)
│   │   ├── labor_unit_cost (editable, triggers recalc)
│   │   ├── material_extended (computed)
│   │   ├── labor_extended (computed)
│   │   └── line_total (computed)
│   │
│   ├── Row Styling:
│   │   ├── bg-blue-50 for isNew
│   │   └── bg-yellow-50 for isModified
│   │
│   └── Actions:
│       ├── Add row
│       ├── Delete selected rows
│       └── Batch save
│
├── EstimateSummary.tsx
│   ├── Total material cost
│   ├── Total labor cost
│   ├── Total equipment cost
│   ├── Markup calculation
│   └── Grand total
│
└── ProductSearchModal.tsx
    └── Search and select products from catalog
```

### 2.4 CAD Markup (`/components/cad-markup/`)

PDF markup and annotation system for construction drawings.

```
CADMarkupStep.tsx (main container)
├── PDF Rendering (pdfjs-dist)
│
├── CADViewer.tsx
│   └── PDF page display with markup overlay
│
├── MarkupToolbar.tsx
│   └── Drawing tools: polygon, line, point, classify
│
├── PageNavigation.tsx / PageThumbnails.tsx
│   └── Navigate between PDF pages
│
├── MarkupsList.tsx
│   └── List of all markups with properties
│
├── MarkupLegend.tsx
│   └── Color legend for markup types
│
├── CadDataPanel.tsx
│   └── Extracted CAD data display
│
├── ProjectGrid.tsx / ProjectSelector.tsx
│   └── Project management UI
│
├── SaveStatus.tsx / SyncStatus.tsx
│   └── Status indicators
│
└── EditCalloutDialog.tsx
    └── Edit material callout properties
```

### 2.5 Dashboard Components (`/components/dashboard/`)

```
DashboardOverview.tsx
├── StatCard components (project counts, revenue)
└── Recent projects list

ExtractionsTable.tsx
├── Active extraction jobs table
├── Job status badges
├── Progress indicators
└── Action buttons (View, Delete)
```

### 2.6 Projects Components (`/components/projects/`)

```
ProjectsTable.tsx
├── Full project listing with search/filter
├── Status badges (pending → won/lost)
├── Download Excel button
├── Delete project action
└── View details modal trigger

ProjectDetailDialog.tsx
└── Modal for full project details

ProjectCard.tsx
└── Card view variant for projects
```

### 2.7 UI Components (`/components/ui/`)

40+ shadcn/ui components (New York variant):

**Form Primitives:**
- input, textarea, checkbox, select, form, label

**Layout:**
- card, tabs, separator, dialog, sheet, popover

**Feedback:**
- alert, badge, progress, skeleton, toast (sonner)

**Data Display:**
- table, context-menu, dropdown-menu

**Custom Components:**
- color-swatch.tsx - visual color selection
- stat-card.tsx - dashboard statistics
- status-badge.tsx - project status
- stepper.tsx - multi-step form progress
- searchable-select.tsx - filterable dropdown
- empty-state.tsx - placeholder for empty lists

---

## 3. State Management

### 3.1 Global Context Providers

Located in `/lib/hooks/`:

#### UserProvider ([lib/hooks/useUser.tsx](lib/hooks/useUser.tsx))

Manages Supabase authentication state.

```typescript
interface UserContextType {
  user: User | null;              // Supabase User object
  profile: UserProfile | null;    // From user_profiles table
  isLoading: boolean;
  hasSession: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isDevBypass: boolean;           // Dev mode flag
}
```

**Features:**
- Supabase auth state listener
- Profile fetching from `user_profiles` table
- Dev bypass mode for localhost (`NEXT_PUBLIC_DEV_BYPASS_AUTH=true`)
- 5-second loading timeout fallback

#### OrganizationProvider ([lib/hooks/useOrganization.tsx](lib/hooks/useOrganization.tsx))

Manages multi-tenant organization context.

```typescript
interface OrganizationContextType {
  organization: Organization | null;
  membership: OrganizationMembership | null;
  organizations: OrganizationMembership[];
  isLoading: boolean;
  hasNoOrganizations: boolean;
  switchOrganization: (orgId: string) => void;
  refreshOrganization: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  timedOut: boolean;
  isDevBypass: boolean;
}
```

**Features:**
- Fetches `organization_memberships` with joined `organizations`
- Role-based permissions: owner, admin, estimator, viewer
- Persists current org in localStorage (`estimate_current_org`)
- 8-second loading timeout fallback
- Dev bypass with mock organization

### 3.2 Custom Hooks

#### useTakeoffData ([lib/hooks/useTakeoffData.ts](lib/hooks/useTakeoffData.ts))

Fetches takeoff data with Realtime subscriptions.

```typescript
const {
  takeoff,
  sections,
  lineItems,
  loading,
  error,
  refresh
} = useTakeoffData(projectId);
```

**Features:**
- Fetches takeoff + sections + line items in single call
- Realtime subscription to `takeoff_line_items` changes
- Auto-refresh on external updates

#### useExtractionData ([lib/hooks/useExtractionData.ts](lib/hooks/useExtractionData.ts))

Core hook for Detection Editor state management.

```typescript
const {
  // Data
  job, pages, currentPage, currentPageId,
  currentPageDetections, allCurrentPageDetections,
  detections, elevationCalcs, jobTotals,

  // State
  loading, error,

  // Computed
  reviewProgress,

  // Local-first editing
  hasUnsavedChanges, canUndo, canRedo, editingModeRef,

  // Actions
  setCurrentPageId, refresh,

  // Optimistic updates
  updateDetectionLocally,
  removeDetectionLocally,
  addDetectionLocally,

  // Undo/Redo
  undo, redo, resetToSaved, clearUnsavedChanges
} = useExtractionData(jobId, options);
```

**Features:**
- Local-first editing with undo/redo (50-item stack)
- Optimistic UI updates
- Auto-save drafts to localStorage every 30 seconds
- Realtime subscriptions (paused during editing mode)
- Recently-edited tracking to prevent realtime overwrites
- 10-second loading timeout

#### useDetectionSync ([lib/hooks/useDetectionSync.ts](lib/hooks/useDetectionSync.ts))

Syncs detection edits to database.

```typescript
const { syncDetection, syncBatch, isSyncing } = useDetectionSync(jobId, projectId);
```

#### useLineItemsSave ([lib/hooks/useLineItemsSave.ts](lib/hooks/useLineItemsSave.ts))

Batch saves line items with optimistic UI.

```typescript
const { saveLineItems, isSaving, error, lastSaved } = useLineItemsSave();
```

#### useAutoSave ([lib/hooks/useAutoSave.ts](lib/hooks/useAutoSave.ts))

Auto-saves data after debounce period.

```typescript
useAutoSave({ data, onSave, delay: 3000 });
```

#### useMaterialSearch ([lib/hooks/useMaterialSearch.ts](lib/hooks/useMaterialSearch.ts))

Searches product catalog for materials.

```typescript
const { results, search, isSearching } = useMaterialSearch();
```

### 3.3 Supabase Client Initialization

**Browser Client** ([lib/supabase/client.ts](lib/supabase/client.ts)):
```typescript
// Singleton pattern - same instance throughout app
import { createBrowserClient } from '@supabase/ssr';
export const createClient = () => createBrowserClient<Database>(...);
```

**Server Client** ([lib/supabase/server.ts](lib/supabase/server.ts)):
```typescript
// Used in Server Components and Route Handlers
import { createServerClient } from '@supabase/ssr';
export const createClient = async () => { /* with cookie handling */ };
```

### 3.4 Authentication Flow

```
1. User visits protected route
    ↓
2. middleware.ts intercepts request
    ↓
3. Supabase session checked/refreshed
    ↓
4. If no session → redirect to /login
    ↓
5. UserProvider fetches user + profile
    ↓
6. OrganizationProvider fetches orgs
    ↓
7. If no orgs → redirect to /onboarding
    ↓
8. Route rendered with context
```

---

## 4. API Integration Points

### 4.1 API Routes Overview

All API routes are in `/app/api/`:

| Endpoint | Method | File | Purpose | External Services | Database Tables |
|----------|--------|------|---------|-------------------|-----------------|
| `/api/extraction-jobs` | GET | [route.ts](app/api/extraction-jobs/route.ts) | List extraction jobs by project | None | `extraction_jobs` |
| `/api/extraction-jobs/[id]` | GET | [route.ts](app/api/extraction-jobs/[id]/route.ts) | Get single extraction job | None | `extraction_jobs` |
| `/api/extraction-pages` | GET | [route.ts](app/api/extraction-pages/route.ts) | Get pages for extraction job | None | `extraction_pages` |
| `/api/takeoffs/[id]` | GET, PUT | [route.ts](app/api/takeoffs/[id]/route.ts) | Get/update takeoff data | None | `takeoffs`, `takeoff_sections`, `takeoff_line_items` |
| `/api/extract-schedule` | POST, GET | [route.ts](app/api/extract-schedule/route.ts) | Extract window/door schedules | **Anthropic Claude Vision** | `extraction_pages` |
| `/api/analyze-schedule-structure` | POST | [route.ts](app/api/analyze-schedule-structure/route.ts) | Analyze schedule table structure | **Anthropic Claude Vision** | None |
| `/api/extract-floor-plan` | POST | [route.ts](app/api/extract-floor-plan/route.ts) | Analyze floor plan geometry | **Anthropic Claude Vision** | None |
| `/api/extract-roof-plan` | POST | [route.ts](app/api/extract-roof-plan/route.ts) | Analyze roof plans | **Anthropic Claude Vision** | None |
| `/api/extract-wall-assembly` | POST | [route.ts](app/api/extract-wall-assembly/route.ts) | Analyze wall assembly sections | **Anthropic Claude Vision** | None |
| `/api/extract-material-callouts` | POST | [route.ts](app/api/extract-material-callouts/route.ts) | Extract material specifications | **Anthropic Claude Vision** | None |
| `/api/extract-material-callouts-v2` | POST | [route.ts](app/api/extract-material-callouts-v2/route.ts) | Enhanced two-pass extraction | **Anthropic Claude Vision** | None |
| `/api/extract-notes-specs` | POST | [route.ts](app/api/extract-notes-specs/route.ts) | Extract general notes | **Anthropic Claude Vision** | None |
| `/api/generate-rfi` | POST | [route.ts](app/api/generate-rfi/route.ts) | Generate RFI list | **Anthropic Claude** | None |

### 4.2 Detailed API Descriptions

#### Schedule Extraction (`/api/extract-schedule`)

**Purpose:** Uses Claude Vision to extract window/door schedules from construction plan images.

**Request:**
```typescript
POST /api/extract-schedule
{
  pageId: string;
  imageUrl: string;
  jobId?: string;
  structure?: StructureAnalysisResult; // Optional from Pass 1
}
```

**Response:**
```typescript
{
  success: boolean;
  pageId: string;
  data?: ScheduleOCRData;
  used_targeted_prompt?: boolean;
}
```

**External Services:**
- Anthropic Claude Vision API (`claude-sonnet-4-20250514`)

**Database Updates:**
- `extraction_pages.ocr_data` - stores extracted schedule data
- `extraction_pages.ocr_status` - marks as 'complete'
- `extraction_jobs.results_summary` - updates aggregated counts

#### Takeoffs API (`/api/takeoffs/[id]`)

**GET:** Retrieves complete takeoff with sections and line items.

**PUT:** Updates takeoff totals and metadata.

**Database Tables:**
- `takeoffs`
- `takeoff_sections`
- `takeoff_line_items`

---

## 5. Key Data Types

All types are defined in `/lib/types/`:

### 5.1 Database Types ([lib/types/database.ts](lib/types/database.ts))

#### Project

```typescript
interface Project {
  id: string;
  name: string;
  client_name: string;
  address: string;
  selected_trades: Trade[];  // 'siding' | 'roofing' | 'windows' | 'gutters'
  status: ProjectStatus;
  hover_pdf_url: string | null;
  excel_url: string | null;
  markup_percent: number;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

type ProjectStatus =
  | 'pending' | 'extracted' | 'calculated' | 'priced'
  | 'approved' | 'sent_to_client' | 'won' | 'lost' | 'on_hold';
```

#### TradeConfiguration

```typescript
interface TradeConfiguration {
  id: string;
  trade: Trade;
  config_section: string;
  config_name: string;           // Unique identifier
  config_display_name: string;
  field_type: FieldType;         // 'select' | 'checkbox' | 'multiselect' | 'number'
  field_label: string;
  field_placeholder: string | null;
  field_help_text: string | null;
  field_options: Record<string, any> | null;  // Options for select fields
  default_value: string | null;
  is_required: boolean;
  validation_rules: Record<string, any> | null;
  show_if_conditions: Record<string, any> | null;      // Conditional visibility
  show_if_product_attributes: Record<string, any> | null;
  hide_if_conditions: Record<string, any> | null;
  triggers_auto_scope: boolean;
  auto_scope_rule_id: string | null;
  section_order: number;
  field_order: number;
  group_name: string | null;
  active: boolean;
  load_from_catalog: boolean;    // If true, load options from product_catalog
  catalog_filter: Record<string, any> | null;
}
```

#### ProductCatalog

```typescript
interface ProductCatalog {
  id: string;
  trade: Trade;
  manufacturer: string;
  product_line: string;
  product_name: string;
  sku: string;
  category: string;
  subcategory: string | null;
  tier: string | null;
  dimensions: Record<string, any> | null;
  coverage_specs: Record<string, any> | null;
  physical_properties: Record<string, any> | null;  // includes hex_code, is_colorplus
  material_cost: number | null;
  labor_cost: number | null;
  total_cost: number | null;
  unit: string;
  description: string | null;
  installation_notes: string | null;
  requires_special_handling: boolean;
  lead_time_days: number;
  available_colors: string[] | null;
  available_finishes: string[] | null;
  display_name: string | null;
  sort_order: number;
  is_featured: boolean;
  thumbnail_url: string | null;
  datasheet_url: string | null;
  active: boolean;
  discontinued: boolean;
  replacement_sku: string | null;
}
```

#### Takeoff Types

```typescript
interface Takeoff {
  id: string;
  project_id: string;
  status: TakeoffStatus;
  total_material: number;
  total_labor: number;
  total_equipment: number;
  grand_total: number;
  markup_percent: number;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

interface TakeoffSection {
  id: string;
  takeoff_id: string;
  name: string;          // Trade name
  display_name: string;
  sort_order: number;
  total_material: number;
  total_labor: number;
  total_equipment: number;
  section_total: number;
  notes: string | null;
}

interface TakeoffLineItem {
  id: string;
  takeoff_id: string;
  section_id: string;
  item_number: number;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: Unit;  // 'EA' | 'PC' | 'SQ' | 'LF' | 'SF' | 'RL' | 'BX' | 'BDL' | 'GAL'
  material_unit_cost: number;
  labor_unit_cost: number;
  equipment_unit_cost: number;
  material_extended: number;   // quantity × material_unit_cost
  labor_extended: number;
  equipment_extended: number;
  line_total: number;
}

// UI extension
interface LineItemWithState extends TakeoffLineItem {
  isNew: boolean;
  isModified: boolean;
}
```

### 5.2 Extraction Types ([lib/types/extraction.ts](lib/types/extraction.ts))

#### ExtractionJob

```typescript
interface ExtractionJob {
  id: string;
  project_id: string | null;
  project_name: string | null;
  status: JobStatus;
  source_pdf_url: string | null;
  total_pages: number;
  elevation_count: number;
  created_at: string;
  completed_at: string | null;
  default_scale_ratio: number | null;
  plan_dpi: number | null;
  results_summary?: {
    total_pages_analyzed?: number;
    page_type_counts?: Record<string, number>;
    element_totals?: { windows, doors, garages, gables, ... };
    aggregation?: ExtractionJobTotals['aggregated_data'];
  };
}

type JobStatus = 'converting' | 'classifying' | 'classified' | 'processing' | 'complete' | 'approved' | 'failed';
```

#### ExtractionPage

```typescript
interface ExtractionPage {
  id: string;
  job_id: string;
  page_number: number;
  image_url: string;
  thumbnail_url: string | null;
  page_type: PageType | null;
  page_type_confidence: number | null;
  elevation_name: ElevationName | null;
  status: string;
  scale_ratio: number | null;
  dpi: number | null;
  original_image_url: string | null;
  original_width: number | null;
  original_height: number | null;
}

type PageType = 'elevation' | 'floor_plan' | 'schedule' | 'cover' | 'detail' | 'section' | 'site_plan' | 'other';
type ElevationName = 'front' | 'rear' | 'left' | 'right';
```

#### ExtractionDetection

```typescript
interface ExtractionDetection {
  id: string;
  job_id: string;
  page_id: string;
  class: DetectionClass;
  detection_index: number;
  confidence: number;

  // Pixel coordinates (from ML model)
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;

  // Real-world measurements
  real_width_in: number | null;
  real_height_in: number | null;
  real_width_ft: number | null;
  real_height_ft: number | null;
  area_sf: number | null;
  perimeter_lf: number | null;

  // Status
  status: DetectionStatus;  // 'auto' | 'verified' | 'edited' | 'deleted'
  is_triangle: boolean;

  // Polygon support
  polygon_points?: PolygonPoints | null;
  has_hole?: boolean;
  markup_type?: MarkupType;  // 'polygon' | 'line' | 'point'
  marker_label?: string | null;

  // Product assignment
  assigned_material_id?: string | null;
  material_cost_override?: number | null;
  labor_cost_override?: number | null;
  notes?: string | null;
  color_override?: string | null;
}

type DetectionClass =
  | 'window' | 'door' | 'garage' | 'siding' | 'roof' | 'gable'
  | 'trim' | 'fascia' | 'gutter' | 'eave' | 'rake' | 'ridge' | 'soffit' | 'valley'
  | 'vent' | 'flashing' | 'downspout' | 'outlet' | 'hose_bib' | 'light_fixture'
  | 'corbel' | 'gable_vent' | 'belly_band' | 'corner_inside' | 'corner_outside'
  | 'shutter' | 'post' | 'column' | 'bracket' | '';
```

#### ScheduleOCRData

```typescript
interface ScheduleOCRData {
  windows: ScheduleWindow[];
  doors: ScheduleDoor[];
  skylights: ScheduleSkylight[];
  garages: ScheduleGarage[];
  totals: { windows: number; doors: number; skylights: number; garages: number };
  confidence: number;
  extraction_notes?: string;
  is_schedule_page: boolean;
  extracted_at: string;
  model_used?: string;
  tokens_used?: number;
}

interface ScheduleWindow {
  mark: string;
  size: string;
  quantity: number;
  type: string;
  notes?: string;
}
```

---

## 6. Supabase Integration

### 6.1 Query Patterns

#### Direct Client Queries (most common)

```typescript
// Browser component
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();
const { data, error } = await supabase
  .from('trade_configurations')
  .select('*')
  .eq('trade', selectedTrade)
  .order('section_order');
```

#### Server Component Queries

```typescript
// Server component or Route Handler
import { createClient } from '@/lib/supabase/server';

const supabase = await createClient();
const { data } = await supabase.from('projects').select('*');
```

#### Direct REST API (extractionQueries.ts)

```typescript
// Bypasses Supabase client for specific performance needs
async function directFetch<T>(endpoint: string): Promise<T | null> {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  return response.json();
}
```

### 6.2 Supabase Query Functions

Located in `/lib/supabase/`:

| File | Functions | Purpose |
|------|-----------|---------|
| [takeoffs.ts](lib/supabase/takeoffs.ts) | `getTakeoffByProjectId()`, `createLineItem()`, `updateLineItem()` | Takeoff CRUD |
| [products.ts](lib/supabase/products.ts) | `getProductsByTrade()`, `getGroupedProducts()` | Product catalog queries |
| [extractionQueries.ts](lib/supabase/extractionQueries.ts) | `getFullExtractionContext()`, `getExtractionJob()`, `getExtractionPages()` | Extraction data queries |
| [cadMarkups.ts](lib/supabase/cadMarkups.ts) | `saveMarkups()`, `loadMarkups()` | CAD markup persistence |
| [bluebeamProjects.ts](lib/supabase/bluebeamProjects.ts) | `updateProject()` | Bluebeam project sync |
| [pdfStorage.ts](lib/supabase/pdfStorage.ts) | `uploadProjectPdf()`, `downloadProjectPdf()` | PDF storage operations |

### 6.3 Realtime Subscriptions

```typescript
// Subscribe to detection changes (useExtractionData.ts)
const unsubscribe = subscribeToPageDetections(
  currentPageId,
  {
    onInsert: (detection) => { /* add to local state */ },
    onUpdate: (detection) => { /* update local state */ },
    onDelete: (detection) => { /* remove from local state */ },
  },
  { editingModeRef }  // Skip updates during editing
);

// Subscribe to job totals
const unsubscribe = subscribeToJobTotals(jobId, (totals) => {
  setJobTotals(totals);
});
```

**Subscribed Tables:**
- `extraction_detections` - Detection changes on current page
- `extraction_job_totals` - Aggregate totals updates
- `takeoff_line_items` - Line item changes for multi-user editing

### 6.4 Authentication Handling

**Middleware** ([middleware.ts](middleware.ts)):
```typescript
// Updates Supabase session on every request
export async function middleware(request: NextRequest) {
  const supabase = createServerClient(...);
  await supabase.auth.getUser();
  // Session automatically refreshed via cookies
}
```

**OAuth Callback** ([app/auth/callback/route.ts](app/auth/callback/route.ts)):
```typescript
// Exchanges OAuth code for session
export async function GET(request: NextRequest) {
  const code = searchParams.get('code');
  await supabase.auth.exchangeCodeForSession(code);
  return redirect(next);
}
```

---

## 7. Critical UI Flows

### 7.1 Creating a New Project

```
User clicks "New Project" tab on /project
    ↓
┌─────────────────────────────────────────┐
│ Step 1: ProjectInfoStep                 │
│ - Enter project name                    │
│ - Enter customer name                   │
│ - Enter address                         │
└─────────────────────────────────────────┘
    ↓ Next
┌─────────────────────────────────────────┐
│ Step 2: TradeSelectionStep              │
│ - Check trades: siding, roofing,        │
│   windows, gutters                      │
└─────────────────────────────────────────┘
    ↓ Next
┌─────────────────────────────────────────┐
│ Step 3: ProductConfigStep               │
│ - Query trade_configurations table      │
│ - Render dynamic fields per trade       │
│ - Handle conditional visibility         │
│ - Load products from product_catalog    │
└─────────────────────────────────────────┘
    ↓ Next
┌─────────────────────────────────────────┐
│ Step 4: HoverUploadStep                 │
│ - Drag-drop PDF file                    │
│ - Validate: PDF only, <25MB             │
│ - Upload to Supabase Storage            │
│   (bucket: hover-pdfs)                  │
│ - Store public URL                      │
└─────────────────────────────────────────┘
    ↓ Next
┌─────────────────────────────────────────┐
│ Step 5: ReviewSubmitStep                │
│ - Display all entered data              │
│ - Set markup percentage (default 15%)  │
│ - Click Submit                          │
└─────────────────────────────────────────┘
    ↓ Submit
┌─────────────────────────────────────────┐
│ Database Operations:                    │
│ 1. INSERT into projects table           │
│ 2. INSERT into project_configurations   │
│    (one row per trade)                  │
│ 3. Trigger n8n webhook for processing   │
└─────────────────────────────────────────┘
    ↓
Redirect to /projects/[id] or /project
```

### 7.2 Uploading and Processing a HOVER PDF

```
PDF Upload (Step 4 of form)
    ↓
┌─────────────────────────────────────────┐
│ Client-Side Validation                  │
│ - File type: application/pdf            │
│ - File size: < 25MB                     │
└─────────────────────────────────────────┘
    ↓ Valid
┌─────────────────────────────────────────┐
│ Supabase Storage Upload                 │
│ - Bucket: hover-pdfs                    │
│ - Path: {projectId}/{timestamp}_{name}  │
│ - Get public URL                        │
└─────────────────────────────────────────┘
    ↓ On Submit
┌─────────────────────────────────────────┐
│ n8n Webhook Triggered                   │
│ POST to NEXT_PUBLIC_N8N_WEBHOOK_URL     │
│ Body: { project_id }                    │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ n8n Processing Pipeline                 │
│ 1. Convert PDF to images                │
│ 2. Create extraction_job record         │
│ 3. Create extraction_pages records      │
│ 4. Run page classification              │
│ 5. Run ML detection on elevations       │
│ 6. Extract schedules (Claude Vision)    │
│ 7. Aggregate results                    │
└─────────────────────────────────────────┘
    ↓
Project status: pending → extracted
User redirected to Detection Editor
```

### 7.3 Using the Detection Editor

```
Navigate to /projects/[id]/extraction/[jobId]
    ↓
┌─────────────────────────────────────────┐
│ Data Loading                            │
│ useExtractionData(jobId) fetches:       │
│ - Extraction job details                │
│ - All pages with thumbnails             │
│ - All detections by page                │
│ - Elevation calculations                │
│ - Job totals                            │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Detection Editor Layout                                     │
│                                                             │
│ ┌──────────┬────────────────────────────┬──────────────┐   │
│ │ Sidebar  │ Canvas (KonvaDetectionCanvas) │ Properties │   │
│ │          │                                │ Panel      │   │
│ │ - Pages  │ ┌────────────────────────┐    │            │   │
│ │ - Filter │ │ Page Image             │    │ - Class    │   │
│ │          │ │                        │    │ - Material │   │
│ │          │ │   [Detection shapes]   │    │ - Price    │   │
│ │          │ │                        │    │ - Notes    │   │
│ │          │ └────────────────────────┘    │            │   │
│ └──────────┴────────────────────────────┴──────────────┘   │
│                                                             │
│ [Toolbar: Select | Create | Pan | Verify | Calibrate | ...]│
└─────────────────────────────────────────────────────────────┘
    ↓
User Interactions:
    ↓
┌─────────────────────────────────────────┐
│ Select Tool                             │
│ - Click to select detection             │
│ - Drag to move                          │
│ - Drag handles to resize                │
│ - Right-click for context menu          │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Create Tool                             │
│ - Click points to draw polygon          │
│ - Double-click to close shape           │
│ - Assign class from Properties Panel    │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Verify Tool                             │
│ - Click detection to mark as verified   │
│ - Status changes: auto → verified       │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Edit Detection Properties               │
│ - Change class (dropdown)               │
│ - Assign material (search modal)        │
│ - Override price                        │
│ - Add notes                             │
│ - Delete (soft delete)                  │
└─────────────────────────────────────────┘
    ↓
All edits are LOCAL-FIRST:
- updateDetectionLocally()
- Undo/redo supported (50 items)
- Auto-save to localStorage every 30s
    ↓
Click "Save" or "Approve":
- useDetectionSync() syncs to database
- Realtime subscription disabled during edit
- On success: clearUnsavedChanges()
```

### 7.4 Generating a Takeoff

```
From Detection Editor, click "Approve"
    ↓
┌─────────────────────────────────────────┐
│ Collect Approval Payload                │
│ {                                       │
│   jobId, projectId,                     │
│   measurements: {                       │
│     total_net_siding_sf,                │
│     window_count, door_count,           │
│     trim_lf, ...                        │
│   },                                    │
│   detections: getAllDetections()        │
│ }                                       │
└─────────────────────────────────────────┘
    ↓
POST to n8n approval webhook
    ↓
┌─────────────────────────────────────────┐
│ n8n Takeoff Generation                  │
│ 1. Calculate quantities from detections │
│ 2. Apply pricing from pricing_items     │
│ 3. CREATE takeoff record                │
│ 4. CREATE takeoff_sections              │
│ 5. CREATE takeoff_line_items            │
│ 6. Return ApprovalResult                │
└─────────────────────────────────────────┘
    ↓
extraction_job.status → 'approved'
project.status → 'priced'
    ↓
Redirect to /projects/[id] (Estimate Editor)
    ↓
┌─────────────────────────────────────────┐
│ Estimate Editor                         │
│ - View/edit line items in AG Grid       │
│ - Real-time cost calculations           │
│ - Export to Excel                       │
│ - Send to client                        │
└─────────────────────────────────────────┘
```

### 7.5 Configuring Trade Options (Siding Example)

```
ProductConfigStep for "siding" trade
    ↓
┌─────────────────────────────────────────┐
│ Query trade_configurations              │
│ SELECT * FROM trade_configurations      │
│ WHERE trade = 'siding'                  │
│ ORDER BY section_order, field_order     │
└─────────────────────────────────────────┘
    ↓
Returns ~17 fields for siding:
    ↓
┌─────────────────────────────────────────┐
│ Field: siding_product_type              │
│ - field_type: select                    │
│ - load_from_catalog: true               │
│ - catalog_filter: { category: '...' }   │
│                                         │
│ → Query product_catalog                 │
│ → Group by category                     │
│ → Render grouped dropdown               │
└─────────────────────────────────────────┘
    ↓ User selects "HardiePlank"
┌─────────────────────────────────────────┐
│ Field: colorplus_color                  │
│ - show_if_conditions evaluated          │
│ - check: product.physical_properties    │
│          .is_colorplus === true         │
│                                         │
│ IF true:                                │
│ → Show ColorSwatch component            │
│ → 25 official James Hardie colors       │
│ → Each with hex code for preview        │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Section: Trim Accessories               │
│ Parent-child field grouping             │
│                                         │
│ □ Include Belly Band                    │
│   └─ IF checked:                        │
│      ├─ Belly Band Color: [dropdown]    │
│      └─ Belly Band Material: [dropdown] │
│                                         │
│ □ Include Corner Trim                   │
│   └─ IF checked:                        │
│      ├─ Corner Product: [dropdown]      │
│      └─ Corner Color: [dropdown]        │
└─────────────────────────────────────────┘
    ↓
All values stored in:
configurations.siding = {
  siding_product_type: 'hardieplank-...',
  colorplus_color: 'arctic-white',
  belly_band_include: true,
  belly_band_color: 'arctic-white',
  ...
}
```

---

## Appendix: File Path Reference

### Core Application Files

| Category | Files |
|----------|-------|
| **App Entry** | [app/layout.tsx](app/layout.tsx), [app/page.tsx](app/page.tsx) |
| **Auth** | [app/login/page.tsx](app/login/page.tsx), [app/signup/page.tsx](app/signup/page.tsx), [middleware.ts](middleware.ts) |
| **Project Dashboard** | [app/project/page.tsx](app/project/page.tsx), [app/project/layout.tsx](app/project/layout.tsx) |
| **Estimate Editor** | [app/projects/[id]/page.tsx](app/projects/[id]/page.tsx) |
| **Detection Editor** | [app/projects/[id]/extraction/[jobId]/page.tsx](app/projects/[id]/extraction/[jobId]/page.tsx) |

### Component Files

| Component Area | Key Files |
|----------------|-----------|
| **Detection Editor** | [components/detection-editor/DetectionEditor.tsx](components/detection-editor/DetectionEditor.tsx), [KonvaDetectionCanvas.tsx](components/detection-editor/KonvaDetectionCanvas.tsx), [KonvaDetectionPolygon.tsx](components/detection-editor/KonvaDetectionPolygon.tsx), [PropertiesPanel/](components/detection-editor/PropertiesPanel/) |
| **Project Form** | [components/project-form/ProductConfigStep.tsx](components/project-form/ProductConfigStep.tsx), [HoverUploadStep.tsx](components/project-form/HoverUploadStep.tsx), [ReviewSubmitStep.tsx](components/project-form/ReviewSubmitStep.tsx) |
| **Estimate Editor** | [components/estimate-editor/EstimateGrid.tsx](components/estimate-editor/EstimateGrid.tsx), [SectionTabs.tsx](components/estimate-editor/SectionTabs.tsx), [EstimateSummary.tsx](components/estimate-editor/EstimateSummary.tsx) |

### Library Files

| Category | Key Files |
|----------|-----------|
| **Hooks** | [lib/hooks/useUser.tsx](lib/hooks/useUser.tsx), [useOrganization.tsx](lib/hooks/useOrganization.tsx), [useExtractionData.ts](lib/hooks/useExtractionData.ts), [useDetectionSync.ts](lib/hooks/useDetectionSync.ts) |
| **Supabase** | [lib/supabase/client.ts](lib/supabase/client.ts), [server.ts](lib/supabase/server.ts), [extractionQueries.ts](lib/supabase/extractionQueries.ts), [takeoffs.ts](lib/supabase/takeoffs.ts) |
| **Types** | [lib/types/database.ts](lib/types/database.ts), [extraction.ts](lib/types/extraction.ts) |

### API Routes

| Endpoint | File |
|----------|------|
| Extraction Jobs | [app/api/extraction-jobs/route.ts](app/api/extraction-jobs/route.ts) |
| Schedule Extraction | [app/api/extract-schedule/route.ts](app/api/extract-schedule/route.ts) |
| Takeoffs | [app/api/takeoffs/[id]/route.ts](app/api/takeoffs/[id]/route.ts) |
| Floor Plan | [app/api/extract-floor-plan/route.ts](app/api/extract-floor-plan/route.ts) |
| Material Callouts | [app/api/extract-material-callouts-v2/route.ts](app/api/extract-material-callouts-v2/route.ts) |

---

*This document should be updated when significant architectural changes are made to the frontend.*
