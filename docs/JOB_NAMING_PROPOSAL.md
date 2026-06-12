# Proposal: Extraction Job Display Names

**Date:** June 11, 2026 · **Status:** proposal only — not implemented (per task instruction)
**Symptom:** the Extractions list shows jobs named "Bluebeam Import", "Untitled Project", or UUID fragments instead of anything a contractor can recognize.

## Where the name comes from today (traced)

**At import:**
- `ExtractionsTable` opens the fresh-import modal with a generated `tempProjectId` and **no `projectName` prop** (`components/dashboard/ExtractionsTable.tsx:572-578`).
- The modal only forwards a name if it was given one: `if (projectName) formData.append("project_name", projectName)` (`components/dashboard/BluebeamFreshImportModal.tsx:211`) — so on the dashboard path **nothing is sent**, and extraction-api's fresh-import service supplies its own default ("Bluebeam Import"-style) when creating the `extraction_jobs` row. The UUID fragments come from the generated temp project id surfacing where no name exists.
- There is no UI on the modal to enter a name, even though the prop is already plumbed.

**At render:**
- `ExtractionsTable.tsx:446` — `{job.project_name || "Untitled Project"}`, with inline rename already wired (`PATCH /api/extraction-jobs/[id]` → `update({ project_name })`, `app/api/extraction-jobs/[id]/route.ts:114`).
- Other surfaces (Detection Editor header, classify page, RFI email subject via `app/api/generate-rfi/route.ts:483`) read `job.project_name` directly — each with its own ad-hoc fallback or none.

So: the name is defaulted by the Python service at insert, never captured from the user, and every render surface invents its own fallback.

## Proposed display-name scheme (not implemented)

**Canonical formula — client + address, the way contractors talk about jobs:**

```
{client_name} — {street_address}        e.g. "Skjei — 568 Marshall Ave N"
```

**Fallback chain** (apply at WRITE time so the stored `project_name` is always presentable; renders never see the chain):

1. `client_name — street(address)` (street line only; drop city/state/zip for list brevity)
2. `address` alone (no client captured)
3. Cleaned PDF filename — strip extension, `[-_]+` → space, title-case (`568-marshall-plans.pdf` → "568 Marshall Plans")
4. `Import {Mon D}` date-stamped (`Import Jun 11`) — never a bare UUID, and date-stamping keeps multiple unnamed imports distinguishable

**Implementation points:**

1. **Capture:** add a single optional "Project name" field to `BluebeamFreshImportModal` pre-filled from the chosen file's cleaned filename — the `projectName` prop and FormData plumbing already exist, only the input is missing. When the import is launched from a real project context, pass `client_name — address` from the project row instead.
2. **One shared helper, not per-surface fallbacks:** `lib/utils/jobDisplayName.ts` exporting `getJobDisplayName(job, project?)` implementing the chain above; use it in `ExtractionsTable`, the Detection Editor header, the classify page, and the RFI email subject. Kills the drift between "Untitled Project" / raw NULL / UUID surfaces.
3. **extraction-api default:** change the Python fresh-import fallback from the constant "Bluebeam Import" to the cleaned-filename rule (step 3 of the chain) so even API-direct imports get a usable name. (Other repo — coordinate, don't block on it.)
4. **Keep inline rename** as-is; it already PATCHes `project_name`.

## Backfill strategy for existing rows (sketch — run with the usual gate)

```sql
-- 1. Jobs linked to a real project: derive from the project record
UPDATE extraction_jobs ej
SET project_name = p.client_name || ' — ' || split_part(p.address, ',', 1)
FROM projects p
WHERE ej.project_id = p.id
  AND p.client_name IS NOT NULL
  AND (ej.project_name IS NULL
       OR ej.project_name IN ('Bluebeam Import', 'Untitled Project')
       OR ej.project_name ~* '^[0-9a-f]{8}-');   -- UUID-fragment names

-- 2. Orphans with a source PDF: cleaned filename
UPDATE extraction_jobs
SET project_name = initcap(regexp_replace(
      regexp_replace(split_part(source_pdf_url, '/', -1), '\.pdf$', '', 'i'),
      '[-_]+', ' ', 'g'))
WHERE project_id IS NULL
  AND source_pdf_url IS NOT NULL
  AND (project_name IS NULL OR project_name IN ('Bluebeam Import', 'Untitled Project'));

-- 3. Remainder: date-stamped
UPDATE extraction_jobs
SET project_name = 'Import ' || to_char(created_at, 'Mon DD')
WHERE project_name IS NULL OR project_name IN ('Bluebeam Import', 'Untitled Project');
```

Dry-run each step with a `SELECT` first; steps are ordered most→least informative so later steps only touch what earlier ones couldn't fix. No calculation-engine impact (`project_name` is display-only), so the MN568 gate is unaffected — but spot-check the RFI email subject after backfill since it embeds the name.
