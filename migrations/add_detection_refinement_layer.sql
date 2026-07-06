-- Add AI refinement run ledger and refined detection layer.
-- Raw Roboflow detections remain in extraction_detection_details.
-- Human-editable rows remain in extraction_detections_draft.

CREATE TABLE IF NOT EXISTS extraction_refinement_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
  page_id UUID REFERENCES extraction_pages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  mode TEXT NOT NULL DEFAULT 'auto',
  model TEXT,
  prompt_version TEXT,
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  blocked_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extraction_refinement_runs_job_page
  ON extraction_refinement_runs(job_id, page_id, created_at DESC);

CREATE TABLE IF NOT EXISTS extraction_detections_refined (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES extraction_pages(id) ON DELETE CASCADE,
  source_detection_id UUID,
  source_detection_ids UUID[] NOT NULL DEFAULT '{}',
  refinement_run_id UUID REFERENCES extraction_refinement_runs(id) ON DELETE SET NULL,
  class TEXT NOT NULL,
  detection_index INTEGER,
  confidence NUMERIC(8,4),
  pixel_x NUMERIC(12,4),
  pixel_y NUMERIC(12,4),
  pixel_width NUMERIC(12,4),
  pixel_height NUMERIC(12,4),
  real_width_in NUMERIC(12,4),
  real_height_in NUMERIC(12,4),
  real_width_ft NUMERIC(12,4),
  real_height_ft NUMERIC(12,4),
  area_sf NUMERIC(12,4),
  perimeter_lf NUMERIC(12,4),
  is_triangle BOOLEAN NOT NULL DEFAULT false,
  matched_tag TEXT,
  assigned_material_id UUID,
  material_notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  is_user_created BOOLEAN NOT NULL DEFAULT false,
  polygon_points JSONB,
  has_hole BOOLEAN NOT NULL DEFAULT false,
  markup_type TEXT NOT NULL DEFAULT 'polygon',
  status TEXT NOT NULL DEFAULT 'auto',
  item_count NUMERIC(12,4) DEFAULT 1,
  plane_type TEXT,
  plane_id TEXT,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extraction_detections_refined_page_active
  ON extraction_detections_refined(page_id, is_deleted, detection_index);

CREATE INDEX IF NOT EXISTS idx_extraction_detections_refined_job
  ON extraction_detections_refined(job_id);

CREATE INDEX IF NOT EXISTS idx_extraction_detections_refined_run
  ON extraction_detections_refined(refinement_run_id);

CREATE INDEX IF NOT EXISTS idx_extraction_detections_refined_source
  ON extraction_detections_refined(source_detection_id);

COMMENT ON TABLE extraction_refinement_runs IS
  'Audit ledger for second-pass AI detection refinement before editor review.';

COMMENT ON TABLE extraction_detections_refined IS
  'AI-refined detection geometry between raw Roboflow detections and human-editable draft detections.';
