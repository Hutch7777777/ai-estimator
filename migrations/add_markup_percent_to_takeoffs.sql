-- Migration: Add markup_percent column to takeoffs table
-- Purpose: Allow users to specify markup percentage when creating estimates
-- Default: 15% (industry standard for construction estimates)

-- Add markup_percent column to takeoffs table
ALTER TABLE takeoffs
ADD COLUMN markup_percent DECIMAL(5,2) DEFAULT 15.00;

-- Add comment for documentation
COMMENT ON COLUMN takeoffs.markup_percent IS 'Markup percentage applied to estimate (e.g., 15.00 for 15%)';

-- Update existing records to have default 15% markup
UPDATE takeoffs
SET markup_percent = 15.00
WHERE markup_percent IS NULL;
