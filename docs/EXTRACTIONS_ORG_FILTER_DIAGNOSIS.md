# Diagnosis: Extractions Tab Shows All Jobs While Overview/Projects Show 0

**Date:** June 11, 2026 · **Status:** diagnosis only — no fix applied (per task instruction)
**Symptom:** for the dev-bypass user, the Extractions tab lists 20+ jobs while the Overview stats and Past Projects table both show 0.

## Root cause — two different scoping models in the same dashboard

**This is a multi-tenancy issue.** `extraction_jobs` is not organization-scoped — neither in schema nor in the query — so the Extractions tab shows every job in the database, for every tenant.

| Component | Query | Org filter? |
|---|---|---|
| `DashboardOverview` (`components/dashboard/DashboardOverview.tsx:66`) | `GET /rest/v1/projects?select=*&organization_id=eq.{org.id}` | ✅ |
| `ProjectsTable` (`components/projects/ProjectsTable.tsx:88-89`) | `GET /rest/v1/projects?select=*&organization_id=eq.{org.id}` | ✅ |
| `ExtractionsTable` (`components/dashboard/ExtractionsTable.tsx:176-184`) | `GET /rest/v1/extraction_jobs?select=id,project_id,project_name,…&order=created_at.desc` | ❌ **none** |

Details:

1. **`extraction_jobs` has no `organization_id` column** (`lib/types/database.ts:328-340`) — only a *nullable* `project_id`. There is nothing the query *could* filter on directly.
2. **`ExtractionsTable` waits for the org but never uses it.** It gates fetching on `organization?.id` being loaded (`ExtractionsTable.tsx:165`) and passes `organizationId` to the import modal (`:576`), but the actual REST query (`:177`) has no `organization_id` parameter and no join through `project_id`. Every row in `extraction_jobs` is returned. The Realtime subscription (`:222-268`) is similarly unscoped.
3. **Why Overview/Projects show 0:** the dev bypass uses the *real* Exterior Finishes org id `45aaa69c-8146-43b2-aef1-e2fe6fabcd86` (`lib/hooks/useOrganization.tsx:37-42`), and the `projects` table has no rows with that `organization_id`. The 20+ jobs arrived through the Bluebeam fresh import (extraction-api), which creates `extraction_jobs` rows directly — `ExtractionsTable` invokes the modal with a generated `tempProjectId` and the modal only forwards `organization_id` to the Python service (`BluebeamFreshImportModal.tsx:210-212`); no org-scoped `projects` row is created on this path. So the org's *projects* count is genuinely 0 while *jobs* exist — the two tabs are counting different, differently-scoped tables.

## Aggravating factor: queries run on the anon key, so RLS can't save you

All three components use the "direct fetch" pattern with `apikey` + `Authorization: Bearer <ANON_KEY>` headers (e.g. `ExtractionsTable.tsx:179-182`) — the **anon key**, not the signed-in user's JWT. Consequences:

- User-scoped RLS policies (`auth.uid()`-based) never apply to these reads; visibility depends entirely on anon-readable policies (or RLS being off — see `scripts/check-rls-status.sql`).
- Even the "correct" org filtering in ProjectsTable/DashboardOverview is only a client-side query parameter — any client can omit it. Org isolation is currently **cosmetic, not enforced**.

## Proposed fix (NOT applied)

**Short term — correct the UI query (frontend-only, no schema change):** scope `ExtractionsTable` through the project relationship, same pattern as the account-page usage stats:

```
GET /rest/v1/extraction_jobs
  ?select=id,project_id,project_name,status,total_pages,elevation_count,created_at,completed_at,projects!inner(organization_id)
  &projects.organization_id=eq.{organization.id}
  &order=created_at.desc
```

Caveat: jobs with `project_id IS NULL` (orphans — likely most of the 20+) disappear from the list. That is the *correct* multi-tenant behavior, but decide deliberately: hide them, or show them in a dev-only "Unassigned" section until backfilled. The Realtime subscription needs the equivalent scoping (filter on the fetched id set, or re-fetch on events).

**Real fix — make jobs first-class tenants (schema + RLS, ties into work-plan Phase 4):**

1. `ALTER TABLE extraction_jobs ADD COLUMN organization_id uuid REFERENCES organizations(id);`
2. Backfill: `UPDATE extraction_jobs ej SET organization_id = p.organization_id FROM projects p WHERE ej.project_id = p.id AND ej.organization_id IS NULL;` — jobs with `project_id IS NULL` need manual attribution (today realistically all Exterior Finishes).
3. Make every writer populate it: extraction-api fresh/roundtrip imports (it already *receives* `organization_id` from the modal and drops it), and the n8n Multi-Trade Coordinator when it creates jobs.
4. Add RLS: `organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())` — and switch the frontend direct-fetch pattern to the session-authenticated supabase-js client so the policy actually executes against the user.
5. Then `ExtractionsTable` filters on `organization_id=eq.{org.id}` directly and the inner-join workaround is removed.
