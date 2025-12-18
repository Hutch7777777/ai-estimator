-- Create takeoffs schema for estimate editor
-- This migration creates the core tables for managing project takeoffs/estimates

-- ============================================================================
-- TAKEOFFS TABLE
-- ============================================================================
-- One takeoff per project, created when status changes to 'extracted'
CREATE TABLE IF NOT EXISTS takeoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft',
  -- Possible values: 'draft', 'in_progress', 'review', 'approved', 'sent'

  -- Totals (calculated from line items)
  total_material DECIMAL(10,2) DEFAULT 0,
  total_labor DECIMAL(10,2) DEFAULT 0,
  total_equipment DECIMAL(10,2) DEFAULT 0,
  grand_total DECIMAL(10,2) DEFAULT 0,

  -- Metadata
  notes TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one takeoff per project
  CONSTRAINT unique_project_takeoff UNIQUE(project_id)
);

-- Index for fast project lookups
CREATE INDEX IF NOT EXISTS idx_takeoffs_project_id ON takeoffs(project_id);
CREATE INDEX IF NOT EXISTS idx_takeoffs_status ON takeoffs(status);


-- ============================================================================
-- TAKEOFF_SECTIONS TABLE
-- ============================================================================
-- One section per selected trade (Siding, Roofing, Windows, Gutters)
CREATE TABLE IF NOT EXISTS takeoff_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  takeoff_id UUID NOT NULL REFERENCES takeoffs(id) ON DELETE CASCADE,

  -- Section details
  name TEXT NOT NULL, -- 'siding', 'roofing', 'windows', 'gutters'
  display_name TEXT NOT NULL, -- 'Siding', 'Roofing', 'Windows', 'Gutters'
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Section totals (calculated from line items)
  total_material DECIMAL(10,2) DEFAULT 0,
  total_labor DECIMAL(10,2) DEFAULT 0,
  total_equipment DECIMAL(10,2) DEFAULT 0,
  section_total DECIMAL(10,2) DEFAULT 0,

  -- Metadata
  notes TEXT,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure unique section names per takeoff
  CONSTRAINT unique_takeoff_section UNIQUE(takeoff_id, name)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_sections_takeoff_id ON takeoff_sections(takeoff_id);
CREATE INDEX IF NOT EXISTS idx_sections_sort_order ON takeoff_sections(takeoff_id, sort_order);


-- ============================================================================
-- TAKEOFF_LINE_ITEMS TABLE
-- ============================================================================
-- Individual line items with detailed cost breakdown
CREATE TABLE IF NOT EXISTS takeoff_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  takeoff_id UUID NOT NULL REFERENCES takeoffs(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES takeoff_sections(id) ON DELETE CASCADE,

  -- Item identification
  item_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  sku TEXT,

  -- Quantity
  quantity DECIMAL(10,4) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'EA', -- EA, PC, SQ, LF, SF, RL, BX, BDL, GAL

  -- Unit costs (detailed breakdown matching Mike Skjei pricing methodology)
  material_unit_cost DECIMAL(10,2) DEFAULT 0,
  labor_unit_cost DECIMAL(10,2) DEFAULT 0,
  equipment_unit_cost DECIMAL(10,2) DEFAULT 0,

  -- Extended costs (auto-calculated: quantity × unit_cost)
  material_extended DECIMAL(10,2) GENERATED ALWAYS AS (quantity * material_unit_cost) STORED,
  labor_extended DECIMAL(10,2) GENERATED ALWAYS AS (quantity * labor_unit_cost) STORED,
  equipment_extended DECIMAL(10,2) GENERATED ALWAYS AS (quantity * equipment_unit_cost) STORED,
  line_total DECIMAL(10,2) GENERATED ALWAYS AS (
    (quantity * material_unit_cost) +
    (quantity * labor_unit_cost) +
    (quantity * equipment_unit_cost)
  ) STORED,

  -- Product reference (optional link to catalog)
  product_id UUID REFERENCES product_catalog(id) ON DELETE SET NULL,

  -- Provenance tracking (CORE to your methodology)
  calculation_source TEXT NOT NULL DEFAULT 'manual',
  -- Possible values: 'auto_scope', 'manual', 'hover_pdf', 'imported'

  source_id TEXT, -- Reference to external system (e.g., HOVER measurement ID)

  formula_used TEXT, -- Human-readable calculation explanation
  -- Example: "19.56 squares × 13.8 pieces/sq = 270 PC"
  -- Example: "Window count (12) × 1 unit = 12 EA"

  -- Metadata
  notes TEXT,
  is_optional BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false, -- Soft delete for audit trail
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure item numbers are sequential within a section
  CONSTRAINT unique_item_number_per_section UNIQUE(section_id, item_number)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_line_items_takeoff_id ON takeoff_line_items(takeoff_id);
CREATE INDEX IF NOT EXISTS idx_line_items_section_id ON takeoff_line_items(section_id);
CREATE INDEX IF NOT EXISTS idx_line_items_product_id ON takeoff_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_line_items_sort_order ON takeoff_line_items(section_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_line_items_calculation_source ON takeoff_line_items(calculation_source);


-- ============================================================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for takeoffs
DROP TRIGGER IF EXISTS update_takeoffs_updated_at ON takeoffs;
CREATE TRIGGER update_takeoffs_updated_at
  BEFORE UPDATE ON takeoffs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for takeoff_sections
DROP TRIGGER IF EXISTS update_sections_updated_at ON takeoff_sections;
CREATE TRIGGER update_sections_updated_at
  BEFORE UPDATE ON takeoff_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for takeoff_line_items
DROP TRIGGER IF EXISTS update_line_items_updated_at ON takeoff_line_items;
CREATE TRIGGER update_line_items_updated_at
  BEFORE UPDATE ON takeoff_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- FUNCTION TO RECALCULATE SECTION TOTALS
-- ============================================================================
-- This function aggregates line item totals up to the section level

CREATE OR REPLACE FUNCTION recalculate_section_totals(section_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE takeoff_sections
  SET
    total_material = COALESCE((
      SELECT SUM(material_extended)
      FROM takeoff_line_items
      WHERE section_id = section_uuid AND is_deleted = false
    ), 0),
    total_labor = COALESCE((
      SELECT SUM(labor_extended)
      FROM takeoff_line_items
      WHERE section_id = section_uuid AND is_deleted = false
    ), 0),
    total_equipment = COALESCE((
      SELECT SUM(equipment_extended)
      FROM takeoff_line_items
      WHERE section_id = section_uuid AND is_deleted = false
    ), 0),
    section_total = COALESCE((
      SELECT SUM(line_total)
      FROM takeoff_line_items
      WHERE section_id = section_uuid AND is_deleted = false
    ), 0)
  WHERE id = section_uuid;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- FUNCTION TO RECALCULATE TAKEOFF TOTALS
-- ============================================================================
-- This function aggregates section totals up to the takeoff level

CREATE OR REPLACE FUNCTION recalculate_takeoff_totals(takeoff_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE takeoffs
  SET
    total_material = COALESCE((
      SELECT SUM(total_material)
      FROM takeoff_sections
      WHERE takeoff_id = takeoff_uuid AND is_active = true
    ), 0),
    total_labor = COALESCE((
      SELECT SUM(total_labor)
      FROM takeoff_sections
      WHERE takeoff_id = takeoff_uuid AND is_active = true
    ), 0),
    total_equipment = COALESCE((
      SELECT SUM(total_equipment)
      FROM takeoff_sections
      WHERE takeoff_id = takeoff_uuid AND is_active = true
    ), 0),
    grand_total = COALESCE((
      SELECT SUM(section_total)
      FROM takeoff_sections
      WHERE takeoff_id = takeoff_uuid AND is_active = true
    ), 0)
  WHERE id = takeoff_uuid;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- TRIGGER TO AUTO-RECALCULATE TOTALS ON LINE ITEM CHANGES
-- ============================================================================
-- When line items change, automatically update section and takeoff totals

CREATE OR REPLACE FUNCTION auto_recalculate_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate section totals
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_section_totals(OLD.section_id);
    PERFORM recalculate_takeoff_totals(OLD.takeoff_id);
  ELSE
    PERFORM recalculate_section_totals(NEW.section_id);
    PERFORM recalculate_takeoff_totals(NEW.takeoff_id);
  END IF;

  RETURN NULL; -- Result is ignored for AFTER triggers
END;
$$ LANGUAGE plpgsql;

-- Trigger on line items for automatic total recalculation
DROP TRIGGER IF EXISTS auto_recalc_on_line_item_change ON takeoff_line_items;
CREATE TRIGGER auto_recalc_on_line_item_change
  AFTER INSERT OR UPDATE OR DELETE ON takeoff_line_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_totals();


-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE takeoffs IS 'Main takeoff/estimate records, one per project';
COMMENT ON TABLE takeoff_sections IS 'Sections organize line items by trade (siding, roofing, windows, gutters)';
COMMENT ON TABLE takeoff_line_items IS 'Individual line items with detailed material/labor/equipment cost breakdown';

COMMENT ON COLUMN takeoff_line_items.calculation_source IS 'Provenance tracking: auto_scope, manual, hover_pdf, imported';
COMMENT ON COLUMN takeoff_line_items.formula_used IS 'Human-readable explanation of how this quantity was calculated';
COMMENT ON COLUMN takeoff_line_items.source_id IS 'External reference ID (e.g., HOVER measurement ID)';
