# 02 — Database Schema

> Sources: `lib/types/database.ts` (Supabase generated types), `/migrations/*.sql`, `DATABASE_ARCHITECTURE.md`.
>
> **Note**: `database.ts` currently reflects only 12 core tables. Several additional tables exist in Postgres (auto-scope rules, pricing, organizations) and are referenced in migrations but not yet regenerated into `database.ts`. When in doubt, trust the migration SQL and `DATABASE_ARCHITECTURE.md` over `database.ts`.

## Domains

1. **Project & Organization** — who owns what
2. **Extraction & Detection** — raw AI output + user edits
3. **Takeoff & Estimation** — priced result
4. **Product Catalog & Pricing**
5. **Configuration & Rules** — trade config + auto-scope
6. **CAD (secondary)** — Bluebeam / CAD import

---

## 1. Project & Organization

### `organizations`
Multi-tenant root. Columns: `id uuid PK`, `name`, `slug`, `logo_url`, `settings jsonb`, `subscription_tier`, `created_at`.

### `organization_memberships`
Users ↔ organizations. Columns: `id uuid PK`, `user_id uuid FK auth.users`, `organization_id uuid FK organizations`, `role` (`owner|admin|estimator|viewer`), timestamps.

### `user_profiles`
Per-user profile. Columns: `id uuid PK = auth.users.id`, `email`, `full_name`, `avatar_url`, `phone`.

### `projects` ⭐ core
A single estimate. Columns:
- `id uuid PK`
- `organization_id uuid FK`
- `name`, `client_name`, `address`
- `selected_trades text[]` (e.g. `{'siding','roofing'}`)
- `status` (`draft|uploaded|processing|extracted|approved|sent`)
- `hover_pdf_url`, `excel_url`
- `markup_percent numeric` (see `add_markup_percent_to_projects.sql`)
- `processing_started_at`, `processing_completed_at`
- `created_at`, `updated_at`

### `project_configurations`
Saved form answers per (project, trade). Columns: `id uuid PK`, `project_id uuid FK`, `trade text`, `configuration_data jsonb`. Unique on `(project_id, trade)`.

---

## 2. Extraction & Detection

### `extraction_jobs` ⭐
One per PDF upload. Columns:
- `id uuid PK`, `project_id uuid FK`
- `status` (`converting|classifying|processing|complete|failed`)
- `total_pages`, `elevation_count`
- `default_scale_ratio numeric`
- `results_summary jsonb`
- `created_at`, `completed_at`
- JSONB payload columns added over time: `floor_plan_data`, `notes_specs_data`, `rfi_list_data`

### `extraction_pages`
One per PDF page. Columns:
- `id uuid PK`, `job_id uuid FK`
- `page_number int`
- `image_url`, `thumbnail_url`
- `page_type` (`cover|elevation|floor_plan|schedule|detail|notes|unknown`)
- `elevation_name` (`front|rear|left|right|...`)
- `scale_ratio numeric` — **pixels per foot, per-page** (critical for area math)
- `ocr_data jsonb`, `ocr_status`, `ocr_processed_at`
- `original_width`, `original_height` (pixels)

### `extraction_detections_draft` ⭐
User-edited detections (source of truth for the Detection Editor). Columns:
- `id uuid PK`, `job_id uuid FK`, `page_id uuid FK`
- `class` (`window|door|garage|building|roof|gable|exterior_wall|gable_topout|topout|...`)
- Pixel geometry (center-based): `pixel_x`, `pixel_y`, `pixel_width`, `pixel_height`
- Real-world: `real_width_in`, `real_width_ft`, `real_height_in`, `real_height_ft`
- `area_sf numeric`, `perimeter_lf numeric` (**stored result** — commit `3a1b295`)
- `polygon_points jsonb` (array of `[x,y]` in pixels)
- `assigned_material_id uuid FK product_catalog`
- `material_cost_override`, `labor_cost_override`
- `has_hole boolean`, `confidence numeric`

### `extraction_detections_validated`
Raw Roboflow output before user edits. Same shape as draft.

### `extraction_detection_details`
Older AI-original detections (pre-Roboflow). Fallback tier.

### `extraction_elevation_calcs`
Per-elevation aggregates. Columns: `window_count`, `door_count`, `gable_count`, `gross_facade_sf`, `window_area_sf`, `door_area_sf`, `garage_area_sf`, `net_siding_sf`, `trim_head_lf`, `trim_jamb_lf`, `trim_sill_lf`, `outside_corner_count`, `outside_corner_lf`, `inside_corner_count`, `inside_corner_lf`, `confidence_avg`.

### `extraction_job_totals`
Job-wide aggregates. Columns: `total_windows`, `total_doors`, `total_net_siding_sf`, `siding_squares` (= `total_net_siding_sf/100`), `outside_corners_lf`, `inside_corners_lf`, `aggregated_data jsonb`.

---

## 3. Takeoff & Estimation

### `takeoffs` ⭐
One per project (unique on `project_id`). Columns:
- `id uuid PK`, `project_id uuid FK`
- `status` (`draft|in_progress|review|approved|sent`)
- `total_material`, `total_labor`, `total_equipment`, `grand_total` (`numeric(10,2)`)
- `markup_percent numeric`
- timestamps

### `takeoff_sections`
Logical groupings within a takeoff. Unique on `(takeoff_id, name)`.
- `name` ∈ {`siding`, `roofing`, `windows`, `gutters`, …}
- `total_material`, `total_labor`, `total_equipment`, `subtotal`
- `is_active boolean`
- `display_order int`

### `takeoff_line_items` ⭐
Individual priced rows. Unique on `(section_id, item_number)`.
- `id uuid PK`, `section_id uuid FK`
- `item_number int`
- `description`, `category`, `presentation_group` text
- `quantity numeric(10,4)`, `unit`
- `material_unit_cost`, `labor_unit_cost`, `equipment_unit_cost`
- **GENERATED columns**: `material_extended`, `labor_extended`, `equipment_extended`, `line_total`
- `calculation_source` (`auto_scope|manual|hover_pdf|imported`)
- `formula_used text`
- `source_measurement jsonb` (provenance — links back to detection)

### Triggers (from `create_takeoffs_schema.sql`)
- `auto_recalc_on_line_item_change` → `recalculate_section_totals()` → `recalculate_takeoff_totals()`.
- These run on INSERT/UPDATE/DELETE of line items and keep parent totals in sync.

---

## 4. Product Catalog & Pricing

### `product_catalog`
Canonical product list. Columns: `id uuid PK`, `trade`, `manufacturer`, `product_line`, `sku` (unique), `category`, `tier`, `dimensions jsonb`, `coverage_specs jsonb`, `physical_properties jsonb`, `material_cost`, `labor_cost`, `total_cost`, `unit`, `available_colors text[]`, `available_finishes text[]`, `active boolean`, `discontinued boolean`.

### `pricing_items`
Snapshot-scoped pricing. Unique on `(snapshot_id, sku)`. Columns: `category`, `base_labor_cost`, `labor_class`, `coverage_value`, `notes`.

### `pricing_snapshots`
Versioned price rollout. Columns: `name`, `description`, `is_active boolean`.

### `v_pricing_current` (view)
Convenience view joining active snapshot to items. See `fix_v_pricing_current_coverage_value.sql`.

### `product_alternatives`
Substitution mapping (see `create_product_alternatives_system.sql`).

---

## 5. Configuration & Rules

### `trade_configurations` ⭐
Dynamic form field definitions. Columns:
- `trade text`, `config_name text` (unique ID)
- `field_type` (`text|select|multiselect|number|boolean|group|…`)
- `field_options jsonb`
- `show_if_conditions jsonb`, `show_if_product_attributes jsonb`
- `triggers_auto_scope boolean`
- `display_order int`, `active boolean`

### `siding_auto_scope_rules` ⭐
Material auto-scope. Columns:
- `rule_id serial PK`, `rule_name text`
- `material_category text`, `sku text`
- `quantity_formula text` (expression over `measurements.*`)
- `unit text`
- `trigger_condition jsonb`  (see §Trigger conditions below)
- `presentation_group text`  (must match the 7 consolidated groups — see rules below)
- `manufacturer_filter text[]` (e.g. `ARRAY['James Hardie']`, `NULL` = generic)
- `priority int`, `active boolean`
- `calculation_notes text` (template with `{variable}` placeholders — see `add_calculation_notes_to_autoscope_rules.sql`)

### `labor_auto_scope_rules`
Labor auto-scope. Columns: `rule_id`, `trigger_type`, `trigger_value`, `quantity_source`, `labor_rate_id FK`, `priority`, `active`.

### Trigger condition shape (`jsonb`)
Parsed by `autoscope-v2.ts` / n8n workflow. Supported keys:
- Measurement thresholds: `always:true`, `min_corners`, `min_openings`, `min_net_area`, `min_belly_band_lf`, `min_gable_topout_lf`, `min_topout_lf`, `trim_total_lf_gt`.
- Material-based: `material_category`, `sku_pattern` (substring match, scoped to matching `material_category` — see fix `4a1cb21`).
- System toggle: `trim_system ∈ {hardie, whitewood}`.
- Config match: `config_match.path` (dot-notation into `estimateConfig`), `config_match.value` (string equality).

### Standard presentation groups (7)
`cladding`, `trims`, `metals_flashings`, `waterproofing`, `accessories`, `soffit`, `gutters` (legacy aliases mapped in `lib/utils/exportTakeoffExcel.ts`; also a `paint` group for paint items).

---

## 6. CAD (secondary / Bluebeam)

### `cad_extractions`, `cad_markups`, `cad_categories`
Used by `/components/cad-markup/*` and `/lib/supabase/cadExtractions.ts`, `cadMarkups.ts`, `cadCategories.ts`. Stores Bluebeam markup imports, category taxonomy, and their provenance.

### `bluebeam_projects`
Links Bluebeam markup imports to `projects`. See `/lib/supabase/bluebeamProjects.ts`.

---

## Relationship summary (text ER)

```
organizations
  └─< organization_memberships >─ auth.users ─┐
                                              │
organizations ─< projects                     │
projects ─< project_configurations             │
projects ─1:1─ takeoffs                       │
projects ─< extraction_jobs                    │
extraction_jobs ─< extraction_pages            │
extraction_pages ─< extraction_detections_draft
                   extraction_detections_validated
                   extraction_detection_details
extraction_jobs ─< extraction_elevation_calcs
extraction_jobs ─1:1─ extraction_job_totals
takeoffs ─< takeoff_sections ─< takeoff_line_items
                                   └─ assigned_material_id → product_catalog
                                   └─ source_measurement jsonb → detection row
pricing_snapshots ─< pricing_items ─ sku → product_catalog
siding_auto_scope_rules  (no FK — matched by rule engine)
labor_auto_scope_rules   (no FK — matched by rule engine)
trade_configurations     (no FK — queried by trade)
```

## Recent schema changes worth knowing

- `add_markup_percent_to_projects.sql` & `add_markup_percent_to_takeoffs.sql` — markup is a first-class column now.
- `add_calculation_notes_to_autoscope_rules.sql` — human-readable templates per rule.
- `add_gable_topout_and_topout_rules.sql` — new gable/topout trim classes.
- `add_opening_trim_fields.sql` — head/jamb/sill LF on extraction aggregates.
- `add_colorplus_*` / `add_belly_band_color_colorplus.sql` — ColorPlus palette options.
- `create_product_alternatives_system.sql` — product substitution infra.
- `migrate_stone_veneer_rules_to_siding.sql` — stone veneer lives under `siding_auto_scope_rules` now.

## Gotchas

- `typescript.ignoreBuildErrors: true` in `next.config.ts` hides drift between DB and `database.ts`. Regenerate types after migrations: `npx supabase gen types typescript --project-id okwtyttfqbfmcqtenize > lib/types/database.ts`.
- Some API routes fall back when columns (`ocr_data`, `ocr_status`, `ocr_processed_at`) don't exist on older deployments.
- RLS is enabled on project-scoped tables; the Supabase **browser** client hangs silently when RLS denies a query — route through server API with the service role key instead.
