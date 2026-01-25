-- Migration: Add floor_plan_data column to extraction_pages table
-- Phase 4: Floor Plan Extraction for building geometry (corners, perimeter, area)
-- Created: 2024-01-23

-- Add floor_plan_data JSONB column to store extracted floor plan geometry
ALTER TABLE extraction_pages
ADD COLUMN IF NOT EXISTS floor_plan_data JSONB;

-- Add comment describing the column purpose
COMMENT ON COLUMN extraction_pages.floor_plan_data IS 'Extracted floor plan data including exterior corners, perimeter, floor area, and opening counts. Used for siding/trim estimation.';

-- Create an index on floor_plan_data for querying by floor level
CREATE INDEX IF NOT EXISTS idx_extraction_pages_floor_plan_data
ON extraction_pages USING GIN (floor_plan_data);

-- Example of expected data structure:
-- {
--   "id": "page-uuid-floor",
--   "pageRef": "Page 6",
--   "floorLevel": "main",
--   "floorAreaSF": 2850,
--   "exteriorPerimeterLF": 245,
--   "wallSegments": [...],
--   "corners": [...],
--   "cornerSummary": {
--     "outsideCorners90": 12,
--     "insideCorners90": 2,
--     "outsideCorners45": 0,
--     "insideCorners45": 0,
--     "totalOutsideCorners": 12,
--     "totalInsideCorners": 2
--   },
--   "windowCount": 18,
--   "doorCount": 2,
--   "garageDoorCount": 2,
--   "overallWidth": 65,
--   "overallDepth": 48,
--   "scale": "1/4\" = 1'-0\"",
--   "confidence": 0.8,
--   "confidenceNotes": "...",
--   "extractionNotes": "...",
--   "extractedAt": "2024-01-23T...",
--   "version": "v1",
--   "model_used": "claude-sonnet-4-20250514",
--   "tokens_used": 1500
-- }
