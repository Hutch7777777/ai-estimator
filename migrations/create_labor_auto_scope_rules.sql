-- ============================================================================
-- LABOR AUTO-SCOPE RULES
-- Dynamic labor calculation based on material categories and detection classes
-- ============================================================================

-- Create labor_auto_scope_rules table
CREATE TABLE IF NOT EXISTS labor_auto_scope_rules (
  id SERIAL PRIMARY KEY,
  rule_id TEXT UNIQUE NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT,
  trade TEXT NOT NULL DEFAULT 'siding',

  -- Trigger configuration
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('always', 'material_category', 'material_sku_pattern', 'detection_class')),
  trigger_value TEXT, -- Comma-separated list of categories, SKU patterns, or detection classes
  trigger_condition JSONB, -- Additional conditions (e.g., min_quantity, threshold)

  -- Labor rate reference
  labor_rate_id INTEGER REFERENCES labor_rates(id),

  -- Quantity calculation
  quantity_source TEXT NOT NULL CHECK (quantity_source IN ('facade_sqft', 'material_sqft', 'material_count', 'detection_count', 'material_lf')),
  quantity_formula TEXT, -- Optional formula (e.g., "facade_sqft / 100" for squares)
  quantity_unit TEXT DEFAULT 'square',

  -- Rule ordering
  priority INTEGER DEFAULT 100,

  -- Status
  active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_labor_auto_scope_rules_trade ON labor_auto_scope_rules(trade);
CREATE INDEX IF NOT EXISTS idx_labor_auto_scope_rules_active ON labor_auto_scope_rules(active);
CREATE INDEX IF NOT EXISTS idx_labor_auto_scope_rules_trigger_type ON labor_auto_scope_rules(trigger_type);

-- Insert default siding labor rules
INSERT INTO labor_auto_scope_rules (rule_id, rule_name, description, trade, trigger_type, trigger_value, labor_rate_id, quantity_source, quantity_formula, quantity_unit, priority)
VALUES
  -- WRB always applies based on facade area
  ('LABOR-WRB-INSTALL', 'WRB Installation', 'Weather resistant barrier installation - applies to all siding jobs',
   'siding', 'always', NULL,
   (SELECT id FROM labor_rates WHERE rate_name = 'WRB Installation' AND trade = 'siding'),
   'facade_sqft', 'facade_sqft / 100', 'square', 10),

  -- Lap siding installation when lap_siding materials present
  ('LABOR-LAP-SIDING', 'Lap Siding Installation', 'Install lap siding materials',
   'siding', 'material_category', 'lap_siding,siding',
   (SELECT id FROM labor_rates WHERE rate_name = 'Lap Siding Installation' AND trade = 'siding'),
   'material_sqft', 'material_sqft / 100', 'square', 20),

  -- Demo/Cleanup always applies (based on facade area)
  ('LABOR-DEMO-CLEANUP', 'Demo/Cleanup', 'Remove existing siding and cleanup debris',
   'siding', 'always', NULL,
   (SELECT id FROM labor_rates WHERE rate_name = 'Demo/Cleanup' AND trade = 'siding'),
   'facade_sqft', 'facade_sqft / 100', 'square', 5)
ON CONFLICT (rule_id) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  description = EXCLUDED.description,
  trigger_type = EXCLUDED.trigger_type,
  trigger_value = EXCLUDED.trigger_value,
  labor_rate_id = EXCLUDED.labor_rate_id,
  quantity_source = EXCLUDED.quantity_source,
  quantity_formula = EXCLUDED.quantity_formula,
  quantity_unit = EXCLUDED.quantity_unit,
  priority = EXCLUDED.priority,
  updated_at = NOW();

-- Add additional labor rates that might be missing
INSERT INTO labor_rates (rate_name, description, trade, presentation_group, unit, base_rate, difficulty_multiplier, active, notes)
VALUES
  ('Shingle Siding Installation', 'Install shingle siding materials', 'siding', 'siding', 'square', 400.00, 1.00, true, 'More complex installation pattern'),
  ('Panel Siding Installation', 'Install panel siding materials', 'siding', 'siding', 'square', 200.00, 1.00, true, 'Large format panels'),
  ('Board & Batten Installation', 'Install board and batten siding', 'siding', 'siding', 'square', 350.00, 1.00, true, 'Vertical application with battens'),
  ('Soffit Installation', 'Install soffit panels', 'siding', 'soffit', 'square', 180.00, 1.00, true, 'Vented or solid soffit installation'),
  ('Fascia Installation', 'Install fascia boards', 'siding', 'fascia', 'linear_foot', 8.00, 1.00, true, 'Per linear foot of fascia'),
  ('Trim Installation', 'Install trim boards and corners', 'siding', 'trim', 'linear_foot', 6.00, 1.00, true, 'Per linear foot of trim'),
  ('Corbel Installation', 'Install decorative corbels', 'siding', 'architectural', 'each', 50.00, 1.00, true, 'Per corbel'),
  ('Column Wrap Installation', 'Install column wraps', 'siding', 'architectural', 'each', 150.00, 1.00, true, 'Per column'),
  ('Shutter Installation', 'Install decorative shutters', 'siding', 'architectural', 'each', 35.00, 1.00, true, 'Per shutter (pair = 2)')
ON CONFLICT (rate_name) WHERE trade = 'siding' DO NOTHING;

-- Add more labor auto-scope rules for different material types
INSERT INTO labor_auto_scope_rules (rule_id, rule_name, description, trade, trigger_type, trigger_value, labor_rate_id, quantity_source, quantity_formula, quantity_unit, priority)
VALUES
  -- Shingle siding
  ('LABOR-SHINGLE-SIDING', 'Shingle Siding Installation', 'Install shingle siding materials',
   'siding', 'material_category', 'shingle,shingle_siding',
   (SELECT id FROM labor_rates WHERE rate_name = 'Shingle Siding Installation' AND trade = 'siding'),
   'material_sqft', 'material_sqft / 100', 'square', 20),

  -- Panel siding
  ('LABOR-PANEL-SIDING', 'Panel Siding Installation', 'Install panel siding materials',
   'siding', 'material_category', 'panel,panel_siding',
   (SELECT id FROM labor_rates WHERE rate_name = 'Panel Siding Installation' AND trade = 'siding'),
   'material_sqft', 'material_sqft / 100', 'square', 20),

  -- Board & batten
  ('LABOR-BOARD-BATTEN', 'Board & Batten Installation', 'Install board and batten siding',
   'siding', 'material_category', 'board_and_batten,vertical_siding',
   (SELECT id FROM labor_rates WHERE rate_name = 'Board & Batten Installation' AND trade = 'siding'),
   'material_sqft', 'material_sqft / 100', 'square', 20),

  -- Soffit
  ('LABOR-SOFFIT', 'Soffit Installation', 'Install soffit panels',
   'siding', 'material_category', 'soffit',
   (SELECT id FROM labor_rates WHERE rate_name = 'Soffit Installation' AND trade = 'siding'),
   'material_sqft', 'material_sqft / 100', 'square', 30),

  -- Fascia (linear foot based)
  ('LABOR-FASCIA', 'Fascia Installation', 'Install fascia boards',
   'siding', 'material_category', 'fascia',
   (SELECT id FROM labor_rates WHERE rate_name = 'Fascia Installation' AND trade = 'siding'),
   'material_lf', NULL, 'linear_foot', 30),

  -- Trim (linear foot based)
  ('LABOR-TRIM', 'Trim Installation', 'Install trim boards and corners',
   'siding', 'material_category', 'trim,corner,corners',
   (SELECT id FROM labor_rates WHERE rate_name = 'Trim Installation' AND trade = 'siding'),
   'material_lf', NULL, 'linear_foot', 30),

  -- Corbels (count based from detections)
  ('LABOR-CORBEL', 'Corbel Installation', 'Install decorative corbels',
   'siding', 'detection_class', 'corbel',
   (SELECT id FROM labor_rates WHERE rate_name = 'Corbel Installation' AND trade = 'siding'),
   'detection_count', NULL, 'each', 40),

  -- Columns (count based from detections)
  ('LABOR-COLUMN', 'Column Wrap Installation', 'Install column wraps',
   'siding', 'detection_class', 'column',
   (SELECT id FROM labor_rates WHERE rate_name = 'Column Wrap Installation' AND trade = 'siding'),
   'detection_count', NULL, 'each', 40),

  -- Shutters (count based from detections)
  ('LABOR-SHUTTER', 'Shutter Installation', 'Install decorative shutters',
   'siding', 'detection_class', 'shutter',
   (SELECT id FROM labor_rates WHERE rate_name = 'Shutter Installation' AND trade = 'siding'),
   'detection_count', NULL, 'each', 40)
ON CONFLICT (rule_id) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  description = EXCLUDED.description,
  trigger_type = EXCLUDED.trigger_type,
  trigger_value = EXCLUDED.trigger_value,
  labor_rate_id = EXCLUDED.labor_rate_id,
  quantity_source = EXCLUDED.quantity_source,
  quantity_formula = EXCLUDED.quantity_formula,
  quantity_unit = EXCLUDED.quantity_unit,
  priority = EXCLUDED.priority,
  updated_at = NOW();

-- Show summary
SELECT
  rule_id,
  rule_name,
  trigger_type,
  trigger_value,
  quantity_source,
  priority
FROM labor_auto_scope_rules
WHERE active = true
ORDER BY priority;
