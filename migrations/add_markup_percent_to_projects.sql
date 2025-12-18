-- Migration: Add markup_percent column to projects table
-- Purpose: Store user's markup preference when creating a project
-- This value will be passed to n8n and used when creating the takeoff
-- Default: 15% (industry standard for construction estimates)

-- Add markup_percent column to projects table
ALTER TABLE projects
ADD COLUMN markup_percent DECIMAL(5,2) DEFAULT 15.00;

-- Add comment for documentation
COMMENT ON COLUMN projects.markup_percent IS 'Markup percentage to apply to estimate (e.g., 15.00 for 15%)';

-- Update existing records to have default 15% markup
UPDATE projects
SET markup_percent = 15.00
WHERE markup_percent IS NULL;
