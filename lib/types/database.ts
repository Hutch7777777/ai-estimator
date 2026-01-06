/**
 * Database Type Definitions
 *
 * TypeScript interfaces for all Supabase database tables.
 * These types ensure type safety when working with database queries.
 */

// ============================================================================
// ENUMS
// ============================================================================

export type ProjectStatus = 'pending' | 'extracted' | 'calculated' | 'priced' | 'approved' | 'sent_to_client' | 'won' | 'lost' | 'on_hold';

export type Trade = 'siding' | 'roofing' | 'windows' | 'gutters';

export type FieldType = 'select' | 'checkbox' | 'multiselect' | 'number';

export type TakeoffStatus = 'draft' | 'in_progress' | 'review' | 'approved' | 'sent';

export type CalculationSource = 'auto_scope' | 'manual' | 'hover_pdf' | 'imported';

export type Unit = 'EA' | 'PC' | 'SQ' | 'LF' | 'SF' | 'RL' | 'BX' | 'BDL' | 'GAL';

// Extraction system enums
export type DetectionStatus = 'auto' | 'verified' | 'edited' | 'deleted';

export type DetectionClass =
  | 'window'
  | 'door'
  | 'garage'
  | 'building'
  | 'roof'
  | 'gable'
  | 'exterior_wall'
  | '';

export type PageType =
  | 'elevation'
  | 'floor_plan'
  | 'schedule'
  | 'cover'
  | 'detail'
  | 'section'
  | 'site_plan'
  | 'other';

export type ElevationName = 'front' | 'rear' | 'left' | 'right';

export type JobStatus =
  | 'converting'
  | 'classifying'
  | 'processing'
  | 'complete'
  | 'failed';

// ============================================================================
// TABLE INTERFACES
// ============================================================================

/**
 * Projects Table
 *
 * Stores main project information and tracks processing status.
 */
export interface Project {
  id: string; // UUID
  name: string; // Project name
  client_name: string; // Customer/client name
  address: string;
  selected_trades: Trade[]; // Array of selected trades
  status: ProjectStatus;
  hover_pdf_url: string | null;
  excel_url: string | null;
  markup_percent: number; // Markup percentage (e.g., 15.00 for 15%)
  processing_started_at: string | null; // ISO timestamp
  processing_completed_at: string | null; // ISO timestamp
  error_message: string | null;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

/**
 * Trade Configurations Table
 *
 * CRITICAL: This table defines ALL form fields dynamically.
 * NEVER hardcode field definitions - always query this table.
 */
export interface TradeConfiguration {
  id: string; // UUID
  trade: Trade;
  config_section: string; // e.g., "General", "Materials", "Colors"
  config_name: string; // e.g., "primary_siding", "siding_color" (unique identifier)
  config_display_name: string; // Display name for the configuration
  field_type: FieldType;
  field_label: string; // Display label for the field
  field_placeholder: string | null; // Placeholder text for inputs
  field_help_text: string | null; // Help text shown below field
  field_options: Record<string, any> | null; // JSONB - Options for select/multiselect fields
  default_value: string | null; // Default value for the field
  is_required: boolean;
  validation_rules: Record<string, any> | null; // JSONB - Validation rules
  show_if_conditions: Record<string, any> | null; // JSONB - Conditional visibility logic
  hide_if_conditions: Record<string, any> | null; // JSONB - Conditional hiding logic
  triggers_auto_scope: boolean; // Whether this field triggers auto-scope calculation
  auto_scope_rule_id: string | null; // UUID - Reference to auto-scope rule
  section_order: number; // Order of sections in the form
  field_order: number; // Order of fields within a section
  group_name: string | null; // Optional grouping name
  active: boolean; // Whether this configuration is active
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  load_from_catalog: boolean; // If true, load options from product_catalog
  catalog_filter: Record<string, any> | null; // JSONB - Filter criteria for catalog products
}

/**
 * Field Option Structure (stored in field_options JSONB)
 */
export interface FieldOption {
  value: string;
  label: string;
}

/**
 * Show If Condition Structure (stored in show_if_conditions JSONB)
 *
 * Example: Show "siding_color" only if "primary_siding" is selected
 *
 * SPECIAL CASES:
 * - colorplus_color: Has special frontend logic that checks if selected product
 *   (from siding_product_type field) has physical_properties.is_colorplus = true.
 *   This cannot be expressed purely in show_if_conditions since it requires
 *   looking up the product in the product_catalog table.
 */
export interface ShowIfCondition {
  field: string; // Field name to check
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
  value: string | string[];
}

/**
 * Product Catalog Table
 *
 * Contains 76+ products for dropdowns.
 * IMPORTANT: Must be grouped by category in UI.
 */
export interface ProductCatalog {
  id: string; // UUID
  trade: Trade;
  manufacturer: string; // e.g., "James Hardie", "CertainTeed"
  product_line: string; // e.g., "HardiePlank", "ColorPlus"
  product_name: string; // Full product name
  sku: string; // Product SKU/model number
  category: string; // e.g., "LAP SIDING - SMOOTH", "VERTICAL PANELS"
  subcategory: string | null; // Optional subcategory
  tier: string | null; // e.g., "Standard", "Premium"
  dimensions: Record<string, any> | null; // JSONB - Product dimensions
  coverage_specs: Record<string, any> | null; // JSONB - Coverage specifications
  physical_properties: Record<string, any> | null; // JSONB - Physical properties
  material_cost: number | null; // Material cost per unit
  labor_cost: number | null; // Labor cost per unit
  total_cost: number | null; // Total cost per unit
  unit: string; // e.g., "SF", "LF", "EA", "Box"
  description: string | null; // Product description
  installation_notes: string | null; // Special installation instructions
  requires_special_handling: boolean; // Whether special handling is needed
  lead_time_days: number; // Lead time in days
  available_colors: string[] | null; // Array of available colors
  available_finishes: string[] | null; // Array of available finishes
  display_name: string | null; // Optional custom display name
  sort_order: number; // Display order in lists
  is_featured: boolean; // Whether this is a featured product
  thumbnail_url: string | null; // Product thumbnail image URL
  datasheet_url: string | null; // Product datasheet/spec sheet URL
  active: boolean; // Whether this product is active
  discontinued: boolean; // Whether this product is discontinued
  replacement_sku: string | null; // SKU of replacement product if discontinued
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  created_by: string | null; // UUID of user who created
  updated_by: string | null; // UUID of user who last updated
}

/**
 * Project Configurations Table
 *
 * Stores user-submitted form data as JSONB.
 * Each trade gets its own configuration record.
 */
export interface ProjectConfiguration {
  id: string; // UUID
  project_id: string; // UUID - Foreign key to projects table
  trade: Trade;
  configuration_data: Record<string, any>; // JSONB - Dynamic form data
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

/**
 * Takeoffs Table
 *
 * Main takeoff/estimate records, one per project.
 * Created when project status changes to 'extracted'.
 */
export interface Takeoff {
  id: string; // UUID
  project_id: string; // UUID - Foreign key to projects table
  status: TakeoffStatus;

  // Totals (calculated from line items)
  total_material: number;
  total_labor: number;
  total_equipment: number;
  grand_total: number;

  // Pricing
  markup_percent: number; // Markup percentage (e.g., 15.00 for 15%)

  // Metadata
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null; // ISO timestamp

  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

/**
 * Takeoff Sections Table
 *
 * Sections organize line items by trade (siding, roofing, windows, gutters).
 * One section per selected trade in the project.
 */
export interface TakeoffSection {
  id: string; // UUID
  takeoff_id: string; // UUID - Foreign key to takeoffs table
  name: Trade; // Internal name: 'siding', 'roofing', 'windows', 'gutters'
  display_name: string; // Display name: 'Siding', 'Roofing', 'Windows', 'Gutters'
  sort_order: number;

  // Section totals (calculated from line items)
  total_material: number;
  total_labor: number;
  total_equipment: number;
  section_total: number;

  // Metadata
  notes: string | null;
  is_active: boolean;

  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

/**
 * Takeoff Line Items Table
 *
 * Individual line items with detailed material/labor/equipment cost breakdown.
 * Implements Mike Skjei pricing methodology with transparent cost breakdowns.
 */
export interface TakeoffLineItem {
  id: string; // UUID
  takeoff_id: string; // UUID - Foreign key to takeoffs table
  section_id: string; // UUID - Foreign key to takeoff_sections table

  // Item identification
  item_number: number;
  description: string;
  sku: string | null;

  // Quantity
  quantity: number;
  unit: Unit;

  // Unit costs (detailed breakdown)
  material_unit_cost: number;
  labor_unit_cost: number;
  equipment_unit_cost: number;

  // Extended costs (auto-calculated: quantity × unit_cost)
  // These are GENERATED ALWAYS columns in the database
  material_extended: number;
  labor_extended: number;
  equipment_extended: number;
  line_total: number;

  // Product reference
  product_id: string | null; // UUID - Optional link to product_catalog

  // Provenance tracking (CORE to methodology)
  calculation_source: CalculationSource;
  source_id: string | null; // External reference (e.g., HOVER measurement ID)
  formula_used: string | null; // Human-readable calculation explanation

  // Metadata
  notes: string | null;
  is_optional: boolean;
  is_deleted: boolean; // Soft delete for audit trail
  sort_order: number;
  presentation_group: string | null; // Group for display organization (e.g., 'siding', 'trim', 'flashing')

  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

/**
 * Extended Line Item with UI State
 *
 * Used in AG Grid for tracking changes before saving to database.
 */
export interface LineItemWithState extends TakeoffLineItem {
  isNew?: boolean; // Flag for newly added rows
  isModified?: boolean; // Flag for modified rows
}

// ============================================================================
// EXTRACTION SYSTEM TABLES
// ============================================================================

/**
 * Extraction Jobs Table
 *
 * Tracks PDF extraction jobs with page/detection processing status.
 */
export interface ExtractionJob {
  id: string; // UUID
  project_id: string | null; // UUID - Optional link to projects table
  project_name: string | null;
  status: JobStatus;
  source_pdf_url: string | null;
  total_pages: number;
  elevation_count: number;
  created_at: string; // ISO timestamp
  completed_at: string | null; // ISO timestamp
  default_scale_ratio: number | null;
  plan_dpi: number | null;
}

/**
 * Extraction Pages Table
 *
 * Individual pages from extracted PDFs with classification info.
 */
export interface ExtractionPage {
  id: string; // UUID
  job_id: string; // UUID - Foreign key to extraction_jobs
  page_number: number;
  image_url: string;
  thumbnail_url: string | null;
  page_type: PageType | null;
  page_type_confidence: number | null;
  elevation_name: ElevationName | null;
  status: string;
  scale_ratio: number | null;
  dpi: number | null;
  // Original unmarked image (detection coordinates are in this space)
  original_image_url: string | null;
  original_width: number | null;
  original_height: number | null;
}

/**
 * Extraction Detection Details Table (View)
 *
 * ML-detected bounding boxes with real-world measurements.
 * This is typically a view that joins detection data with calculated dimensions.
 */
export interface ExtractionDetectionDetail {
  id: string; // UUID
  job_id: string; // UUID
  page_id: string; // UUID
  class: DetectionClass;
  detection_index: number;
  confidence: number;

  // Pixel coordinates (from ML model)
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;

  // Real-world measurements (calculated from scale)
  real_width_in: number | null;
  real_height_in: number | null;
  real_width_ft: number | null;
  real_height_ft: number | null;
  area_sf: number | null;
  perimeter_lf: number | null;

  // Additional properties
  is_triangle: boolean;
  matched_tag: string | null;
  created_at: string; // ISO timestamp

  // Edit tracking
  status: DetectionStatus;
  edited_by: string | null;
  edited_at: string | null;
  original_bbox: {
    pixel_x: number;
    pixel_y: number;
    pixel_width: number;
    pixel_height: number;
  } | null;
}

/**
 * Extraction Elevation Calcs Table
 *
 * Aggregated calculations per elevation (facade areas, opening areas, etc.)
 */
export interface ExtractionElevationCalc {
  id: string; // UUID
  job_id: string; // UUID
  page_id: string; // UUID
  elevation_name: string | null;

  // Counts
  window_count: number;
  door_count: number;
  garage_count: number;
  gable_count: number;
  roof_count: number;
  exterior_wall_count: number;

  // Area calculations
  gross_facade_sf: number;
  window_area_sf: number;
  door_area_sf: number;
  garage_area_sf: number;
  total_openings_sf: number;
  net_siding_sf: number;

  // Window perimeter measurements
  window_perimeter_lf: number;
  window_head_lf: number;
  window_jamb_lf: number;
  window_sill_lf: number;

  // Door perimeter measurements
  door_perimeter_lf: number;
  door_head_lf: number;
  door_jamb_lf: number;

  // Other measurements
  garage_head_lf: number;
  gable_rake_lf: number;
  roof_eave_lf: number;
  roof_rake_lf: number;

  // Scale info
  scale_ratio: number | null;
  dpi: number | null;
  confidence_avg: number | null;
}

/**
 * Extraction Job Totals Table
 *
 * Aggregated totals across all elevations for a job.
 */
export interface ExtractionJobTotal {
  id: string; // UUID
  job_id: string; // UUID
  elevation_count: number;
  elevations_processed: string[];

  // Counts
  total_windows: number;
  total_doors: number;
  total_garages: number;
  total_gables: number;

  // Area totals
  total_gross_facade_sf: number;
  total_openings_sf: number;
  total_net_siding_sf: number;

  // Window perimeter totals
  total_window_head_lf: number;
  total_window_jamb_lf: number;
  total_window_sill_lf: number;
  total_window_perimeter_lf: number;

  // Door perimeter totals
  total_door_head_lf: number;
  total_door_jamb_lf: number;
  total_door_perimeter_lf: number;

  // Other totals
  total_garage_head_lf: number;
  total_gable_rake_lf: number;
  total_roof_eave_lf: number;

  // Derived values
  siding_squares: number;
  calculation_version: string | null;
}

// ============================================================================
// DATABASE TYPE
// ============================================================================

/**
 * Complete Database Schema
 *
 * Use this type for Supabase client type inference:
 *
 * @example
 * const supabase = createClient<Database>(url, key);
 */
export interface Database {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>;
      };
      trade_configurations: {
        Row: TradeConfiguration;
        Insert: Omit<TradeConfiguration, 'id'>;
        Update: Partial<Omit<TradeConfiguration, 'id'>>;
      };
      product_catalog: {
        Row: ProductCatalog;
        Insert: Omit<ProductCatalog, 'id'>;
        Update: Partial<Omit<ProductCatalog, 'id'>>;
      };
      project_configurations: {
        Row: ProjectConfiguration;
        Insert: Omit<ProjectConfiguration, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ProjectConfiguration, 'id' | 'created_at' | 'updated_at'>>;
      };
      takeoffs: {
        Row: Takeoff;
        Insert: Omit<Takeoff, 'id' | 'created_at' | 'updated_at' | 'total_material' | 'total_labor' | 'total_equipment' | 'grand_total'>;
        Update: Partial<Omit<Takeoff, 'id' | 'created_at' | 'updated_at' | 'total_material' | 'total_labor' | 'total_equipment' | 'grand_total'>>;
      };
      takeoff_sections: {
        Row: TakeoffSection;
        Insert: Omit<TakeoffSection, 'id' | 'created_at' | 'updated_at' | 'total_material' | 'total_labor' | 'total_equipment' | 'section_total'>;
        Update: Partial<Omit<TakeoffSection, 'id' | 'created_at' | 'updated_at' | 'total_material' | 'total_labor' | 'total_equipment' | 'section_total'>>;
      };
      takeoff_line_items: {
        Row: TakeoffLineItem;
        Insert: Omit<TakeoffLineItem, 'id' | 'created_at' | 'updated_at' | 'material_extended' | 'labor_extended' | 'equipment_extended' | 'line_total'>;
        Update: Partial<Omit<TakeoffLineItem, 'id' | 'created_at' | 'updated_at' | 'material_extended' | 'labor_extended' | 'equipment_extended' | 'line_total'>>;
      };
      // Extraction system tables
      extraction_jobs: {
        Row: ExtractionJob;
        Insert: Omit<ExtractionJob, 'id' | 'created_at'>;
        Update: Partial<Omit<ExtractionJob, 'id' | 'created_at'>>;
      };
      extraction_pages: {
        Row: ExtractionPage;
        Insert: Omit<ExtractionPage, 'id'>;
        Update: Partial<Omit<ExtractionPage, 'id'>>;
      };
      extraction_detection_details: {
        Row: ExtractionDetectionDetail;
        Insert: Omit<ExtractionDetectionDetail, 'id' | 'created_at'>;
        Update: Partial<Omit<ExtractionDetectionDetail, 'id' | 'created_at'>>;
      };
      extraction_elevation_calcs: {
        Row: ExtractionElevationCalc;
        Insert: Omit<ExtractionElevationCalc, 'id'>;
        Update: Partial<Omit<ExtractionElevationCalc, 'id'>>;
      };
      extraction_job_totals: {
        Row: ExtractionJobTotal;
        Insert: Omit<ExtractionJobTotal, 'id'>;
        Update: Partial<Omit<ExtractionJobTotal, 'id'>>;
      };
    };
  };
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Helper type for grouped products (used in UI dropdowns)
 */
export interface GroupedProduct {
  category: string;
  products: ProductCatalog[];
}

/**
 * Helper type for form field rendering
 */
export interface FormFieldDefinition extends TradeConfiguration {
  options?: FieldOption[]; // Resolved options (from field_options or product_catalog)
  isVisible?: boolean; // Computed based on show_if_conditions
}
