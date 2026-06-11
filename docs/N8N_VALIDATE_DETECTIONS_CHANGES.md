# n8n Changes — "Validate Detections" Workflow

**Date:** June 10, 2026
**Applies to:** n8n workflow **Validate Detections** (webhook path `/webhook/validate-detections`) on Railway n8n.
**Pairs with frontend commit:** "feat: persist real dimensions in validate-detections payload" (`lib/hooks/useDetectionSync.ts`).
**Why:** Closes CONFIRMED_WORK_PLAN.md finding **N-2** — the Detection Editor computes `real_width_ft`/`real_height_ft`/`area_sf`/`perimeter_lf` locally on every edit, but the validate payload dropped them, so the `extraction_detections_draft` columns were permanently NULL and every downstream LF derivation from them (extraction-api `aggregate_detections_for_recalc()`) was silently zero.
**Scope guard:** this is the **Validate Detections** workflow only. Do **not** touch "Approve from Detection Editor", "Detection Edit Sync", or the Multi-Trade Coordinator.

---

## 0. Payload change (already shipped from the frontend)

Each entry in `detections[]` now carries four additional fields. **Before:**

```json
{
  "page_id": "…",
  "class": "window",
  "pixel_x": 412.5,
  "pixel_y": 230.1,
  "pixel_width": 96.0,
  "pixel_height": 120.0,
  "confidence": 0.92,
  "source_detection_id": "…",
  "is_deleted": false,
  "detection_index": 3,
  "matched_tag": null,
  "polygon_points": [{ "x": 0, "y": 0 }],
  "markup_type": "polygon",
  "assigned_material_id": null,
  "material_cost_override": null,
  "labor_cost_override": null,
  "notes": null
}
```

**After (new fields at the end):**

```json
{
  "…": "(all fields above, unchanged)",
  "real_width_ft": 3.0,
  "real_height_ft": 3.75,
  "area_sf": 11.25,
  "perimeter_lf": 13.5
}
```

**Null semantics — the one rule that matters:** any of the four may be `null` (detection loaded from DB and never edited, or page not calibrated). `null` means **"not measured"**. Map `null` through as SQL `NULL`. **Never** default to `0` — "zeros that should have been errors" is exactly the failure class this change kills (work plan finding #29).

---

## 1. Pre-flight (do these before editing anything)

- [ ] In the Railway n8n editor, open workflow **Validate Detections** (find it via the webhook node whose path is `validate-detections`).
- [ ] **Download/export the workflow JSON first** (⋮ menu → Download) and keep it as the rollback copy.
- [ ] Confirm the draft table has the four columns (Supabase SQL editor):
  ```sql
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'extraction_detections_draft'
    AND column_name IN ('real_width_ft','real_height_ft','area_sf','perimeter_lf');
  ```
  Expect 4 rows (extraction-api already reads these columns, so they should exist). If any are missing, stop and add them before the workflow edit.
- [ ] Walk the canvas and write down the actual node names for the three roles below. Expected chain shape: **Webhook** → (Code node that validates/normalizes/splits `detections[]`) → (branch: existing-row UPDATE / new-row INSERT / deletion handling) → (totals recompute) → **Respond to Webhook**. The checklists below give the change per role; apply it under whatever the node is actually named.

---

## 2. Node changes

### ☐ Node role A — the Code node that normalizes/iterates `detections[]`
*(Likely named something like "Validate & Normalize", "Process Detections", or "Split Detections". Only needed if this node rebuilds each detection object field-by-field — if it passes items through untouched, skip to role B.)*

**Before** (representative — your field list should match the payload above):

```javascript
return detections.map((d) => ({
  page_id: d.page_id,
  class: d.class,
  pixel_x: d.pixel_x,
  pixel_y: d.pixel_y,
  pixel_width: d.pixel_width,
  pixel_height: d.pixel_height,
  confidence: d.confidence,
  source_detection_id: d.source_detection_id,
  is_deleted: d.is_deleted,
  detection_index: d.detection_index,
  matched_tag: d.matched_tag,
  polygon_points: d.polygon_points,
  markup_type: d.markup_type,
  assigned_material_id: d.assigned_material_id ?? null,
  material_cost_override: d.material_cost_override ?? null,
  labor_cost_override: d.labor_cost_override ?? null,
  notes: d.notes ?? null,
}));
```

**After — add exactly these four lines to the mapped object:**

```javascript
  // Real-world dimensions + derived measurements (June 2026, work plan N-2).
  // null = "not measured" — pass through, never coerce to 0.
  real_width_ft: d.real_width_ft ?? null,
  real_height_ft: d.real_height_ft ?? null,
  area_sf: d.area_sf ?? null,
  perimeter_lf: d.perimeter_lf ?? null,
```

### ☐ Node role B — the draft-table UPDATE for existing detections
*(The Supabase/Postgres/HTTP Request node that PATCHes `extraction_detections_draft` keyed by `source_detection_id` — likely named "Update Detection", "Update Draft", or similar. This is the load-bearing change.)*

**Before** — the node's field/column mapping contains entries like:

| Column | Value expression |
|---|---|
| `pixel_x` | `={{ $json.pixel_x }}` |
| `pixel_y` | `={{ $json.pixel_y }}` |
| `pixel_width` | `={{ $json.pixel_width }}` |
| `pixel_height` | `={{ $json.pixel_height }}` |
| `class` | `={{ $json.class }}` |
| `assigned_material_id` | `={{ $json.assigned_material_id }}` |
| `material_cost_override` | `={{ $json.material_cost_override }}` |
| … | … |

**After — add these four mappings** (the `?? null` guard makes the node safe even against an older frontend that doesn't send the fields yet):

| Column | Value expression |
|---|---|
| `real_width_ft` | `={{ $json.real_width_ft ?? null }}` |
| `real_height_ft` | `={{ $json.real_height_ft ?? null }}` |
| `area_sf` | `={{ $json.area_sf ?? null }}` |
| `perimeter_lf` | `={{ $json.perimeter_lf ?? null }}` |

*If this node is an HTTP Request node sending a JSON body instead of a column mapping, add the same four keys to the JSON body with the same expressions.*

### ☐ Node role C — the draft-table INSERT for newly created detections
*(The branch that handles detections whose `source_detection_id` has no existing row — n8n returns `created_count`, so this branch exists. Likely named "Insert Detection" / "Create Detection".)*

- [ ] Add the **same four column mappings as role B**, identical expressions.

### ☐ Node role D — things to verify you did NOT change

- [ ] The deletion branch (soft-delete/status update) — no new fields needed there.
- [ ] The totals-recompute step (`elevation_totals` / `job_totals`) — out of scope for this change; the new columns are available to it but recomputing from them is Phase 1.5 work, not this edit.
- [ ] The **Respond to Webhook** node — response shape (`success`, `updated_count`, `created_count`, `deleted_count`) is unchanged.

---

## 3. Verification (after saving + activating the workflow)

- [ ] In the Detection Editor, open a job, **resize or move one detection** on a calibrated page, then click Save (Validate).
- [ ] In n8n, check the execution log: the incoming items show the four fields; the UPDATE node's input shows non-null values for the edited detection.
- [ ] In Supabase SQL editor:
  ```sql
  SELECT id, class, real_width_ft, real_height_ft, area_sf, perimeter_lf, updated_at
  FROM extraction_detections_draft
  WHERE job_id = '<the job you edited>'
  ORDER BY updated_at DESC
  LIMIT 10;
  ```
  **Expect:** the edited detection has real values; untouched detections may legitimately remain NULL (they were never measured — that's correct, do not "fix" them).
- [ ] Re-save without editing anything: values must not get clobbered to 0 or NULL-overwritten incorrectly (they should be re-sent unchanged, since the frontend sends all detections with their current local values).

---

## 4. Deploy order & rollback

- **Order is flexible — both sides are independently safe.** Frontend-first: n8n ignores unmapped fields. n8n-first: the `?? null` expressions yield NULL until the frontend ships.
- **Rollback:** restore the exported workflow JSON from pre-flight (or remove the four mappings from roles A–C). The frontend payload fields are additive and harmless when unmapped; no frontend rollback needed.
- **Note for later phases:** once values are confirmed flowing, extraction-api's `aggregate_detections_for_recalc()` (which reads these exact columns) stops emitting all-zero trim/corner LF for edited detections — re-run the MN568 comparison on any job that path touches and expect an **explained delta** there (work plan Phase 1.5, gate mode b).
