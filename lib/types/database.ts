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

export type AssistantScope = 'global' | 'project';

export type AssistantMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type KnowledgeCollectionType = 'core' | 'company' | 'project' | 'template' | 'rule';

export type KnowledgeVisibility = 'organization' | 'project';

export type KnowledgeDocumentStatus = 'uploaded' | 'extracting' | 'chunking' | 'embedding' | 'ready' | 'error';

export type AssistantFeedbackRating = 'helpful' | 'not_helpful';

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

/**
 * Knowledge Collections Table
 *
 * Groups documents, rules, templates, and core/company/project knowledge for retrieval.
 * project_id is nullable so the same table supports global and project-specific assistant scope.
 */
export interface KnowledgeCollection {
  id: string;
  organization_id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  collection_type: KnowledgeCollectionType;
  visibility: KnowledgeVisibility;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Documents Table
 *
 * Tracks uploaded source files and extraction/chunking status for the assistant knowledge library.
 */
export interface KnowledgeDocumentRecord {
  id: string;
  organization_id: string;
  project_id: string | null;
  collection_id: string | null;
  uploaded_by: string | null;
  title: string;
  file_name: string | null;
  file_type: string | null;
  mime_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  source_url: string | null;
  status: KnowledgeDocumentStatus;
  extracted_text_checksum: string | null;
  chunk_count: number;
  metadata: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Document Chunks Table
 *
 * Stores searchable content segments and optional pgvector embeddings.
 */
export interface DocumentChunk {
  id: string;
  organization_id: string;
  project_id: string | null;
  document_id: string;
  collection_id: string | null;
  chunk_index: number;
  content: string;
  token_count: number | null;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Chat Threads Table
 *
 * Conversation containers for global or project-level assistant chats.
 */
export interface ChatThread {
  id: string;
  organization_id: string;
  project_id: string | null;
  title: string;
  scope: AssistantScope;
  created_by: string | null;
  archived_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Chat Messages Table
 *
 * Stores user/assistant messages and citation metadata.
 */
export interface ChatMessage {
  id: string;
  organization_id: string;
  project_id: string | null;
  thread_id: string;
  role: AssistantMessageRole;
  content: string;
  citations: Record<string, unknown>[];
  token_count: number | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

/**
 * Assistant Feedback Table
 *
 * Captures thumbs-up/down feedback and future save-as-rule actions.
 */
export interface AssistantFeedback {
  id: string;
  organization_id: string;
  project_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  user_id: string | null;
  rating: AssistantFeedbackRating;
  feedback_type: string | null;
  comment: string | null;
  saved_as_rule: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Company Rules Table
 *
 * Stores reusable estimating rules from manual entry or assistant feedback.
 */
export interface CompanyRule {
  id: string;
  organization_id: string;
  project_id: string | null;
  collection_id: string | null;
  source_feedback_id: string | null;
  title: string;
  content: string;
  rule_type: string;
  active: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Prompt Templates Table
 *
 * Stores reusable assistant prompts for company and project workflows.
 */
export interface PromptTemplate {
  id: string;
  organization_id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  template_key: string;
  system_prompt: string;
  user_prompt: string | null;
  variables: Record<string, unknown>[];
  active: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
      knowledge_collections: {
        Row: KnowledgeCollection;
        Insert: Omit<KnowledgeCollection, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<KnowledgeCollection, 'id' | 'created_at' | 'updated_at'>>;
      };
      documents: {
        Row: KnowledgeDocumentRecord;
        Insert: Omit<KnowledgeDocumentRecord, 'id' | 'created_at' | 'updated_at' | 'chunk_count'> & Partial<Pick<KnowledgeDocumentRecord, 'chunk_count'>>;
        Update: Partial<Omit<KnowledgeDocumentRecord, 'id' | 'created_at' | 'updated_at'>>;
      };
      document_chunks: {
        Row: DocumentChunk;
        Insert: Omit<DocumentChunk, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DocumentChunk, 'id' | 'created_at' | 'updated_at'>>;
      };
      chat_threads: {
        Row: ChatThread;
        Insert: Omit<ChatThread, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ChatThread, 'id' | 'created_at' | 'updated_at'>>;
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Omit<ChatMessage, 'id' | 'created_at'>;
        Update: Partial<Omit<ChatMessage, 'id' | 'created_at'>>;
      };
      assistant_feedback: {
        Row: AssistantFeedback;
        Insert: Omit<AssistantFeedback, 'id' | 'created_at'>;
        Update: Partial<Omit<AssistantFeedback, 'id' | 'created_at'>>;
      };
      company_rules: {
        Row: CompanyRule;
        Insert: Omit<CompanyRule, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CompanyRule, 'id' | 'created_at' | 'updated_at'>>;
      };
      prompt_templates: {
        Row: PromptTemplate;
        Insert: Omit<PromptTemplate, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PromptTemplate, 'id' | 'created_at' | 'updated_at'>>;
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
