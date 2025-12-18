# ColorPlus Complete Palette Update

## Overview

This update adds all 25 official James Hardie ColorPlus colors with accurate hex codes to the color picker component.

## Changes Made

### 1. Updated color-swatch.tsx Component

**File:** `/components/ui/color-swatch.tsx`

**Changes:**
- Updated colorMap with all 25 official James Hardie ColorPlus colors
- Added enhanced border styling for light colors (Arctic White, Light Mist, etc.)
- Improved visibility on white backgrounds

**New Colors Added (10):**
1. Midnight Blue (#1E2A3A)
2. Pearl Gray (#9A9A94)
3. Autumn Tan (#B89F7E)
4. Country Lane Red (#6B3232)
5. Deep Ocean (#2B4553)
6. Light Mist (#D8D8D0)
7. Slate Gray (#5A5F63)
8. Sierra (#8B5A42)
9. Traditional Red (#7B2D26)
10. Tuscan Gold (#C4A35A)
11. Woodstock Brown (#5A4A3A)

**Hex Codes Updated (14):**
- Arctic White: #E8E4DF → #F5F5F0
- Evening Blue: #5B6770 → #2B3A4D
- Monterey Taupe: #A69E93 → #8B7D6B
- Navajo Beige: #C9B99A → #C4B9A7
- Timber Bark: #4A3F37 → #5D4E42
- Aged Pewter: #7A7D7A → #6B6B63
- Boothbay Blue: #4A5B6A → #5B7A8A
- Cobble Stone: #8B8985 → #7A7568
- Iron Gray: #5C5D5B → #4A4F4F
- Khaki Brown: #6B5D4D → #7D6B5A
- Mountain Sage: #7D8B7A → #7A8B7A
- Night Gray: #4B4F52 → #3D4242
- Sandstone Beige: #C4B9A4 → #C9B99A
- "Countrylane Red" → "Country Lane Red": #7B3B35 → #6B3232

### 2. Enhanced Visual Styling

**Light Color Detection:**
Added function to detect very light colors (brightness > 200) that need stronger borders for visibility on white backgrounds.

**Border Enhancement:**
- Light colors (Arctic White, Light Mist, Pearl Gray, etc.): `border-slate-400` (darker border)
- Regular colors: `border-slate-300` (standard border)
- Selected state: `border-brand-500` (brand color, overrides light/regular)

**Visual Features:**
- ✅ Circular color swatches (48px diameter)
- ✅ Checkmark on selected color (white on dark, dark on light)
- ✅ Automatic text contrast detection
- ✅ Hover effects (scale + border color change)
- ✅ Responsive grid (3/4/5 columns)
- ✅ Enhanced borders for light colors

### 3. Database Migration

**File:** `/migrations/update_colorplus_complete_palette.sql`

**Updates 3 fields:**
1. `colorplus_color` - All 25 ColorPlus colors
2. `corner_trim_color` - "Match Siding" + all 25 colors
3. `j_channel_color` - "Match Siding" + all 25 colors

## Complete Color List (25 Colors)

All colors sorted alphabetically with official hex codes:

| Color Name | Hex Code | Brightness | Border Style |
|------------|----------|------------|--------------|
| Aged Pewter | #6B6B63 | Medium | Standard |
| Arctic White | #F5F5F0 | Very Light | Enhanced |
| Autumn Tan | #B89F7E | Light | Standard |
| Boothbay Blue | #5B7A8A | Medium | Standard |
| Cobble Stone | #7A7568 | Medium | Standard |
| Country Lane Red | #6B3232 | Dark | Standard |
| Deep Ocean | #2B4553 | Dark | Standard |
| Evening Blue | #2B3A4D | Dark | Standard |
| Heathered Moss | #5A6B52 | Medium-Dark | Standard |
| Iron Gray | #4A4F4F | Medium-Dark | Standard |
| Khaki Brown | #7D6B5A | Medium | Standard |
| Light Mist | #D8D8D0 | Very Light | Enhanced |
| Midnight Blue | #1E2A3A | Very Dark | Standard |
| Monterey Taupe | #8B7D6B | Medium | Standard |
| Mountain Sage | #7A8B7A | Medium | Standard |
| Navajo Beige | #C4B9A7 | Light | Standard |
| Night Gray | #3D4242 | Dark | Standard |
| Pearl Gray | #9A9A94 | Light | Enhanced |
| Sandstone Beige | #C9B99A | Light | Standard |
| Sierra | #8B5A42 | Medium-Dark | Standard |
| Slate Gray | #5A5F63 | Medium-Dark | Standard |
| Timber Bark | #5D4E42 | Dark | Standard |
| Traditional Red | #7B2D26 | Dark | Standard |
| Tuscan Gold | #C4A35A | Medium | Standard |
| Woodstock Brown | #5A4A3A | Dark | Standard |

## How to Apply

### Option 1: Supabase Dashboard (Recommended)

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy contents of `update_colorplus_complete_palette.sql`
5. Paste and click **Run**
6. Verify output shows 25-26 colors per field

### Option 2: Command Line (psql)

```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres" \
  -f migrations/update_colorplus_complete_palette.sql
```

### Option 3: Supabase CLI

```bash
supabase db push
```

## Testing

### 1. Visual Test in UI

1. **Refresh browser** (hard refresh: Ctrl+Shift+R / Cmd+Shift+R)
2. Navigate to siding configuration form
3. Select a ColorPlus product (e.g., "HardiePlank 5.25" Smooth ColorPlus")
4. The ColorPlus color field should appear

**Expected Results:**
- ✅ See 25 color swatches (5 rows × 5 columns on desktop)
- ✅ Each swatch shows actual color (not grey)
- ✅ Light colors (Arctic White, Light Mist, Pearl Gray) have darker borders
- ✅ Dark colors (Midnight Blue, Deep Ocean, Night Gray) have white checkmarks when selected
- ✅ Light colors have dark checkmarks when selected
- ✅ Color names display below each swatch
- ✅ Clicking a color selects it (checkmark appears)

### 2. Color Accuracy Test

Compare displayed colors to official James Hardie ColorPlus samples:

**Very Light Colors:**
- Arctic White (#F5F5F0) - Off-white, slightly warm
- Light Mist (#D8D8D0) - Very light grey

**Light/Medium Colors:**
- Pearl Gray (#9A9A94) - Medium light grey
- Navajo Beige (#C4B9A7) - Light tan/beige
- Sandstone Beige (#C9B99A) - Light sandy tan
- Autumn Tan (#B89F7E) - Light brown/tan

**Medium Colors:**
- Monterey Taupe (#8B7D6B) - Medium grey-brown
- Aged Pewter (#6B6B63) - Medium grey
- Cobble Stone (#7A7568) - Medium grey-tan
- Mountain Sage (#7A8B7A) - Medium sage green
- Khaki Brown (#7D6B5A) - Medium brown
- Tuscan Gold (#C4A35A) - Medium golden brown

**Dark Colors:**
- Boothbay Blue (#5B7A8A) - Medium-dark blue-grey
- Slate Gray (#5A5F63) - Dark grey
- Heathered Moss (#5A6B52) - Dark mossy green
- Sierra (#8B5A42) - Dark reddish brown
- Iron Gray (#4A4F4F) - Very dark grey
- Timber Bark (#5D4E42) - Dark brown
- Night Gray (#3D4242) - Very dark grey
- Evening Blue (#2B3A4D) - Very dark blue
- Deep Ocean (#2B4553) - Very dark blue-grey
- Midnight Blue (#1E2A3A) - Darkest blue
- Woodstock Brown (#5A4A3A) - Dark chocolate brown
- Country Lane Red (#6B3232) - Dark brick red
- Traditional Red (#7B2D26) - Dark burgundy red

### 3. Responsive Test

Test at different screen sizes:

**Mobile (< 640px):**
- Should display 3 columns
- Gap between swatches: 12px
- Swatches should be 48px circles

**Tablet (640px - 768px):**
- Should display 4 columns

**Desktop (≥ 768px):**
- Should display 5 columns
- 5 rows of colors (25 total)

### 4. Interaction Test

**Hover Effects:**
- Swatch scales up slightly (1.05x)
- Border color changes to brand color
- Background changes to light grey

**Selection:**
- Click any color → Checkmark appears
- Card gets brand-colored border and background
- Label text turns brand color
- Clicking another color → Selection moves

**Accessibility:**
- All colors have proper text contrast (WCAG AA)
- Checkmark visible on all colors (white or dark)
- Keyboard navigation works (tab/enter)

## Verification Query

After applying migration, verify with:

```sql
-- Check color counts
SELECT
  config_name,
  field_label,
  jsonb_array_length(field_options->'options') as total_colors
FROM trade_configurations
WHERE
  trade = 'siding'
  AND config_name IN ('colorplus_color', 'corner_trim_color', 'j_channel_color');
```

**Expected output:**
- `colorplus_color`: 25 colors
- `corner_trim_color`: 26 colors (includes "Match Siding")
- `j_channel_color`: 26 colors (includes "Match Siding")

## Troubleshooting

### Colors Still Grey After Update

**Solution:**
1. Clear browser cache (hard refresh)
2. Restart dev server: `npm run dev`
3. Check colorMap in color-swatch.tsx has all 25 colors
4. Verify values use spaces: `"arctic white"` not `"arctic_white"`

### Migration Fails

**Possible causes:**
1. Fields don't exist yet
2. Database connection issue
3. Syntax error

**Solution:**
- Check field exists: `SELECT * FROM trade_configurations WHERE config_name = 'colorplus_color';`
- Verify Supabase credentials in `.env.local`
- Check migration syntax

### Light Colors Not Visible

**Solution:**
- Verify `isVeryLightColor()` function in color-swatch.tsx
- Check border color: should be `border-slate-400` for very light colors
- Brightness threshold is 200 (tune if needed)

### Wrong Color Displayed

**Solution:**
1. Check value format matches colorMap key exactly
2. Verify hex code in colorMap is correct
3. Database value must be lowercase with spaces

## Rollback

If you need to revert to the 15-color palette:

```sql
-- Example: Revert colorplus_color to original 15 colors
UPDATE trade_configurations
SET
  field_options = jsonb_build_object(
    'options', jsonb_build_array(
      -- ... paste original 15 colors here
    )
  ),
  updated_at = NOW()
WHERE
  trade = 'siding'
  AND config_name = 'colorplus_color';
```

Not recommended - the 25-color palette is the official complete set.

## Related Files

- **Component:** `/components/ui/color-swatch.tsx` - ColorSwatchGrid implementation
- **Form:** `/components/project-form/ProductConfigStep.tsx` - Where color fields render
- **Migration:** `/migrations/update_colorplus_complete_palette.sql` - Database updates
- **Previous Migration:** `/migrations/fix_corner_trim_color_values.sql` - Fixed value format
- **Types:** `/lib/types/database.ts` - TypeScript types (auto-generated)

## Technical Notes

### Color Map Structure

The colorMap is a simple key-value object:
```typescript
const colorMap: Record<string, string> = {
  "arctic white": "#F5F5F0",
  "aged pewter": "#6B6B63",
  // ...
};
```

### Value Format Standard

**Rules:**
1. **Lowercase** - All keys must be lowercase
2. **Spaces** - Use spaces between words (not underscores/hyphens)
3. **Trimmed** - No leading/trailing whitespace
4. **Exact match** - Database value must match colorMap key exactly

### Brightness Calculation

Uses weighted RGB formula for perceptual brightness:
```typescript
brightness = (R × 299 + G × 587 + B × 114) / 1000
```

**Thresholds:**
- **Light color** (checkmark color): brightness > 155
- **Very light color** (border enhancement): brightness > 200

### Database Schema

Each color field in `trade_configurations` has:
```json
{
  "field_options": {
    "options": [
      {"label": "Display Name", "value": "database_value"},
      ...
    ]
  }
}
```

The `value` must match a colorMap key exactly (lowercase with spaces).

## Adding Future Colors

To add new James Hardie colors:

### 1. Update colorMap (color-swatch.tsx)
```typescript
const colorMap: Record<string, string> = {
  // Existing colors...
  "new color name": "#HEXCODE",
};
```

### 2. Update database field options
```sql
UPDATE trade_configurations
SET field_options = jsonb_set(
  field_options,
  '{options}',
  field_options->'options' || jsonb_build_array(
    jsonb_build_object('label', 'New Color Name', 'value', 'new color name')
  )
)
WHERE config_name = 'colorplus_color';
```

### 3. Test
- Refresh browser
- Verify new color appears in swatch grid
- Check hex code displays correctly
- Verify checkmark visibility

## Support

For issues or questions:
1. Check browser console for errors
2. Verify migration ran successfully
3. Confirm Supabase credentials are correct
4. Check that dev server restarted after code changes
