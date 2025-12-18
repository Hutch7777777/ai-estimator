# Database Changes Log

This file tracks all database migrations and schema changes for the AI Estimator project.

## Format
Each entry should include:
- **Date**: When the migration was created
- **Migration File**: Name of the SQL migration file
- **Description**: What the migration does
- **Impact**: Tables/views/functions affected
- **Status**: Pending / Applied / Rolled Back

---

## 2024-11-29 - Product Alternatives System

**Migration File**: `create_product_alternatives_system.sql`

**Description**: Creates a comprehensive product alternatives/substitutions system that allows users to swap materials in estimates with equivalent, upgrade, or budget alternatives.

**Changes**:
- **New Table**: `product_alternatives`
  - Links products to their alternatives with relationship types (equivalent, upgrade, downgrade, budget, premium)
  - Includes `active` boolean for soft deletes
  - Prevents self-referencing and duplicate relationships
  - Indexed on product_id, alternative_product_id, and relationship_type

- **RLS Policies**:
  - Enabled Row-Level Security on `product_alternatives`
  - Added policy for authenticated read access (active alternatives only)

- **New View**: `product_alternatives_view`
  - Denormalized view with full product details from both products
  - Calculates price differences (material and labor)
  - Calculates price impact percentages
  - Optimized for UI queries

- **New Function**: `get_product_alternatives(product_id UUID)`
  - Returns JSONB object with alternatives grouped by relationship type
  - Includes all cost calculations and product details
  - Easy to consume in frontend applications

- **Sample Data**:
  - Common siding substitutions (HardiePlank ↔ LP SmartSide, Primed ↔ ColorPlus)
  - Uses intelligent subqueries to find products by name/SKU patterns
  - Bidirectional relationships for flexible querying

**Impact**:
- New table: `product_alternatives`
- New view: `product_alternatives_view`
- New function: `get_product_alternatives(UUID)`
- Dependencies: Requires `product_catalog` table with `physical_properties` JSONB column

**Status**: ✅ Ready to Apply

---

## Future Migrations

_(Migrations will be added here as they are created)_
