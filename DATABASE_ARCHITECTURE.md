# Database Architecture Documentation

> AI Estimator - Construction Estimation SaaS Platform
>
> Last Updated: January 2026

---

## Table of Contents

1. [Complete Table Inventory](#1-complete-table-inventory)
2. [Entity Relationship Diagram](#2-entity-relationship-diagram)
3. [Key JSONB Column Structures](#3-key-jsonb-column-structures)
4. [Enums and Custom Types](#4-enums-and-custom-types)
5. [Views](#5-views)
6. [Indexes](#6-indexes)
7. [RLS Policies](#7-rls-policies)
8. [Common Query Patterns](#8-common-query-patterns)
9. [Data Flow Diagrams](#9-data-flow-diagrams)

---

## 1. Complete Table Inventory

### 1.1 Organization/User Tables

#### `organizations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Organization name |
| `slug` | TEXT | URL-safe identifier |
| `logo_url` | TEXT | Logo image URL |
| `settings` | JSONB | Organization settings |
| `subscription_tier` | TEXT | 'free' \| 'pro' \| 'enterprise' |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Foreign Keys:** None
**Row Count Estimate:** ~100-1000

---

#### `user_profiles`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (matches auth.users.id) |
| `email` | TEXT | User email |
| `full_name` | TEXT | Display name |
| `avatar_url` | TEXT | Profile picture URL |
| `phone` | TEXT | Phone number |

**Foreign Keys:** `id` → `auth.users(id)`
**Row Count Estimate:** ~100-1000

---

#### `organization_memberships`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | User reference |
| `organization_id` | UUID | Organization reference |
| `role` | TEXT | 'owner' \| 'admin' \| 'estimator' \| 'viewer' |
| `joined_at` | TIMESTAMPTZ | When user joined org |

**Foreign Keys:**
- `user_id` → `auth.users(id)`
- `organization_id` → `organizations(id)`

**Row Count Estimate:** ~200-2000

---

### 1.2 Project Tables

#### `projects`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Project name |
| `client_name` | TEXT | Customer name |
| `address` | TEXT | Project address |
| `selected_trades` | TEXT[] | Array: 'siding', 'roofing', 'windows', 'gutters' |
| `status` | TEXT | Project status enum |
| `hover_pdf_url` | TEXT | Uploaded PDF URL |
| `excel_url` | TEXT | Generated Excel URL |
| `markup_percent` | DECIMAL(10,2) | Markup percentage |
| `processing_started_at` | TIMESTAMPTZ | Processing start time |
| `processing_completed_at` | TIMESTAMPTZ | Processing end time |
| `error_message` | TEXT | Error details if failed |
| `organization_id` | UUID | Org reference (for RLS) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Foreign Keys:** `organization_id` → `organizations(id)`
**Row Count Estimate:** ~1000-10000

---

#### `project_configurations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `project_id` | UUID | Project reference |
| `trade` | TEXT | Trade type |
| `configuration_data` | JSONB | All form field values |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Foreign Keys:** `project_id` → `projects(id) ON DELETE CASCADE`
**Unique Constraint:** `(project_id, trade)`
**Row Count Estimate:** ~4000-40000 (4 trades per project)

---

### 1.3 Extraction Tables

#### `extraction_jobs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `project_id` | UUID | Project reference |
| `project_name` | TEXT | Denormalized project name |
| `status` | TEXT | Job status enum |
| `source_pdf_url` | TEXT | Source PDF URL |
| `total_pages` | INTEGER | Total pages in PDF |
| `elevation_count` | INTEGER | Number of elevation pages |
| `default_scale_ratio` | DECIMAL(10,4) | Default scale |
| `plan_dpi` | INTEGER | Plan DPI |
| `results_summary` | JSONB | Aggregated results |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `completed_at` | TIMESTAMPTZ | Completion timestamp |

**Foreign Keys:** `project_id` → `projects(id)`
**Row Count Estimate:** ~1000-5000

---

#### `extraction_pages`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `job_id` | UUID | Job reference |
| `page_number` | INTEGER | Page number in PDF |
| `image_url` | TEXT | Page image URL |
| `thumbnail_url` | TEXT | Thumbnail URL |
| `page_type` | TEXT | Page type enum |
| `page_type_confidence` | DECIMAL(5,4) | Classification confidence |
| `elevation_name` | TEXT | 'front' \| 'rear' \| 'left' \| 'right' |
| `status` | TEXT | Processing status |
| `scale_ratio` | DECIMAL(10,4) | Page-specific scale |
| `dpi` | INTEGER | Page DPI |
| `original_image_url` | TEXT | Unmarked image URL |
| `original_width` | INTEGER | Image width in pixels |
| `original_height` | INTEGER | Image height in pixels |
| `ocr_data` | JSONB | Schedule extraction data |
| `ocr_status` | TEXT | OCR processing status |
| `ocr_processed_at` | TIMESTAMPTZ | When OCR completed |

**Foreign Keys:** `job_id` → `extraction_jobs(id)`
**Row Count Estimate:** ~10000-50000 (10 pages per job)

---

#### `extraction_detections_draft`

User-editable detections (local-first editing).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `job_id` | UUID | Job reference |
| `page_id` | UUID | Page reference |
| `class` | TEXT | Detection class |
| `detection_index` | INTEGER | Index on page |
| `confidence` | DECIMAL(5,4) | ML confidence |
| `pixel_x` | DECIMAL(10,4) | X position |
| `pixel_y` | DECIMAL(10,4) | Y position |
| `pixel_width` | DECIMAL(10,4) | Width in pixels |
| `pixel_height` | DECIMAL(10,4) | Height in pixels |
| `real_width_in` | DECIMAL(10,2) | Real width in inches |
| `real_height_in` | DECIMAL(10,2) | Real height in inches |
| `real_width_ft` | DECIMAL(10,2) | Real width in feet |
| `real_height_ft` | DECIMAL(10,2) | Real height in feet |
| `area_sf` | DECIMAL(10,2) | Area in square feet |
| `perimeter_lf` | DECIMAL(10,2) | Perimeter in linear feet |
| `is_triangle` | BOOLEAN | Triangle shape flag |
| `is_deleted` | BOOLEAN | Soft delete flag |
| `polygon_points` | JSONB | Polygon vertices |
| `has_hole` | BOOLEAN | Has cutout flag |
| `markup_type` | TEXT | 'polygon' \| 'line' \| 'point' |
| `marker_label` | TEXT | Point marker label |
| `assigned_material_id` | UUID | Assigned product |
| `material_cost_override` | DECIMAL(10,2) | Price override |
| `labor_cost_override` | DECIMAL(10,2) | Labor override |
| `notes` | TEXT | User notes |
| `color_override` | TEXT | Color override hex |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Foreign Keys:**
- `job_id` → `extraction_jobs(id)`
- `page_id` → `extraction_pages(id)`
- `assigned_material_id` → `product_catalog(id)`

**Row Count Estimate:** ~50000-500000

---

#### `extraction_detection_details` (View)

Computed view joining detections with real-world measurements.

| Column | Type | Description |
|--------|------|-------------|
| (all columns from extraction_detections_draft) | | |
| `status` | TEXT | Computed from is_deleted |
| `edited_by` | TEXT | Last editor |
| `edited_at` | TIMESTAMPTZ | Last edit time |
| `original_bbox` | JSONB | Original bounding box |

---

#### `extraction_elevation_calcs`

Aggregated measurements per elevation page.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `job_id` | UUID | Job reference |
| `page_id` | UUID | Page reference |
| `elevation_name` | TEXT | Elevation direction |
| `window_count` | INTEGER | Number of windows |
| `door_count` | INTEGER | Number of doors |
| `garage_count` | INTEGER | Number of garages |
| `gable_count` | INTEGER | Number of gables |
| `roof_count` | INTEGER | Number of roof areas |
| `exterior_wall_count` | INTEGER | Number of wall sections |
| `gross_facade_sf` | DECIMAL(10,2) | Total facade area |
| `window_area_sf` | DECIMAL(10,2) | Total window area |
| `door_area_sf` | DECIMAL(10,2) | Total door area |
| `garage_area_sf` | DECIMAL(10,2) | Total garage area |
| `total_openings_sf` | DECIMAL(10,2) | Sum of opening areas |
| `net_siding_sf` | DECIMAL(10,2) | Facade minus openings |
| `window_perimeter_lf` | DECIMAL(10,2) | Window trim length |
| `window_head_lf` | DECIMAL(10,2) | Window header length |
| `window_jamb_lf` | DECIMAL(10,2) | Window jamb length |
| `window_sill_lf` | DECIMAL(10,2) | Window sill length |
| `door_perimeter_lf` | DECIMAL(10,2) | Door trim length |
| `door_head_lf` | DECIMAL(10,2) | Door header length |
| `door_jamb_lf` | DECIMAL(10,2) | Door jamb length |
| `garage_head_lf` | DECIMAL(10,2) | Garage header length |
| `gable_rake_lf` | DECIMAL(10,2) | Gable rake length |
| `roof_eave_lf` | DECIMAL(10,2) | Eave length |
| `roof_rake_lf` | DECIMAL(10,2) | Roof rake length |
| `scale_ratio` | DECIMAL(10,4) | Scale used |
| `dpi` | INTEGER | DPI used |
| `confidence_avg` | DECIMAL(5,4) | Average confidence |

**Foreign Keys:**
- `job_id` → `extraction_jobs(id)`
- `page_id` → `extraction_pages(id)`

**Row Count Estimate:** ~5000-25000

---

#### `extraction_job_totals`

Aggregated totals across all elevations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `job_id` | UUID | Job reference |
| `elevation_count` | INTEGER | Elevations processed |
| `elevations_processed` | TEXT[] | List of elevations |
| `total_windows` | INTEGER | Total window count |
| `total_doors` | INTEGER | Total door count |
| `total_garages` | INTEGER | Total garage count |
| `total_gables` | INTEGER | Total gable count |
| `total_gross_facade_sf` | DECIMAL(10,2) | Total facade area |
| `total_openings_sf` | DECIMAL(10,2) | Total opening area |
| `total_net_siding_sf` | DECIMAL(10,2) | Net siding area |
| `total_window_head_lf` | DECIMAL(10,2) | Total window head |
| `total_window_jamb_lf` | DECIMAL(10,2) | Total window jamb |
| `total_window_sill_lf` | DECIMAL(10,2) | Total window sill |
| `total_window_perimeter_lf` | DECIMAL(10,2) | Total window perimeter |
| `total_door_head_lf` | DECIMAL(10,2) | Total door head |
| `total_door_jamb_lf` | DECIMAL(10,2) | Total door jamb |
| `total_door_perimeter_lf` | DECIMAL(10,2) | Total door perimeter |
| `total_garage_head_lf` | DECIMAL(10,2) | Total garage head |
| `total_gable_rake_lf` | DECIMAL(10,2) | Total gable rake |
| `total_roof_eave_lf` | DECIMAL(10,2) | Total roof eave |
| `siding_squares` | DECIMAL(10,2) | Net siding / 100 |
| `calculation_version` | TEXT | Version string |
| `outside_corners_count` | INTEGER | Outside corner count |
| `inside_corners_count` | INTEGER | Inside corner count |
| `outside_corners_lf` | DECIMAL(10,2) | Outside corner LF |
| `inside_corners_lf` | DECIMAL(10,2) | Inside corner LF |
| `aggregated_data` | JSONB | Full aggregation data |

**Foreign Keys:** `job_id` → `extraction_jobs(id)`
**Row Count Estimate:** ~1000-5000

---

### 1.4 Product Tables

#### `product_catalog`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `trade` | TEXT | Trade type |
| `manufacturer` | TEXT | Manufacturer name |
| `product_line` | TEXT | Product line |
| `product_name` | TEXT | Full product name |
| `sku` | TEXT | Unique SKU |
| `category` | TEXT | Product category |
| `subcategory` | TEXT | Subcategory |
| `tier` | TEXT | 'Standard' \| 'Premium' |
| `dimensions` | JSONB | Product dimensions |
| `coverage_specs` | JSONB | Coverage specs |
| `physical_properties` | JSONB | Physical properties |
| `material_cost` | DECIMAL(10,2) | Material cost |
| `labor_cost` | DECIMAL(10,2) | Labor cost |
| `total_cost` | DECIMAL(10,2) | Total cost |
| `unit` | TEXT | Unit type |
| `description` | TEXT | Product description |
| `installation_notes` | TEXT | Installation notes |
| `requires_special_handling` | BOOLEAN | Special handling flag |
| `lead_time_days` | INTEGER | Lead time |
| `available_colors` | TEXT[] | Color options |
| `available_finishes` | TEXT[] | Finish options |
| `display_name` | TEXT | Display name |
| `sort_order` | INTEGER | Sort order |
| `is_featured` | BOOLEAN | Featured flag |
| `thumbnail_url` | TEXT | Thumbnail URL |
| `datasheet_url` | TEXT | Datasheet URL |
| `active` | BOOLEAN | Active flag |
| `discontinued` | BOOLEAN | Discontinued flag |
| `replacement_sku` | TEXT | Replacement SKU |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Update timestamp |

**Unique Constraint:** `sku`
**Row Count Estimate:** 76+ products

---

#### `pricing_items`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `snapshot_id` | UUID | Pricing snapshot reference |
| `sku` | TEXT | Product SKU |
| `product_name` | TEXT | Product name |
| `category` | TEXT | Product category |
| `trade` | TEXT | Trade type |
| `unit` | TEXT | Unit type |
| `material_cost` | DECIMAL(10,2) | Material cost |
| `base_labor_cost` | DECIMAL(10,2) | Base labor cost |
| `manufacturer` | TEXT | Manufacturer |
| `notes` | TEXT | Notes |
| `labor_class` | TEXT | Labor classification |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Unique Constraint:** `(snapshot_id, sku)`
**Row Count Estimate:** 200+ items

**Categories:**
- `lap_siding` - Lap siding products
- `panel_siding` - Panel siding
- `trim` - Trim boards
- `architectural` - Corbels, brackets, shutters, posts, columns
- `soffit` - Soffit panels
- `fascia` - Fascia boards
- `gutter_accessories` - Gutter components
- `fasteners` - Nails, screws
- `flashing` - Flashing products
- `sealants` - Caulk, sealants

---

#### `pricing_snapshots`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Snapshot name |
| `description` | TEXT | Description |
| `is_active` | BOOLEAN | Active snapshot flag |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Row Count Estimate:** ~5-10

---

### 1.5 Takeoff Tables

#### `takeoffs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `project_id` | UUID | Project reference |
| `status` | TEXT | Takeoff status enum |
| `total_material` | DECIMAL(10,2) | Total material cost |
| `total_labor` | DECIMAL(10,2) | Total labor cost |
| `total_equipment` | DECIMAL(10,2) | Total equipment cost |
| `grand_total` | DECIMAL(10,2) | Grand total |
| `markup_percent` | DECIMAL(10,2) | Markup percentage |
| `notes` | TEXT | Takeoff notes |
| `approved_by` | TEXT | Approver |
| `approved_at` | TIMESTAMPTZ | Approval timestamp |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Update timestamp |

**Foreign Keys:** `project_id` → `projects(id) ON DELETE CASCADE`
**Unique Constraint:** `project_id` (one takeoff per project)
**Row Count Estimate:** ~1000-10000

---

#### `takeoff_sections`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `takeoff_id` | UUID | Takeoff reference |
| `name` | TEXT | Trade name |
| `display_name` | TEXT | Display name |
| `sort_order` | INTEGER | Display order |
| `total_material` | DECIMAL(10,2) | Section material total |
| `total_labor` | DECIMAL(10,2) | Section labor total |
| `total_equipment` | DECIMAL(10,2) | Section equipment total |
| `section_total` | DECIMAL(10,2) | Section total |
| `notes` | TEXT | Section notes |
| `is_active` | BOOLEAN | Active flag |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Update timestamp |

**Foreign Keys:** `takeoff_id` → `takeoffs(id) ON DELETE CASCADE`
**Unique Constraint:** `(takeoff_id, name)`
**Row Count Estimate:** ~4000-40000 (4 sections per takeoff)

---

#### `takeoff_line_items`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `takeoff_id` | UUID | Takeoff reference |
| `section_id` | UUID | Section reference |
| `item_number` | INTEGER | Item number in section |
| `description` | TEXT | Item description |
| `sku` | TEXT | Product SKU |
| `quantity` | DECIMAL(10,4) | Quantity |
| `unit` | TEXT | Unit type |
| `material_unit_cost` | DECIMAL(10,2) | Material unit cost |
| `labor_unit_cost` | DECIMAL(10,2) | Labor unit cost |
| `equipment_unit_cost` | DECIMAL(10,2) | Equipment unit cost |
| `material_extended` | DECIMAL(10,2) | **GENERATED**: qty × mat cost |
| `labor_extended` | DECIMAL(10,2) | **GENERATED**: qty × labor cost |
| `equipment_extended` | DECIMAL(10,2) | **GENERATED**: qty × equip cost |
| `line_total` | DECIMAL(10,2) | **GENERATED**: sum of extended |
| `product_id` | UUID | Product reference |
| `calculation_source` | TEXT | Source enum |
| `source_id` | TEXT | External reference |
| `formula_used` | TEXT | Calculation explanation |
| `notes` | TEXT | Item notes |
| `is_optional` | BOOLEAN | Optional item flag |
| `is_deleted` | BOOLEAN | Soft delete flag |
| `sort_order` | INTEGER | Display order |
| `presentation_group` | TEXT | Grouping for display |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Update timestamp |

**Foreign Keys:**
- `takeoff_id` → `takeoffs(id) ON DELETE CASCADE`
- `section_id` → `takeoff_sections(id) ON DELETE CASCADE`
- `product_id` → `product_catalog(id) ON DELETE SET NULL`

**Unique Constraint:** `(section_id, item_number)`
**Row Count Estimate:** ~50000-500000 (50 items per section)

---

### 1.6 Configuration Tables

#### `trade_configurations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `trade` | TEXT | Trade type |
| `config_section` | TEXT | Section grouping |
| `config_name` | TEXT | Field identifier |
| `config_display_name` | TEXT | Display name |
| `field_type` | TEXT | Field type enum |
| `field_label` | TEXT | Input label |
| `field_placeholder` | TEXT | Placeholder text |
| `field_help_text` | TEXT | Help text |
| `field_options` | JSONB | Select options |
| `default_value` | TEXT | Default value |
| `is_required` | BOOLEAN | Required flag |
| `validation_rules` | JSONB | Validation rules |
| `show_if_conditions` | JSONB | Visibility conditions |
| `show_if_product_attributes` | JSONB | Product attribute conditions |
| `hide_if_conditions` | JSONB | Hide conditions |
| `triggers_auto_scope` | BOOLEAN | Auto-scope trigger |
| `auto_scope_rule_id` | UUID | Auto-scope rule ref |
| `section_order` | INTEGER | Section display order |
| `field_order` | INTEGER | Field display order |
| `group_name` | TEXT | Field grouping |
| `active` | BOOLEAN | Active flag |
| `load_from_catalog` | BOOLEAN | Load from product_catalog |
| `catalog_filter` | JSONB | Product filter criteria |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Update timestamp |

**Unique Constraint:** `(trade, config_name)`
**Row Count Estimate:** ~50-100 fields

---

#### `labor_rates`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `rate_name` | TEXT | Rate name |
| `description` | TEXT | Description |
| `trade` | TEXT | Trade type |
| `presentation_group` | TEXT | Display grouping |
| `unit` | TEXT | Unit type |
| `base_rate` | DECIMAL(10,2) | Base rate |
| `difficulty_multiplier` | DECIMAL(5,2) | Difficulty factor |
| `active` | BOOLEAN | Active flag |
| `notes` | TEXT | Notes |

**Row Count Estimate:** ~20-50

---

#### `labor_auto_scope_rules`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `rule_id` | TEXT | Unique rule identifier |
| `rule_name` | TEXT | Rule display name |
| `description` | TEXT | Rule description |
| `trade` | TEXT | Trade type |
| `trigger_type` | TEXT | Trigger type enum |
| `trigger_value` | TEXT | Comma-separated triggers |
| `trigger_condition` | JSONB | Additional conditions |
| `labor_rate_id` | INTEGER | Labor rate reference |
| `quantity_source` | TEXT | Quantity source enum |
| `quantity_formula` | TEXT | Formula string |
| `quantity_unit` | TEXT | Unit type |
| `priority` | INTEGER | Execution order |
| `active` | BOOLEAN | Active flag |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Update timestamp |

**Foreign Keys:** `labor_rate_id` → `labor_rates(id)`
**Unique Constraint:** `rule_id`
**Row Count Estimate:** ~20-50

---

#### `siding_auto_scope_rules`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `rule_name` | TEXT | Rule name |
| `description` | TEXT | Description |
| `trigger_condition` | JSONB | Trigger conditions |
| `output_sku` | TEXT | Output product SKU |
| `quantity_formula` | TEXT | Quantity formula |
| `unit` | TEXT | Output unit |
| `priority` | INTEGER | Execution order |
| `active` | BOOLEAN | Active flag |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Row Count Estimate:** ~30-50

---

### 1.7 CAD/Bluebeam Tables

#### `bluebeam_projects`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `project_id` | UUID | Project reference |
| `name` | TEXT | Project name |
| `pdf_url` | TEXT | PDF URL |
| `status` | TEXT | Processing status |
| `page_count` | INTEGER | Number of pages |
| `floor_plan_data` | JSONB | Floor plan analysis |
| `notes_specs_data` | JSONB | Notes/specs extraction |
| `rfi_list_data` | JSONB | RFI list |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Update timestamp |

**Foreign Keys:** `project_id` → `projects(id)`

---

#### `cad_markups`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `project_id` | UUID | Bluebeam project reference |
| `page_number` | INTEGER | Page number |
| `markup_data` | JSONB | Markup data |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Update timestamp |

**Foreign Keys:** `project_id` → `bluebeam_projects(id)`

---

#### `cad_hover_measurements`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `project_id` | UUID | Project reference |
| `measurements` | JSONB | Measurement data |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

#### `cad_material_callouts`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `project_id` | UUID | Project reference |
| `callout_data` | JSONB | Callout data |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

#### `cad_layer_mappings`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `layer_name` | TEXT | CAD layer name |
| `detection_class` | TEXT | Mapped class |
| `color` | TEXT | Display color |
| `active` | BOOLEAN | Active flag |

---

---

## 2. Entity Relationship Diagram

```
┌─────────────────┐
│  organizations  │
└────────┬────────┘
         │ 1
         │
         ▼ N
┌─────────────────────────┐
│ organization_memberships│
└────────┬────────────────┘
         │ N
         │
         ▼ 1
┌─────────────────┐          ┌─────────────────┐
│   user_profiles │◀────────▶│   auth.users    │
└─────────────────┘          └─────────────────┘


┌─────────────────┐
│  organizations  │
└────────┬────────┘
         │ 1
         │
         ▼ N
┌─────────────────┐
│    projects     │
└────────┬────────┘
         │ 1
         │
    ┌────┴────────────────────────┐
    │                             │
    ▼ N                           ▼ N
┌───────────────────────┐  ┌─────────────────────┐
│ project_configurations│  │   extraction_jobs   │
└───────────────────────┘  └──────────┬──────────┘
                                      │ 1
                                      │
                           ┌──────────┴──────────┐
                           │                     │
                           ▼ N                   ▼ 1
                    ┌──────────────────┐  ┌─────────────────────┐
                    │ extraction_pages │  │ extraction_job_totals│
                    └────────┬─────────┘  └─────────────────────┘
                             │ 1
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼ N               ▼ 1
         ┌─────────────────────────┐ ┌─────────────────────────┐
         │extraction_detections_draft│ │extraction_elevation_calcs│
         └─────────────────────────┘ └─────────────────────────┘


┌─────────────────┐
│    projects     │
└────────┬────────┘
         │ 1
         │
         ▼ 1
┌─────────────────┐
│    takeoffs     │
└────────┬────────┘
         │ 1
         │
         ▼ N
┌─────────────────┐
│ takeoff_sections│
└────────┬────────┘
         │ 1
         │
         ▼ N
┌─────────────────────┐     ┌─────────────────┐
│ takeoff_line_items  │────▶│ product_catalog │
└─────────────────────┘     └─────────────────┘


┌────────────────────────┐     ┌─────────────────┐
│ trade_configurations   │────▶│ product_catalog │
│ (via load_from_catalog)│     │ (via catalog_filter)│
└────────────────────────┘     └─────────────────┘


┌────────────────────────┐     ┌─────────────────┐
│ labor_auto_scope_rules │────▶│   labor_rates   │
└────────────────────────┘     └─────────────────┘


┌─────────────────┐     ┌───────────────────┐
│  pricing_items  │────▶│ pricing_snapshots │
└─────────────────┘     └───────────────────┘
```

---

## 3. Key JSONB Column Structures

### 3.1 `product_catalog.physical_properties`

```json
{
  "is_colorplus": true,
  "is_panel": false,
  "is_primed": false,
  "requires_primer": false,
  "joint_flashing_required": true,
  "hex_code": "#F5F5F0",
  "color": "arctic white",
  "texture": "smooth",
  "exposure_inches": 7.0,
  "width": 8.25,
  "length": 144,
  "thickness": 0.312,
  "coverage_sf": 7.0,
  "material_type": "fiber cement",
  "fire_rating": "Class A",
  "warranty_years": 30
}
```

---

### 3.2 `product_catalog.dimensions`

```json
{
  "width_inches": 8.25,
  "length_inches": 144,
  "thickness_inches": 0.312,
  "weight_lbs": 25.5,
  "bundle_qty": 25
}
```

---

### 3.3 `product_catalog.coverage_specs`

```json
{
  "coverage_sf_per_piece": 7.0,
  "pieces_per_square": 14.3,
  "overlap_inches": 1.25,
  "exposure_inches": 7.0
}
```

---

### 3.4 `trade_configurations.field_options`

```json
{
  "options": [
    { "value": "arctic_white", "label": "Arctic White" },
    { "value": "cobble_stone", "label": "Cobble Stone" },
    { "value": "monterey_taupe", "label": "Monterey Taupe" },
    { "value": "aged_pewter", "label": "Aged Pewter" }
  ]
}
```

---

### 3.5 `trade_configurations.show_if_conditions`

**Simple equality check:**
```json
{
  "belly_band_include": true
}
```

**Multiple conditions (AND):**
```json
{
  "corner_trim_include": true,
  "siding_product_type": "hardie_plank"
}
```

**With operator:**
```json
{
  "siding_product_type": {
    "operator": "not_equals",
    "value": ""
  }
}
```

**Contains check (for arrays):**
```json
{
  "selected_options": {
    "operator": "contains",
    "value": "premium"
  }
}
```

---

### 3.6 `trade_configurations.show_if_product_attributes`

```json
{
  "is_colorplus": true
}
```

**Frontend implementation:**
```typescript
const selectedProduct = products.find(p => p.id === formValues.siding_product_type);
if (selectedProduct?.physical_properties?.is_colorplus) {
  showColorSwatchField();
}
```

---

### 3.7 `trade_configurations.catalog_filter`

```json
{
  "active": true,
  "category": ["LAP SIDING - SMOOTH", "LAP SIDING - CEDARMILL", "PANEL SIDING"],
  "manufacturer": "James Hardie",
  "trade": "siding"
}
```

---

### 3.8 `project_configurations.configuration_data`

```json
{
  "siding_product_type": "HP-825-SM-CP-AW",
  "colorplus_color": "arctic_white",
  "belly_band_include": true,
  "belly_band_color": "match_siding",
  "belly_band_material": "hardie_trim_44",
  "corner_trim_include": true,
  "corner_trim_product": "hardie_outside_corner",
  "corner_trim_color": "arctic_white",
  "j_channel_include": true,
  "j_channel_product": "vinyl_j_channel",
  "j_channel_color": "white"
}
```

---

### 3.9 `siding_auto_scope_rules.trigger_condition`

```json
{
  "add_battens": true,
  "batten_spacing": "16",
  "product_finish": "colorplus"
}
```

---

### 3.10 `labor_auto_scope_rules.trigger_condition`

```json
{
  "min_quantity": 10,
  "threshold_sqft": 100,
  "requires_scaffolding": true
}
```

---

### 3.11 `extraction_jobs.results_summary`

```json
{
  "total_pages_analyzed": 12,
  "successful": 10,
  "failed": 2,
  "total_time_seconds": 145.3,
  "avg_time_per_page_ms": 12108,
  "total_input_tokens": 150000,
  "total_output_tokens": 25000,
  "estimated_cost_usd": 1.25,
  "page_type_counts": {
    "elevation": 8,
    "floor_plan": 2,
    "schedule": 1,
    "detail": 1
  },
  "element_totals": {
    "windows": 24,
    "doors": 6,
    "garages": 2,
    "gables": 2,
    "outside_corners": 8,
    "inside_corners": 4
  },
  "aggregation": {
    "corners": {...},
    "heights": {...},
    "elements": {...}
  }
}
```

---

### 3.12 `extraction_job_totals.aggregated_data`

```json
{
  "corners": {
    "outside_count": 8,
    "outside_count_confidence": 0.92,
    "outside_count_source": "floor_plan",
    "inside_count": 4,
    "inside_count_confidence": 0.88,
    "inside_count_source": "floor_plan"
  },
  "heights": {
    "stories": 2,
    "total_wall_height_ft": 20.0,
    "height_source": "ocr",
    "height_confidence": 0.95,
    "story_heights": [
      { "label": "First Floor", "height_ft": 9.5, "source": "ocr" },
      { "label": "Second Floor", "height_ft": 10.5, "source": "ocr" }
    ]
  },
  "calculated": {
    "outside_corner_lf": 160.0,
    "inside_corner_lf": 80.0,
    "total_corner_lf": 240.0
  },
  "elements": {
    "windows": {
      "count_from_schedule": 24,
      "count_from_elevations": 22,
      "recommended_count": 24,
      "source": "schedule_ocr"
    },
    "doors": {
      "count_from_schedule": 6,
      "count_from_elevations": 5,
      "recommended_count": 6,
      "source": "schedule_ocr"
    },
    "gables": {
      "count": 2,
      "confidence": 0.95,
      "source": "elevations"
    },
    "garages": {
      "count": 2,
      "position": "front",
      "widths": [16, 10],
      "source": "elevations"
    }
  },
  "materials": {
    "siding_type": "fiber cement",
    "siding_profile": "lap",
    "siding_exposure_inches": 7.0,
    "source": "ocr"
  },
  "spatial": {
    "stories": 2,
    "roof_style": "gable",
    "roof_pitch": "6/12",
    "foundation_type": "slab",
    "has_porch": true,
    "porch_type": "covered"
  },
  "quality": {
    "data_completeness": 0.85,
    "missing_data": ["window_sizes", "door_types"],
    "warnings": ["Low confidence on garage width"]
  }
}
```

---

### 3.13 `extraction_pages.ocr_data` (ScheduleOCRData)

```json
{
  "windows": [
    {
      "mark": "101A",
      "size": "3'-0\" x 4'-0\"",
      "quantity": 2,
      "type": "single hung",
      "notes": "tempered, egress"
    }
  ],
  "doors": [
    {
      "mark": "D1",
      "size": "3'-0\" x 6'-8\"",
      "quantity": 1,
      "type": "prehung interior",
      "notes": "hollow core"
    }
  ],
  "skylights": [
    {
      "mark": "SK1",
      "size": "2'-0\" x 4'-0\"",
      "quantity": 1,
      "type": "fixed",
      "notes": ""
    }
  ],
  "garages": [
    {
      "mark": "G1",
      "size": "16'-0\" x 7'-0\"",
      "quantity": 1,
      "type": "sectional",
      "notes": "insulated"
    }
  ],
  "totals": {
    "windows": 12,
    "doors": 8,
    "skylights": 1,
    "garages": 2
  },
  "confidence": 0.92,
  "extraction_notes": "Successfully extracted all schedules",
  "is_schedule_page": true,
  "extracted_at": "2025-01-15T10:30:00Z",
  "model_used": "claude-sonnet-4-20250514",
  "tokens_used": 4500
}
```

---

### 3.14 `extraction_detections_draft.polygon_points`

**Simple polygon:**
```json
[
  { "x": 100, "y": 50 },
  { "x": 200, "y": 50 },
  { "x": 200, "y": 150 },
  { "x": 100, "y": 150 }
]
```

**Polygon with holes (for split shapes):**
```json
{
  "outer": [
    { "x": 0, "y": 0 },
    { "x": 300, "y": 0 },
    { "x": 300, "y": 200 },
    { "x": 0, "y": 200 }
  ],
  "holes": [
    [
      { "x": 50, "y": 50 },
      { "x": 100, "y": 50 },
      { "x": 100, "y": 100 },
      { "x": 50, "y": 100 }
    ]
  ]
}
```

---

### 3.15 `bluebeam_projects.floor_plan_data`

```json
{
  "corners": {
    "outside": 8,
    "inside": 4,
    "source": "floor_plan_analysis"
  },
  "perimeter": {
    "total_lf": 180.5,
    "segments": [
      { "length": 45.5, "orientation": "north" },
      { "length": 35.0, "orientation": "east" }
    ]
  },
  "rooms": [
    { "name": "living", "area_sf": 320 },
    { "name": "kitchen", "area_sf": 180 }
  ],
  "analyzed_at": "2025-01-15T10:00:00Z"
}
```

---

## 4. Enums and Custom Types

### PostgreSQL Enums

These are implemented as TEXT with CHECK constraints or as TypeScript union types.

#### `project_status`
```sql
'pending' | 'extracted' | 'calculated' | 'priced' | 'approved' |
'sent_to_client' | 'won' | 'lost' | 'on_hold'
```

#### `trade`
```sql
'siding' | 'roofing' | 'windows' | 'gutters'
```

#### `field_type`
```sql
'select' | 'checkbox' | 'multiselect' | 'number'
```

#### `takeoff_status`
```sql
'draft' | 'in_progress' | 'review' | 'approved' | 'sent'
```

#### `calculation_source`
```sql
'auto_scope' | 'manual' | 'hover_pdf' | 'imported'
```

#### `unit`
```sql
'EA' | 'PC' | 'SQ' | 'LF' | 'SF' | 'RL' | 'BX' | 'BDL' | 'GAL'
```

#### `detection_status`
```sql
'auto' | 'verified' | 'edited' | 'deleted'
```

#### `detection_class`
```sql
-- Area classes (SF)
'window' | 'door' | 'garage' | 'siding' | 'roof' | 'gable' |

-- Linear classes (LF)
'trim' | 'fascia' | 'gutter' | 'eave' | 'rake' | 'ridge' | 'soffit' | 'valley' |

-- Point classes (count)
'vent' | 'flashing' | 'downspout' | 'outlet' | 'hose_bib' | 'light_fixture' |
'corbel' | 'gable_vent' | 'belly_band' | 'corner_inside' | 'corner_outside' |
'shutter' | 'post' | 'column' | 'bracket' |

-- Internal classes (not user-selectable)
'building' | 'exterior_wall' |

-- Empty/unclassified
''
```

#### `page_type`
```sql
'elevation' | 'floor_plan' | 'schedule' | 'cover' | 'detail' |
'section' | 'site_plan' | 'other'
```

#### `elevation_name`
```sql
'front' | 'rear' | 'left' | 'right'
```

#### `job_status`
```sql
'converting' | 'classifying' | 'classified' | 'processing' |
'complete' | 'approved' | 'failed'
```

#### `markup_type`
```sql
'polygon' | 'line' | 'point'
```

#### `membership_role`
```sql
'owner' | 'admin' | 'estimator' | 'viewer'
```

#### `trigger_type` (labor_auto_scope_rules)
```sql
'always' | 'material_category' | 'material_sku_pattern' | 'detection_class'
```

#### `quantity_source` (labor_auto_scope_rules)
```sql
'facade_sqft' | 'material_sqft' | 'material_count' | 'detection_count' | 'material_lf'
```

---

## 5. Views

### `extraction_detection_details`

**Purpose:** Computed view combining draft detections with status.

**Source Tables:** `extraction_detections_draft`

**Key Computed Columns:**
- `status`: Computed from `is_deleted` flag → 'deleted' if true, else original status

---

## 6. Indexes

### Performance-Critical Indexes

```sql
-- Projects
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_organization_id ON projects(organization_id);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- Takeoffs
CREATE INDEX idx_takeoffs_project_id ON takeoffs(project_id);
CREATE INDEX idx_takeoffs_status ON takeoffs(status);

-- Takeoff Sections
CREATE INDEX idx_sections_takeoff_id ON takeoff_sections(takeoff_id);
CREATE INDEX idx_sections_sort_order ON takeoff_sections(takeoff_id, sort_order);

-- Takeoff Line Items
CREATE INDEX idx_line_items_takeoff_id ON takeoff_line_items(takeoff_id);
CREATE INDEX idx_line_items_section_id ON takeoff_line_items(section_id);
CREATE INDEX idx_line_items_product_id ON takeoff_line_items(product_id);
CREATE INDEX idx_line_items_sort_order ON takeoff_line_items(section_id, sort_order);
CREATE INDEX idx_line_items_calculation_source ON takeoff_line_items(calculation_source);

-- Extraction Jobs
CREATE INDEX idx_extraction_jobs_project_id ON extraction_jobs(project_id);
CREATE INDEX idx_extraction_jobs_status ON extraction_jobs(status);

-- Extraction Pages
CREATE INDEX idx_extraction_pages_job_id ON extraction_pages(job_id);
CREATE INDEX idx_extraction_pages_page_type ON extraction_pages(page_type);

-- Extraction Detections
CREATE INDEX idx_detection_details_job_id ON extraction_detections_draft(job_id);
CREATE INDEX idx_detection_details_page_id ON extraction_detections_draft(page_id);
CREATE INDEX idx_detection_details_class ON extraction_detections_draft(class);

-- Trade Configurations
CREATE UNIQUE INDEX idx_trade_config_unique ON trade_configurations(trade, config_name);

-- Labor Auto-Scope Rules
CREATE INDEX idx_labor_auto_scope_rules_trade ON labor_auto_scope_rules(trade);
CREATE INDEX idx_labor_auto_scope_rules_active ON labor_auto_scope_rules(active);
CREATE INDEX idx_labor_auto_scope_rules_trigger_type ON labor_auto_scope_rules(trigger_type);

-- Organization Memberships
CREATE INDEX idx_org_memberships_user_id ON organization_memberships(user_id);
CREATE INDEX idx_org_memberships_org_id ON organization_memberships(organization_id);
```

---

## 7. RLS Policies

### Tables with RLS Enabled

| Table | RLS Enabled | Policy Type |
|-------|-------------|-------------|
| `projects` | ✅ Yes | Organization-scoped |
| `project_configurations` | ✅ Yes | Via project |
| `takeoffs` | ✅ Yes | Via project |
| `takeoff_sections` | ✅ Yes | Via takeoff → project |
| `takeoff_line_items` | ✅ Yes | Via takeoff → project |
| `extraction_jobs` | ✅ Yes | Via project |
| `extraction_pages` | ✅ Yes | Via job → project |
| `extraction_detections_draft` | ✅ Yes | Via job → project |
| `organizations` | ✅ Yes | Membership check |
| `organization_memberships` | ✅ Yes | User check |
| `product_catalog` | ❌ No | Public read |
| `trade_configurations` | ❌ No | Public read |
| `pricing_items` | ❌ No | Public read |
| `labor_rates` | ❌ No | Public read |

### RLS Helper Function

```sql
CREATE OR REPLACE FUNCTION auth.user_organization_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id
  FROM public.organization_memberships
  WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### Example Policies

```sql
-- Projects: SELECT
CREATE POLICY "Users can view own org projects"
  ON projects FOR SELECT
  USING (organization_id IN (SELECT auth.user_organization_ids()));

-- Projects: INSERT
CREATE POLICY "Users can create projects in own org"
  ON projects FOR INSERT
  WITH CHECK (organization_id IN (SELECT auth.user_organization_ids()));

-- Projects: UPDATE
CREATE POLICY "Users can update own org projects"
  ON projects FOR UPDATE
  USING (organization_id IN (SELECT auth.user_organization_ids()))
  WITH CHECK (organization_id IN (SELECT auth.user_organization_ids()));

-- Projects: DELETE
CREATE POLICY "Users can delete own org projects"
  ON projects FOR DELETE
  USING (organization_id IN (SELECT auth.user_organization_ids()));

-- Takeoffs: ALL (via project relationship)
CREATE POLICY "Users can manage takeoffs for own org projects"
  ON takeoffs FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organization_id IN (SELECT auth.user_organization_ids())
    )
  );
```

---

## 8. Common Query Patterns

### Get Trade Configurations with Conditional Fields

```sql
SELECT
  id, config_name, field_label, field_type,
  show_if_conditions, load_from_catalog, catalog_filter
FROM trade_configurations
WHERE trade = 'siding'
  AND active = true
ORDER BY section_order, field_order;
```

### Evaluate Auto-Scope Rules

```sql
SELECT *
FROM siding_auto_scope_rules
WHERE active = true
  AND trigger_condition @> '{"add_battens": true}'::jsonb
ORDER BY priority;
```

### Get Products with Specific Attributes

```sql
SELECT id, product_name, sku, physical_properties
FROM product_catalog
WHERE physical_properties->>'is_colorplus' = 'true'
  AND active = true
ORDER BY product_name;
```

### Get Products by Category Filter

```sql
SELECT id, product_name, category, manufacturer
FROM product_catalog
WHERE category = ANY(ARRAY['LAP SIDING - SMOOTH', 'LAP SIDING - CEDARMILL'])
  AND active = true
ORDER BY sort_order, product_name;
```

### Get Complete Takeoff with Sections and Line Items

```sql
-- Get takeoff
SELECT * FROM takeoffs WHERE project_id = $1;

-- Get sections
SELECT * FROM takeoff_sections
WHERE takeoff_id = $2
ORDER BY sort_order;

-- Get line items with product details
SELECT li.*, pc.product_name, pc.manufacturer
FROM takeoff_line_items li
LEFT JOIN product_catalog pc ON li.product_id = pc.id
WHERE li.takeoff_id = $2
  AND li.is_deleted = false
ORDER BY li.section_id, li.item_number;
```

### Get Labor Rules for Trade and Category

```sql
SELECT
  r.rule_id, r.rule_name, r.quantity_source, r.quantity_formula,
  l.rate_name, l.base_rate, l.unit
FROM labor_auto_scope_rules r
JOIN labor_rates l ON r.labor_rate_id = l.id
WHERE r.trade = 'siding'
  AND r.active = true
  AND (
    r.trigger_type = 'always'
    OR (r.trigger_type = 'material_category' AND r.trigger_value LIKE '%lap_siding%')
  )
ORDER BY r.priority;
```

### Get Extraction Detections by Page

```sql
SELECT *
FROM extraction_detections_draft
WHERE page_id = $1
  AND is_deleted = false
ORDER BY detection_index;
```

### Get Aggregated Elevation Measurements

```sql
SELECT
  jt.*,
  j.project_name,
  j.status as job_status
FROM extraction_job_totals jt
JOIN extraction_jobs j ON jt.job_id = j.id
WHERE j.project_id = $1;
```

### Search Products by Name or SKU

```sql
SELECT id, product_name, sku, category, material_cost
FROM product_catalog
WHERE (
  product_name ILIKE '%' || $1 || '%'
  OR sku ILIKE '%' || $1 || '%'
)
AND active = true
LIMIT 50;
```

---

## 9. Data Flow Diagrams

### 9.1 Project Creation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Fills Form                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Project Info                                            │
│ - name, client_name, address                                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Trade Selection                                         │
│ - selected_trades: ['siding', 'roofing', ...]                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Product Configuration                                   │
│ - Query trade_configurations WHERE trade IN selected_trades     │
│ - For each field with load_from_catalog = true:                 │
│   └─ Query product_catalog with catalog_filter                  │
│ - Evaluate show_if_conditions for visibility                    │
│ - Store values in configurations object                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: HOVER PDF Upload                                        │
│ - Upload to Supabase Storage: hover-pdfs/{projectId}/{filename} │
│ - Get public URL                                                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Submit                                                  │
│                                                                 │
│ INSERT INTO projects (                                          │
│   name, client_name, address, selected_trades,                  │
│   status = 'pending', hover_pdf_url, organization_id            │
│ )                                                               │
│                                                                 │
│ FOR EACH trade IN selected_trades:                              │
│   INSERT INTO project_configurations (                          │
│     project_id, trade, configuration_data                       │
│   )                                                             │
│                                                                 │
│ Trigger n8n webhook with project_id                             │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Extraction Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     n8n Webhook Triggered                       │
│                     POST /webhook/process                       │
│                     Body: { project_id }                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: PDF Conversion                                         │
│                                                                 │
│ INSERT INTO extraction_jobs (                                   │
│   project_id, status = 'converting', source_pdf_url             │
│ )                                                               │
│                                                                 │
│ Convert PDF to images → Supabase Storage                        │
│                                                                 │
│ FOR EACH page:                                                  │
│   INSERT INTO extraction_pages (                                │
│     job_id, page_number, image_url, thumbnail_url               │
│   )                                                             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 2: Page Classification                                    │
│                                                                 │
│ UPDATE extraction_jobs SET status = 'classifying'               │
│                                                                 │
│ FOR EACH page:                                                  │
│   Claude Vision API → classify page type                        │
│   UPDATE extraction_pages SET                                   │
│     page_type, page_type_confidence, elevation_name             │
│                                                                 │
│ UPDATE extraction_jobs SET status = 'classified'                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 3: ML Detection                                           │
│                                                                 │
│ UPDATE extraction_jobs SET status = 'processing'                │
│                                                                 │
│ FOR EACH elevation page:                                        │
│   Run ML model → detect windows, doors, etc.                    │
│   INSERT INTO extraction_detections_draft (                     │
│     job_id, page_id, class, pixel_x, pixel_y, ...               │
│   )                                                             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 4: Schedule Extraction                                    │
│                                                                 │
│ FOR EACH schedule page:                                         │
│   POST /api/extract-schedule                                    │
│   UPDATE extraction_pages SET ocr_data = {...}                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 5: Aggregation                                            │
│                                                                 │
│ FOR EACH elevation page:                                        │
│   Calculate totals → INSERT INTO extraction_elevation_calcs     │
│                                                                 │
│ Aggregate all elevations:                                       │
│   INSERT INTO extraction_job_totals (                           │
│     job_id, total_windows, total_doors, total_net_siding_sf...  │
│   )                                                             │
│                                                                 │
│ UPDATE extraction_jobs SET                                      │
│   status = 'complete', results_summary = {...}                  │
│                                                                 │
│ UPDATE projects SET status = 'extracted'                        │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Detection Editor Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  User Opens Detection Editor                    │
│              /projects/{id}/extraction/{jobId}                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ useExtractionData(jobId) Loads:                                 │
│                                                                 │
│ SELECT * FROM extraction_jobs WHERE id = jobId                  │
│ SELECT * FROM extraction_pages WHERE job_id = jobId             │
│ SELECT * FROM extraction_detections_draft WHERE job_id = jobId  │
│ SELECT * FROM extraction_elevation_calcs WHERE job_id = jobId   │
│ SELECT * FROM extraction_job_totals WHERE job_id = jobId        │
│                                                                 │
│ Subscribe to Realtime: extraction_detections_draft, job_totals  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ User Edits Detection (Local-First)                              │
│                                                                 │
│ - Move/resize → updateDetectionLocally()                        │
│ - Delete → removeDetectionLocally() (sets is_deleted = true)    │
│ - Create new → addDetectionLocally()                            │
│ - Assign material → update assigned_material_id                 │
│ - Override price → update material_cost_override                │
│                                                                 │
│ Changes stored in local state (undo/redo supported)             │
│ Auto-save to localStorage every 30 seconds                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ User Clicks "Approve"                                           │
│                                                                 │
│ Sync all changes to database:                                   │
│   UPDATE extraction_detections_draft SET ... WHERE id = ...     │
│                                                                 │
│ Trigger takeoff generation via n8n webhook:                     │
│   POST /webhook/approve                                         │
│   Body: { jobId, projectId, measurements, detections }          │
└─────────────────────────────────────────────────────────────────┘
```

### 9.4 Takeoff Generation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Approval Webhook Received                    │
│                    { jobId, projectId, ... }                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Read Measurements                                       │
│                                                                 │
│ SELECT * FROM extraction_job_totals WHERE job_id = jobId        │
│ SELECT * FROM cad_hover_measurements WHERE project_id = ...     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Read Project Configuration                              │
│                                                                 │
│ SELECT * FROM project_configurations WHERE project_id = ...     │
│ → Extract: siding_product_type, belly_band_include, etc.        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Evaluate Auto-Scope Rules                               │
│                                                                 │
│ SELECT * FROM siding_auto_scope_rules                           │
│ WHERE active = true                                             │
│   AND matches(trigger_condition, configuration)                 │
│ ORDER BY priority                                               │
│                                                                 │
│ FOR EACH matching rule:                                         │
│   - Calculate quantity using formula                            │
│   - Lookup pricing from pricing_items                           │
│   - Add to line items list                                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Evaluate Labor Rules                                    │
│                                                                 │
│ SELECT * FROM labor_auto_scope_rules                            │
│ WHERE active = true AND trade = 'siding'                        │
│ ORDER BY priority                                               │
│                                                                 │
│ FOR EACH rule WHERE trigger matches:                            │
│   - Calculate quantity (facade_sqft / 100 for squares)          │
│   - Lookup rate from labor_rates                                │
│   - Add labor line item                                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Create Takeoff Records                                  │
│                                                                 │
│ INSERT INTO takeoffs (project_id, status = 'draft')             │
│                                                                 │
│ FOR EACH selected trade:                                        │
│   INSERT INTO takeoff_sections (                                │
│     takeoff_id, name, display_name, sort_order                  │
│   )                                                             │
│                                                                 │
│ FOR EACH calculated line item:                                  │
│   INSERT INTO takeoff_line_items (                              │
│     takeoff_id, section_id, description, quantity, unit,        │
│     material_unit_cost, labor_unit_cost,                        │
│     calculation_source = 'auto_scope', formula_used             │
│   )                                                             │
│                                                                 │
│ Triggers automatically recalculate section and takeoff totals   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Update Status                                           │
│                                                                 │
│ UPDATE extraction_jobs SET status = 'approved'                  │
│ UPDATE projects SET status = 'priced'                           │
│                                                                 │
│ Return takeoff summary to frontend                              │
└─────────────────────────────────────────────────────────────────┘
```

### 9.5 Takeoff Editing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  User Opens Estimate Editor                     │
│                     /projects/{id}                              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ useTakeoffData(projectId) Loads:                                │
│                                                                 │
│ SELECT * FROM takeoffs WHERE project_id = projectId             │
│ SELECT * FROM takeoff_sections WHERE takeoff_id = ...           │
│ SELECT * FROM takeoff_line_items WHERE takeoff_id = ...         │
│   AND is_deleted = false                                        │
│                                                                 │
│ Subscribe to Realtime: takeoff_line_items                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ User Edits in AG Grid                                           │
│                                                                 │
│ - Edit quantity → recalculate material_extended, line_total     │
│ - Edit unit costs → recalculate extended costs                  │
│ - Add new row → create new line item                            │
│ - Delete row → set is_deleted = true                            │
│                                                                 │
│ Mark rows as isModified = true                                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ User Clicks "Save"                                              │
│                                                                 │
│ useLineItemsSave.saveLineItems(modifiedItems):                  │
│                                                                 │
│ FOR EACH modified item:                                         │
│   UPSERT INTO takeoff_line_items (...)                          │
│                                                                 │
│ FOR EACH deleted item:                                          │
│   UPDATE takeoff_line_items SET is_deleted = true               │
│                                                                 │
│ Database triggers automatically recalculate:                    │
│   - section totals                                              │
│   - takeoff totals                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Functions and Triggers

### Automatic Timestamp Update

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied to: takeoffs, takeoff_sections, takeoff_line_items,
--             projects, project_configurations, etc.
```

### Section Total Recalculation

```sql
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
```

### Takeoff Total Recalculation

```sql
CREATE OR REPLACE FUNCTION recalculate_takeoff_totals(takeoff_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE takeoffs
  SET
    total_material = COALESCE((
      SELECT SUM(total_material) FROM takeoff_sections
      WHERE takeoff_id = takeoff_uuid AND is_active = true
    ), 0),
    total_labor = COALESCE((
      SELECT SUM(total_labor) FROM takeoff_sections
      WHERE takeoff_id = takeoff_uuid AND is_active = true
    ), 0),
    total_equipment = COALESCE((
      SELECT SUM(total_equipment) FROM takeoff_sections
      WHERE takeoff_id = takeoff_uuid AND is_active = true
    ), 0),
    grand_total = COALESCE((
      SELECT SUM(section_total) FROM takeoff_sections
      WHERE takeoff_id = takeoff_uuid AND is_active = true
    ), 0)
  WHERE id = takeoff_uuid;
END;
$$ LANGUAGE plpgsql;
```

### Auto-Recalculate Trigger

```sql
CREATE OR REPLACE FUNCTION auto_recalculate_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate section totals
  PERFORM recalculate_section_totals(
    COALESCE(NEW.section_id, OLD.section_id)
  );

  -- Recalculate takeoff totals
  PERFORM recalculate_takeoff_totals(
    COALESCE(NEW.takeoff_id, OLD.takeoff_id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recalculate_totals
AFTER INSERT OR UPDATE OR DELETE ON takeoff_line_items
FOR EACH ROW
EXECUTE FUNCTION auto_recalculate_totals();
```

---

## Migration Files Reference

| File | Purpose |
|------|---------|
| [create_takeoffs_schema.sql](migrations/create_takeoffs_schema.sql) | Core takeoffs tables + triggers |
| [add_siding_configurations.sql](migrations/add_siding_configurations.sql) | Siding trade field definitions |
| [add_roofing_configurations.sql](migrations/add_roofing_configurations.sql) | Roofing trade field definitions |
| [add_windows_configurations.sql](migrations/add_windows_configurations.sql) | Windows trade field definitions |
| [add_gutters_configurations.sql](migrations/add_gutters_configurations.sql) | Gutters trade field definitions |
| [add_colorplus_color_options.sql](migrations/add_colorplus_color_options.sql) | ColorPlus color palette (25 colors) |
| [expand_pricing_items.sql](migrations/expand_pricing_items.sql) | 200+ pricing items |
| [create_labor_auto_scope_rules.sql](migrations/create_labor_auto_scope_rules.sql) | Labor auto-scope rules |
| [add_trim_auto_scope_rules.sql](migrations/add_trim_auto_scope_rules.sql) | Trim-specific auto-scope |
| [add_color_override_column.sql](migrations/add_color_override_column.sql) | Detection color override |
| [add_labor_class_to_pricing_items.sql](migrations/add_labor_class_to_pricing_items.sql) | Labor classification |

---

*This document is the authoritative database reference for AI Estimator. Update when schema changes are made.*
