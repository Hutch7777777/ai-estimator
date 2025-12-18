# Color Swatch Fix Migration

## Overview

This migration fixes trim accessory color fields to display actual James Hardie ColorPlus color swatches instead of grey placeholders.

## Problem

The `corner_trim_color` and `j_channel_color` fields were showing **grey placeholder circles** instead of actual James Hardie colors in the UI.

**Root Cause:** Value format mismatch
- Color fields used: `"arctic_white"` (underscores)
- ColorSwatchGrid expects: `"arctic white"` (spaces)
- Lookup failed → Defaulted to grey (#94a3b8)

## Solution

Update field values to use **spaces instead of underscores** to match the ColorSwatchGrid component's colorMap.

## Files Modified

### Migration File
- **`fix_corner_trim_color_values.sql`** - Updates database configuration

### No Code Changes Required
The ColorSwatchGrid component (`/components/ui/color-swatch.tsx`) already has all 15 James Hardie ColorPlus colors mapped with hex codes:

```typescript
const colorMap: Record<string, string> = {
  "arctic white": "#E8E4DF",
  "aged pewter": "#7A7D7A",
  "cobble stone": "#8B8985",
  "monterey taupe": "#A69E93",
  "sandstone beige": "#C4B9A4",
  "navajo beige": "#C9B99A",
  "iron gray": "#5C5D5B",
  "timber bark": "#4A3F37",
  "khaki brown": "#6B5D4D",
  "heathered moss": "#6B6F5E",
  "mountain sage": "#7D8B7A",
  "evening blue": "#5B6770",
  "night gray": "#4B4F52",
  "boothbay blue": "#4A5B6A",
  "countrylane red": "#7B3B35",
};
```

## Fields Updated

### 1. corner_trim_color
**Before:**
```json
{
  "options": [
    {"label": "Arctic White", "value": "arctic_white"},
    {"label": "Cobble Stone", "value": "cobble_stone"},
    {"label": "Monterey Taupe", "value": "monterey_taupe"},
    {"label": "Aged Pewter", "value": "aged_pewter"}
  ]
}
```

**After:**
```json
{
  "options": [
    {"label": "Match Siding", "value": "match_siding"},
    {"label": "Arctic White", "value": "arctic white"},
    {"label": "Cobble Stone", "value": "cobble stone"},
    {"label": "Monterey Taupe", "value": "monterey taupe"},
    {"label": "Aged Pewter", "value": "aged pewter"},
    ... (all 15 ColorPlus colors)
  ]
}
```

### 2. j_channel_color
**Before:**
```json
{
  "options": [
    {"label": "White", "value": "white"},
    {"label": "Almond", "value": "almond"},
    {"label": "Clay", "value": "clay"}
  ]
}
```

**After:**
```json
{
  "options": [
    {"label": "Match Siding", "value": "match_siding"},
    {"label": "Arctic White", "value": "arctic white"},
    ... (all 15 ColorPlus colors)
  ]
}
```

## How to Apply Migration

### Option 1: Supabase Dashboard (Recommended)

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the contents of `fix_corner_trim_color_values.sql`
5. Paste into the SQL editor
6. Click **Run**
7. Verify the output shows the updated color values

### Option 2: Command Line (psql)

```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres" \
  -f migrations/fix_corner_trim_color_values.sql
```

### Option 3: Supabase CLI

```bash
supabase db push
```

## Verification

After running the migration, verify with this query:

```sql
SELECT
  config_name,
  jsonb_array_elements(field_options->'options')->>'value' as color_value,
  jsonb_array_elements(field_options->'options')->>'label' as color_label
FROM trade_configurations
WHERE
  trade = 'siding'
  AND config_name IN ('corner_trim_color', 'j_channel_color')
ORDER BY config_name;
```

**Expected output:** Color values should have spaces (e.g., `"arctic white"`) not underscores.

## Testing the UI

### Before Migration
1. Navigate to siding configuration
2. Check "Include corner trim"
3. Color field shows: 🔘 Grey circles (all the same color)

### After Migration
1. Refresh the page (or restart dev server)
2. Navigate to siding configuration
3. Check "Include corner trim"
4. Color field shows: 🎨 Actual James Hardie colors
   - Off-white circle for Arctic White
   - Grey circle for Aged Pewter
   - Tan circle for Monterey Taupe
   - Beige circle for Cobble Stone
   - etc.

### Visual Test
Click different colors and verify:
- ✅ Each color shows its actual hex value
- ✅ Selected color has checkmark overlay
- ✅ Hover effect works
- ✅ Colors are visually distinct

## Color Field Implementation Details

### How It Works

**1. Field Detection (ProductConfigStep.tsx:600)**
```typescript
const isColorField = field.config_name.toLowerCase().includes('color');
```

**2. ColorSwatchGrid Rendering (ProductConfigStep.tsx:603-636)**
```typescript
if (isColorField && field.field_options?.options && !field.load_from_catalog) {
  return <ColorSwatchGrid colors={colorOptions} ... />
}
```

**3. Color Lookup (color-swatch.tsx:50-53)**
```typescript
const getColorValue = (colorName: string): string => {
  const normalized = colorName.toLowerCase().trim();
  return colorMap[normalized] || "#94a3b8"; // Default grey if not found
};
```

**4. Visual Rendering**
- Circle with background color from colorMap
- White/black text based on contrast
- Checkmark for selected state
- Hover effects

### Supported Color Fields

After this migration, these fields will show actual color swatches:

| Field | Trade | Colors Shown |
|-------|-------|--------------|
| `colorplus_color` | siding | ✅ 15 James Hardie ColorPlus colors |
| `corner_trim_color` | siding | ✅ 15 James Hardie ColorPlus colors |
| `j_channel_color` | siding | ✅ 15 James Hardie ColorPlus colors |

### Generic Colors

The colorMap also includes generic colors for non-ColorPlus products:
- `white` → `#FFFFFF`
- `almond` → `#EED9C4`
- `clay` → `#D4A76A`
- `black` → `#000000`
- `brown` → `#8B4513`
- `gray` → `#808080`

## Adding New Colors

To add new color options in the future:

### 1. Add to ColorMap (color-swatch.tsx)
```typescript
const colorMap: Record<string, string> = {
  // Existing colors...
  "new color name": "#HEXCODE",
};
```

### 2. Add to Field Options (via migration)
```sql
UPDATE trade_configurations
SET field_options = jsonb_build_object(
  'options', jsonb_build_array(
    -- Existing options...
    jsonb_build_object('label', 'New Color Name', 'value', 'new color name')
  )
)
WHERE config_name = 'field_name';
```

**Important:** Value must use **spaces, not underscores** to match colorMap keys.

## Value Format Standard

### ✅ Correct Format (use this)
```json
{"label": "Arctic White", "value": "arctic white"}
```

### ❌ Wrong Format (don't use)
```json
{"label": "Arctic White", "value": "arctic_white"}
{"label": "Arctic White", "value": "ARCTIC WHITE"}
{"label": "Arctic White", "value": "ArcticWhite"}
```

### Rules
1. **Lowercase** - All values must be lowercase
2. **Spaces** - Use spaces between words, not underscores or hyphens
3. **Trimmed** - No leading/trailing whitespace
4. **Match colorMap** - Value must exactly match a key in the colorMap

## Impact on Existing Data

### Data Preservation
The migration **only updates field configuration**, not existing project data. If you have existing projects with old values (`arctic_white`), they will:

1. Still be stored in the database as-is
2. Display as grey swatches (until updated)
3. Need manual migration if you want to fix historical data

### Migrating Historical Data (Optional)

If you want to update existing project configurations:

```sql
-- Example: Update corner trim color values in existing projects
UPDATE project_configurations
SET configuration_data = jsonb_set(
  configuration_data,
  '{corner_trim_color}',
  to_jsonb(replace(configuration_data->>'corner_trim_color', '_', ' '))
)
WHERE
  trade = 'siding'
  AND configuration_data ? 'corner_trim_color'
  AND configuration_data->>'corner_trim_color' LIKE '%\_%';
```

**Warning:** Test this on a backup first!

## Rollback

If you need to rollback (not recommended):

```sql
-- Revert to underscore format (will show grey placeholders again)
UPDATE trade_configurations
SET
  field_options = jsonb_build_object(
    'options', jsonb_build_array(
      jsonb_build_object('label', 'Arctic White', 'value', 'arctic_white'),
      jsonb_build_object('label', 'Cobble Stone', 'value', 'cobble_stone'),
      jsonb_build_object('label', 'Monterey Taupe', 'value', 'monterey_taupe'),
      jsonb_build_object('label', 'Aged Pewter', 'value', 'aged_pewter')
    )
  ),
  default_value = 'arctic_white'
WHERE
  trade = 'siding'
  AND config_name = 'corner_trim_color';
```

## Troubleshooting

### Colors Still Show Grey After Migration

1. **Clear browser cache** - Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
2. **Restart dev server** - `npm run dev`
3. **Check database** - Verify values have spaces:
   ```sql
   SELECT field_options FROM trade_configurations
   WHERE config_name = 'corner_trim_color';
   ```
4. **Check console** - Look for errors in browser console

### New Color Not Showing

1. **Verify colorMap** - Color name must exist in `color-swatch.tsx`
2. **Check value format** - Must be lowercase with spaces
3. **Exact match** - Value must match colorMap key exactly

### Colors Wrong in Production

1. **Re-run migration** - Migration is idempotent, safe to re-run
2. **Check environment** - Verify connecting to correct database
3. **Regenerate types** - `npx supabase gen types typescript`

## Related Files

- **Component:** `/components/ui/color-swatch.tsx` - ColorSwatchGrid implementation
- **Form:** `/components/project-form/ProductConfigStep.tsx` - Color field detection
- **Types:** `/lib/types/database.ts` - TypeScript types (auto-generated)
- **Original Migration:** `/migrations/add_siding_configurations.sql` - Initial field definitions

## Architecture Notes

This fix demonstrates the **database-driven architecture** principle:
- ✅ No hardcoded colors in components
- ✅ ColorMap in single source of truth (color-swatch.tsx)
- ✅ Field options in database (trade_configurations)
- ✅ UI automatically reflects database changes
- ✅ Type-safe via generated TypeScript types

The separation of concerns:
- **colorMap** = Visual design (hex codes)
- **field_options** = Business logic (available choices)
- **ColorSwatchGrid** = Presentation (UI component)
- **ProductConfigStep** = Orchestration (form logic)
