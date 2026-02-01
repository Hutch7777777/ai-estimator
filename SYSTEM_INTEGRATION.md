# System Integration Map

This document provides a comprehensive map of how all components in the AI Estimator system connect and communicate.

---

## Table of Contents

1. [System Architecture Diagram](#1-system-architecture-diagram)
2. [Component Connection Matrix](#2-component-connection-matrix)
3. [Data Flow Maps](#3-data-flow-maps)
   - A. Create New Project
   - B. PDF Upload & Processing
   - C. Extraction Pipeline
   - D. Detection Editor Workflow
   - E. Takeoff Generation
   - F. Estimate Editing & Export
   - G. Trade Configuration Display (CRITICAL)
4. [API Contract Reference](#4-api-contract-reference)
5. [Webhook Reference](#5-webhook-reference)
6. [Environment Variable Map](#6-environment-variable-map)
7. [Real-Time Communication](#7-real-time-communication)
8. [Authentication Flow](#8-authentication-flow)
9. [Error Handling & Recovery](#9-error-handling--recovery)
10. [Troubleshooting Quick Reference](#10-troubleshooting-quick-reference)
11. [Integration Points Summary](#11-integration-points-summary)

---

## 1. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    FRONTEND                                          │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                         Next.js 16 (App Router)                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │  Dashboard  │  │  Detection  │  │   Takeoff   │  │    Project Form     │  │   │
│  │  │  /project   │  │   Editor    │  │   Editor    │  │  (5-step wizard)    │  │   │
│  │  │             │  │   Konva.js  │  │   AG Grid   │  │                     │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │   │
│  │         │                │                │                     │             │   │
│  │         └────────────────┼────────────────┼─────────────────────┘             │   │
│  │                          │                │                                    │   │
│  │                    ┌─────┴────────────────┴─────┐                             │   │
│  │                    │      Custom React Hooks     │                             │   │
│  │                    │  useExtractionData          │                             │   │
│  │                    │  useDetectionSync           │                             │   │
│  │                    │  useTakeoffData             │                             │   │
│  │                    │  useUser / useOrganization  │                             │   │
│  │                    └─────────────┬───────────────┘                             │   │
│  └──────────────────────────────────┼────────────────────────────────────────────┘   │
│                                     │                                                 │
└─────────────────────────────────────┼─────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
┌───────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│   NEXT.JS API ROUTES  │  │    SUPABASE      │  │   N8N WEBHOOKS       │
│   /app/api/*          │  │   (Direct SDK)   │  │   (Railway)          │
│                       │  │                  │  │                      │
│ • extract-schedule    │  │ • Database       │  │ • detection-edit-sync│
│ • extract-floor-plan  │  │ • Realtime       │  │ • project-process    │
│ • extract-material-   │  │ • Auth           │  │ • takeoff-generate   │
│   callouts            │  │ • Storage        │  │                      │
│ • extract-roof-plan   │  │                  │  │                      │
│ • extract-wall-       │  │                  │  │                      │
│   assembly            │  │                  │  │                      │
│ • extract-notes-specs │  │                  │  │                      │
│ • generate-rfi        │  │                  │  │                      │
│ • extraction-jobs     │  │                  │  │                      │
│ • extraction-pages    │  │                  │  │                      │
└───────────┬───────────┘  └────────┬─────────┘  └───────────┬──────────┘
            │                       │                        │
            │                       │                        │
            ▼                       ▼                        ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SERVICES                                     │
│                                                                                    │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐       │
│  │   ANTHROPIC API     │  │   EXTRACTION API    │  │     SUPABASE        │       │
│  │   (Claude Vision)   │  │     (Railway)       │  │     (Cloud)         │       │
│  │                     │  │                     │  │                     │       │
│  │ claude-sonnet-4-    │  │ • /wall-heights     │  │ • PostgreSQL DB     │       │
│  │ 20250514            │  │ • /calculate-linear │  │ • Auth (Supabase    │       │
│  │                     │  │ • /linear-summary   │  │   Auth)             │       │
│  │ Vision extraction:  │  │ • /siding-polygons  │  │ • Storage (S3-like) │       │
│  │ • Schedules         │  │                     │  │ • Realtime (WS)     │       │
│  │ • Floor plans       │  │ Python backend      │  │                     │       │
│  │ • Material callouts │  │ for advanced        │  │ 28+ tables          │       │
│  │ • Roof geometry     │  │ calculations        │  │                     │       │
│  │ • Wall assemblies   │  │                     │  │                     │       │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘       │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Connection Matrix

| Component | Connects To | Protocol | Purpose |
|-----------|-------------|----------|---------|
| **Frontend (React)** | API Routes | HTTP/REST | Data mutations, extractions |
| **Frontend (React)** | Supabase SDK | HTTP/WS | Direct DB queries, realtime |
| **API Routes** | Anthropic API | HTTPS | Vision extraction |
| **API Routes** | Supabase | HTTP | Data persistence |
| **Frontend** | n8n Webhooks | HTTPS | Background processing |
| **n8n** | Supabase | HTTP | Data updates |
| **n8n** | Extraction API | HTTP | Linear calculations |
| **Frontend** | Extraction API | HTTP | Siding polygons, wall heights |
| **Supabase Realtime** | Frontend | WebSocket | Live updates |

---

## 3. Data Flow Maps

### A. Create New Project

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CREATE NEW PROJECT FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

USER ACTION                      SYSTEM RESPONSE                    DATABASE
───────────                      ───────────────                    ────────

1. Navigate to /project
   └─→ Dashboard loads
       └─→ "New Project" tab active
           └─→ ProjectForm renders

2. Fill Step 1: Project Info
   ┌─────────────────────┐
   │ projectName         │
   │ customerName        │──→ Form state updated
   │ address             │
   └─────────────────────┘

3. Fill Step 2: Trade Selection
   ┌─────────────────────┐
   │ ☑ siding            │
   │ ☐ roofing           │──→ selectedTrades: ['siding']
   │ ☑ windows           │
   │ ☐ gutters           │
   └─────────────────────┘

4. Fill Step 3: Product Configuration
   ┌─────────────────────────────────────────────────────────────────────┐
   │                                                                     │
   │  ┌──────────────────────────────────────────────────────────────┐  │
   │  │  Query trade_configurations                                   │  │
   │  │  WHERE trade IN (selectedTrades)                             │  │
   │  │  ORDER BY section_order, field_order                         │◄─┼──── Supabase
   │  └──────────────────────────────────────────────────────────────┘  │
   │                           │                                        │
   │                           ▼                                        │
   │  ┌──────────────────────────────────────────────────────────────┐  │
   │  │  For each field where load_from_catalog = true:              │  │
   │  │  Query product_catalog with catalog_filter                   │◄─┼──── Supabase
   │  │  Group by category, deduplicate if needed                    │  │
   │  └──────────────────────────────────────────────────────────────┘  │
   │                           │                                        │
   │                           ▼                                        │
   │  ┌──────────────────────────────────────────────────────────────┐  │
   │  │  Render fields dynamically                                   │  │
   │  │  Evaluate show_if_conditions for visibility                  │  │
   │  │  Store values in configurations[trade] object                │  │
   │  └──────────────────────────────────────────────────────────────┘  │
   │                                                                     │
   └─────────────────────────────────────────────────────────────────────┘

5. Step 4: PDF Upload (covered in next section)

6. Step 5: Review & Submit
   ┌─────────────────────────────────────────────────────────────────────┐
   │                                                                     │
   │  Display summary of all data                                       │
   │  User confirms → Click "Generate Estimate"                         │
   │                           │                                        │
   │                           ▼                                        │
   │  ┌──────────────────────────────────────────────────────────────┐  │
   │  │  INSERT INTO projects (...)                                  │──┼──► projects table
   │  └──────────────────────────────────────────────────────────────┘  │
   │                           │                                        │
   │                           ▼                                        │
   │  ┌──────────────────────────────────────────────────────────────┐  │
   │  │  For each trade:                                             │  │
   │  │  INSERT INTO project_configurations (...)                    │──┼──► project_configurations
   │  └──────────────────────────────────────────────────────────────┘  │
   │                           │                                        │
   │                           ▼                                        │
   │  ┌──────────────────────────────────────────────────────────────┐  │
   │  │  POST to NEXT_PUBLIC_N8N_WEBHOOK_URL                         │──┼──► n8n workflow
   │  │  Payload: { project_id, configurations, pdf_url, ... }       │  │
   │  └──────────────────────────────────────────────────────────────┘  │
   │                                                                     │
   └─────────────────────────────────────────────────────────────────────┘
```

**Database State After Project Creation:**

```sql
-- projects table
INSERT INTO projects (
  id,              -- UUID
  organization_id, -- From auth context
  name,            -- "Kitchen Renovation"
  client_name,     -- "John Smith"
  address,         -- "123 Main St"
  selected_trades, -- ['siding', 'windows']
  hover_pdf_url,   -- Storage URL
  markup_percent,  -- 15
  status           -- 'pending'
);

-- project_configurations table (one row per trade)
INSERT INTO project_configurations (
  project_id,         -- FK to projects
  trade,              -- 'siding'
  configuration_data  -- JSONB: all form field values
);
```

---

### B. PDF Upload & Processing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PDF UPLOAD & PROCESSING FLOW                         │
└─────────────────────────────────────────────────────────────────────────────┘

USER                          FRONTEND                         EXTERNAL
────                          ────────                         ────────

1. Drag PDF onto dropzone
       │
       ▼
   ┌───────────────────┐
   │ Validate file:    │
   │ • Type: PDF       │
   │ • Size: <25MB     │
   └─────────┬─────────┘
             │
             ▼
   ┌───────────────────┐
   │ Show preview      │
   │ File: doc.pdf     │
   │ Size: 2.4 MB      │
   └─────────┬─────────┘
             │
             ▼
2. Click "Generate Estimate"
       │
       ▼
   ┌───────────────────────────────────────────────────────────────┐
   │                     UPLOAD SEQUENCE                           │
   │                                                               │
   │  Step 1: Upload to Supabase Storage                          │
   │  ┌─────────────────────────────────────────────────────────┐ │
   │  │ supabase.storage                                        │ │
   │  │   .from('hover-pdfs')                                   │ │
   │  │   .upload(`${projectId}/${timestamp}_${filename}`, file)│─┼──► Supabase Storage
   │  │                                                         │ │     hover-pdfs bucket
   │  │ Returns: publicUrl                                      │ │
   │  └─────────────────────────────────────────────────────────┘ │
   │                           │                                   │
   │                           ▼                                   │
   │  Step 2: Save project with PDF URL                           │
   │  ┌─────────────────────────────────────────────────────────┐ │
   │  │ INSERT INTO projects                                    │ │
   │  │ (hover_pdf_url = publicUrl)                             │─┼──► projects table
   │  └─────────────────────────────────────────────────────────┘ │
   │                           │                                   │
   │                           ▼                                   │
   │  Step 3: Trigger n8n webhook                                 │
   │  ┌─────────────────────────────────────────────────────────┐ │
   │  │ POST https://n8n-production-293e.up.railway.app/webhook │ │
   │  │                                                         │ │
   │  │ {                                                       │ │
   │  │   project_id: "uuid",                                   │ │
   │  │   project_name: "Kitchen Renovation",                   │─┼──► n8n Workflow
   │  │   hover_pdf_url: "https://supabase.co/storage/...",     │ │
   │  │   selected_trades: ["siding"],                          │ │
   │  │   siding: { /* config */ },                             │ │
   │  │   ...                                                   │ │
   │  │ }                                                       │ │
   │  └─────────────────────────────────────────────────────────┘ │
   │                                                               │
   └───────────────────────────────────────────────────────────────┘
                               │
                               ▼
   ┌───────────────────────────────────────────────────────────────┐
   │                     N8N WORKFLOW (External)                   │
   │                                                               │
   │  1. Download PDF from Supabase Storage                       │
   │                     │                                         │
   │                     ▼                                         │
   │  2. Convert PDF pages to images (via external service)       │
   │                     │                                         │
   │                     ▼                                         │
   │  3. Create extraction_job record                             │
   │     ┌───────────────────────────────────────────────────┐    │
   │     │ INSERT INTO extraction_jobs (                     │    │
   │     │   project_id, status='converting', ...           │────┼──► extraction_jobs
   │     │ )                                                 │    │
   │     └───────────────────────────────────────────────────┘    │
   │                     │                                         │
   │                     ▼                                         │
   │  4. Classify pages (cover, elevation, schedule, etc.)        │
   │     ┌───────────────────────────────────────────────────┐    │
   │     │ For each page:                                    │    │
   │     │ INSERT INTO extraction_pages (                    │────┼──► extraction_pages
   │     │   job_id, page_number, page_type, image_url      │    │
   │     │ )                                                 │    │
   │     └───────────────────────────────────────────────────┘    │
   │                     │                                         │
   │                     ▼                                         │
   │  5. Run Roboflow detection on elevation pages                │
   │     ┌───────────────────────────────────────────────────┐    │
   │     │ For each elevation:                               │    │
   │     │ POST to Roboflow API → bounding boxes            │    │
   │     │ INSERT INTO extraction_detections_validated (...)│────┼──► extraction_detections_validated
   │     └───────────────────────────────────────────────────┘    │
   │                     │                                         │
   │                     ▼                                         │
   │  6. Update job status                                        │
   │     ┌───────────────────────────────────────────────────┐    │
   │     │ UPDATE extraction_jobs                            │    │
   │     │ SET status = 'classified'                        │────┼──► extraction_jobs
   │     └───────────────────────────────────────────────────┘    │
   │                                                               │
   └───────────────────────────────────────────────────────────────┘
                               │
                               ▼
   ┌───────────────────────────────────────────────────────────────┐
   │                 FRONTEND RECEIVES NOTIFICATION                 │
   │                                                               │
   │  Supabase Realtime subscription:                             │
   │  ┌───────────────────────────────────────────────────────┐   │
   │  │ supabase                                              │   │
   │  │   .channel('project-status')                          │   │
   │  │   .on('postgres_changes', {                           │◄──┼── WebSocket
   │  │     event: 'UPDATE',                                  │   │
   │  │     table: 'extraction_jobs',                         │   │
   │  │     filter: `project_id=eq.${projectId}`              │   │
   │  │   }, handleStatusChange)                              │   │
   │  └───────────────────────────────────────────────────────┘   │
   │                           │                                   │
   │                           ▼                                   │
   │  Show "Ready for Review" → Navigate to Detection Editor      │
   │                                                               │
   └───────────────────────────────────────────────────────────────┘
```

---

### C. Extraction Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTRACTION PIPELINE FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │           EXTRACTION JOB            │
                    │         (One per project)           │
                    └──────────────────┬──────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  ELEVATION      │         │   FLOOR PLAN    │         │    SCHEDULE     │
│  PAGES          │         │   PAGES         │         │    PAGES        │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ Roboflow Detection  │   │ Claude Vision API   │   │ Claude Vision API   │
│                     │   │                     │   │                     │
│ POST /api/detect    │   │ POST /api/extract-  │   │ POST /api/extract-  │
│                     │   │      floor-plan     │   │      schedule       │
│ Returns:            │   │                     │   │                     │
│ • Bounding boxes    │   │ Returns:            │   │ Returns:            │
│ • Classes           │   │ • Floor area SF     │   │ • Window schedule   │
│ • Confidence scores │   │ • Perimeter LF      │   │ • Door schedule     │
│                     │   │ • Corner counts     │   │ • Skylight schedule │
│                     │   │ • Wall segments     │   │ • Garage schedule   │
└──────────┬──────────┘   └──────────┬──────────┘   └──────────┬──────────┘
           │                         │                         │
           ▼                         ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          DATABASE STORAGE                                 │
│                                                                          │
│  extraction_detections_validated    extraction_pages.floor_plan_data    │
│  ┌────────────────────────────┐    ┌────────────────────────────┐       │
│  │ id: UUID                   │    │ id: UUID                   │       │
│  │ page_id: UUID              │    │ floorLevel: "main"         │       │
│  │ class: "window"            │    │ floorAreaSF: 2850          │       │
│  │ pixel_x: 245               │    │ exteriorPerimeterLF: 245   │       │
│  │ pixel_y: 120               │    │ cornerSummary: {...}       │       │
│  │ pixel_width: 80            │    │ windowCount: 12            │       │
│  │ pixel_height: 60           │    │ doorCount: 2               │       │
│  │ confidence: 0.92           │    │ confidence: 0.85           │       │
│  └────────────────────────────┘    └────────────────────────────┘       │
│                                                                          │
│  extraction_pages.ocr_data (schedule extraction)                        │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ windows: [{ mark: "A", width: "3'-0\"", height: "4'-0\"", ...}]│     │
│  │ doors: [{ mark: "1", size: "3'-0\" x 6'-8\"", type: "entry"}] │     │
│  │ totals: { windows: 12, doors: 5, skylights: 2, garages: 1 }   │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         AGGREGATION & TOTALS                              │
│                                                                          │
│  extraction_jobs.results_summary                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ {                                                                  │ │
│  │   "aggregated_data": {                                             │ │
│  │     "floor_plans": [...],                                          │ │
│  │     "building_geometry": {                                         │ │
│  │       "totalFloorAreaSF": 5700,                                    │ │
│  │       "totalPerimeterLF": 490,                                     │ │
│  │       "totalOutsideCorners": 12,                                   │ │
│  │       "totalInsideCorners": 2                                      │ │
│  │     },                                                             │ │
│  │     "elevations": [                                                │ │
│  │       { "name": "front", "detections": {...} },                    │ │
│  │       { "name": "rear", "detections": {...} }                      │ │
│  │     ],                                                             │ │
│  │     "schedules": {                                                 │ │
│  │       "windows": 12,                                               │ │
│  │       "doors": 5,                                                  │ │
│  │       "garages": 1                                                 │ │
│  │     }                                                              │ │
│  │   }                                                                │ │
│  │ }                                                                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Extraction API Routes Detail:**

| Route | Input | Claude Prompt Focus | Output Stored In |
|-------|-------|---------------------|------------------|
| `/api/extract-floor-plan` | Page image | Perimeter, corners, areas | `extraction_pages.floor_plan_data` |
| `/api/extract-schedule` | Schedule page | Tables (windows/doors) | `extraction_pages.ocr_data` |
| `/api/extract-material-callouts` | Elevation | Text annotations | `extraction_pages.material_callouts` |
| `/api/extract-wall-assembly` | Section drawing | Wall layers | `extraction_pages.wall_assembly` |
| `/api/extract-roof-plan` | Roof plan | Slopes, ridges, valleys | `extraction_pages.roof_plan_data` |
| `/api/extract-notes-specs` | Notes pages | Specifications | `extraction_jobs.notes_specs_data` |

---

### D. Detection Editor Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DETECTION EDITOR WORKFLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

ROUTE: /projects/[projectId]/extraction/[jobId]

┌───────────────────────────────────────────────────────────────────────────┐
│                         COMPONENT HIERARCHY                                │
│                                                                           │
│  DetectionEditor                                                          │
│  ├── DetectionToolbar (tools: select, create, pan, line, point, split)   │
│  ├── PageThumbnails (elevation navigation)                               │
│  ├── DetectionCanvas (Konva.js Stage)                                    │
│  │   ├── KonvaDetectionPolygon (siding, roof, gable areas)               │
│  │   ├── KonvaDetectionLine (trim, fascia, gutter lines)                 │
│  │   └── KonvaDetectionPoint (vents, outlets, corbels)                   │
│  ├── PropertiesPanel (selected detection details)                        │
│  └── DetectionSidebar (counts, area totals)                              │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

DATA LOADING SEQUENCE:

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  1. useExtractionData(jobId) hook initializes                            │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │ GET /api/extraction-pages?job_id=${jobId}&page_type=elevation   │  │
│     │                                                                 │  │
│     │ Response: {                                                     │  │
│     │   pages: [...],                                                 │  │
│     │   detection_source: 'draft' | 'validated' | 'ai_original',      │  │
│     │   detections by page                                            │  │
│     │ }                                                               │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  2. Detection Priority System:                                           │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │                                                                 │  │
│     │  Priority 1: extraction_detections_draft (user edits)          │  │
│     │      │       └─ If any exist, use exclusively                  │  │
│     │      ▼                                                          │  │
│     │  Priority 2: extraction_detections_validated (Roboflow)        │  │
│     │      │       └─ Fallback if no drafts                          │  │
│     │      ▼                                                          │  │
│     │  Priority 3: extraction_detection_details (original AI)        │  │
│     │              └─ Last resort                                     │  │
│     │                                                                 │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

USER INTERACTION FLOW:

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  User Action              Local Update              Server Sync           │
│  ───────────              ────────────              ───────────           │
│                                                                           │
│  1. SELECT detection                                                      │
│     └─→ Highlight in canvas                                              │
│     └─→ Show in PropertiesPanel                                          │
│                                                                           │
│  2. MOVE detection (drag)                                                │
│     └─→ Optimistic UI update    ────────────────────────────────────────┐│
│     └─→ Update polygon_points                                           ││
│                                 │                                        ││
│                                 ▼                                        ││
│                    ┌────────────────────────────────────────────────────┐││
│                    │ POST n8n webhook: /detection-edit-sync             │││
│                    │ {                                                  │││
│                    │   edit_type: 'move',                               │││
│                    │   detection_id: "uuid",                            │││
│                    │   changes: { pixel_x, pixel_y, polygon_points }    │││
│                    │ }                                                  │││
│                    └────────────────────────────────────────────────────┘││
│                                 │                                        ││
│                                 ▼                                        ││
│                    ┌────────────────────────────────────────────────────┐││
│                    │ n8n updates extraction_detections_draft            │││
│                    │ Recalculates area_sf, perimeter_lf                 │││
│                    │ Returns updated totals                             │││
│                    └────────────────────────────────────────────────────┘││
│                                 │                                        ││
│                                 ▼                                        ││
│                    Update sidebar totals with new calculations ◄─────────┘│
│                                                                           │
│  3. RESIZE detection                                                      │
│     └─→ Same flow as MOVE                                                │
│                                                                           │
│  4. RECLASSIFY detection                                                  │
│     └─→ Change class dropdown in PropertiesPanel                         │
│     └─→ Sync to server, recategorize in totals                           │
│                                                                           │
│  5. DELETE detection                                                      │
│     └─→ Set is_deleted = true in draft table                             │
│     └─→ Remove from canvas                                               │
│     └─→ Update totals                                                    │
│                                                                           │
│  6. CREATE new detection                                                  │
│     └─→ Draw polygon/line/point on canvas                                │
│     └─→ INSERT INTO extraction_detections_draft                          │
│     └─→ Add to local state                                               │
│                                                                           │
│  7. SPLIT detection (Polygon with Holes)                                  │
│     └─→ Draw inner hole boundary                                         │
│     └─→ Store as PolygonWithHoles: { outer: [...], holes: [[...]] }     │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

UNDO/REDO SYSTEM:

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  History Stack (in useExtractionData):                                   │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │ historyStack: [                                                   │   │
│  │   { action: 'move', detection_id: 'abc', before: {...} },         │   │
│  │   { action: 'resize', detection_id: 'def', before: {...} },       │   │
│  │   ...                                                              │   │
│  │ ]                                                                  │   │
│  │ historyIndex: number                                               │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  Cmd+Z → Pop from stack, apply reverse operation                         │
│  Cmd+Shift+Z → Redo                                                      │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

### E. Takeoff Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TAKEOFF GENERATION FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

TRIGGER: User clicks "Approve" in Detection Editor

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  1. Update extraction_jobs status                                        │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │ UPDATE extraction_jobs                                          │  │
│     │ SET status = 'approved'                                         │  │
│     │ WHERE id = jobId                                                │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  2. Trigger n8n takeoff workflow                                         │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │ POST n8n webhook: /takeoff-generate                             │  │
│     │ { job_id, project_id }                                          │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                       N8N TAKEOFF WORKFLOW                                 │
│                                                                           │
│  Step 1: Aggregate Detection Data                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ SELECT * FROM extraction_detections_draft                          │ │
│  │ WHERE page_id IN (SELECT id FROM extraction_pages WHERE job_id=?)  │ │
│  │ AND is_deleted = false                                              │ │
│  │                                                                     │ │
│  │ Group by class:                                                     │ │
│  │ • windows: count, aggregate area                                    │ │
│  │ • doors: count                                                      │ │
│  │ • siding: sum area_sf → net siding SF                              │ │
│  │ • trim: sum perimeter_lf                                           │ │
│  │ • corners: count by type                                           │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                       │                                   │
│                                       ▼                                   │
│  Step 2: Merge with Floor Plan Data                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Combine:                                                            │ │
│  │ • Detection counts (from Roboflow + user edits)                    │ │
│  │ • Floor plan geometry (from Claude Vision)                         │ │
│  │ • Schedule data (windows/doors from Claude Vision)                 │ │
│  │ • Notes & specs (materials from Claude Vision)                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                       │                                   │
│                                       ▼                                   │
│  Step 3: Calculate Wall Heights (Extraction API)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ GET https://extraction-api.railway.app/wall-heights?job_id=...     │ │
│  │                                                                     │ │
│  │ POST https://extraction-api.railway.app/calculate-linear           │ │
│  │ { job_id }                                                         │ │
│  │                                                                     │ │
│  │ Returns:                                                            │ │
│  │ • default_height_ft: 9                                             │ │
│  │ • total_perimeter_lf: 245                                          │ │
│  │ • total_corners_outside: 8                                         │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                       │                                   │
│                                       ▼                                   │
│  Step 4: Apply Pricing                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ For each material quantity:                                        │ │
│  │                                                                     │ │
│  │ 1. Look up pricing_items by item_code, trade                       │ │
│  │ 2. Calculate extended costs:                                       │ │
│  │    material_extended = quantity × material_unit_cost               │ │
│  │    labor_extended = quantity × labor_unit_cost                     │ │
│  │                                                                     │ │
│  │ 3. Apply labor_auto_scope_rules for labor items                    │ │
│  │    • WRB Installation (always, per square)                         │ │
│  │    • Siding Installation (per material_sqft)                       │ │
│  │    • Trim Installation (per material_lf)                           │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                       │                                   │
│                                       ▼                                   │
│  Step 5: Create Takeoff Records                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │ INSERT INTO takeoffs (                                             │ │
│  │   project_id, takeoff_name, total_material_cost,                   │ │
│  │   total_labor_cost, markup_percent, final_price                    │ │
│  │ )                                                                   │ │
│  │                                                                     │ │
│  │ INSERT INTO takeoff_sections (                                     │ │
│  │   takeoff_id, section_name, display_order                          │ │
│  │ )                                                                   │ │
│  │ • "Siding"                                                          │ │
│  │ • "Trim & Accessories"                                              │ │
│  │ • "Labor"                                                           │ │
│  │ • "Overhead"                                                        │ │
│  │                                                                     │ │
│  │ INSERT INTO takeoff_line_items (                                   │ │
│  │   takeoff_id, section_id, item_name, quantity,                     │ │
│  │   material_unit_cost, labor_unit_cost, ...                         │ │
│  │ )                                                                   │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      DATABASE STATE AFTER TAKEOFF                          │
│                                                                           │
│  takeoffs                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ id: "takeoff-uuid"                                                  │ │
│  │ project_id: "project-uuid"                                          │ │
│  │ total_material_cost: 8500.00                                        │ │
│  │ total_labor_cost: 6200.00                                           │ │
│  │ subtotal: 15200.00                                                  │ │
│  │ markup_percent: 15                                                  │ │
│  │ final_price: 17480.00                                               │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  takeoff_sections (4 sections)                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ [0] { section_name: "Siding", display_order: 1 }                   │ │
│  │ [1] { section_name: "Trim & Accessories", display_order: 2 }       │ │
│  │ [2] { section_name: "Labor", display_order: 3 }                    │ │
│  │ [3] { section_name: "Overhead", display_order: 4 }                 │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  takeoff_line_items (20+ items)                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ { item_name: "HardiePlank Lap Siding",                             │ │
│  │   quantity: 24.5, unit: "SQ",                                       │ │
│  │   material_unit_cost: 285.00,                                       │ │
│  │   material_extended: 6982.50,                                       │ │
│  │   source_measurement: { detection_ids: [...], page_id: "..." } }   │ │
│  │                                                                     │ │
│  │ { item_name: "Outside Corners",                                    │ │
│  │   quantity: 8, unit: "EA", ... }                                   │ │
│  │                                                                     │ │
│  │ { item_name: "Siding Installation Labor",                          │ │
│  │   quantity: 24.5, unit: "SQ",                                       │ │
│  │   labor_unit_cost: 180.00,                                         │ │
│  │   labor_extended: 4410.00 }                                        │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

### F. Estimate Editing & Export

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ESTIMATE EDITING & EXPORT FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

ROUTE: /projects/[projectId]

┌───────────────────────────────────────────────────────────────────────────┐
│                         COMPONENT STRUCTURE                                │
│                                                                           │
│  ProjectEstimatePage                                                      │
│  ├── EstimateSummary (totals card)                                       │
│  │   ├── Material Total: $8,500                                          │
│  │   ├── Labor Total: $6,200                                             │
│  │   ├── Subtotal: $15,200                                               │
│  │   ├── Markup (15%): $2,280                                            │
│  │   └── Final Price: $17,480                                            │
│  │                                                                        │
│  ├── SectionTabs                                                         │
│  │   ├── Tab: "Siding"                                                   │
│  │   ├── Tab: "Trim & Accessories"                                       │
│  │   ├── Tab: "Labor"                                                    │
│  │   └── Tab: "Overhead"                                                 │
│  │                                                                        │
│  └── EstimateGrid (AG Grid)                                              │
│      ├── Column: Item Name (editable)                                    │
│      ├── Column: Description (editable)                                  │
│      ├── Column: Quantity (editable, triggers recalc)                    │
│      ├── Column: Unit                                                    │
│      ├── Column: Material Unit Cost (editable)                           │
│      ├── Column: Material Extended (calculated)                          │
│      ├── Column: Labor Unit Cost (editable)                              │
│      ├── Column: Labor Extended (calculated)                             │
│      └── Column: Line Total (calculated)                                 │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

DATA LOADING:

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  useTakeoffData(projectId) hook                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ 1. Fetch takeoff + sections + line items                           │ │
│  │    SELECT * FROM takeoffs WHERE project_id = ?                     │ │
│  │    SELECT * FROM takeoff_sections WHERE takeoff_id = ?             │ │
│  │    SELECT * FROM takeoff_line_items WHERE takeoff_id = ?           │ │
│  │                                                                     │ │
│  │ 2. Setup Realtime subscription                                     │ │
│  │    supabase.channel(`takeoff-${takeoffId}`)                        │ │
│  │      .on('postgres_changes', { table: 'takeoff_line_items' })      │ │
│  │                                                                     │ │
│  │ 3. Return: { takeoff, sections, lineItems, refresh }               │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

EDIT FLOW:

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  User edits cell in AG Grid                                              │
│         │                                                                 │
│         ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ onCellValueChanged(event)                                          │ │
│  │                                                                     │ │
│  │ if (field is 'quantity' | 'material_unit_cost' | 'labor_unit_cost')│ │
│  │   → Recalculate extended costs                                     │ │
│  │   → Set isModified = true                                          │ │
│  │   → Highlight row (yellow background)                              │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                 │
│         ▼                                                                 │
│  User clicks "Save"                                                      │
│         │                                                                 │
│         ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ useLineItemsSave().saveLineItems(lineItems)                        │ │
│  │                                                                     │ │
│  │ 1. Separate items by operation:                                    │ │
│  │    • newItems (isNew && !id)                                       │ │
│  │    • modifiedItems (isModified && id)                              │ │
│  │    • deletedItems (isDeleted)                                      │ │
│  │                                                                     │ │
│  │ 2. Batch database operations:                                      │ │
│  │    INSERT new items                                                │ │
│  │    UPSERT modified items                                           │ │
│  │    DELETE removed items                                            │ │
│  │                                                                     │ │
│  │ 3. Clear dirty flags                                               │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                 │
│         ▼                                                                 │
│  Database trigger recalculates takeoff totals                            │
│         │                                                                 │
│         ▼                                                                 │
│  Realtime subscription notifies frontend                                 │
│         │                                                                 │
│         ▼                                                                 │
│  EstimateSummary updates with new totals                                 │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

EXPORT FLOW:

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  User clicks "Export to Excel"                                           │
│         │                                                                 │
│         ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ exportTakeoffToExcel({                                             │ │
│  │   takeoff,                                                          │ │
│  │   sections,                                                         │ │
│  │   lineItems,                                                        │ │
│  │   projectInfo: { clientName, address, projectName },               │ │
│  │   filename: "Estimate_ClientName_2024.xlsx"                        │ │
│  │ })                                                                  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                 │
│         ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ ExcelJS generates workbook:                                        │ │
│  │                                                                     │ │
│  │ ┌───────────────────────────────────────────────────────────────┐  │ │
│  │ │     EXTERIOR FINISHES - PROFESSIONAL ESTIMATE                 │  │ │
│  │ ├───────────────────────────────────────────────────────────────┤  │ │
│  │ │ Project: Kitchen Renovation                                   │  │ │
│  │ │ Client: John Smith                                            │  │ │
│  │ │ Address: 123 Main St                                          │  │ │
│  │ ├───────────────────────────────────────────────────────────────┤  │ │
│  │ │ SIDING                                          (blue header) │  │ │
│  │ ├───────┬──────┬─────┬────────┬─────────┬──────────────────────┤  │ │
│  │ │ Item  │ Qty  │Unit │Unit $  │Extended │ Total                │  │ │
│  │ ├───────┼──────┼─────┼────────┼─────────┼──────────────────────┤  │ │
│  │ │ ...   │ ...  │ ... │ ...    │ ...     │ ...                  │  │ │
│  │ └───────┴──────┴─────┴────────┴─────────┴──────────────────────┘  │ │
│  │                                                                   │  │ │
│  │ Styled with:                                                      │ │
│  │ • Blue section headers                                            │ │
│  │ • Alternating row colors                                          │ │
│  │ • Currency formatting                                             │ │
│  │ • Borders                                                         │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                 │
│         ▼                                                                 │
│  Browser downloads .xlsx file                                            │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

### G. Trade Configuration Display (CRITICAL)

This section documents exactly how a configuration field (e.g., `add_battens`) appears in the UI.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               TRADE CONFIGURATION DISPLAY FLOW                               │
│                                                                             │
│  Example: How does the "add_battens" checkbox appear?                       │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: CONFIG STORED IN DATABASE
─────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────────┐
│  Table: trade_configurations                                                │
│                                                                             │
│  {                                                                          │
│    config_name: "add_battens",                                             │
│    trade: "siding",                                                         │
│    config_section: "trim_accessories",                                      │
│    field_type: "checkbox",                                                  │
│    field_label: "Add Battens",                                             │
│    field_order: 5,                                                          │
│    section_order: 3,                                                        │
│    is_required: false,                                                      │
│    default_value: null,                                                     │
│    triggers_auto_scope: true,                                               │
│    show_if_conditions: null,              ◄─── No conditions = always show  │
│    show_if_product_attributes: null,      ◄─── No product attribute checks │
│    load_from_catalog: false,                                                │
│    active: true                                                             │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 2: FRONTEND FETCHES CONFIGURATIONS
───────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────────┐
│  File: components/project-form/ProductConfigStep.tsx                        │
│  Lines: 141-175                                                             │
│                                                                             │
│  // Fetch trade configurations                                              │
│  const { data: configs } = await supabase                                  │
│    .from('trade_configurations')                                            │
│    .select('*')                                                             │
│    .in('trade', data.selectedTrades)   ◄─── Filter by selected trades      │
│    .eq('active', true)                                                      │
│    .order('section_order', { ascending: true })                            │
│    .order('field_order', { ascending: true });                             │
│                                                                             │
│  // Fetch product catalog (for fields with load_from_catalog = true)       │
│  const { data: products } = await supabase                                 │
│    .from('product_catalog')                                                 │
│    .select('*')                                                             │
│    .in('trade', data.selectedTrades)                                       │
│    .eq('active', true);                                                     │
│                                                                             │
│  // Store in component state                                                │
│  setConfigurations(configs);    ◄─── configurations state                  │
│  setProductCatalog(products);   ◄─── productCatalog state                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 3: VISIBILITY EVALUATION (isFieldVisible function)
───────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────────┐
│  File: components/project-form/ProductConfigStep.tsx                        │
│  Lines: 273-481                                                             │
│                                                                             │
│  function isFieldVisible(field, trade) {                                   │
│    const tradeValues = formValues[trade] || {};                            │
│                                                                             │
│    // ═══════════════════════════════════════════════════════════════════  │
│    // CHECK 1: show_if_product_attributes (HIGHEST PRIORITY)               │
│    // ═══════════════════════════════════════════════════════════════════  │
│    if (field.show_if_product_attributes) {                                 │
│      // Get which product field to check based on trade                    │
│      const productFieldMap = {                                             │
│        siding: 'siding_product_type',                                      │
│        roofing: 'roofing_product',                                         │
│        windows: 'window_series',                                           │
│        gutters: 'gutter_product'                                           │
│      };                                                                     │
│                                                                             │
│      const productFieldName = productFieldMap[trade];                      │
│      const selectedProductId = tradeValues[productFieldName];              │
│                                                                             │
│      // Find product in catalog                                            │
│      const product = productCatalog.find(p => p.id === selectedProductId); │
│      const physicalProps = product?.physical_properties || {};             │
│                                                                             │
│      // Check ALL attributes must match                                    │
│      for (const [attrKey, expectedValue] of                               │
│           Object.entries(field.show_if_product_attributes)) {              │
│        const actualValue = physicalProps[attrKey];                         │
│        if (actualValue !== expectedValue) return false;  ◄─── HIDE field  │
│      }                                                                      │
│    }                                                                        │
│                                                                             │
│    // ═══════════════════════════════════════════════════════════════════  │
│    // CHECK 2: show_if_conditions (form field values)                      │
│    // ═══════════════════════════════════════════════════════════════════  │
│    if (field.show_if_conditions) {                                         │
│      for (const [fieldName, conditionValue] of                            │
│           Object.entries(field.show_if_conditions)) {                      │
│        const currentValue = tradeValues[fieldName];                        │
│                                                                             │
│        // Format 1: Operator-based { operator: "equals", value: X }        │
│        if (conditionValue.operator) {                                      │
│          switch (conditionValue.operator) {                                │
│            case 'equals':      if (currentValue !== expected) return false;│
│            case 'not_equals':  if (currentValue === expected) return false;│
│            case 'contains':    if (!arr.includes(val)) return false;       │
│            case 'not_contains': if (arr.includes(val)) return false;       │
│          }                                                                  │
│        }                                                                    │
│                                                                             │
│        // Format 2: Shorthand { contains: "value" }                        │
│        else if (conditionValue.contains) {                                 │
│          if (!Array.isArray(currentValue) ||                               │
│              !currentValue.includes(conditionValue.contains)) return false;│
│        }                                                                    │
│                                                                             │
│        // Format 3: Simple equality { field: true }                        │
│        else {                                                               │
│          // Type coercion: true == "true" == 1                             │
│          if (!valuesMatch(currentValue, conditionValue)) return false;     │
│        }                                                                    │
│      }                                                                      │
│    }                                                                        │
│                                                                             │
│    return true;  ◄─── SHOW field                                           │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 4: PRODUCT LOOKUP FOR CATALOG FIELDS
─────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────────┐
│  File: components/project-form/ProductConfigStep.tsx                        │
│  Lines: 486-597, 643-658                                                    │
│                                                                             │
│  // For fields where load_from_catalog = true:                             │
│                                                                             │
│  1. Filter products by catalog_filter JSONB                                │
│     filterProductsByCatalogFilter(products, field.catalog_filter)          │
│     └─→ Filters by: category, manufacturer, active, discontinued          │
│                                                                             │
│  2. Dynamic filtering (e.g., window_series based on manufacturer)          │
│     if (field.config_name === 'window_series') {                           │
│       const selectedManufacturer = tradeValues['window_manufacturer'];     │
│       effectiveCatalogFilter = {                                           │
│         ...field.catalog_filter,                                           │
│         manufacturer: selectedManufacturer  ◄─── Dynamic filter            │
│       };                                                                    │
│     }                                                                       │
│                                                                             │
│  3. Deduplicate (for roofing/windows only)                                 │
│     deduplicateProducts(products)                                          │
│     └─→ Shows unique product lines, not every color variant                │
│                                                                             │
│  4. Group by category                                                      │
│     getGroupedProducts(trade, catalogFilter)                               │
│     └─→ Returns: { "LAP SIDING": [...], "PANEL SIDING": [...] }           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 5: FIELD RENDERING
───────────────────────
┌─────────────────────────────────────────────────────────────────────────────┐
│  File: components/project-form/ProductConfigStep.tsx                        │
│  Lines: 629-1069                                                            │
│                                                                             │
│  function renderField(field, trade) {                                      │
│    // First check visibility                                               │
│    if (!isFieldVisible(field, trade)) {                                    │
│      return null;  ◄─── Field not rendered                                 │
│    }                                                                        │
│                                                                             │
│    switch (field.field_type) {                                             │
│      case 'select':                                                         │
│        if (field.load_from_catalog) {                                      │
│          return <SearchableSelect options={groupedProducts} />;            │
│        }                                                                    │
│        return <Select options={field.field_options} />;                    │
│                                                                             │
│      case 'checkbox':                                                       │
│        return (                                                             │
│          <div className="flex items-center rounded-lg border p-4">        │
│            <Checkbox                                                        │
│              checked={tradeValues[field.config_name] || false}             │
│              onCheckedChange={(v) => handleFieldChange(trade, field, v)}   │
│            />                                                               │
│            <Label>{field.field_label}</Label>                              │
│          </div>                                                             │
│        );                                                                   │
│                                                                             │
│      case 'multiselect':                                                    │
│        return <MultiSelectCheckboxes options={field.field_options} />;     │
│                                                                             │
│      case 'number':                                                         │
│        return <Input type="number" validation={field.validation_rules} />; │
│    }                                                                        │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 6: PARENT-CHILD GROUPING (trim_accessories section)
────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────────┐
│  File: components/project-form/ProductConfigStep.tsx                        │
│  Lines: 1087-1142, 1261-1291                                                │
│                                                                             │
│  Pattern: Parent checkbox controls child field visibility                  │
│                                                                             │
│  Parent field:  belly_band_include  (checkbox, ends with _include)         │
│  Child fields:  belly_band_color    (select, starts with belly_band_)      │
│                 belly_band_material (select)                                │
│                                                                             │
│  Rendering:                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ☑ Include Belly Band  ◄─── Parent checkbox (always visible)        │   │
│  │                                                                      │   │
│  │   │ (shown only if parent checked)                                  │   │
│  │   │                                                                  │   │
│  │   ├── Belly Band Color: [Arctic White ▼]  ◄─── Child field         │   │
│  │   │                                                                  │   │
│  │   └── Belly Band Material: [HardieTrim 4/4 ▼]  ◄─── Child field    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Code:                                                                      │
│  {group.parent && renderField(group.parent, trade)}                        │
│  {parentValue && group.children.length > 0 && (                            │
│    <div className="ml-8 pl-4 border-l-2">                                  │
│      {group.children.map(child => renderField(child, trade))}              │
│    </div>                                                                   │
│  )}                                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Visibility Condition Examples:**

| Condition Type | Database Value | Triggers When |
|----------------|----------------|---------------|
| Simple equality | `{ "belly_band_include": true }` | Checkbox is checked |
| Product attribute | `{ "is_colorplus": true }` | Selected product has `physical_properties.is_colorplus = true` |
| Operator | `{ "field": { "operator": "not_equals", "value": "" } }` | Field is not empty |
| Contains | `{ "accessories": { "contains": "flashing" } }` | Multiselect includes "flashing" |

**Key Files for Trade Configuration:**

| File | Lines | Purpose |
|------|-------|---------|
| [ProductConfigStep.tsx](components/project-form/ProductConfigStep.tsx) | 128-185 | Data fetching |
| [ProductConfigStep.tsx](components/project-form/ProductConfigStep.tsx) | 273-481 | `isFieldVisible()` function |
| [ProductConfigStep.tsx](components/project-form/ProductConfigStep.tsx) | 486-597 | Product filtering & grouping |
| [ProductConfigStep.tsx](components/project-form/ProductConfigStep.tsx) | 629-1069 | `renderField()` function |
| [ProductConfigStep.tsx](components/project-form/ProductConfigStep.tsx) | 1087-1142 | Parent-child grouping |
| [lib/types/database.ts](lib/types/database.ts) | 88-115 | TradeConfiguration interface |

---

## 4. API Contract Reference

### Frontend → Supabase (Direct SDK Queries)

| Table | Component | Query Type | Purpose |
|-------|-----------|------------|---------|
| `trade_configurations` | ProductConfigStep | SELECT | Load form field definitions |
| `product_catalog` | ProductConfigStep | SELECT | Load product options |
| `projects` | ProjectsTable, Dashboard | SELECT/INSERT/UPDATE | Project CRUD |
| `project_configurations` | HoverUploadStep | INSERT | Save form values |
| `extraction_jobs` | Dashboard, DetectionEditor | SELECT | Job status |
| `extraction_pages` | DetectionEditor | SELECT | Page images |
| `extraction_detections_draft` | DetectionEditor | SELECT/INSERT/UPDATE | User edits |
| `takeoffs` | EstimateEditor | SELECT | Takeoff data |
| `takeoff_line_items` | EstimateGrid | SELECT/INSERT/UPDATE/DELETE | Line items |
| `pricing_items` | (via n8n) | SELECT | Pricing lookup |

### Frontend → API Routes

| Route | Method | Request | Response |
|-------|--------|---------|----------|
| `/api/extraction-jobs` | GET | `?project_id=uuid` | `{ success, jobs: ExtractionJobRecord[] }` |
| `/api/extraction-pages` | GET | `?job_id=uuid&page_type=elevation` | `{ success, pages, detection_source }` |
| `/api/extract-schedule` | POST | `{ pageId, imageUrl, structure? }` | `{ success, data: ScheduleOCRData }` |
| `/api/extract-floor-plan` | POST | `{ pageId, imageUrl, scaleNotation? }` | `{ success, floorPlan: FloorPlanData }` |
| `/api/extract-material-callouts` | POST | `{ pageId, imageUrl }` | `{ success, data: { callouts } }` |
| `/api/extract-roof-plan` | POST | `{ pageId, imageUrl }` | `{ success, roofPlan: RoofPlanData }` |
| `/api/extract-wall-assembly` | POST | `{ pageId, imageUrl }` | `{ success, data: WallAssemblyResult }` |
| `/api/extract-notes-specs` | POST | `{ job_id }` | `{ success, data: NotesSpecsData }` |
| `/api/generate-rfi` | POST | `{ job_id }` | `{ success, data: RFIListData }` |
| `/api/takeoffs/[id]` | GET | Path param: id | `{ takeoff, sections, lineItems }` |

### API Routes → External Services

| Route | External Service | Purpose |
|-------|------------------|---------|
| `/api/extract-*` | Anthropic Claude Vision | Vision extraction |
| (via n8n) | Extraction API Railway | Wall heights, linear calcs |
| (via n8n) | Roboflow | Object detection |

### n8n → Database Operations

| Workflow | Reads From | Writes To |
|----------|------------|-----------|
| Multi-Trade Coordinator | `projects`, `project_configurations` | `extraction_jobs`, `extraction_pages` |
| Detection Sync | `extraction_detections_draft` | `extraction_detections_draft` |
| Takeoff Generate | `extraction_detections_draft`, `pricing_items`, `labor_auto_scope_rules` | `takeoffs`, `takeoff_sections`, `takeoff_line_items` |
| Approve from DE | `extraction_jobs` | `extraction_jobs.status`, Excel file |

---

## 5. Webhook Reference

| Webhook Path | Called By | n8n Workflow | Purpose |
|--------------|-----------|--------------|---------|
| `/webhook/` (base) | HoverUploadStep | Multi-Trade Coordinator | Project submission, Excel generation |
| `/webhook/detection-edit-sync` | useDetectionSync | Detection Edit Sync | Real-time detection edits |
| `/webhook/validate-detections` | useDetectionSync | Validate Detections | Validate detection data |
| `/webhook/approve-detection-editor` | DetectionEditor | Approve from DE | Approval flow, takeoff generation |

**Webhook Payload Examples:**

```typescript
// Project Submission (HoverUploadStep → base webhook)
{
  project_id: "uuid",
  project_name: "Kitchen Renovation",
  customer_name: "John Smith",
  address: "123 Main St",
  selected_trades: ["siding", "roofing"],
  hover_pdf_url: "https://supabase.co/storage/...",
  siding: { siding_product_type: "...", colorplus_color: "..." },
  roofing: { roofing_product: "...", ... },
  created_at: "2025-01-31T..."
}

// Detection Edit Sync
{
  edit_type: "move" | "resize" | "reclassify" | "delete" | "create",
  detection_id: "uuid",
  job_id: "uuid",
  page_id: "uuid",
  changes: { pixel_x?, pixel_y?, pixel_width?, pixel_height?, class? }
}

// Approval
{
  job_id: "uuid",
  project_id: "uuid",
  approved_by: "user_id",
  detections: [...],
  totals: {...}
}
```

---

## 6. Environment Variable Map

| Component | Required Env Vars | Purpose |
|-----------|-------------------|---------|
| **Frontend** | `NEXT_PUBLIC_SUPABASE_URL` | Supabase connection |
| | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public API key |
| | `NEXT_PUBLIC_N8N_WEBHOOK_URL` | n8n webhooks base URL |
| | `NEXT_PUBLIC_EXTRACTION_API_URL` | Railway extraction API |
| | `NEXT_PUBLIC_DEV_BYPASS_AUTH` | Dev auth bypass (dev only) |
| **API Routes** | `ANTHROPIC_API_KEY` | Claude Vision API (server-only) |
| | `SUPABASE_SERVICE_ROLE_KEY` | Admin database access |
| **n8n** | `SUPABASE_URL` | Database connection |
| | `SUPABASE_SERVICE_KEY` | Admin access |
| | `EXTRACTION_API_URL` | Railway extraction API |
| | `ROBOFLOW_API_KEY` | Object detection |

**Environment File Template:**

```bash
# .env.local

# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://okwtyttfqbfmcqtenize.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# n8n Webhook (REQUIRED)
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://n8n-production-293e.up.railway.app

# Extraction API (has default)
NEXT_PUBLIC_EXTRACTION_API_URL=https://extraction-api-production.up.railway.app

# Anthropic (REQUIRED - Server-side only)
ANTHROPIC_API_KEY=sk-ant-...

# Development Only
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

---

## 7. Real-Time Communication

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REALTIME COMMUNICATION                               │
└─────────────────────────────────────────────────────────────────────────────┘

TECHNOLOGY: Supabase Realtime (WebSocket)

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  SUBSCRIPTION PATTERNS                                                    │
│                                                                           │
│  1. Project Status Updates                                               │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │ supabase                                                        │  │
│     │   .channel(`project-${projectId}`)                              │  │
│     │   .on('postgres_changes', {                                     │  │
│     │     event: 'UPDATE',                                            │  │
│     │     schema: 'public',                                           │  │
│     │     table: 'projects',                                          │  │
│     │     filter: `id=eq.${projectId}`                                │  │
│     │   }, (payload) => {                                             │  │
│     │     // Update UI when status changes                            │  │
│     │     // pending → extracted → calculated → priced → approved     │  │
│     │   })                                                            │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  2. Extraction Job Status                                                │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │ supabase                                                        │  │
│     │   .channel(`extraction-job-${jobId}`)                           │  │
│     │   .on('postgres_changes', {                                     │  │
│     │     event: 'UPDATE',                                            │  │
│     │     table: 'extraction_jobs'                                    │  │
│     │   }, (payload) => {                                             │  │
│     │     // converting → classifying → classified → complete         │  │
│     │   })                                                            │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  3. Takeoff Line Items (Multi-User Editing)                              │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │ supabase                                                        │  │
│     │   .channel(`takeoff-${takeoffId}`)                              │  │
│     │   .on('postgres_changes', {                                     │  │
│     │     event: '*',  // INSERT, UPDATE, DELETE                      │  │
│     │     table: 'takeoff_line_items',                                │  │
│     │     filter: `takeoff_id=eq.${takeoffId}`                        │  │
│     │   }, (payload) => {                                             │  │
│     │     // Update grid when other users make changes                │  │
│     │   })                                                            │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

EVENT FLOW:

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  User A (Browser)          Supabase           User B (Browser)           │
│        │                      │                      │                    │
│        │  Subscribe           │                      │                    │
│        │─────────────────────►│                      │                    │
│        │                      │◄─────────────────────│ Subscribe          │
│        │                      │                      │                    │
│        │  Edit line item      │                      │                    │
│        │─────────────────────►│                      │                    │
│        │                      │  UPDATE in DB        │                    │
│        │                      │──────────────────────│                    │
│        │                      │                      │                    │
│        │                      │  Broadcast change    │                    │
│        │◄─────────────────────│─────────────────────►│                    │
│        │                      │                      │                    │
│        │  Update UI           │                      │  Update UI         │
│        │                      │                      │                    │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTICATION FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  useUser() Hook                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  if (NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true') {                     │ │
│  │    // Development mode - skip auth                                 │ │
│  │    return mockUser                                                 │ │
│  │  }                                                                  │ │
│  │                                                                     │ │
│  │  // Production mode                                                │ │
│  │  const { data: { user } } = await supabase.auth.getUser()         │ │
│  │                                                                     │ │
│  │  if (!user) {                                                      │ │
│  │    redirect('/auth/login')                                         │ │
│  │  }                                                                  │ │
│  │                                                                     │ │
│  │  return user                                                       │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  useOrganization() Hook                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  1. Get current user                                               │ │
│  │  2. Query organization_members for user's org                      │ │
│  │  3. Query organizations for org details                            │ │
│  │  4. Return organization context                                    │ │
│  │                                                                     │ │
│  │  All queries filtered by organization_id (RLS)                     │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

DATA ISOLATION (Row Level Security):

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  Every table with organization_id has RLS policies:                      │
│                                                                           │
│  CREATE POLICY "Users see own org data"                                  │
│  ON projects FOR SELECT                                                  │
│  USING (                                                                 │
│    organization_id IN (                                                  │
│      SELECT organization_id                                              │
│      FROM organization_members                                           │
│      WHERE user_id = auth.uid()                                          │
│    )                                                                     │
│  );                                                                      │
│                                                                           │
│  Tables with RLS:                                                        │
│  • projects                                                              │
│  • project_configurations                                                │
│  • extraction_jobs                                                       │
│  • takeoffs                                                              │
│  • takeoff_line_items                                                    │
│  • pricing_items (org-specific pricing)                                  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Error Handling & Recovery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ERROR HANDLING & RECOVERY                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  DETECTION SYNC ERROR HANDLING (useDetectionSync)                        │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  const syncEdit = async (editType, detectionId, changes) => {      │ │
│  │    let retries = 0;                                                │ │
│  │    const maxRetries = 3;                                           │ │
│  │    const retryDelays = [1000, 2000, 4000];                         │ │
│  │                                                                     │ │
│  │    while (retries < maxRetries) {                                  │ │
│  │      try {                                                          │ │
│  │        const response = await fetch(webhookUrl, {...});            │ │
│  │        if (response.ok) return response.json();                    │ │
│  │        throw new Error(response.statusText);                       │ │
│  │      } catch (error) {                                              │ │
│  │        retries++;                                                   │ │
│  │        if (retries === maxRetries) {                               │ │
│  │          // Rollback local change                                  │ │
│  │          restoreFromHistory(editType, detectionId);                │ │
│  │          throw error;                                               │ │
│  │        }                                                            │ │
│  │        await sleep(retryDelays[retries]);                          │ │
│  │      }                                                              │ │
│  │    }                                                                │ │
│  │  };                                                                 │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  LINE ITEMS SAVE ERROR HANDLING (useLineItemsSave)                       │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  try {                                                              │ │
│  │    await saveLineItems(items);                                     │ │
│  │  } catch (error) {                                                  │ │
│  │    // Keep items in dirty state                                    │ │
│  │    // Show error banner                                            │ │
│  │    setError(error.message);                                        │ │
│  │    // User can retry                                               │ │
│  │  }                                                                  │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  EXTRACTION API ERROR HANDLING                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  Response pattern (all API routes):                                │ │
│  │  {                                                                  │ │
│  │    success: boolean,                                               │ │
│  │    data?: T,                                                       │ │
│  │    error?: string                                                  │ │
│  │  }                                                                  │ │
│  │                                                                     │ │
│  │  HTTP Status Codes:                                                │ │
│  │  • 200 - Success                                                   │ │
│  │  • 400 - Bad Request (missing params)                              │ │
│  │  • 404 - Not Found                                                 │ │
│  │  • 500 - Internal Server Error                                     │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

RECOVERY STRATEGIES:

┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  1. OPTIMISTIC UI + ROLLBACK                                             │
│     • Apply change locally immediately                                   │
│     • Sync to server in background                                       │
│     • Rollback if server rejects                                         │
│                                                                           │
│  2. DRAFT SYSTEM                                                         │
│     • User edits saved to draft tables                                   │
│     • Original data preserved in validated tables                        │
│     • Can always reset to original                                       │
│                                                                           │
│  3. UNDO/REDO STACK                                                      │
│     • Every edit pushed to history                                       │
│     • Cmd+Z reverses last action                                         │
│     • Works even after server sync                                       │
│                                                                           │
│  4. STATUS-BASED WORKFLOWS                                               │
│     • Each stage recorded in database                                    │
│     • Can resume from any stage                                          │
│     • Failed jobs can be retried                                         │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Troubleshooting Quick Reference

| Symptom | Likely Cause | Where to Check |
|---------|--------------|----------------|
| **Field not showing in form** | `show_if_conditions` mismatch | `trade_configurations` table + [ProductConfigStep.tsx:273-481](components/project-form/ProductConfigStep.tsx#L273) |
| **Field shows but shouldn't** | Missing/incorrect `show_if_product_attributes` | `trade_configurations.show_if_product_attributes` + product's `physical_properties` |
| **Product options empty** | `catalog_filter` not matching | `trade_configurations.catalog_filter` vs `product_catalog` data |
| **Takeoff missing items** | Auto-scope rule not matching | `siding_auto_scope_rules` or `labor_auto_scope_rules` + n8n workflow |
| **Detection not saving** | RLS policy or sync issue | `extraction_detections_draft` + [useDetectionSync.ts](lib/hooks/useDetectionSync.ts) |
| **Webhook not responding** | n8n workflow error or URL mismatch | Check n8n execution logs + `NEXT_PUBLIC_N8N_WEBHOOK_URL` |
| **Extraction stuck** | Claude API error or timeout | `/api/extract-*` route logs + `ANTHROPIC_API_KEY` |
| **PDF upload fails** | Storage bucket permissions | Supabase Storage `hover-pdfs` bucket RLS policies |
| **Realtime not updating** | Channel subscription issue | Supabase Realtime dashboard + [useTakeoffData.ts](lib/hooks/useTakeoffData.ts) |
| **Excel export empty** | Line items not fetched | `takeoff_line_items` query + [excelExportProfessional.ts](lib/utils/excelExportProfessional.ts) |
| **Auth bypass not working** | Env var not set | `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` in `.env.local` |
| **Wrong products showing** | Manufacturer filter not applied | Dynamic filtering in ProductConfigStep for `window_series` |

### Debugging Commands

```bash
# Check Supabase connection
npx supabase status

# Verify env vars are loaded
echo $NEXT_PUBLIC_SUPABASE_URL

# Check API route logs
# (View terminal running next dev)

# Test webhook manually
curl -X POST https://n8n-production-293e.up.railway.app/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Common Configuration Fixes

**Field not visible despite conditions being met:**
```sql
-- Check the exact value stored
SELECT config_name, show_if_conditions, show_if_product_attributes
FROM trade_configurations
WHERE config_name = 'colorplus_color';

-- Verify product has required attribute
SELECT id, product_name, physical_properties
FROM product_catalog
WHERE id = 'selected-product-uuid';
-- Should have: { "is_colorplus": true }
```

**Auto-scope rule not triggering:**
```sql
-- Check rule is active and trigger matches
SELECT rule_name, trigger_type, trigger_value, active
FROM siding_auto_scope_rules
WHERE trigger_value LIKE '%belly_band%';
```

---

## 11. Integration Points Summary

| Source | Target | Method | Data |
|--------|--------|--------|------|
| **Frontend** | Supabase DB | SDK | CRUD operations |
| **Frontend** | Supabase Storage | SDK | PDF upload/download |
| **Frontend** | Supabase Realtime | WebSocket | Live updates |
| **Frontend** | API Routes | HTTP | Extraction requests |
| **Frontend** | n8n Webhooks | HTTP | Detection edits, project submit |
| **API Routes** | Anthropic | SDK | Vision extraction |
| **API Routes** | Supabase | SDK | Data persistence |
| **n8n** | Supabase | HTTP | Status updates, data inserts |
| **n8n** | Extraction API | HTTP | Linear calculations |
| **n8n** | Roboflow | HTTP | Object detection |
| **Extraction API** | Supabase | HTTP | Data queries |

---

## Quick Reference: Key Files

| Flow | Key Files |
|------|-----------|
| **Project Creation** | [ProjectForm.tsx](components/project-form/ProjectForm.tsx), [HoverUploadStep.tsx](components/project-form/HoverUploadStep.tsx) |
| **Trade Configuration** | [ProductConfigStep.tsx](components/project-form/ProductConfigStep.tsx), `trade_configurations` table |
| **PDF Processing** | n8n workflows (external) |
| **Extraction** | [app/api/extract-*/route.ts](app/api/) |
| **Detection Editor** | [DetectionEditor.tsx](components/detection-editor/DetectionEditor.tsx), [useExtractionData.ts](lib/hooks/useExtractionData.ts) |
| **Detection Sync** | [useDetectionSync.ts](lib/hooks/useDetectionSync.ts) |
| **Takeoff Generation** | n8n workflows, [useTakeoffData.ts](lib/hooks/useTakeoffData.ts) |
| **Estimate Editing** | [app/projects/[id]/page.tsx](app/projects/), [useLineItemsSave.ts](lib/hooks/useLineItemsSave.ts) |
| **Excel Export** | [excelExportProfessional.ts](lib/utils/excelExportProfessional.ts) |
| **Auto-Scope Rules** | `siding_auto_scope_rules`, `labor_auto_scope_rules` tables |

---

*Last Updated: January 2025*
