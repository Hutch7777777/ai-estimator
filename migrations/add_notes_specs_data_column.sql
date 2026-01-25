-- Migration: Add notes_specs_data column to extraction_jobs table
-- Stores extracted notes and specifications from plan pages
-- Created: 2024-01-23

-- Add notes_specs_data JSONB column to store extracted specs
ALTER TABLE extraction_jobs
ADD COLUMN IF NOT EXISTS notes_specs_data JSONB;

-- Add comment describing the column purpose
COMMENT ON COLUMN extraction_jobs.notes_specs_data IS 'Extracted notes and specifications from plan pages including siding specs, flashing, fasteners, weather barrier, trim details, code requirements, and installation notes.';

-- Example of expected data structure:
-- {
--   "summary": "Found 15 takeoff-relevant specifications across 8 pages",
--   "notes": [
--     {
--       "id": "note-1",
--       "category": "siding_specs",
--       "item": "HardiePlank Lap Siding",
--       "details": "7.25\" exposure, ColorPlus Arctic White, 5/16\" thick",
--       "source_page": "Page 3 - Front Elevation",
--       "importance": "critical"
--     }
--   ],
--   "categories": {
--     "siding_specs": 5,
--     "flashing_waterproofing": 3,
--     "fasteners_adhesives": 2,
--     "weather_barrier": 1,
--     "trim_details": 2,
--     "code_requirements": 1,
--     "installation_notes": 1,
--     "special_conditions": 0
--   },
--   "pages_analyzed": 8,
--   "extracted_at": "2024-01-23T...",
--   "version": "v1",
--   "model_used": "claude-sonnet-4-20250514",
--   "tokens_used": 5000
-- }
