# Markup Percent Feature Implementation

## Overview
Added `markup_percent` field to the estimate creation workflow, allowing users to specify their desired markup percentage when creating projects. The markup is applied to the total estimate cost.

## Changes Made

### 1. Database Migrations

#### `/migrations/add_markup_percent_to_projects.sql`
- Added `markup_percent` column to `projects` table
- Type: `DECIMAL(5,2)` (allows values like 15.50 for 15.5%)
- Default value: 15.00 (15% - industry standard)
- Updates existing records to have 15% default

#### `/migrations/add_markup_percent_to_takeoffs.sql`
- Added `markup_percent` column to `takeoffs` table
- Type: `DECIMAL(5,2)`
- Default value: 15.00 (15%)
- Updates existing records to have 15% default

**To apply these migrations:**
```bash
# Run migrations in your Supabase project
# Option 1: Via Supabase Dashboard (SQL Editor)
# Option 2: Via Supabase CLI
supabase db push
```

---

### 2. TypeScript Type Updates

#### `/lib/types/database.ts`

**Project Interface:**
```typescript
export interface Project {
  // ... existing fields
  markup_percent: number; // Markup percentage (e.g., 15.00 for 15%)
  // ... other fields
}
```

**Takeoff Interface:**
```typescript
export interface Takeoff {
  // ... existing fields

  // Pricing
  markup_percent: number; // Markup percentage (e.g., 15.00 for 15%)

  // ... other fields
}
```

---

### 3. Form Updates

#### `/app/project/new/page.tsx`

**ProjectFormData Interface:**
```typescript
export interface ProjectFormData {
  // ... existing fields
  notes: string;
  markupPercent: number; // Markup percentage (default 15%)
}
```

**Initial Form State:**
```typescript
const [formData, setFormData] = useState<ProjectFormData>({
  // ... existing fields
  markupPercent: 15, // Default 15% markup
});
```

---

### 4. UI Component Updates

#### `/components/project-form/ReviewSubmitStep.tsx`

Added markup input field in Step 5 (Review & Submit):

**Features:**
- Number input with percentage symbol
- Min: 0%, Max: 100%
- Step: 0.1 (allows decimal values like 15.5%)
- Default: 15%
- Validation: Only accepts values between 0-100
- Helper text explaining the purpose

**Location:**
- Placed after PDF upload section
- Before the Notes textarea
- Visually separated with separators

**User Experience:**
```
┌─────────────────────────────────────┐
│ Markup Percentage                   │
│ [15.00] %                           │
│ This markup will be applied to the  │
│ total estimate cost (default: 15%)  │
└─────────────────────────────────────┘
```

---

### 5. Webhook Integration

#### `/components/project-form/HoverUploadStep.tsx`

**Webhook Payload (packageProjectData function):**
```typescript
const payload = {
  project_id: newProjectId,
  project_name: data.projectName,
  client_name: data.customerName,
  address: data.address,
  selected_trades: data.selectedTrades,
  markup_percent: data.markupPercent, // ← NEW: Passed to n8n
  siding: cleanedSiding,
  roofing: cleanedRoofing,
  windows: cleanedWindows,
  gutters: cleanedGutters,
  hover_pdf_url: pdfUrl,
  created_at: new Date().toISOString()
};
```

**Database Insertion:**
```typescript
const projectInsert = {
  id: tempProjectId,
  name: data.projectName,
  client_name: data.customerName,
  address: data.address,
  selected_trades: data.selectedTrades,
  hover_pdf_url: pdfUrl,
  markup_percent: data.markupPercent, // ← NEW: Saved to database
  status: 'pending' as const
};
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ USER ENTERS MARKUP                                          │
│ Step 5: ReviewSubmitStep                                    │
│ Input: [15.00] %                                            │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│ FORM STATE UPDATED                                          │
│ formData.markupPercent = 15                                 │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│ SAVED TO DATABASE                                           │
│ projects.markup_percent = 15.00                             │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│ SENT TO N8N WEBHOOK                                         │
│ POST /webhook/multi-trade-coordinator                       │
│ Body: { ..., markup_percent: 15 }                           │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│ N8N PROCESSES & CREATES TAKEOFF                             │
│ takeoffs.markup_percent = 15.00                             │
│ Used for calculating final prices in Excel output           │
└─────────────────────────────────────────────────────────────┘
```

---

## n8n Webhook Integration Notes

### What the n8n workflow receives:

```json
{
  "project_id": "uuid-string",
  "project_name": "Smith Residence",
  "client_name": "John Smith",
  "address": "123 Main St",
  "selected_trades": ["siding", "roofing"],
  "markup_percent": 15,  ← NEW FIELD
  "siding": { /* config */ },
  "roofing": { /* config */ },
  "windows": {},
  "gutters": {},
  "hover_pdf_url": "https://...",
  "created_at": "2025-11-30T..."
}
```

### What the n8n workflow should do:

1. **Extract markup_percent** from webhook payload
2. **Calculate costs** from HOVER PDF measurements
3. **Apply markup** to subtotal:
   ```
   subtotal = material_cost + labor_cost + equipment_cost
   markup_amount = subtotal * (markup_percent / 100)
   grand_total = subtotal + markup_amount
   ```
4. **Create takeoff record** with markup_percent:
   ```sql
   INSERT INTO takeoffs (
     project_id,
     markup_percent,  -- Store user's preference
     total_material,
     total_labor,
     total_equipment,
     grand_total      -- Includes markup
   ) VALUES (...)
   ```

5. **Generate Excel file** showing:
   - Line items with costs
   - Subtotal
   - Markup (15%): $X,XXX.XX
   - Grand Total: $XX,XXX.XX

---

## Testing Checklist

- [ ] Run database migrations on Supabase
- [ ] Verify `projects.markup_percent` column exists (default 15.00)
- [ ] Verify `takeoffs.markup_percent` column exists (default 15.00)
- [ ] Test form: Change markup from 15% to 20%
- [ ] Verify form validation (0-100 range)
- [ ] Submit project and check database:
  - [ ] `projects.markup_percent = 20`
  - [ ] Webhook payload includes `markup_percent: 20`
- [ ] Verify n8n receives markup_percent in webhook
- [ ] Verify Excel output shows correct markup calculation
- [ ] Test with decimal values (e.g., 12.5%)
- [ ] Test edge cases (0%, 100%)

---

## Future Enhancements

1. **Per-Trade Markup:**
   - Allow different markup % for each trade
   - Example: Siding 15%, Roofing 20%

2. **Markup Templates:**
   - Save common markup presets
   - "Standard" (15%), "Premium" (25%), "Budget" (10%)

3. **Dynamic Markup Display:**
   - Show estimated markup dollar amount in real-time
   - Requires cost estimation before submission

4. **Markup History:**
   - Track average markup per customer
   - Suggest markup based on project type

---

## Files Modified

```
migrations/
  ├── add_markup_percent_to_projects.sql (NEW)
  └── add_markup_percent_to_takeoffs.sql (NEW)

lib/types/
  └── database.ts (MODIFIED)
      ├── Project interface (+markup_percent)
      └── Takeoff interface (+markup_percent)

app/project/new/
  └── page.tsx (MODIFIED)
      ├── ProjectFormData interface (+markupPercent)
      └── Initial state (+markupPercent: 15)

components/project-form/
  ├── ReviewSubmitStep.tsx (MODIFIED)
  │   └── Added markup input field with validation
  └── HoverUploadStep.tsx (MODIFIED)
      ├── Webhook payload (+markup_percent)
      └── Database insert (+markup_percent)
```

---

## Developer Notes

- **Default Value:** 15% is industry standard for construction estimates
- **Validation:** Frontend enforces 0-100 range, backend should also validate
- **Decimal Precision:** DECIMAL(5,2) allows values from 0.00 to 999.99
- **User Experience:** Field appears in Step 5 for final review/adjustment
- **Backward Compatibility:** Existing records get 15% default via migration

---

## Support

If you encounter issues:
1. Verify migrations ran successfully
2. Check browser console for validation errors
3. Inspect webhook payload in n8n logs
4. Verify database columns exist with correct types
