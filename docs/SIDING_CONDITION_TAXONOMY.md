# Siding Scope Condition Taxonomy — v0.1 (DRAFT for adjudication)

**Status:** Draft. Every row needs Anthony's adjudication before it becomes schema data.
**Purpose:** The backbone of the scope knowledge architecture. A *condition* is any place
or circumstance on a building where the cladding system changes state and materials are
required. Every auto-scope rule will eventually map to exactly one condition. Every
condition on every job must resolve to: SATISFIED / EXPLICITLY ABSENT / UNKNOWN.
**Sources:** James Hardie TR1502 (HardieTrim HZ10 flashing & clearance details),
HardieWrap install instructions, HardieWrap ProFlashing product doc, CSI Division 7
(07 25 00 WRB · 07 46 46 fiber-cement siding · 07 62 00 sheet-metal flashing & trim ·
07 92 00 joint sealants), IRC R703, and conditions observed in the EstimatePros pipeline
(MN568 and rule table v2).

## Column legend

- **Job type:** NC = new construction · RR = remove & replace · BOTH
- **Zero-legal:** can this condition legitimately not exist on a house? If NO, an
  absence is always a measurement gap, never a confirmation candidate.
- **Measurement source:** the input that satisfies the condition. Class names use
  current detection-class vocabulary where it exists; NEW = no class exists today.
- **Ref:** primary citable documentation (to be registered in `knowledge_sources`).

---

## Zone A — Field cladding (planes)

| ID | Condition | Job type | Zero-legal | Measurement source | Ref |
|----|-----------|----------|-----------|--------------------|-----|
| A1 | Field wall — lap siding | BOTH | Yes (other cladding) | siding polygons w/ material assignment | 07 46 46; Hardie install |
| A2 | Field wall — shingle/shake | BOTH | Yes | siding polygons w/ material assignment | 07 46 46 |
| A3 | Field wall — board & batten / panel | BOTH | Yes | siding polygons w/ material assignment | 07 46 46 |
| A4 | Horizontal material transition (e.g., lap→shake at band) | BOTH | Yes | transition line LF (NEW or derive from adjacent polygons) | TR1502 fig. 7 (horizontal flashing) |
| A5 | Vertical material transition / dissimilar-material abutment (brick, stone) | BOTH | Yes | line LF (NEW) | TR1502 fig. 9 (mortar/masonry) |
| A6 | Gable field (when distinct product from body) | BOTH | Yes | gable polygons / gable detection | 07 46 46 |

## Zone B — Openings

| ID | Condition | Job type | Zero-legal | Measurement source | Ref |
|----|-----------|----------|-----------|--------------------|-----|
| B1 | Opening head (window / door / garage) | BOTH | No (every house has openings) | opening detections → head LF | ProFlashing doc; IRC R703.4 |
| B2 | Opening jambs | BOTH | No | opening detections → jamb LF | ProFlashing doc |
| B3 | Opening sill | BOTH | No | opening detections → sill LF | ProFlashing doc (pan/sill sequence) |
| B4 | Mulled / ganged opening assembly (shared trim runs) | BOTH | Yes | grouped-opening flag (NEW) | practitioner policy |
| B5 | Opening surround trim (the trim package itself) | BOTH | Policy | opening perimeter LF | TR1502 |

## Zone C — Corners & vertical terminations

| ID | Condition | Job type | Zero-legal | Measurement source | Ref |
|----|-----------|----------|-----------|--------------------|-----|
| C1 | Outside corner | BOTH | No (geometry guarantees ≥4) | floor-plan corner count × wall height (current: extraction_job_totals, corner_source) | TR1502; 07 46 46 |
| C2 | Inside corner | BOTH | Yes | floor-plan corner count × wall height | TR1502 |
| C3 | Vertical termination at soffit return / open rake end | BOTH | Yes | derived from elevations (NEW) | practitioner policy |

## Zone D — Horizontal lines & bands

| ID | Condition | Job type | Zero-legal | Measurement source | Ref |
|----|-----------|----------|-----------|--------------------|-----|
| D1 | Belly band / band board | BOTH | Yes | belly_band line LF (NOTE: MN568 lesson — marked LF vs actual wrap extent must be confirmed at pre-flight) | TR1502 fig. 4 + fig. 7 |
| D2 | Level starter / first course | BOTH | No | derived: foundation perimeter LF (known-good: net ÷ wall height is NOT correct derivation — see work plan) | Hardie install |
| D3 | Frieze / top-out at soffit line | BOTH | Yes | perimeter LF at plate (current: derived; verify 2× anomaly — top + bottom runs?) | TR1502 |
| D4 | Gable rake trim | BOTH | Yes | rake LF from gable detections | TR1502 |
| D5 | Grade / hardscape clearance line | BOTH | No | starter LF proxy + clearance policy (1¼"–2") | TR1502 figs. 2–3 |
| D6 | Water table / skirt board | BOTH | Yes | line LF (NEW) | practitioner policy |

## Zone E — Roof intersections

| ID | Condition | Job type | Zero-legal | Measurement source | Ref |
|----|-----------|----------|-----------|--------------------|-----|
| E1 | Roof-to-wall (step-flash zone) | BOTH | Yes (single-story hip possible) | roof-wall intersection LF from elevations (current: count only — 8 intersections) | TR1502 fig. 6 |
| E2 | Kickout location | BOTH | Yes — but REQUIRED wherever E1 terminates at eave | count = E1 eave terminations (current rule: 8) | TR1502; IRC R903.2.1 |
| E3 | Dormer sidewall | BOTH | Yes | dormer detection (NEW) or folded into E1 | TR1502 fig. 6 |
| E4 | Chimney / chase intersection | BOTH | Yes | count (NEW) | TR1502 |
| E5 | Valley / shingle extension interface | BOTH | Yes | count (NEW) | TR1502 fig. 11 |

## Zone F — Attachments, penetrations, details

| ID | Condition | Job type | Zero-legal | Measurement source | Ref |
|----|-----------|----------|-----------|--------------------|-----|
| F1 | Deck ledger / deck-to-trim interface | BOTH | Yes | line LF (NEW) | TR1502 fig. 5 |
| F2 | Penetrations (hose bibs, vents, electrical, AC lines) | BOTH | No (every house has some) | point markers (partial today) + default allowance | TR1502 fig. 10 |
| F3 | Mounting / light blocks | BOTH | Yes | point markers | practitioner policy |
| F4 | Column / post wrap | BOTH | Yes | post count (point markers) | known MN568 gap category |
| F5 | Corbels / brackets (decorative) | BOTH | Yes | corbel point markers (current: 3 detected) | working today |
| F6 | Shutters / decorative attachments | BOTH | Yes | point markers (NEW) | practitioner policy |

## Zone G — System-wide (whole-envelope conditions)

| ID | Condition | Job type | Zero-legal | Measurement source | Ref |
|----|-----------|----------|-----------|--------------------|-----|
| G1 | WRB field coverage | BOTH | No | gross facade SF | HardieWrap install; 07 25 00 |
| G2 | WRB seams & laps | BOTH | No | facade SF → seam-tape derivation | HardieWrap install |
| G3 | Horizontal sheathing-joint flashing (pro-flashing / Z at panel joints) | BOTH | Conditional on cladding type | joint count derivation (current: 43 joints — verify dedup vs D1 flashing) | ProFlashing doc |
| G4 | Fastening system | BOTH | No | cladding SF per system | Hardie install (fastener schedules) |
| G5 | Sealant package (global) | BOTH | No | trim LF aggregate ÷ coverage | 07 92 00; TR1502 ("do not caulk" exceptions!) |
| G6 | Touch-up & finish (primed vs ColorPlus paths) | BOTH | No | cladding SF by finish type | Hardie ColorPlus docs |
| G7 | Starter strip / vented starter | BOTH | No | D2 LF | Hardie install |

**Note on G5:** TR1502 repeatedly marks specific joints "Do not caulk" (slabs, grade,
horizontal flashing laps). The sealant assembly must encode *exclusions*, not just
coverage — a correctness issue, not just quantity.

## Zone H — R&R-only conditions

| ID | Condition | Job type | Zero-legal | Measurement source | Ref |
|----|-----------|----------|-----------|--------------------|-----|
| H1 | Tear-off existing cladding | RR | No (defines R&R) | gross facade SF × existing-material factor | EF policy |
| H2 | Disposal / dumpster sizing | RR | No | H1 volume derivation (drives the rental line that is flat-fee today) | EF policy |
| H3 | Sheathing repair allowance | RR | Policy | % allowance or inspection input (NEW input type: declared) | EF policy |
| H4 | WRB replace-vs-patch decision | RR | No | declared policy per job | EF policy |
| H5 | Retrofit flashing at existing openings | RR | No | opening count (different assembly than B1–B3 new-install) | ProFlashing retrofit guidance |
| H6 | Protection / masking (fixtures, landscape, adjacent surfaces) | RR | Policy | flat or perimeter-derived | EF policy |
| H7 | Rot / damage repair allowance at known conditions | RR | Policy | declared per job | EF policy |

## Zone I — New-construction-only conditions

| ID | Condition | Job type | Zero-legal | Measurement source | Ref |
|----|-----------|----------|-----------|--------------------|-----|
| I1 | Builder-spec substitutions (MainVue / MN Homes product standards) | NC | Policy | builder_id → override tables (planned) | builder specs |
| I2 | Sequencing-dependent scope (pre-rock vs post, trade coordination) | NC | Policy | declared | builder schedule |

---

## Adjudication protocol (per row)

1. **Real?** Does this condition exist as a scope driver in your world? (delete / merge / split)
2. **Assembly:** list the layered materials at this condition, in install order
   (WRB treatment → flashing → trim → cladding interface → fasteners → sealant → finish),
   per job type where they differ.
3. **Authority:** which document or policy governs it — and where you and the
   manufacturer differ, record the EF policy as its own citable source.
4. **Measurement:** confirm the input source; mark NEW classes/derivations needed.
5. **Zero-legal + confirm prompt:** what should the pre-flight check ask when this
   condition shows zero? ("No inside corners marked — confirm none exist?")

## Immediate uses

- **Rule backfill audit:** map all 172 `auto_scope_rules_v2` rows to condition IDs.
  Rules mapping to no condition = orphans. Conditions with multiple overlapping rules =
  the dedup bugs (the D1/G3 flashing triple-dip is visible in this draft already).
- **"Office MN568" note sweep:** every rule note citing Mike's sheet gets re-adjudicated
  against the condition's documented assembly — the sheet is a formatting template, not
  quantity truth, and MN568 is R&R while several tuned rules may assume NC scope.
- **Pre-flight completeness check:** the Detection Editor walks Zones A–G (+H for R&R
  jobs) and forces every zero-legal=No condition and every unmarked zero-legal=Yes
  condition to SATISFIED or EXPLICITLY ABSENT before Approve.
