# SQL audits

Read-only audit queries for Phase 1.1 (Database Truth Audit). These files contain ONLY `SELECT` statements — no `INSERT`, `UPDATE`, `DELETE`, `ALTER`, or `CREATE`. Run them in the Supabase SQL editor against production. The results feed `docs/strategy/phase-1-database-audit.md`.

Each file is self-contained. Copy-paste a single file's contents into the SQL editor.

| File | Audits | Phase 1.x sub-item informed |
|---|---|---|
| `01-pricing-items.sql` | DET-CORBEL, DET-BRACKET, DET-SHUTTER, belly-band SKUs | Phase 1 — Database is the truth (Tier-1 risks 1.1, 1.2) |
| `02-calculation-constants.sql` | markup_rate, soc_unemployment_rate, li_hourly_rate, insurance_rate_per_thousand, default_crew_size, default_estimated_weeks | Phase 1 (Tier-1 risk 1.6) |
| `03-presentation-groups.sql` | distinct presentation_group values in takeoff_line_items and siding_auto_scope_rules | Phase 1 (Tier-1 risk 1.8) |
| `04-rule-tables.sql` | which auto-scope tables exist, row counts, last-updated timestamps | Phase 1 (Tier-1 risk 1.3) |

## Constraints

- **No mutations.** If a query returns "this row should exist" results that suggest a seed, that is captured in the audit doc as a finding — the seed itself happens in Phase 1.x sub-PRs, not here.
- **No schema changes.** The audit observes; it does not propose DDL. Schema decisions belong in `docs/strategy/03-target-architecture.md` and Phase 1 sub-PR planning.
- **Run order is independent.** Each file can run alone. Recommended order is 01 → 02 → 03 → 04 to match the audit doc's section ordering.
