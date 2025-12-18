# Belly Band Configuration Migration

## Overview

This migration adds belly band configuration fields to the siding estimation form, matching the API requirements for the backend calculation service.

## Fields Added

### 1. **belly_band_include** (checkbox)
- **Label:** "Include belly band trim?"
- **Default:** false
- **Parent field** that controls visibility of all other belly band fields

### 2. **belly_band_size** (dropdown)
- **Label:** "Belly band width"
- **Options:** 6", 8", 10"
- **Default:** "8in"
- **Conditional:** Only shows when `belly_band_include` is checked

### 3. **belly_band_finish** (dropdown)
- **Label:** "Belly band finish"
- **Options:** ColorPlus, Primed
- **Default:** "colorplus"
- **Conditional:** Only shows when `belly_band_include` is checked

### 4. **belly_band_locations** (dropdown)
- **Label:** "Belly band location"
- **Options:**
  - Foundation (high confidence)
  - Gable Break (low confidence)
  - Both
- **Default:** "foundation"
- **Help text:** ⚠️ Foundation uses HOVER measurements (high confidence). Gable break uses estimates - verify on site.
- **Conditional:** Only shows when `belly_band_include` is checked

### 5. **belly_band_gable_board_count** (number input)
- **Label:** "Gable board count (default: 6)"
- **Default:** 6
- **Min:** 1
- **Max:** 50
- **Help text:** Number of boards for gable break belly band (estimate - HOVER does not provide this measurement)
- **Conditional:** Only shows when `belly_band_include` is checked AND `belly_band_locations` is NOT "foundation"

## How to Apply Migration

### Option 1: Supabase Dashboard (Recommended)

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the contents of `update_belly_band_fields.sql`
5. Paste into the SQL editor
6. Click **Run**
7. Verify the output shows all 5 belly band fields

### Option 2: Command Line (psql)

```bash
# Replace with your actual Supabase connection string
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres" \
  -f migrations/update_belly_band_fields.sql
```

### Option 3: Supabase CLI

```bash
# If you have Supabase CLI installed and configured
supabase db push
```

## Verification

After running the migration, you can verify it worked by running:

```sql
SELECT
  config_name,
  field_label,
  field_type,
  default_value,
  show_if_conditions,
  active
FROM trade_configurations
WHERE trade = 'siding'
  AND config_section = 'trim_accessories'
  AND config_name LIKE 'belly_band%'
ORDER BY field_order;
```

You should see 5 rows with these fields:
- `belly_band_include`
- `belly_band_size`
- `belly_band_finish`
- `belly_band_locations`
- `belly_band_gable_board_count`

## Testing the UI

1. Start your development server: `npm run dev`
2. Navigate to the project form
3. Select "Siding" as a trade
4. Scroll to the "Trim & Accessories" section
5. You should see:
   - A checkbox labeled "Include belly band trim?"
   - When checked, four additional fields appear indented below

### Test the Conditional Logic

1. Check "Include belly band trim?" ✓
   - All 4 child fields should appear
2. Set "Belly band location" to "Foundation"
   - Gable board count field should be HIDDEN
3. Set "Belly band location" to "Gable Break"
   - Gable board count field should APPEAR
4. Set "Belly band location" to "Both"
   - Gable board count field should APPEAR
5. Uncheck "Include belly band trim?" ☐
   - All child fields should disappear

## API Integration

When the form is submitted, the configuration object will include:

```json
{
  "config": {
    "belly_band_include": true,
    "belly_band_size": "8in",
    "belly_band_finish": "colorplus",
    "belly_band_locations": "both",
    "belly_band_gable_board_count": 6
  }
}
```

These values are automatically included in the `project_configurations` table when the project is saved.

## Architecture Notes

This migration follows the **database-driven architecture** principle:

- ✅ No code changes required
- ✅ Fields defined in database
- ✅ UI automatically renders from database
- ✅ Conditional logic evaluated at runtime
- ✅ Parent-child pattern detected automatically
- ✅ Type-safe (TypeScript types in `database.ts`)

The ProductConfigStep component automatically:
- Queries `trade_configurations` table
- Detects parent-child relationships using `{prefix}_include` pattern
- Evaluates `show_if_conditions` JSONB
- Renders fields with proper indentation and grouping
- Validates and submits values

## Old Fields Deactivated

The migration deactivates these old fields (data is preserved):
- `belly_band_color` (replaced by `belly_band_finish`)
- `belly_band_material` (no longer needed)

These fields remain in the database but won't appear in the UI.

## Rollback

If you need to rollback this migration:

```sql
-- Deactivate new fields
UPDATE trade_configurations
SET active = false
WHERE trade = 'siding'
  AND config_name IN (
    'belly_band_size',
    'belly_band_finish',
    'belly_band_locations',
    'belly_band_gable_board_count'
  );

-- Reactivate old fields
UPDATE trade_configurations
SET active = true
WHERE trade = 'siding'
  AND config_name IN ('belly_band_color', 'belly_band_material');
```

## Support

If you encounter issues:
1. Check the browser console for errors
2. Verify the migration ran successfully
3. Check that Supabase environment variables are configured in `.env.local`
4. Ensure the development server was restarted after applying migration
