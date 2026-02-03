-- Plan annotations (standalone notes on plans)
-- Allows users to place notes anywhere on extraction plan pages

CREATE TABLE IF NOT EXISTS plan_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  job_id UUID NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES extraction_pages(id) ON DELETE CASCADE,

  -- Position on canvas (in pixels, relative to page image)
  pixel_x NUMERIC NOT NULL,
  pixel_y NUMERIC NOT NULL,

  -- Note content
  text TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT 'general' CHECK (category IN (
    'general',        -- General observation
    'rfi',            -- Request for Information
    'warning',        -- Potential issue
    'clarification',  -- Clarification needed
    'customer',       -- Customer request/preference
    'site_condition'  -- Site-specific note
  )),

  -- Optional link to specific detection
  linked_detection_id UUID,

  -- Visual styling
  color VARCHAR(7),  -- Override color (null = use category default)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,

  -- Flow control
  include_in_takeoff BOOLEAN DEFAULT TRUE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_plan_annotations_job ON plan_annotations(job_id);
CREATE INDEX IF NOT EXISTS idx_plan_annotations_page ON plan_annotations(page_id);
CREATE INDEX IF NOT EXISTS idx_plan_annotations_linked ON plan_annotations(linked_detection_id) WHERE linked_detection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plan_annotations_category ON plan_annotations(category);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_plan_annotations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plan_annotations_updated_at ON plan_annotations;
CREATE TRIGGER trg_plan_annotations_updated_at
  BEFORE UPDATE ON plan_annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_plan_annotations_updated_at();

-- Enable RLS
ALTER TABLE plan_annotations ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Users can view annotations in their org" ON plan_annotations;
CREATE POLICY "Users can view annotations in their org"
  ON plan_annotations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

DROP POLICY IF EXISTS "Users can insert annotations" ON plan_annotations;
CREATE POLICY "Users can insert annotations"
  ON plan_annotations FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update annotations" ON plan_annotations;
CREATE POLICY "Users can update annotations"
  ON plan_annotations FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Users can delete annotations" ON plan_annotations;
CREATE POLICY "Users can delete annotations"
  ON plan_annotations FOR DELETE
  USING (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE plan_annotations;

COMMENT ON TABLE plan_annotations IS 'Standalone annotations that can be placed anywhere on plan pages';
COMMENT ON COLUMN plan_annotations.category IS 'Type of annotation: general, rfi, warning, clarification, customer, site_condition';
COMMENT ON COLUMN plan_annotations.linked_detection_id IS 'Optional link to a specific detection for context';
COMMENT ON COLUMN plan_annotations.include_in_takeoff IS 'Whether this note should appear in the takeoff export';
