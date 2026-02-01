-- Migration: Add color_override column to detection tables
-- This allows users to override the default class-based color for individual detections

-- Add to draft table (used for editing)
ALTER TABLE extraction_detections_draft
ADD COLUMN IF NOT EXISTS color_override TEXT;

-- Add to validated table (for consistency)
ALTER TABLE extraction_detections_validated
ADD COLUMN IF NOT EXISTS color_override TEXT;

-- Add comment for documentation
COMMENT ON COLUMN extraction_detections_draft.color_override IS 'User-defined hex color override (e.g., #FF5733). When set, this color is used instead of the default class-based color.';
COMMENT ON COLUMN extraction_detections_validated.color_override IS 'User-defined hex color override (e.g., #FF5733). When set, this color is used instead of the default class-based color.';
