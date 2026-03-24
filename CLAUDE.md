# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

**AI Estimator** is a construction takeoff platform that extracts measurements from architectural PDFs and generates professional estimates. Built with Next.js 16, React 19, TypeScript, and Supabase.

**Core Workflow:**
1. Upload construction PDF (architectural plans)
2. AI extracts detections (walls, windows, doors, materials)
3. Review/edit detections in Konva.js canvas editor
4. Generate takeoff with materials, labor, and paint costs
5. Export professional Excel estimate

**Business Context:** Exterior Finishes - James Hardie siding installations ($20-25k projects). Goal: Reduce estimation from 45 min to 5 min.

## Quick Start

```bash
npm install
# Create .env.local (see Environment Setup)
npm run dev  # http://localhost:3000
```

**Common Tasks:**
- Add shadcn component: `npx shadcn@latest add [component]`
- Update DB types: `npx supabase gen types typescript --project-id ID > lib/types/database.ts`
- Type check: `npx tsc --noEmit`

## Architecture Principles

### 1. DATABASE-DRIVEN ARCHITECTURE (Critical!)

**Never hardcode field definitions, products, or business logic.**

```typescript
// WRONG
const fields = [{ name: 'siding_color', label: 'Siding Color' }];

// RIGHT
const { data: fields } = await supabase
  .from('trade_configurations')
  .select('*')
  .eq('trade', 'siding');
```

### 2. ASYNC PROCESSING

Long operations (PDF extraction, Excel generation) use async pattern:
1. Save to DB → Trigger n8n webhook (instant response)
2. Background processing via n8n
3. Update DB status → Realtime notifies frontend

### 3. FULL PROVENANCE TRACKING

Every line item traces back to source measurement via `source_measurement` JSONB field.

## Application Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/login`, `/signup` | Authentication |
| `/onboarding` | New user onboarding |
| `/account` | User account settings |
| `/project` | Project dashboard (create new / view past) |
| `/project/new` | Multi-step project creation form |
| `/projects/[id]` | Estimate editor (AG Grid) |
| `/projects/[id]/extraction/[jobId]` | **Detection Editor** - Review/edit AI detections |
| `/takeoffs/[id]` | **Takeoff Viewer** - Materials, labor, paint tables |
| `/dashboard/extractions/[jobId]/classify` | Classification dashboard |

## Core Features

### Detection Editor (`/projects/[id]/extraction/[jobId]`)
- Konva.js canvas for viewing PDF pages with overlaid detections
- Shape types: rectangles, polygons, lines, points
- Confidence filtering (show/hide low-confidence detections)
- Manual editing: draw, resize, delete, reclassify
- SAM (Segment Anything Model) integration for auto-segmentation
- Claude AI assistant panel for plan interpretation
- Bluebeam PDF import
- Calibration modal for real-world measurements

### Takeoff Viewer (`/takeoffs/[id]`)
- Materials table with quantities and costs
- Labor table with scope rules
- **Paint table** (separate paint items tracking)
- Overhead costs
- Cost summary with margins
- Plan Intelligence AI panel
- RFI email generation
- Professional Excel export

### Multi-Step Project Form (`/project/new`)
1. **ProjectInfoStep** - Name, customer, address
2. **TradeSelectionStep** - Select trades (siding, roofing, windows, gutters)
3. **ProductConfigStep** - Dynamic product configuration from DB
4. **HoverUploadStep** / **PDFUploadStep** - Upload PDF to Supabase Storage
5. **ReviewSubmitStep** - Review and submit

## Project Structure

```
/app
  /api                          # API routes (18+ endpoints)
    /extraction-jobs/           # Create/manage extraction jobs
    /extraction-pages/          # Manage extraction pages
    /claude-detect/             # Claude API detection
    /detect-region/             # Region detection
    /sam-segment/               # SAM segmentation
    /extract-floor-plan/        # Floor plan extraction
    /extract-roof-plan/         # Roof plan extraction
    /extract-wall-assembly/     # Wall assembly extraction
    /extract-schedule/          # Schedule extraction
    /extract-material-callouts/ # Material callout extraction
    /extract-notes-specs/       # Notes/specs extraction
    /generate-rfi/              # RFI email generation
    /redetect-page/             # Re-run detection
    /takeoffs/[id]/             # Takeoff data API
    /debug-takeoff/[id]/        # Debug endpoint
    /n8n/[...path]/             # n8n webhook proxy
  /login, /signup, /onboarding  # Auth routes
  /account                      # Account settings
  /project                      # Project dashboard
  /projects/[id]                # Estimate editor
    /extraction/[jobId]         # Detection editor
  /takeoffs/[id]                # Takeoff viewer
    /components/                # Takeoff-specific components
      MaterialsTable.tsx
      LaborTable.tsx
      PaintTable.tsx
      OverheadTable.tsx
      CostSummaryCard.tsx
      TakeoffHeader.tsx
      PlanIntelligence.tsx
      RFIEmailModal.tsx

/components
  /ui                           # shadcn/ui components (don't edit manually)
  /project-form                 # Multi-step form components
    ProjectForm.tsx
    ProjectInfoStep.tsx
    TradeSelectionStep.tsx
    ProductConfigStep.tsx
    HoverUploadStep.tsx
    PDFUploadStep.tsx
    ReviewSubmitStep.tsx
  /projects                     # Project management
    ProjectsTable.tsx
    ProjectDetailDialog.tsx
    ProjectCard.tsx
  /estimate-editor              # AG Grid estimate editing
    EstimateGrid.tsx
    SectionTabs.tsx
    EstimateSummary.tsx
  /detection-editor             # Konva.js detection editing (20+ components)
    DetectionEditor.tsx         # Main editor component
    KonvaDetectionCanvas.tsx    # Konva canvas wrapper
    KonvaDetectionRect.tsx      # Rectangle detection shape
    KonvaDetectionPolygon.tsx   # Polygon detection shape
    KonvaDetectionLine.tsx      # Line detection shape
    KonvaDetectionPoint.tsx     # Point detection shape
    DetectionBox.tsx            # Detection bounding box
    DetectionToolbar.tsx        # Tools toolbar
    DetectionSidebar.tsx        # Detection list sidebar
    DetectionContextMenu.tsx    # Right-click menu
    ConfidenceFilter.tsx        # Confidence slider filter
    CalibrationModal.tsx        # Calibration for measurements
    BluebeamImportModal.tsx     # Bluebeam PDF import
    SAMSelectOverlay.tsx        # SAM selection overlay
    SAMClassPicker.tsx          # SAM class picker
    ClaudeAssistantPanel.tsx    # Claude AI chat
    PlanReaderChatbot.tsx       # Plan interpretation bot
    ToolClassSelector.tsx       # Tool/class selector
    /PropertiesPanel/           # Properties editing (8 components)
  /cad-markup                   # CAD file markup (22+ components)
  /dashboard                    # Dashboard components
  /layout                       # Layout components (UserMenu)
  /settings                     # Settings components

/lib
  /supabase
    client.ts                   # Browser client
    server.ts                   # Server client
    middleware.ts               # Auth middleware
    takeoffs.ts                 # Takeoff queries
    extractionQueries.ts        # Extraction job queries (23KB)
    cadExtractions.ts           # CAD extraction queries
    cadMarkups.ts               # CAD markup queries
    cadCategories.ts            # CAD category queries
    bluebeamProjects.ts         # Bluebeam integration
    pdfStorage.ts               # PDF storage operations
    products.ts                 # Product catalog queries
  /hooks                        # Custom React hooks (13 hooks)
    index.ts                    # Exports
    useTakeoffData.ts           # Fetch takeoff with Realtime
    useLineItemsSave.ts         # Save line items
    useAutoSave.ts              # Auto-save with debounce
    useExtractionData.ts        # Fetch extraction/job data
    useDetectionSync.ts         # Sync detection changes
    useConfidenceFilter.ts      # Filter by confidence
    useClaudeAssistant.ts       # Claude AI chat
    useRegionDetect.ts          # Region detection
    useSAMSegment.ts            # SAM segmentation
    useMaterialSearch.ts        # Material search
    usePdfRenderer.ts           # PDF.js rendering
    useResizable.ts             # Resizable panels
  /utils
    excelExport.ts              # Basic Excel export
    excelExportProfessional.ts  # Professional Excel
    exportTakeoffExcel.ts       # Full takeoff export (61KB, includes paint)
    itemHelpers.ts              # Line item calculations
    coordinates.ts              # Real-world coordinate transforms
    polygonUtils.ts             # Polygon operations (22KB)
    markupRenderer.ts           # Render markup images
    pageTypeMapping.ts          # Detect PDF page types
    planReaderActions.ts        # AI plan reading
    documentGenerators.ts       # Document generation
  /types
    database.ts                 # Supabase schema types
    extraction.ts               # Extraction system types (30+ types)
    organization.ts             # Organization types
  /api
    extractionApi.ts            # Extraction API helpers
  /validation
    project-form.ts             # Zod validation schemas

/migrations                     # SQL migrations (40+ files)
/docs                           # API documentation
/patterns                       # Design patterns
/scripts                        # Utility scripts
```

## Database Schema

### Core Tables
- **projects** - Project metadata, status, PDF URLs
- **trade_configurations** - Dynamic form field definitions
- **product_catalog** - Products with categories, pricing, physical properties
- **project_configurations** - Saved form data (JSONB)

### Takeoff Tables
- **takeoffs** - Estimate totals linked to projects
- **takeoff_sections** - Section groupings (Siding, Trim, etc.)
- **takeoff_line_items** - Individual line items with costs and provenance

### Extraction Tables (New)
- **extraction_jobs** - PDF extraction job tracking
- **extraction_pages** - Individual pages from PDFs
- **extraction_detections** - AI-detected elements with coordinates

### CAD Tables
- **cad_extractions** - CAD file extractions
- **cad_markups** - CAD markup annotations
- **cad_categories** - CAD element categorization

### Organization Tables
- Multi-tenant support with organization-scoped data

## Custom Hooks

| Hook | Purpose |
|------|---------|
| `useTakeoffData` | Fetch takeoff with Realtime subscriptions |
| `useLineItemsSave` | Batch save line items |
| `useAutoSave` | Auto-save with debounce |
| `useExtractionData` | Fetch extraction job data with Realtime |
| `useDetectionSync` | Sync detection changes to database |
| `useConfidenceFilter` | Filter detections by confidence score |
| `useClaudeAssistant` | Claude AI chat integration |
| `useRegionDetect` | Region detection from images |
| `useSAMSegment` | SAM (Segment Anything) segmentation |
| `useMaterialSearch` | Material product search |
| `usePdfRenderer` | PDF.js rendering with zoom/pan |
| `useResizable` | Resizable panel management |

## Technology Stack

**Core:**
- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4

**UI:**
- shadcn/ui (New York variant)
- Radix UI primitives
- lucide-react icons
- AG Grid Community (spreadsheet)
- Konva.js + react-konva (canvas)
- sonner (toasts)

**Backend:**
- Supabase (PostgreSQL, Auth, Realtime, Storage)
- Anthropic Claude API
- n8n webhooks

**PDF/Image:**
- pdfjs-dist (PDF rendering)
- pdf-lib (PDF manipulation)
- polygon-clipping (geometry)

**Data:**
- ExcelJS (Excel export)
- react-hook-form + Zod
- date-fns

## Environment Variables

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Claude API (Required for AI features)
ANTHROPIC_API_KEY=your-key

# n8n Webhook (Optional)
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://your-n8n.com/webhook/process
```

## Key Patterns

### Detection Coordinates
Detections use normalized coordinates (0-1) for page-independent positioning:
```typescript
// Convert normalized to pixel coordinates
const pixelX = normalized.x * pageWidth;
const pixelY = normalized.y * pageHeight;
```

### Polygon Operations
Use `polygonUtils.ts` for area calculations, clipping, and boolean operations:
```typescript
import { calculatePolygonArea, clipPolygon } from '@/lib/utils/polygonUtils';
```

### Realtime Subscriptions
```typescript
supabase
  .channel('detections')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'extraction_detections',
    filter: `page_id=eq.${pageId}`
  }, handleUpdate)
  .subscribe();
```

### Excel Export
Use `exportTakeoffExcel.ts` for full exports (includes materials, labor, paint):
```typescript
import { exportTakeoffToExcel } from '@/lib/utils/exportTakeoffExcel';
await exportTakeoffToExcel({ takeoff, sections, lineItems, projectInfo });
```

## Important Notes

- **React 19 & Next.js 16**: Latest stable versions
- **Tailwind v4**: Uses `@theme` in CSS, not tailwind.config.js
- **AG Grid Community**: Free version only - never import from `ag-grid-enterprise`
- **Konva.js**: Register before use, import CSS
- **shadcn/ui**: Don't manually edit `/components/ui` - use CLI
- **Database-first**: Always query schema, never hardcode options
- **PDF.js**: Worker must be configured for PDF rendering

## Development Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # ESLint
npm start        # Production server
npx tsc --noEmit # Type check
```

## EstimatePros Skills

Custom workflow skills for the EstimatePros.ai estimation platform. Located in `.claude/skills/`.

### Available Skills

| Skill | Role | When to Use |
|-------|------|-------------|
| `/scope-review` | Product strategist | Before starting any new feature |
| `/arch-review` | Senior engineer | Before implementing any code change |
| `/rule-add` | Database specialist | When adding auto-scope rules |
| `/material-onboard` | Onboarding lead | When adding new products/manufacturers |
| `/calc-engine` | Calculation engineer | When modifying formulas or pricing logic |
| `/takeoff-validate` | QA engineer | After any change to verify MN568 output |
| `/pre-deploy` | Release engineer | Before every git push to main |
| `/retro` | Team memory | After fixing bugs or completing features |

### Skill Descriptions

- **`/scope-review`** — Product-level planning review. Evaluates if a feature is the RIGHT thing to build. Checks MN568 impact, scope creep, and strategic priorities.

- **`/arch-review`** — Engineering architecture review. Reviews proposed changes against known failure patterns: toggle ordering bugs, JSONB boolean mismatches, presentation_group filtering, manufacturer path splits, n8n template literal escaping.

- **`/rule-add`** — Structured auto-scope rule insertion. Prevents common failures: wrong presentation_group, missing manufacturer_filter syntax, serial PK collisions, trigger_condition JSONB errors.

- **`/material-onboard`** — Complete 10-phase manufacturer/product onboarding workflow. Covers pricing_items, auto-scope rules, labor configuration, calculation formulas, overhead costs, UI integration, verification, and testing.

- **`/calc-engine`** — Safe calculation engine modification workflow. For changes to autoscope-v2.ts, orchestrator-v2.ts, pricing service, or formula evaluation. Records before/after MN568 totals.

- **`/takeoff-validate`** — MN568 regression testing. Diffs current output against baseline totals by category. Catches regressions before they reach contractors.

- **`/pre-deploy`** — Railway production deployment guard. Reviews diff, checks for known failure patterns, verifies database compatibility, API contracts, and env vars. No staging — every push to main auto-deploys.

- **`/retro`** — Engineering retrospective. Captures lessons from debugging sessions and encodes them into appropriate skill checklists so the same bug never happens twice.

### Standard Development Workflow

```
1. /scope-review     — Is this the right thing to build?
2. /arch-review      — Will this implementation work safely?
3. Build the feature — Use /rule-add, /material-onboard, /calc-engine as needed
4. /takeoff-validate — Did this break anything?
5. /pre-deploy       — Is this safe to ship?
6. git push main     — Deploy to production
7. /retro            — What did we learn?
```

### Self-Improving System

The `/retro` skill is key: after every bug fix, it documents what happened and identifies which skill should encode the lesson. The lesson gets added as a checklist item to that skill, preventing the same bug from recurring.
