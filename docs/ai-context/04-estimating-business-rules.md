# 04 — Estimating Business Rules

> The math that turns detections into a priced takeoff. Source files are cited inline.
> Companion reading: `patterns/CALCULATION_AND_PRICING_ENGINE.md`, `MATERIAL_ONBOARDING_STANDARD_OPERATING_PROCEDURE.md`, `docs/N8N_TRIM_IMPLEMENTATION.md`, and the migrations under `/migrations`.

## Glossary

- **SF** — square feet of area
- **LF** — linear feet
- **SQ** — "square", a siding industry unit = 100 SF
- **Scale ratio** — pixels per foot, stored per-page on `extraction_pages.scale_ratio`
- **Facade** — the 2D projection of a building elevation, before openings are subtracted
- **Net siding** — facade minus openings plus gable add-ons
- **Presentation group** — visual grouping used in UI and Excel (7 consolidated groups)

---

## 1. Coordinate transforms (`lib/utils/coordinates.ts`)

- **Roboflow center → Konva top-left**
  `x = pixel_x − pixel_width/2`, `y = pixel_y − pixel_height/2`
- **Konva → Roboflow** (reverse, on save)
- **Pixel → feet**
  `real_width_ft = pixel_width / scale_ratio`
  `real_height_ft = pixel_height / scale_ratio`
  `real_width_in = real_width_ft × 12`
- **Rectangular helpers**
  `area_sf = real_width_ft × real_height_ft`
  `perimeter_lf = 2 × (real_width_ft + real_height_ft)`

Scale ratio is always **per-page**; do not use a job-level default for area math.

---

## 2. Polygon geometry (`lib/utils/polygonUtils.ts`)

- **Area — Shoelace formula** (lines 75–103):
  `A = |Σᵢ (xᵢ · yᵢ₊₁ − xᵢ₊₁ · yᵢ)| / 2` in pixel space.
- **`calculatePolygonAreaSf(points, scaleRatio)`** (≈110–135): divide pixel² by `scaleRatio²`.
- **`calculatePolygonPerimeterLf(points, scaleRatio)`** (≈139–168): Σ Euclidean distances / scaleRatio.
- **Bounding box + centroid** (≈181–250): used for label placement only.
- **Degenerate polygon warnings** — every polygon helper emits `console.warn('[polygonUtils] …')` on < 3 points or zero area (commit `f38839b`).
- **Drag / resize uses Shoelace end-to-end** — prior bounding-box math inflated triangular / gable areas; fixed in commit `bf02c6b`.

Preferred source of area: **`extraction_detections_draft.area_sf` stored in the DB** (commit `3a1b295`). Fall back to pixel math only when the stored value is null/absent, and emit a warning.

---

## 3. Net siding calculation

Formula applied at elevation level:

```
net_siding_sf = building_area_sf − total_openings_sf + gable_area_sf
```

- `building_area_sf` — from the `building` or `exterior_wall` detection polygon.
- `total_openings_sf = Σ(window + door + garage area_sf)` — sums opening detections.
- `gable_area_sf` — from `gable` polygons on the same elevation.

Applied across:
- `DetectionEditor.tsx` → `liveDerivedTotals`
- `DetectionEditor.tsx` → `allPagesTotals`
- `KonvaDetectionPolygon.tsx` (per-polygon display)

The Extraction API `POST /siding-polygons` returns the same decomposition (exterior + holes + gable add-ons) for overlay rendering on the canvas.

---

## 4. Openings (windows / doors / garages)

- Detections carry `area_sf`, `perimeter_lf`, and individual **head / jamb / sill** LF splits (added in `add_opening_trim_fields.sql`).
- Aggregates per elevation: `window_count`, `window_area_sf`, `window_perimeter_lf`, `window_head_lf`, `window_jamb_lf`, `window_sill_lf` (and same for `door_*`, `garage_*`).
- Schedule data (from `/api/extract-schedule`) provides **mark / size / quantity** for cross-checking detection counts.

---

## 5. Corners

Stored on `extraction_elevation_calcs` and summed into `extraction_job_totals`:
- `outside_corner_count`, `outside_corner_lf`
- `inside_corner_count`, `inside_corner_lf`

Auto-scope formula (standard):

```
quantity_pieces = CEILING(corner_count × wall_height_ft / piece_length_ft × waste_factor)
```

Typical values: piece_length = `{corner-piece length, e.g. 10 ft}`, waste = `1.10` (10%). Angles are **assumed 90°** today — non-rectangular buildings have no `angle_degrees` field yet.

---

## 6. Trim (Hardie + Whitewood)

### Sources (from detections)
- `trim.total_head_lf`, `trim.total_jamb_lf`, `trim.total_sill_lf`, `trim.total_trim_lf` (= sum of all three).

### Standard rules (from `add_trim_auto_scope_rules.sql`)
| Item | Formula | Notes |
|------|---------|-------|
| Trim boards (12 ft) | `CEILING(trim_total_lf / 12 × 1.10)` | 10 % waste |
| Head flashing (Z-flash, 10 ft) | `CEILING(trim_head_lf / 10 × 1.10)` | |
| Caulk (tubes) | `CEILING(trim_total_lf / 40)` | 1 tube / 40 LF |
| Fasteners (boxes) | `CEILING(trim_total_lf / 100)` | 1 box / 100 SF |

### Trim system toggle
- `trigger_condition.trim_system ∈ {hardie, whitewood}` — rules scope themselves to the chosen trim system.
- Whitewood rules are seeded with `active = false` by default; the estimate settings panel flips them on when the user selects whitewood.
- Whitewood consumable toggles default to **true** (commit `f5cdf96`).

---

## 7. Gable, top-out, belly band

From `add_gable_topout_and_topout_rules.sql`:
- **Gable top-out** (`gable_topout_count`, `gable_topout_lf`) — transition trim between main wall cladding and gable panel. Trigger: `min_gable_topout_lf`.
- **Top-out** (`topout_count`, `topout_lf`) — top-of-wall transition at eave / soffit. Trigger: `min_topout_lf`.
- **Belly band** (`belly_band_count`, `belly_band_lf`) — horizontal band between first and second story. Trigger: `min_belly_band_lf`.
- All use the 12 ft × 10 % formula: `CEILING(lf / 12 × 1.10)`.

Color options for belly band + ColorPlus palette: `add_belly_band_color_colorplus.sql`, `add_colorplus_color_options.sql`, `update_colorplus_complete_palette.sql`.

---

## 8. WRB (Weather-resistive barrier) & coverage-based items

Coverage formula (from `add_wrb_installation_labor.sql` and generic coverage rules):

```
quantity_rolls = CEILING(facade_sqft / coverage_sf_per_roll × waste_factor)
```

Same pattern for house wrap tapes, flashing membranes, etc.

---

## 9. Labor

- **L&I insurance rate** — 12.65 % applied to labor subtotal (`lib/utils/itemHelpers.ts:58`, `LI_INSURANCE_RATE`). Added dynamically in calculation notes (commit `14f14c5` + `81d82c5`).
- **Squares-based labor** — `labor_auto_scope_rules` with `quantity_source = 'facade_sqft'` and formula `facade_sqft / 100`. Unit = `SQ`. See `create_labor_auto_scope_rules.sql`.
- **Dynamic L&I** — `config_match` in `trigger_condition` reads estimate settings to pick the correct labor rate.

Toggle ordering bug is common here: in `shouldApplyRule()`, the `config_match` check must run **before** the early-return on `trigger.always` (fixed in commit `f74557f`).

---

## 10. Waste factors (canonical)

| Item type | Waste | Notes |
|-----------|-------|-------|
| Trim boards / corners / top-out / belly band | 10 % (× 1.10) | encoded in CEILING formulas |
| Z-flashing | 10 % | 10 ft pieces |
| Fasteners | +1 box/100 SF | not a multiplier |
| Caulk | +1 tube/40 LF | not a multiplier |
| WRB / membranes | from rule (usually 5–10 %) | per-product |

---

## 11. Markup, margin, per-square economics (Excel Summary sheet)

From commits `439035e`, `3f204e8`, and `lib/utils/exportTakeoffExcel.ts`:

- `Total SQ's` → cross-references `Takeoff!C{row}` (total squares).
- `Sell Pr SQ = Grand Total / Total SQ's`.
- `Sub Payout` → cross-references `Takeoff!G{row}`.
- `Sub Payout Pr SQ = Sub Payout / Total SQ's`.
- `Profit = Σ markup amounts (Materials + Labor + Overhead)`.
- `Margin = Profit / Grand Total` (percentage).
- `markup_percent` is stored on both `projects` and `takeoffs` (project value flows into takeoff at creation).

---

## 12. Presentation groups (display + Excel grouping)

Defined in `lib/utils/itemHelpers.ts:61-104` (`PRESENTATION_GROUP_CONFIG`) and enforced in `lib/utils/exportTakeoffExcel.ts`.

**Canonical 7 groups**: `cladding`, `trims`, `metals_flashings`, `waterproofing`, `accessories`, `soffit`, `gutters`.
**Legacy mapping** (exportTakeoffExcel.ts ~104–155): `siding → cladding`, `trim → trims`, `flashing → metals_flashings`, etc. Rules with unknown `presentation_group` fall through to this mapping (consolidation commit: `6726cfa`).

**Paint special handling** (`isPaintItem()` in exportTakeoffExcel.ts ~199+): matches when `category = 'paint'`, `presentation_group` contains 'paint', or description matches paint keywords. Rendered in its own `PaintTable` and tinted purple (`F3E5F5` / `8E24AA`).

---

## 13. Auto-scope rule evaluation

Pseudocode (applied by n8n and documented in `docs/api-updates/autoscope-v2-changes.ts`):

```
for rule in siding_auto_scope_rules (active = true):
    if rule.presentation_group not in allowed_groups: skip
    if rule.manufacturer_filter and manufacturer not in filter: skip
    if not shouldApplyRule(rule.trigger_condition, measurements, estimateConfig):
        skip
    quantity = evaluate(rule.quantity_formula, measurements, estimateConfig)
    material_cost = lookup_price(rule.sku)
    emit line_item(quantity, unit, rule.calculation_notes.interpolate(...))
```

### `shouldApplyRule()` — order-sensitive
1. Check `config_match` (path + value equality into `estimateConfig`).
2. Check `trim_system` match if specified.
3. Check `material_category` and `sku_pattern` (scoped to matching products only — commit `4a1cb21`).
4. Check measurement thresholds (`min_corners`, `min_openings`, etc.).
5. **Only then** honour `trigger.always = true`.

Reversing steps 1 and 5 is a known repeat bug — see `.claude/skills/arch-review/SKILL.md` ("toggle ordering").

### JSONB truth helpers
`undefined` / `null` defaults to "fires" in JSONB, so always use `isTrue()` / `isFalse()` helpers rather than raw `if (trigger.foo)`.

### Formula variable names
Formulas are evaluated against a **flat** measurement context — use `facade_sqft`, not `measurements.facade_sqft`. Variable names must match the key set exposed by the evaluator.

### Manufacturer filter syntax
Stored as a Postgres text array: `ARRAY['James Hardie']`. Case-sensitive. A NULL filter means "generic, applies to any manufacturer". Generic + per-manufacturer rules are **two separate code paths** in autoscope-v2; bugs often hide in the one that wasn't changed.

---

## 14. Calculation notes (user-facing)

`siding_auto_scope_rules.calculation_notes` holds a templated string with `{variable}` placeholders. n8n interpolates at calculation time so the user sees the exact numbers used (e.g. `"{facade_sqft} SF ÷ {coverage} SF/roll × {waste} = {quantity}"`). Added in `add_calculation_notes_to_autoscope_rules.sql` and broadened in `fix_calculation_notes_catchall.sql`.

**Watch out**: n8n Code nodes that build these notes must use **string concatenation**, not backticks. Backticks get re-escaped when n8n serialises the expression into JSON and the output breaks. (`.claude/skills/arch-review/SKILL.md`)

---

## 15. Paint (paint & primer)

- Separate line-item type via `itemHelpers.separateItemsByType()`.
- Rendered in its own `/takeoffs/[id]/components/PaintTable.tsx`.
- Excel export groups paint into its own visual block (purple tint).
- See root-level `PAINT_PRIMED_MATERIAL_GAMEPLAN.md` and `PAINT_SERVICE_FINDINGS.md`.

---

## 16. Known rule-engine footguns

1. **Toggle check ordering** (see §13).
2. **JSONB truthiness** — use helpers.
3. **Variable naming** — `facade_sqft` not `measurements.facade_sqft`.
4. **`presentation_group` typos** — silent zero quantities.
5. **`manufacturer_filter` case / array syntax** — must be `ARRAY['James Hardie']`.
6. **Generic vs per-manufacturer code paths** (autoscope-v2.ts ~1554 vs ~1621) — change both.
7. **n8n template literals** — use string concatenation.
8. **Per-page scale ratio** — don't reuse job-level scale for area math.
9. **`sku_pattern` scope** — must scope to matching `material_category` only (commit `4a1cb21`).
10. **Formula CEILING()** — must wrap the whole expression, not a sub-expression, or waste rounds incorrectly.
