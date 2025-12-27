# Opening Trim Fields Migration

**Migration File:** `add_opening_trim_fields.sql`
**Date:** November 29, 2024
**Status:** ✅ Ready to Deploy

## Overview

This migration adds 12 new form fields to the siding trade configuration for window trim, door trim, and garage trim. These fields follow the existing database-driven architecture and parent-child grouping pattern used by belly_band, corner_trim, and j_channel.

## Business Context

These trim fields allow estimators to specify trim requirements around different opening types:
- **Window Trim:** Trim boards around windows (3.5", 5.5", or 7.25" widths)
- **Door Trim:** Trim boards around doors (3.5", 5.5", or 7.25" widths)
- **Garage Trim:** Trim boards around garage doors (4" or 6" sizes)

Each trim type can be:
- **Primed:** Factory-primed boards requiring field painting
- **ColorPlus:** Pre-finished in one of 6 Statement Collection colors

## Fields Added

### Window Trim (4 fields)
| Field Name | Type | Options | Conditional On |
|------------|------|---------|----------------|
| `window_trim_include` | checkbox | - | - |
| `window_trim_width` | select | 3.5", 5.5", 7.25" | `window_trim_include = true` |
| `window_trim_finish` | select | ColorPlus, Primed | `window_trim_include = true` |
| `window_trim_colorplus_color` | select | 6 colors | `window_trim_include = true AND window_trim_finish = "colorplus"` |

### Door Trim (4 fields)
| Field Name | Type | Options | Conditional On |
|------------|------|---------|----------------|
| `door_trim_include` | checkbox | - | - |
| `door_trim_width` | select | 3.5", 5.5", 7.25" | `door_trim_include = true` |
| `door_trim_finish` | select | ColorPlus, Primed | `door_trim_include = true` |
| `door_trim_colorplus_color` | select | 6 colors | `door_trim_include = true AND door_trim_finish = "colorplus"` |

### Garage Trim (4 fields)
| Field Name | Type | Options | Conditional On |
|------------|------|---------|----------------|
| `garage_trim_include` | checkbox | - | - |
| `garage_trim_size` | select | 4", 6" | `garage_trim_include = true` |
| `garage_trim_finish` | select | ColorPlus, Primed | `garage_trim_include = true` |
| `garage_trim_colorplus_color` | select | 6 colors | `garage_trim_include = true AND garage_trim_finish = "colorplus"` |

## ColorPlus Color Options (Statement Collection Trim Colors)

The following 6 colors are available for all trim types when ColorPlus finish is selected:

1. **Arctic White** (`arctic_white`)
2. **Cobble Stone** (`cobble_stone`)
3. **Navajo Beige** (`navajo_beige`)
4. **Khaki Brown** (`khaki_brown`)
5. **Timber Bark** (`timber_bark`)
6. **Midnight Black** (`midnight_black`)

These are the standard James Hardie Statement Collection colors approved for trim applications.

## Database Schema

All fields are inserted into the `trade_configurations` table with the following properties:

```sql
trade: 'siding'
section: 'trim_accessories'
section_order: 4
field_order: 50-61
load_from_catalog: false
```

### Parent-Child Relationships

The migration follows the parent-child pattern where:
- **Parent fields:** End with `_include` suffix (e.g., `window_trim_include`)
- **Child fields:** Share the same prefix (e.g., `window_trim_width`, `window_trim_finish`)
- **Frontend detection:** The `ProductConfigStep.tsx` component automatically groups these fields

### Conditional Visibility (`show_if_conditions`)

The JSONB `show_if_conditions` column implements cascading visibility:

```json
// Child fields show when parent checkbox is checked
{"window_trim_include": true}

// Color field shows when both conditions are met
{"window_trim_include": true, "window_trim_finish": "colorplus"}
```

## Frontend Integration

### Automatic Rendering

The existing `ProductConfigStep.tsx` component automatically:
1. ✅ Queries `trade_configurations` table filtered by `trade='siding'`
2. ✅ Detects parent-child relationships via `_include` suffix pattern
3. ✅ Evaluates `show_if_conditions` for conditional visibility
4. ✅ Renders child fields indented under parent checkbox
5. ✅ Updates form state as user makes selections

**No frontend code changes required!**

### Expected UI Layout

```
Trim Accessories
├─ Belly Band (existing)
│  └─ [child fields]
├─ Corner Trim (existing)
│  └─ [child fields]
├─ J-Channel (existing)
│  └─ [child fields]
├─ ☐ Include Window Trim (NEW)
│  └─ Width: [3.5" | 5.5" | 7.25"]
│  └─ Finish: [ColorPlus | Primed]
│  └─ Color: [6 colors] (only if ColorPlus selected)
├─ ☐ Include Door Trim (NEW)
│  └─ Width: [3.5" | 5.5" | 7.25"]
│  └─ Finish: [ColorPlus | Primed]
│  └─ Color: [6 colors] (only if ColorPlus selected)
└─ ☐ Include Garage Trim (NEW)
   └─ Size: [4" | 6"]
   └─ Finish: [ColorPlus | Primed]
   └─ Color: [6 colors] (only if ColorPlus selected)
```

## Webhook Payload

### Example Payload (n8n webhook)

When a user submits the form, the payload sent to `https://n8n-production-293e.up.railway.app/webhook/multi-trade-coordinator` will include:

```json
{
  "project_id": "uuid-here",
  "project_name": "Smith Residence Siding",
  "client_name": "John Smith",
  "address": "123 Main St",
  "selected_trades": ["siding"],
  "siding": {
    "siding_product_type": "hardieplank",
    "primary_siding_color": "arctic_white",
    "belly_band_include": true,
    "belly_band_size": "8",
    "belly_band_finish": "colorplus",
    "corner_trim_include": true,
    "corner_trim_product": "hardie_trim",
    "corner_trim_color": "arctic_white",
    "window_trim_include": true,
    "window_trim_width": "5.5",
    "window_trim_finish": "colorplus",
    "window_trim_colorplus_color": "cobble_stone",
    "door_trim_include": true,
    "door_trim_width": "3.5",
    "door_trim_finish": "primed",
    "garage_trim_include": false
  },
  "hover_pdf_url": "https://...",
  "created_at": "2024-11-29T12:00:00Z"
}
```

### Payload Notes

- Fields are included in the `siding` configuration object
- Only submitted if parent `*_include` checkbox is checked
- Empty values are cleaned by `cleanConfig()` function in `HoverUploadStep.tsx`
- Color field omitted if finish is "primed"

## Deployment Instructions

### 1. Run Migration in Supabase

**Via Supabase Dashboard:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor**
4. Copy contents of `add_opening_trim_fields.sql`
5. Click **Run** to execute

**Via Supabase CLI:**
```bash
supabase db push
```

### 2. Verify Migration Success

Run the verification query included at the bottom of the migration file:

```sql
SELECT
  config_name,
  field_label,
  field_type,
  section,
  field_order,
  show_if_conditions
FROM trade_configurations
WHERE trade = 'siding'
  AND section = 'trim_accessories'
  AND config_name LIKE '%_trim_%'
ORDER BY field_order;
```

**Expected Result:** 12 rows (4 fields × 3 trim types)

### 3. Test Frontend

1. Start development server: `npm run dev`
2. Navigate to `/app/project` → New Project tab
3. Select "Siding" trade in Step 2
4. Proceed to Step 3 (Product Configuration)
5. Scroll to "Trim Accessories" section
6. Verify new fields appear after existing trim fields
7. Test conditional visibility:
   - Check "Include Window Trim" → Width and Finish fields appear
   - Select "ColorPlus" finish → Color field appears
   - Select "Primed" finish → Color field disappears

### 4. Test Webhook Integration

1. Complete all form steps
2. Upload HOVER PDF in Step 4
3. Open browser DevTools → Network tab
4. Click "Submit" in Step 5
5. Inspect POST request to n8n webhook
6. Verify payload includes trim fields in `siding` object

### 5. Verify Database Storage

```sql
-- Check latest project configurations
SELECT
  p.name as project_name,
  pc.trade,
  pc.configuration_data
FROM projects p
JOIN project_configurations pc ON p.id = pc.project_id
WHERE p.created_at > NOW() - INTERVAL '1 hour'
  AND pc.trade = 'siding'
ORDER BY p.created_at DESC
LIMIT 1;
```

## Rollback Instructions

If you need to remove these fields:

```sql
-- Delete all opening trim fields
DELETE FROM trade_configurations
WHERE trade = 'siding'
  AND section = 'trim_accessories'
  AND config_name IN (
    'window_trim_include', 'window_trim_width', 'window_trim_finish', 'window_trim_colorplus_color',
    'door_trim_include', 'door_trim_width', 'door_trim_finish', 'door_trim_colorplus_color',
    'garage_trim_include', 'garage_trim_size', 'garage_trim_finish', 'garage_trim_colorplus_color'
  );
```

## Architecture Notes

This migration follows the critical architecture principles from `CLAUDE.md`:

✅ **PRINCIPLE #1: DATABASE-DRIVEN ARCHITECTURE**
- No hardcoded fields in frontend
- All field definitions stored in `trade_configurations` table
- Frontend queries database to build form dynamically

✅ **PRINCIPLE #2: CONDITIONAL FIELD VISIBILITY**
- Uses `show_if_conditions` JSONB for conditional logic
- Frontend evaluates conditions via `isFieldVisible()` function
- Cascading visibility (parent → child → grandchild)

✅ **PRINCIPLE #3: PARENT-CHILD GROUPING**
- Parent fields end with `_include` suffix
- Child fields share the same prefix
- Frontend auto-detects and groups via `groupFieldsByParent()` function

## Related Files

- **Migration:** `/migrations/add_opening_trim_fields.sql`
- **Documentation:** `/migrations/README_OPENING_TRIM.md`
- **Frontend Component:** `/components/project-form/ProductConfigStep.tsx` (no changes)
- **Webhook Handler:** `/components/project-form/HoverUploadStep.tsx` (no changes)
- **Existing Migrations:**
  - `/migrations/add_siding_configurations.sql` (original siding fields)
  - `/migrations/add_belly_band_color_colorplus.sql` (belly band update)
  - `/migrations/update_belly_band_fields.sql` (belly band refinement)

## Support

If you encounter issues:
1. Check Supabase logs for SQL errors
2. Verify `trade_configurations` table has all 12 new rows
3. Check browser console for React errors
4. Verify environment variable `NEXT_PUBLIC_SUPABASE_URL` is set
5. Clear browser cache and reload form

## Questions?

Contact the development team or refer to:
- `CLAUDE.md` - Complete architecture documentation
- `ProductConfigStep.tsx` - Form rendering logic
- `HoverUploadStep.tsx` - Webhook integration logic
