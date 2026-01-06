# Extraction Review Editor - Implementation Handoff

## Overview

Build an interactive canvas editor that overlays AI-detected extraction results (bounding boxes, material callouts) on PDF pages, allowing users to:
1. View detected elements visually
2. Select/edit detections
3. Add missing detections manually
4. Confirm or correct classifications
5. Save changes back to the database

---

## Existing Canvas Capabilities

### CADViewer Component (`components/cad-markup/CADViewer.tsx`)

A production-ready canvas system with:

**Drawing Tools:**
- `select` - Click to select/deselect markups
- `draw` - Click points to create polygons, double-click to close
- `count` - Click to place numbered count markers
- `linear` - Click two points for distance measurements
- `calibrate` - Set pixels-per-foot scale

**Pan & Zoom:**
- Right-click drag or Alt+click to pan
- Mouse wheel zoom with position preservation
- PDF re-rendering at higher resolution when zooming past threshold

**Coordinate System:**
```typescript
screenToCanvas(screenX, screenY) {
  rect = container.getBoundingClientRect();
  x = (screenX - rect.left - viewTransform.offsetX) / viewTransform.scale;
  y = (screenY - rect.top - viewTransform.offsetY) / viewTransform.scale;
  return { x, y };
}
```

**Visual Rendering:**
- Polygons: Filled (25% opacity) + 2px stroke
- Markers: 8px circles with numbered labels
- Measurements: Lines with arrowheads + distance labels
- Selection: 3px black border on selected items

### Hit Testing (`components/cad-markup/hitTesting.ts`)

Pure geometry utilities:
- `pointInPolygon()` - Ray casting algorithm
- `pointNearLine()` - Perpendicular distance to segment
- `hitTestAll()` - Priority-based selection (markers > measurements > polygons)

### History/Undo (`components/cad-markup/useHistory.ts`)

Generic undo/redo hook:
```typescript
const { state, setState, undo, redo, canUndo, canRedo } = useHistory({
  initialState: { polygons: [], markers: [], measurements: [] }
});
```
- Keyboard: Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z (redo)
- 50-item history limit

### Core Types (`components/cad-markup/types.ts`)

```typescript
interface Point { x: number; y: number; }

interface Polygon {
  id: string;
  pageNumber: number;
  points: Point[];
  material: MarkupMaterial;
  area: number;
  subject?: string;
  notes?: string;
}

interface MarkupMaterial {
  trade: string;      // 'siding', 'roofing', etc.
  category: string;   // 'lap_siding', 'trim', etc.
  productId?: string;
  productName?: string;
  color: string;      // hex color
}

type ToolMode = "select" | "draw" | "count" | "linear" | "calibrate";
```

---

## Extraction Data Structure

### Database Tables

Located in Supabase (accessed via `lib/supabase/cadExtractions.ts`):

**cad_extractions** - Main extraction job
```typescript
interface CadExtraction {
  id: string;
  project_name: string;
  status: string;           // 'pending' | 'completed' | 'failed'
  sheet_count: number;
  dimension_count: number;
  material_callout_count: number;
}
```

**cad_material_callouts** - Individual detected materials
```typescript
interface CadMaterialCallout {
  id: string;
  extraction_id: string;
  raw_text: string;           // As found in CAD
  normalized_text: string;    // Cleaned/standardized
  trade: string;              // 'siding', 'roofing', 'windows', 'unknown'
  material_type: string;      // Category within trade
  manufacturer: string;
  match_confidence: number;   // 0.0-1.0
  product_id: string | null;  // FK to product_catalog
  user_corrected: boolean;

  // MISSING BUT NEEDED:
  page_number?: number;       // Which PDF page
  bounding_box?: {            // Position on page
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

**cad_hover_measurements** - Extracted measurements
```typescript
interface CadHoverMeasurements {
  id: string;
  extraction_id: string;
  facade_total_sqft: number;
  net_siding_sqft: number;
  openings_count: number;
  outside_corners_lf: number;
  // ... more measurements
}
```

### Existing API Functions

```typescript
// Fetch
fetchCadExtractions()
getCadExtraction(extractionId)
getMaterialCallouts(extractionId)
getCalloutsByTrade(extractionId)

// Update
updateCalloutTrade(calloutId, trade, materialType)
confirmCallout(calloutId)
confirmHighConfidenceCallouts(extractionId, threshold)

// Training
recordTrainingExample(normalizedText, trade, category, wasCorrection)
```

### Existing UI Components

- `CadDataPanel.tsx` - Shows extraction summary + measurements
- `CalloutClassificationPanel.tsx` - Lists callouts with confidence badges, filtering, bulk confirm
- `EditCalloutDialog.tsx` - Modal to edit single callout trade/category

---

## What Needs to Be Built

### 1. Detection Overlay System

**New Types:**
```typescript
interface DetectionBox {
  id: string;
  calloutId: string;        // Links to cad_material_callouts
  pageNumber: number;
  boundingBox: {
    x: number;              // Top-left X (in image coords)
    y: number;              // Top-left Y
    width: number;
    height: number;
  };
  label: string;            // Display text
  confidence: number;       // 0-1
  trade: string;
  status: 'detected' | 'confirmed' | 'corrected' | 'manual';
}
```

**Rendering:**
- Draw bounding boxes with trade-based colors
- Confidence-based styling (solid vs dashed border)
- Labels positioned above/inside boxes
- Selection highlight on click

### 2. Detection Editor Component

**New Component:** `ExtractionReviewViewer.tsx`

```typescript
interface Props {
  extractionId: string;
  pdfUrl: string;
  onSave: (changes: DetectionChanges) => void;
}

// Features needed:
- Load PDF and detection data
- Overlay boxes on canvas
- Click to select detection
- Side panel shows selected detection details
- Edit trade/category/text
- Delete false positives
- Draw new box for missed detections
```

### 3. Detection CRUD Operations

**New API Functions:**
```typescript
// Update detection box position/size
updateDetectionBox(calloutId, boundingBox)

// Create new manual detection
createManualDetection(extractionId, pageNumber, boundingBox, classification)

// Delete detection
deleteDetection(calloutId)

// Bulk operations
bulkUpdateDetections(updates: DetectionUpdate[])
```

### 4. Save/Sync Workflow

```
User edits detection
  ↓
Local state updates immediately
  ↓
Track changes (adds, updates, deletes)
  ↓
Save button triggers bulk API call
  ↓
Training data recorded for corrections
  ↓
UI shows saved status
```

---

## Key Files to Reference

### Canvas/Drawing
- [components/cad-markup/CADViewer.tsx](components/cad-markup/CADViewer.tsx) - Main canvas implementation
- [components/cad-markup/hitTesting.ts](components/cad-markup/hitTesting.ts) - Click detection
- [components/cad-markup/useHistory.ts](components/cad-markup/useHistory.ts) - Undo/redo
- [components/cad-markup/types.ts](components/cad-markup/types.ts) - Type definitions

### Extraction Data
- [lib/supabase/cadExtractions.ts](lib/supabase/cadExtractions.ts) - All extraction API functions
- [components/cad-markup/CadDataPanel.tsx](components/cad-markup/CadDataPanel.tsx) - Extraction display
- [components/cad-markup/CalloutClassificationPanel.tsx](components/cad-markup/CalloutClassificationPanel.tsx) - Callout list UI

### UI Patterns
- [components/cad-markup/CADMarkupStep.tsx](components/cad-markup/CADMarkupStep.tsx) - Full editor orchestration
- [components/cad-markup/MarkupToolbar.tsx](components/cad-markup/MarkupToolbar.tsx) - Tool selection UI
- [components/cad-markup/EditCalloutDialog.tsx](components/cad-markup/EditCalloutDialog.tsx) - Edit modal pattern

---

## Implementation Approach

### Phase 1: Detection Overlay (Read-Only)
1. Create `ExtractionReviewViewer.tsx` based on CADViewer
2. Load extraction data with bounding boxes
3. Render boxes as overlay on PDF
4. Click to select, show details in side panel

### Phase 2: Edit Capabilities
1. Add selection state for detections
2. Integrate with existing `EditCalloutDialog`
3. Add delete button for false positives
4. Track changes locally

### Phase 3: Manual Detection Drawing
1. Add "draw box" tool mode
2. Reuse polygon drawing logic for rectangles
3. On complete, show classification dialog
4. Create new callout in database

### Phase 4: Save & Training
1. Batch save all changes
2. Record corrections as training examples
3. Show save status indicator
4. Handle conflicts/errors

---

## Database Schema Changes Needed

The `cad_material_callouts` table needs:
```sql
ALTER TABLE cad_material_callouts
ADD COLUMN page_number INTEGER DEFAULT 1,
ADD COLUMN bounding_box JSONB;  -- {x, y, width, height}
```

Or create new table for visual positions:
```sql
CREATE TABLE cad_callout_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  callout_id UUID REFERENCES cad_material_callouts(id),
  page_number INTEGER NOT NULL,
  x NUMERIC NOT NULL,
  y NUMERIC NOT NULL,
  width NUMERIC NOT NULL,
  height NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Trade Color Mapping

Reuse from existing system:
```typescript
const TRADE_COLORS: Record<string, string> = {
  siding: '#3B82F6',    // Blue
  roofing: '#10B981',   // Green
  trim: '#F59E0B',      // Amber
  windows: '#8B5CF6',   // Purple
  doors: '#EC4899',     // Pink
  gutters: '#06B6D4',   // Cyan
  unknown: '#6B7280',   // Gray
};
```

---

## Questions to Resolve

1. **Bounding box source**: Does the extraction API already return positions, or do we need to add them?
2. **Multi-page**: Should detection review be per-page or show all pages?
3. **Zoom behavior**: Should boxes scale with zoom or stay fixed size?
4. **Conflict resolution**: What if user edits while extraction is re-running?
5. **Mobile support**: Is touch interaction needed for box editing?

---

## Success Criteria

- [ ] PDF renders with detection boxes overlaid
- [ ] Boxes colored by trade with confidence indicator
- [ ] Click detection selects and shows details
- [ ] Can edit trade/category of selected detection
- [ ] Can delete false positive detections
- [ ] Can draw new box for missed detections
- [ ] Changes save to database
- [ ] Corrections create training records
- [ ] Undo/redo works for all operations
