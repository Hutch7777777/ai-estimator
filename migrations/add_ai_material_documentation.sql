-- Migration: AI material documentation references
-- Purpose: Optional Supabase-backed source library for manufacturer docs used by Exterior Finishes AI.
-- Runtime fallback: docs/assistant-knowledge/material-docs/material_documentation_seed.json

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS ai_material_documentation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_key TEXT NOT NULL UNIQUE,
  manufacturer TEXT NOT NULL,
  product_family TEXT NOT NULL,
  document_title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  division TEXT NOT NULL DEFAULT '07',
  trades TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  product_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  applicability TEXT NOT NULL DEFAULT '',
  risk_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  estimating_guidance TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source_notes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  priority INTEGER NOT NULL DEFAULT 50,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_material_documentation_active_priority
  ON ai_material_documentation(active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_ai_material_documentation_manufacturer
  ON ai_material_documentation(manufacturer);

CREATE INDEX IF NOT EXISTS idx_ai_material_documentation_trades
  ON ai_material_documentation USING GIN(trades);

CREATE INDEX IF NOT EXISTS idx_ai_material_documentation_categories
  ON ai_material_documentation USING GIN(categories);

CREATE INDEX IF NOT EXISTS idx_ai_material_documentation_keywords
  ON ai_material_documentation USING GIN(product_keywords);

DROP TRIGGER IF EXISTS update_ai_material_documentation_updated_at ON ai_material_documentation;
CREATE TRIGGER update_ai_material_documentation_updated_at
  BEFORE UPDATE ON ai_material_documentation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE ai_material_documentation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_material_documentation_read ON ai_material_documentation;
CREATE POLICY ai_material_documentation_read
  ON ai_material_documentation
  FOR SELECT
  TO authenticated
  USING (active = TRUE);
