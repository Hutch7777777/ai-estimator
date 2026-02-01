# External API Services Documentation

This document provides comprehensive documentation for all external API services used by the AI Estimator application, including Railway-hosted services, third-party APIs, and internal API routes.

---

## Table of Contents

1. [External Service Inventory](#external-service-inventory)
2. [Anthropic Claude API](#anthropic-claude-api)
3. [Extraction API (Railway)](#extraction-api-railway)
4. [n8n Workflow Engine](#n8n-workflow-engine)
5. [Supabase Backend](#supabase-backend)
6. [Internal API Routes](#internal-api-routes)
7. [Environment Variables Reference](#environment-variables-reference)
8. [API Contract Examples](#api-contract-examples)

---

## External Service Inventory

| Service | Type | Base URL | Environment Variable | Status |
|---------|------|----------|---------------------|--------|
| **Anthropic Claude** | Vision AI | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` | Active |
| **Extraction API** | Custom Backend | `https://extraction-api-production.up.railway.app` | `NEXT_PUBLIC_EXTRACTION_API_URL` | Active |
| **n8n** | Workflow Engine | `https://n8n-production-293e.up.railway.app` | `NEXT_PUBLIC_N8N_WEBHOOK_URL` | Configured |
| **Supabase** | BaaS (DB/Auth/Storage) | `https://okwtyttfqbfmcqtenize.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` | Active |

---

## Anthropic Claude API

### Overview

The application uses Anthropic's Claude Sonnet 4 model for all vision-based PDF extraction tasks. Claude processes construction plan images and extracts structured data including schedules, floor plans, material callouts, and more.

**SDK:** `@anthropic-ai/sdk`
**Model:** `claude-sonnet-4-20250514`
**Authentication:** API Key (server-side only)

### Endpoints (via SDK)

All Claude API calls go through the Anthropic SDK, which communicates with `https://api.anthropic.com/v1/messages`.

### Internal API Routes Using Claude

| Route | Method | Purpose | Max Tokens |
|-------|--------|---------|------------|
| `/api/extract-schedule` | POST | Extract window/door schedules | 4096 |
| `/api/analyze-schedule-structure` | POST | Analyze table structure (Pass 1) | 2048 |
| `/api/extract-floor-plan` | POST | Extract building geometry | 4096 |
| `/api/extract-material-callouts` | POST | Extract material specifications | 4096 |
| `/api/extract-wall-assembly` | POST | Extract wall construction layers | 4096 |
| `/api/extract-roof-plan` | POST | Extract roofing data | 4096 |
| `/api/extract-notes-specs` | POST | Extract all specifications | 8192 |

### Request Pattern

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'url',
            url: imageUrl,
          },
        },
        {
          type: 'text',
          text: promptText,
        },
      ],
    },
  ],
});
```

### Response Tracking

All Claude API responses include token usage tracking:

```typescript
interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}
```

---

## Extraction API (Railway)

### Overview

A custom Python backend service hosted on Railway that handles advanced extraction processing including linear element calculations, wall height analysis, and siding polygon generation.

**Base URL:** `https://extraction-api-production.up.railway.app`
**Environment Variable:** `NEXT_PUBLIC_EXTRACTION_API_URL`

### Endpoints

#### GET `/wall-heights`

Retrieves OCR-extracted or estimated wall height data for a job.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | string | Yes | Extraction job UUID |

**Response:**
```typescript
interface WallHeightsResponse {
  wall_heights: WallHeightsData | null;
}

interface WallHeightsData {
  default_height_ft: number;
  heights_by_elevation: Record<string, number>;
  source: 'ocr' | 'estimated' | 'manual';
  confidence: number;
}
```

---

#### POST `/calculate-linear`

Triggers linear element calculation on the backend and returns results.

**Request Body:**
```typescript
interface CalculateLinearRequest {
  job_id: string;
}
```

**Response:**
```typescript
interface Phase4Data {
  wall_heights: WallHeightsData;
  linear_summary: {
    total_perimeter_lf: number;
    total_corners_inside: number;
    total_corners_outside: number;
    total_trim_lf: number;
    by_elevation: Record<string, {
      perimeter_lf: number;
      corners_inside: number;
      corners_outside: number;
    }>;
  };
  calculated_at: string;
}
```

---

#### GET `/linear-summary`

Retrieves cached linear summary if already calculated.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | string | Yes | Extraction job UUID |

**Response:** `Phase4Data | null` (404 if not calculated)

---

#### POST `/siding-polygons`

Returns polygon coordinates for rendering net siding area overlay on elevation drawings.

**Request Body:**
```typescript
interface SidingPolygonsRequest {
  page_id: string;
}
```

**Response:**
```typescript
interface SidingPolygonResponse {
  success: boolean;
  page_id: string;

  // Legacy format (first building only, backwards compatibility)
  exterior: {
    points: [number, number][];
    gross_facade_sf: number;
  };
  holes: SidingHole[];
  summary: SidingSummary;

  // New multi-building format
  siding_polygons?: SidingPolygon[];
  page_summary?: {
    total_buildings: number;
    total_net_siding_sf: number;
  };
}

interface SidingHole {
  class: string;           // e.g., 'window', 'door', 'garage'
  points: [number, number][];
  area_sf: number;
}

interface SidingSummary {
  building_sf: number;
  roof_sf: number;
  gross_facade_sf: number;
  openings_sf: number;
  net_siding_sf: number;
  opening_count: number;
}

interface SidingPolygon {
  building_id: string;
  exterior: {
    points: [number, number][];
    gross_facade_sf: number;
  };
  holes: SidingHole[];
  summary: SidingSummary;
}
```

### Client Library

The Extraction API client is implemented in [lib/api/extractionApi.ts](lib/api/extractionApi.ts):

```typescript
import {
  getWallHeights,
  calculateLinearElements,
  getLinearSummary,
  getPhase4Data,
  getSidingPolygons,
} from '@/lib/api/extractionApi';

// Get all Phase 4 data (caches if available, calculates if not)
const phase4 = await getPhase4Data(jobId);

// Get siding polygons for overlay rendering
const polygons = await getSidingPolygons(pageId);
```

---

## n8n Workflow Engine

### Overview

n8n is configured as a workflow automation engine for background processing tasks, particularly Excel generation. Currently configured but not actively used in the codebase.

**Base URL:** `https://n8n-production-293e.up.railway.app`
**Environment Variable:** `NEXT_PUBLIC_N8N_WEBHOOK_URL`

### Planned Integration

```typescript
// Trigger background Excel generation workflow
await fetch(process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: projectId,
    action: 'generate_excel',
    // n8n will fetch full project data from Supabase
  }),
});
```

### Status

- **Configured:** Yes
- **Active:** No (marked as future enhancement)
- **Purpose:** Async Excel generation, background processing

---

## Supabase Backend

### Overview

Supabase provides the primary backend infrastructure including PostgreSQL database, authentication, file storage, and realtime subscriptions.

**Project URL:** `https://okwtyttfqbfmcqtenize.supabase.co`

### Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Anonymous/public API key |

### Services Used

1. **PostgreSQL Database** - Primary data storage
2. **Storage** - PDF and image file storage (`hover-pdfs` bucket)
3. **Realtime** - Live subscription to table changes
4. **Row Level Security** - Multi-tenant data isolation

### Client Libraries

```typescript
// Browser client (Client Components)
import { createClient } from '@/lib/supabase/client';
const supabase = createClient();

// Server client (Server Components/API Routes)
import { createClient } from '@/lib/supabase/server';
const supabase = await createClient();
```

---

## Internal API Routes

### Data Management Routes

#### GET `/api/extraction-jobs`

Fetch extraction jobs for a project.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | Yes | Project UUID |

**Response:**
```typescript
interface ExtractionJobsResponse {
  success: boolean;
  jobs: ExtractionJobRecord[];
}

interface ExtractionJobRecord {
  id: string;
  project_id: string | null;
  project_name: string | null;
  status: string;
  total_pages: number;
  elevation_count: number;
  created_at: string;
  completed_at: string | null;
}
```

---

#### GET `/api/extraction-pages`

Fetch extraction pages with detections for a project or job.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | No | Project UUID (one of project_id or job_id required) |
| `job_id` | string | No | Job UUID |
| `page_type` | string | No | Filter by page type (default: 'elevation') |

**Response:**
```typescript
interface ExtractionPagesResponse {
  success: boolean;
  job_id: string;
  detection_source: 'draft (user edits)' | 'validated (raw Roboflow)' | 'ai_original' | 'none';
  pages: ExtractionPageWithDetections[];
}

interface ExtractionPageWithDetections {
  id: string;
  page_number: number;
  page_type: string | null;
  elevation_name: string | null;
  image_url: string;
  thumbnail_url: string | null;
  ocr_data: Record<string, unknown> | null;
  ocr_status: string | null;
  ocr_processed_at: string | null;
  detections: Detection[];
}
```

**Detection Priority:**
1. `extraction_detections_draft` (user edits from Detection Editor)
2. `extraction_detections_validated` (Roboflow validated)
3. `extraction_detection_details` (original AI detections)

---

### Claude Extraction Routes

#### POST `/api/extract-schedule`

Extract window/door schedules from construction plan images.

**Request Body:**
```typescript
interface ExtractScheduleRequest {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  structure?: ScheduleStructure; // From analyze-schedule-structure
}
```

**Response:**
```typescript
interface ExtractScheduleResponse {
  success: boolean;
  pageId: string;
  data: ScheduleOCRData;
  used_targeted_prompt?: boolean;
}

interface ScheduleOCRData {
  windows: ScheduleWindow[];
  doors: ScheduleDoor[];
  skylights: ScheduleSkylight[];
  garages: ScheduleGarage[];
  totals: {
    windows: number;
    doors: number;
    skylights: number;
    garages: number;
  };
  confidence: number;
  extraction_notes: string;
  is_schedule_page: boolean;
  extracted_at: string;
  model_used: string;
  tokens_used: number;
}

interface ScheduleWindow {
  mark: string;
  width: string;
  height: string;
  type: string;
  quantity: number;
  notes?: string;
}

interface ScheduleDoor {
  mark: string;
  size: string;
  type: string;
  quantity: number;
  notes?: string;
}
```

---

#### POST `/api/analyze-schedule-structure`

Analyze table structure without extracting data (Pass 1 of two-pass extraction).

**Request Body:**
```typescript
interface AnalyzeStructureRequest {
  pageId: string;
  imageUrl: string;
}
```

**Response:**
```typescript
interface AnalyzeStructureResponse {
  success: boolean;
  pageId: string;
  structure: StructureAnalysisResult;
  tokens_used: number;
}

interface StructureAnalysisResult {
  window_schedule: ScheduleStructure | null;
  door_schedule: ScheduleStructure | null;
  skylight_schedule: ScheduleStructure | null;
  garage_schedule: ScheduleStructure | null;
}

interface ScheduleStructure {
  exists: boolean;
  header_row_count?: number;
  column_headers?: string[];
  column_count?: number;
  size_format?: 'split' | 'combined';
  mark_column?: number;
  type_column?: number;
  quantity_column?: number | null;
  data_row_count?: number;
  sample_rows?: SampleRow[];
}
```

---

#### POST `/api/extract-floor-plan`

Extract building geometry from floor plan images.

**Request Body:**
```typescript
interface ExtractFloorPlanRequest {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  pageNumber?: number;
  scaleNotation?: string;
}
```

**Response:**
```typescript
interface ExtractFloorPlanResponse {
  success: boolean;
  pageId: string;
  floorPlan: FloorPlanData;
  tokens_used: number;
}

interface FloorPlanData {
  id: string;
  pageRef: string;
  floorLevel: 'crawlspace' | 'basement' | 'main' | 'second' | 'third' | 'fourth' | 'garage' | 'unknown';
  floorAreaSF: number | null;
  exteriorPerimeterLF: number | null;
  wallSegments: ExteriorWallSegment[];
  corners: ExteriorCorner[];
  cornerSummary: CornerSummary;
  windowCount: number;
  doorCount: number;
  garageDoorCount: number;
  overallWidth: number | null;
  overallDepth: number | null;
  scale: string | null;
  confidence: number;
  confidenceNotes: string;
  extractionNotes: string;
  extractedAt: string;
  model_used: string;
  tokens_used: number;
}
```

---

#### POST `/api/extract-material-callouts`

Extract material specifications from elevation drawings.

**Request Body:**
```typescript
interface ExtractMaterialCalloutsRequest {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  pageNumber?: number;
}
```

**Response:**
```typescript
interface ExtractMaterialCalloutsResponse {
  success: boolean;
  pageId: string;
  data: {
    callouts: MaterialCallout[];
    summary: string;
    extraction_confidence: number;
  };
  tokens_used: number;
}

interface MaterialCallout {
  id: string;
  rawText: string;
  normalizedText: string;
  trade: string;
  materialType?: string;
  manufacturer?: string;
  productMatch?: string;
  confidence: number;
  pageRef?: string;
}
```

---

#### POST `/api/extract-wall-assembly`

Extract wall construction layers from section drawings.

**Request Body:**
```typescript
interface ExtractWallAssemblyRequest {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  pageNumber?: number;
}
```

**Response:**
```typescript
interface ExtractWallAssemblyResponse {
  success: boolean;
  pageId: string;
  data: WallAssemblyExtractionResult;
  tokens_used: number;
}

interface WallAssemblyExtractionResult {
  hasWallSections: boolean;
  assemblies: WallAssembly[];
  sectionDetails: Array<{
    sectionTitle: string;
    sectionNumber: string | null;
    scale: string | null;
  }>;
  extractedAt: string;
  modelUsed: string;
  tokensUsed: number;
  processingTimeMs: number;
  extractionNotes: string | null;
}

interface WallAssembly {
  id: string;
  name: string;
  layers: WallLayer[];
  totalThickness: number;
  rValue?: number;
}
```

---

#### POST `/api/extract-roof-plan`

Extract roofing data from roof plan images.

**Request Body:**
```typescript
interface ExtractRoofPlanRequest {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  pageNumber?: number;
  scaleNotation?: string;
}
```

**Response:**
```typescript
interface ExtractRoofPlanResponse {
  success: boolean;
  pageId: string;
  roofPlan: RoofPlanData;
  tokens_used: number;
}

interface RoofPlanData {
  id: string;
  pageRef: string;
  primaryPitch: string | null;
  totalRoofAreaSF: number | null;
  slopes: RoofSlope[];
  linearElements: RoofLinearElement[];
  linearSummary: RoofLinearSummary;
  features: RoofFeature[];
  materialCallouts: RoofMaterialCallout[];
  confidence: number;
  confidenceNotes: string;
  extractionNotes: string;
  extractedAt: string;
  model_used: string;
  tokens_used: number;
}
```

---

#### POST `/api/extract-notes-specs`

Extract ALL specifications relevant to exterior finishing from multiple pages.

**Request Body:**
```typescript
interface ExtractNotesSpecsRequest {
  job_id: string;
  include_all_pages?: boolean;
}
```

**Response:**
```typescript
interface ExtractNotesSpecsResponse {
  success: boolean;
  data: NotesSpecsData;
}

interface NotesSpecsData {
  summary: string;
  notes: TakeoffNote[];
  categories: Record<string, number>;
  pages_analyzed: number;
  extracted_at: string;
  version: string;
  model_used: string;
  tokens_used: number;
  confidence: number;
  confidenceNotes: string;
}

interface TakeoffNote {
  id: string;
  category: TakeoffNoteCategory;
  item: string;
  details: string;
  importance: 'critical' | 'recommended' | 'optional';
  source_page?: string;
  verified: boolean;
}

type TakeoffNoteCategory =
  | 'siding_specs'
  | 'trim_details'
  | 'flashing_waterproofing'
  | 'weather_barrier'
  | 'fasteners_adhesives'
  | 'code_requirements'
  | 'installation_notes'
  | 'special_conditions';
```

---

#### POST `/api/generate-rfi`

Generate RFI (Request for Information) items from missing specifications.

**Request Body:**
```typescript
interface GenerateRFIRequest {
  job_id: string;
}
```

**Response:**
```typescript
interface GenerateRFIResponse {
  success: boolean;
  data?: RFIListData;
  error?: string;
}

interface RFIListData {
  id: string;
  job_id: string;
  items: RFIItem[];
  summary: RFISummary;
  generated_at: string;
  updated_at: string;
  version: string;
}

interface RFIItem {
  id: string;
  source_note_id?: string;
  category: TakeoffNoteCategory;
  question: string;
  details?: string;
  impact: string;
  suggested_default?: string;
  resolution?: string;
  status: 'unresolved' | 'will_clarify' | 'resolved' | 'not_applicable';
  priority: 'high' | 'medium' | 'low';
  source_page?: string;
}
```

---

## Environment Variables Reference

### Required Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous key | `eyJhbGci...` |
| `ANTHROPIC_API_KEY` | **Server-only** | Anthropic API key | `sk-ant-...` |

### Optional Variables

| Variable | Type | Description | Default |
|----------|------|-------------|---------|
| `NEXT_PUBLIC_EXTRACTION_API_URL` | Public | Extraction API base URL | `https://extraction-api-production.up.railway.app` |
| `NEXT_PUBLIC_N8N_WEBHOOK_URL` | Public | n8n webhook URL | (none) |
| `NEXT_PUBLIC_DEV_BYPASS_AUTH` | Public | Bypass auth in development | `false` |

### Environment File Template

```bash
# .env.local

# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Anthropic Claude (REQUIRED - Server-side only)
ANTHROPIC_API_KEY=sk-ant-your-key

# Extraction API (Optional - has default)
NEXT_PUBLIC_EXTRACTION_API_URL=https://extraction-api-production.up.railway.app

# n8n Webhook (Optional)
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://your-n8n-instance.up.railway.app

# Development Only
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

---

## API Contract Examples

### Example: Extract Schedule Flow

```typescript
// 1. Analyze schedule structure (Pass 1)
const structureResponse = await fetch('/api/analyze-schedule-structure', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pageId: 'page-123',
    imageUrl: 'https://storage.supabase.co/...',
  }),
});

const { structure } = await structureResponse.json();

// 2. Extract schedule data using structure (Pass 2)
const extractResponse = await fetch('/api/extract-schedule', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pageId: 'page-123',
    imageUrl: 'https://storage.supabase.co/...',
    jobId: 'job-456',
    structure: structure, // Use analyzed structure for targeted extraction
  }),
});

const { data } = await extractResponse.json();
// data.windows, data.doors, etc.
```

### Example: Get Siding Polygons for Overlay

```typescript
import { getSidingPolygons } from '@/lib/api/extractionApi';

// Fetch polygon data for rendering
const polygonData = await getSidingPolygons(pageId);

if (polygonData?.success) {
  // Render building exterior
  const exterior = polygonData.exterior.points;

  // Render holes (windows, doors, etc.)
  for (const hole of polygonData.holes) {
    console.log(`${hole.class}: ${hole.area_sf} SF`);
    // Render hole.points as cutout
  }

  // Show summary
  console.log(`Net Siding: ${polygonData.summary.net_siding_sf} SF`);
}
```

### Example: Full Phase 4 Data Fetch

```typescript
import { getPhase4Data } from '@/lib/api/extractionApi';

// Get complete Phase 4 data (wall heights + linear summary)
const phase4 = await getPhase4Data(jobId);

if (phase4) {
  console.log(`Wall Height: ${phase4.wall_heights.default_height_ft} ft`);
  console.log(`Total Perimeter: ${phase4.linear_summary.total_perimeter_lf} LF`);
  console.log(`Outside Corners: ${phase4.linear_summary.total_corners_outside}`);
}
```

---

## Error Handling

All API routes follow a consistent error response pattern:

```typescript
interface ErrorResponse {
  success: false;
  error: string;
}

// HTTP Status Codes
// 400 - Bad Request (missing required parameters)
// 404 - Not Found (resource doesn't exist)
// 500 - Internal Server Error
```

### Example Error Handling

```typescript
try {
  const response = await fetch('/api/extract-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageId, imageUrl }),
  });

  const data = await response.json();

  if (!data.success) {
    console.error('Extraction failed:', data.error);
    // Handle error appropriately
    return;
  }

  // Process successful response
  return data.data;
} catch (error) {
  console.error('Network error:', error);
  // Handle network failure
}
```

---

## Security Considerations

1. **API Key Protection:** `ANTHROPIC_API_KEY` is server-side only and never exposed to the browser
2. **Row Level Security:** Supabase RLS policies ensure multi-tenant data isolation
3. **Dev Bypass Warning:** `NEXT_PUBLIC_DEV_BYPASS_AUTH` must NEVER be enabled in production
4. **HTTPS Only:** All external service communications use HTTPS

---

## Rate Limits & Quotas

### Anthropic Claude

- Model: `claude-sonnet-4-20250514`
- Token tracking enabled on all requests
- See [Anthropic documentation](https://docs.anthropic.com) for current rate limits

### Supabase

- Subject to Supabase plan limits
- Realtime connections limited by plan
- Storage subject to bucket policies

---

## Monitoring & Debugging

### Token Usage Tracking

All Claude API responses include token usage for cost monitoring:

```typescript
// Available in all extract-* route responses
{
  tokens_used: number;  // Total tokens (input + output)
  model_used: string;   // Model identifier
}
```

### Logging

All API routes include detailed console logging:

```typescript
// Example log output
[extraction-pages] API called at: 2025-01-31T12:00:00.000Z
[extraction-pages] Project ID: abc-123
[extraction-pages] Returning DRAFT data - NOT querying validated or AI
```

---

*Last Updated: January 2025*
