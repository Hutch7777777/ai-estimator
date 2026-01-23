# Extraction Architecture Analysis

## Executive Summary

This document analyzes the extraction/measurement architecture in the AI Estimator codebase to understand data flow, calculations, and gaps for designing a calculation engine API.

**Key Findings:**
1. **Polygon-based measurement system** with support for simple polygons, holes, and lines
2. **Class-specific derived measurements** (head/sill/jamb for windows, rake for gables)
3. **Two-layer aggregation**: page-level (`liveDerivedTotals`) and job-level (`allPagesTotals`)
4. **Webhook-based calculation** via n8n (external black box)
5. **Several data gaps** that impact calculation accuracy

---

## 1. Available Measurements from Extraction Layer

### 1.1 Detection Classes & Measurement Types

| Category | Classes | Measurement Type | Unit |
|----------|---------|------------------|------|
| **Area** | `siding`, `window`, `door`, `garage`, `roof`, `gable` | Square footage | SF |
| **Linear** | `trim`, `fascia`, `gutter`, `eave`, `rake`, `ridge`, `soffit`, `valley` | Linear feet | LF |
| **Count/Point** | `vent`, `flashing`, `downspout`, `outlet`, `hose_bib`, `light_fixture`, `corbel`, `gable_vent`, `belly_band`, `corner_inside`, `corner_outside`, `shutter`, `post`, `column`, `bracket` | Each | EA |
| **Internal** | `building`, `exterior_wall` | Area + perimeter | SF/LF |

**Source**: [lib/types/extraction.ts:42-74](lib/types/extraction.ts#L42-L74)

### 1.2 Core Detection Data Structure

```typescript
// From lib/types/extraction.ts (lines 221-277)
interface ExtractionDetection {
  // Identification
  id: string;
  job_id: string;
  page_id: string;
  class: DetectionClass;
  detection_index: number;
  confidence: number;

  // Pixel coordinates (raw from ML model)
  pixel_x: number;      // Center X
  pixel_y: number;      // Center Y
  pixel_width: number;
  pixel_height: number;

  // Real-world measurements (calculated from scale)
  real_width_in: number | null;
  real_height_in: number | null;
  real_width_ft: number | null;
  real_height_ft: number | null;
  area_sf: number | null;
  perimeter_lf: number | null;

  // Polygon support (arbitrary shapes)
  polygon_points?: PolygonPoints | null;
  has_hole?: boolean;
  markup_type?: 'polygon' | 'line' | 'point';

  // Product assignment
  assigned_material_id?: string | null;

  // Status tracking
  status: 'auto' | 'verified' | 'edited' | 'deleted';
  original_bbox: {...} | null;
}
```

### 1.3 Polygon Points Structure

```typescript
// Simple polygon (most common)
type SimplePolygonPoint = { x: number; y: number };

// Polygon with holes (from split/subtraction tool)
interface PolygonWithHoles {
  outer: SimplePolygonPoint[];     // Clockwise
  holes?: SimplePolygonPoint[][];  // Counter-clockwise
}

type PolygonPoints = SimplePolygonPoint[] | PolygonWithHoles;
```

**Source**: [lib/types/extraction.ts:15-28](lib/types/extraction.ts#L15-L28)

---

## 2. Data Flow: Extraction to Calculation

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: ML DETECTION                                          │
│ Backend extracts: pixel_x/y/width/height, class, confidence    │
│ Output: ExtractionDetection[] stored in extraction_detections  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2: SCALE CALIBRATION (User in Detection Editor)          │
│ User marks known measurement → derives scale_ratio              │
│ scale_ratio = pixels_per_foot (e.g., 64 px = 1 ft)              │
│ Stored in: ExtractionPage.scale_ratio                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: POLYGON MATH (polygonUtils.ts)                        │
│ • Shoelace formula: area_sf = |Σ(x·y - x'·y')| / (2·SR²)        │
│ • Edge distance: perimeter_lf = Σ distance(p_i, p_i+1) / SR    │
│ • Bounding box & centroid calculations                         │
│ Source: lib/utils/polygonUtils.ts:86-162                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4: CLASS-SPECIFIC DERIVED MEASUREMENTS                   │
│ WINDOW: head_lf, sill_lf, jamb_lf (by Y-coordinate sorting)    │
│ DOOR: head_lf, jamb_lf (no sill - touches floor)               │
│ GARAGE: head_lf, jamb_lf (same as door)                        │
│ GABLE: rake_lf (sloped edges only), base_lf                    │
│ BUILDING: area_sf, perimeter_lf, level_starter_lf              │
│ Source: lib/utils/polygonUtils.ts:462-631                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 5: PAGE-LEVEL AGGREGATION (liveDerivedTotals)            │
│ DetectionEditor.tsx lines 1551-1852                            │
│ Aggregates all detections on current page by class             │
│ Calculates: counts, areas, perimeters, derived measurements    │
│ Computes: net_siding_sf = building_area - openings             │
│ Auto-calculates corners from exterior wall polygons            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 6: JOB-LEVEL AGGREGATION (allPagesTotals)                │
│ DetectionEditor.tsx lines 1855-2037                            │
│ Sums page totals across all elevation pages                    │
│ Only includes pages with page_type='elevation' and valid scale │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 7: APPROVAL PAYLOAD (buildApprovePayload)                │
│ DetectionEditor.tsx lines 2044-2191                            │
│ Transforms totals to ApprovePayload structure                  │
│ Determines selected_trades from material assignments           │
│ Sends to n8n webhook for line item generation                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 8: n8n CALCULATION ENGINE (External Black Box)           │
│ Applies auto-scope rules                                        │
│ Generates takeoff line items with pricing                      │
│ Returns: takeoff_id, line items, totals                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Current Calculated vs Passed Through Data

### 3.1 Calculated in Frontend

| Measurement | Calculation | Source Location |
|-------------|-------------|-----------------|
| `area_sf` | Shoelace formula on polygon | `polygonUtils.ts:86-114` |
| `perimeter_lf` | Sum of edge distances | `polygonUtils.ts:136-162` |
| `window.head_lf` | Top edge (sorted by Y) | `polygonUtils.ts:462-509` |
| `window.sill_lf` | Bottom edge (sorted by Y) | `polygonUtils.ts:462-509` |
| `window.jamb_lf` | Left + right edges | `polygonUtils.ts:462-509` |
| `door.head_lf` | Top edge | `polygonUtils.ts:515-546` |
| `door.jamb_lf` | Vertical edges (no sill) | `polygonUtils.ts:515-546` |
| `gable.rake_lf` | Two sloped edges | `polygonUtils.ts:568-606` |
| `building.level_starter_lf` | Bottom horizontal edge | `polygonUtils.ts:651-697` |
| `net_siding_sf` | `building_area - Σ(openings)` | `DetectionEditor.tsx:1744` |
| `outside_corner_lf` | Auto from wall boundaries | `DetectionEditor.tsx:1746-1848` |
| `inside_corner_lf` | Auto from wall gaps | `DetectionEditor.tsx:1746-1848` |

### 3.2 Passed Through (No Additional Calculation)

| Data | Notes |
|------|-------|
| Detection count | Simple aggregation |
| Confidence scores | From ML model |
| Product assignments | User selection |
| Page metadata | DPI, scale_ratio, page_type |

### 3.3 Calculated in n8n (External)

| Calculation | Presumed Logic |
|-------------|----------------|
| Material quantities | Based on auto-scope rules |
| Waste factors | By product category |
| Pricing | From product catalog |
| Labor costs | By area/LF rates |
| Line item generation | Trade-specific formulas |

---

## 4. Exact Data Structures at Each Step

### 4.1 LiveDerivedTotals (Page/Job Level)

```typescript
// From lib/types/extraction.ts (lines 911-969)
interface LiveDerivedTotals {
  // FACADE
  buildingCount: number;
  buildingAreaSf: number;
  buildingPerimeterLf: number;
  buildingLevelStarterLf: number;

  // WINDOWS
  windowCount: number;
  windowAreaSf: number;
  windowPerimeterLf: number;
  windowHeadLf: number;
  windowJambLf: number;
  windowSillLf: number;

  // DOORS
  doorCount: number;
  doorAreaSf: number;
  doorPerimeterLf: number;
  doorHeadLf: number;
  doorJambLf: number;

  // GARAGES
  garageCount: number;
  garageAreaSf: number;
  garagePerimeterLf: number;
  garageHeadLf: number;
  garageJambLf: number;

  // GABLES
  gableCount: number;
  gableAreaSf: number;
  gableRakeLf: number;

  // CORNERS
  insideCornerCount: number;
  insideCornerLf: number;
  outsideCornerCount: number;
  outsideCornerLf: number;

  // ROOFLINE (line-type)
  eavesCount: number;
  eavesLf: number;
  rakesCount: number;
  rakesLf: number;
  ridgeCount: number;
  ridgeLf: number;
  valleyCount: number;
  valleyLf: number;

  // OTHER
  soffitCount: number;
  soffitAreaSf: number;
  fasciaCount: number;
  fasciaLf: number;
  gutterCount: number;
  gutterLf: number;
  downspoutCount: number;

  // NET SIDING
  sidingNetSf: number;

  // POINT MARKERS
  countsByClass: Record<string, number>;
  totalPointCount: number;
}
```

### 4.2 ApprovePayload (Sent to n8n)

```typescript
// From lib/types/extraction.ts (lines 975-1042)
interface ApprovePayload {
  job_id: string;
  project_id?: string;
  project_name?: string;
  selected_trades: string[];  // ['siding', 'windows', 'gutters']

  facade: {
    gross_area_sf: number;
    net_siding_sf: number;
    perimeter_lf: number;
    level_starter_lf: number;
  };

  windows: {
    count: number;
    area_sf: number;
    perimeter_lf: number;
    head_lf: number;
    jamb_lf: number;
    sill_lf: number;
  };

  doors: {
    count: number;
    area_sf: number;
    perimeter_lf: number;
    head_lf: number;
    jamb_lf: number;
  };

  garages: {
    count: number;
    area_sf: number;
    perimeter_lf: number;
    head_lf: number;
    jamb_lf: number;
  };

  trim: {
    total_head_lf: number;  // windows + doors + garages
    total_jamb_lf: number;
    total_sill_lf: number;  // windows only
    total_trim_lf: number;
  };

  corners: {
    outside_count: number;
    outside_lf: number;
    inside_count: number;
    inside_lf: number;
  };

  gables: {
    count: number;
    area_sf: number;
    rake_lf: number;
  };

  products: {
    color: string | null;
    profile: string;
  };
}
```

### 4.3 Phase4Data (Enhanced Data from Extraction API)

```typescript
// From lib/types/extraction.ts (lines 835-873)
interface Phase4Data {
  wall_heights: {
    first_floor_ft: number;
    second_floor_ft: number | null;
    total_wall_height_ft: number;
    story_count: number;
    source: 'ocr' | 'estimated';
  };

  corners: {
    outside_corners_count: number;
    inside_corners_count: number;
    outside_corners_lf: number;
    inside_corners_lf: number;
    total_corner_lf: number;
    corner_posts_needed: number;
    j_channel_pieces_needed: number;
    wall_height_used_ft: number;
  };

  perimeter: {
    building_perimeter_lf: number;
    starter_strip_lf: number;
    starter_strip_pieces: number;
    water_table_lf: number;
    band_board_lf: number;
    frieze_board_lf: number;
  };

  trim_totals?: {
    window_perimeter_lf: number;
    door_perimeter_lf: number;
    gable_rake_lf: number;
  };
}
```

---

## 5. Data Gaps & Missing Information

### 5.1 Gap: Edge Classification (Interior vs Exterior)

**Problem**: All edges treated equally, but siding trim only applies to exterior edges.

**Current State**:
- Window perimeter = head + sill + 2× jamb (all edges)
- No distinction when window shares edge with another opening

**Missing Data**:
```typescript
interface EdgeClassification {
  edge_index: number;
  edge_type: 'head' | 'sill' | 'jamb_left' | 'jamb_right';
  is_exterior: boolean;  // MISSING
  adjacent_detection_id?: string;  // MISSING
}
```

**Impact**: 5-15% overestimate of trim when openings are adjacent.

### 5.2 Gap: Wall Height Information

**Problem**: No wall height stored per detection or page.

**Current State**:
- Phase4Data has `wall_heights` but not linked to individual detections
- Level starter calculated but not multiplied by stories

**Missing Data**:
```typescript
interface WallContext {
  story_number: number;  // MISSING
  story_height_ft: number;  // MISSING
  total_stories: number;  // MISSING
  floor_to_floor_ft: number;  // MISSING
}
```

**Impact**: Cannot accurately calculate multi-story material quantities.

### 5.3 Gap: Corner Angle Information

**Problem**: Assumes 90° corners for all calculations.

**Current State**:
- `corner_inside`/`corner_outside` detected as points or lines
- No angle information stored

**Missing Data**:
```typescript
interface CornerDetails {
  angle_degrees: number;  // MISSING (default assumes 90)
  corner_type: 'vertical' | 'sloped';  // MISSING
  adjacent_wall_ids: [string, string];  // MISSING
}
```

**Impact**: Inaccurate corner post calculations for non-rectangular buildings.

### 5.4 Gap: Gable Measurements

**Problem**: Only rake_lf calculated; missing height and pitch.

**Current State**:
- Calculates sloped edges (rake_lf)
- Excludes base width
- No peak height

**Missing Data**:
```typescript
interface GableDetails {
  peak_height_ft: number;  // MISSING
  base_width_ft: number;  // available but not exposed
  roof_pitch: string;  // MISSING (e.g., "6:12")
  is_front_gable: boolean;  // MISSING
  is_rear_gable: boolean;  // MISSING
}
```

**Impact**: Cannot calculate gable siding separately from main wall.

### 5.5 Gap: Product-Specific Calculations

**Problem**: Generic area/LF calculations, no product-specific adjustments.

**Current State**:
- Raw measurements sent to n8n
- n8n presumably handles product specifics

**Missing Data**:
```typescript
interface ProductContext {
  siding_exposure_in: number;  // MISSING
  board_length_ft: number;  // MISSING
  overlap_in: number;  // MISSING
  waste_factor_percent: number;  // MISSING
  pieces_per_bundle: number;  // MISSING
}
```

**Impact**: Cannot calculate exact piece counts or optimize cuts.

### 5.6 Gap: Adjacency/Relationship Data

**Problem**: Each detection is isolated; no relationship tracking.

**Current State**:
- Detections have no links to adjacent detections
- Corner detection separate from wall detection

**Missing Data**:
```typescript
interface DetectionRelationships {
  parent_detection_id?: string;  // MISSING (e.g., wall contains window)
  adjacent_detection_ids: string[];  // MISSING
  shared_edges: {
    detection_id: string;
    edge_index: number;
    overlap_percent: number;
  }[];  // MISSING
}
```

**Impact**: Cannot optimize trim where openings share jambs.

### 5.7 Gap: Elevation Position Context

**Problem**: No tracking of detection position relative to facade.

**Current State**:
- pixel_x/y are absolute image coordinates
- No elevation identification (front/rear/left/right)

**Missing Data**:
```typescript
interface PositionContext {
  elevation_name: 'front' | 'rear' | 'left' | 'right';  // On page, not detection
  wall_section_id?: string;  // MISSING
  distance_to_left_corner_ft: number;  // MISSING
  distance_to_right_corner_ft: number;  // MISSING
  vertical_position: 'ground' | 'upper';  // MISSING
}
```

**Impact**: Cannot determine material runs or identify shared corners.

### 5.8 Gap: Hole/Subtraction Tracking

**Problem**: Holes created by split tool not tracked for material calculations.

**Current State**:
- `PolygonWithHoles` structure exists
- `has_hole` flag on detection
- But hole area not separately calculated

**Missing Data**:
```typescript
interface HoleData {
  hole_index: number;
  hole_area_sf: number;  // MISSING - calculated from outer only
  hole_perimeter_lf: number;  // MISSING
  created_from_detection_id?: string;  // MISSING
}
```

**Impact**: Net area calculation may be off when using split tool.

---

## 6. Key File References

| Component | File | Key Lines |
|-----------|------|-----------|
| Detection Types | [lib/types/extraction.ts](lib/types/extraction.ts) | 221-277 (ExtractionDetection), 911-969 (LiveDerivedTotals), 975-1042 (ApprovePayload) |
| Polygon Math | [lib/utils/polygonUtils.ts](lib/utils/polygonUtils.ts) | 86-114 (area), 136-162 (perimeter), 462-631 (class-specific) |
| Live Totals Calc | [components/detection-editor/DetectionEditor.tsx](components/detection-editor/DetectionEditor.tsx) | 1551-1852 (liveDerivedTotals), 1855-2037 (allPagesTotals) |
| Approval Payload | [components/detection-editor/DetectionEditor.tsx](components/detection-editor/DetectionEditor.tsx) | 2044-2191 (buildApprovePayload) |
| Takeoff Queries | [lib/supabase/takeoffs.ts](lib/supabase/takeoffs.ts) | Full file - DB operations |

---

## 7. Recommendations for Calculation Engine API

### 7.1 Enhanced Input Structure

```typescript
interface CalculationEngineInput {
  // Existing
  facade: ApprovePayload['facade'];
  windows: ApprovePayload['windows'];
  doors: ApprovePayload['doors'];
  garages: ApprovePayload['garages'];
  trim: ApprovePayload['trim'];
  corners: ApprovePayload['corners'];
  gables: ApprovePayload['gables'];

  // NEW: Wall context
  wall_heights: {
    stories: number;
    total_height_ft: number;
    heights_by_story: { story: number; height_ft: number }[];
  };

  // NEW: Individual detections with relationships
  detections: {
    id: string;
    class: string;
    measurements: {
      area_sf: number;
      perimeter_lf: number;
      derived: Record<string, number>;  // head_lf, jamb_lf, etc.
    };
    position: {
      elevation: 'front' | 'rear' | 'left' | 'right';
      story: number;
    };
    relationships: {
      adjacent_ids: string[];
      shared_edge_ids: string[];
    };
  }[];

  // NEW: Product configuration
  product_config: {
    siding_profile: string;
    siding_exposure_in: number;
    waste_factor: number;
  };
}
```

### 7.2 Calculated Output Structure

```typescript
interface CalculationEngineOutput {
  // Line items (existing)
  line_items: TakeoffLineItem[];

  // NEW: Detailed breakdowns
  breakdowns: {
    siding: {
      gross_sf: number;
      net_sf: number;
      pieces_needed: number;
      bundles_needed: number;
      waste_sf: number;
    };
    trim: {
      by_type: {
        type: 'head' | 'jamb' | 'sill';
        total_lf: number;
        pieces_needed: number;
      }[];
      total_lf: number;
    };
    corners: {
      outside: { count: number; pieces_needed: number };
      inside: { count: number; pieces_needed: number };
    };
  };

  // NEW: Validation warnings
  warnings: {
    code: string;
    message: string;
    detection_id?: string;
  }[];
}
```

---

## 8. Summary

### Architecture Strengths
- Polygon-based system supports arbitrary shapes
- Class-aware derived measurements (head/sill/jamb)
- Live aggregation provides real-time feedback
- Type-safe throughout with TypeScript

### Primary Gaps for Calculation Engine
1. **Edge classification** - No interior/exterior edge distinction
2. **Wall height context** - No story-level information on detections
3. **Adjacency relationships** - Detections are isolated
4. **Product-specific calculations** - Generic LF/SF only
5. **Gable completeness** - Missing height/pitch data

### Recommended Next Steps
1. Enhance `ExtractionDetection` with `position_context` and `relationships`
2. Add `WallContext` to each detection for multi-story buildings
3. Implement edge classification during polygon creation
4. Create server-side calculation engine to replace n8n dependency
5. Add validation layer to catch physically impossible measurements
