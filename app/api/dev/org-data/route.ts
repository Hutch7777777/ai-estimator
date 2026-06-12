import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * DEV-ONLY data reads for the app shell (hub, projects list, breadcrumb
 * names). Exists because the dev auth bypass has no Supabase session: the
 * anon-key client gets nothing back under RLS and every view would hang or
 * show empty. This route serves those reads with the service-role key
 * INSTEAD — local development only.
 *
 * Guards, in order:
 *   1. Deploy-time: a Railway/CI build with the bypass flag set refuses to
 *      load this module at all — the flag cannot ship enabled. (A LOCAL
 *      `npm run build` with the flag in .env.local is allowed; `next build`
 *      always runs as NODE_ENV=production, and the route is inert there per
 *      guard 2 anyway.)
 *   2. Runtime: 404 unless NODE_ENV === 'development' AND the flag is 'true'
 *      — i.e. only the local dev server ever serves data.
 *
 * Documented in CLAUDE.md ("Dev Auth Bypass").
 */

const isDeployBuild = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.CI
);
if (isDeployBuild && process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true') {
  throw new Error(
    'NEXT_PUBLIC_DEV_BYPASS_AUTH must never be enabled in a deployed build — refusing to expose /api/dev/org-data.'
  );
}

const NAME_LOOKUPS: Record<string, { table: 'projects' | 'extraction_jobs' | 'takeoffs'; column: string }> = {
  projects: { table: 'projects', column: 'name' },
  extraction_jobs: { table: 'extraction_jobs', column: 'project_name' },
  takeoffs: { table: 'takeoffs', column: 'project_name' },
};

function devGuardActive(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';
}

export async function GET(request: NextRequest) {
  if (!devGuardActive()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const supabase = createServiceClient();

  try {
    // ?hub=<projectId> → { project, jobs, takeoffs }
    const hubProjectId = searchParams.get('hub');
    if (hubProjectId) {
      const [projectRes, jobsRes, takeoffsRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, client_name, address, status, created_at')
          .eq('id', hubProjectId)
          .maybeSingle(),
        supabase
          .from('extraction_jobs')
          .select('id, project_name, status, total_pages, source_pdf_url, created_at')
          .eq('project_id', hubProjectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('takeoffs')
          .select('id, status, grand_total, created_at')
          .eq('project_id', hubProjectId)
          .order('created_at', { ascending: false }),
      ]);
      return NextResponse.json({
        project: projectRes.data ?? null,
        jobs: jobsRes.data ?? [],
        takeoffs: takeoffsRes.data ?? [],
      });
    }

    // ?list=<orgId> → { projects, jobs } (projects org-scoped; jobs unscoped,
    // matching the current UI behavior — see EXTRACTIONS_ORG_FILTER_DIAGNOSIS.md)
    const listOrgId = searchParams.get('list');
    if (listOrgId) {
      const [projectsRes, jobsRes] = await Promise.all([
        supabase
          .from('projects')
          .select('*')
          .eq('organization_id', listOrgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('extraction_jobs')
          .select('id, project_id, project_name, status, total_pages, source_pdf_url, created_at')
          .order('created_at', { ascending: false }),
      ]);
      return NextResponse.json({
        projects: projectsRes.data ?? [],
        jobs: jobsRes.data ?? [],
      });
    }

    // ?name=<table>:<id> → { name }
    const nameParam = searchParams.get('name');
    if (nameParam) {
      const [tableKey, id] = nameParam.split(':');
      const lookup = NAME_LOOKUPS[tableKey];
      if (!lookup || !id) {
        return NextResponse.json({ error: 'Invalid name lookup' }, { status: 400 });
      }
      const { data } = await supabase
        .from(lookup.table)
        .select(lookup.column)
        .eq('id', id)
        .maybeSingle();
      const name = (data as Record<string, string | null> | null)?.[lookup.column] ?? null;
      return NextResponse.json({ name });
    }

    return NextResponse.json({ error: 'Missing query: hub | list | name' }, { status: 400 });
  } catch (error) {
    console.error('[dev/org-data] read failed:', error);
    return NextResponse.json({ error: 'Read failed' }, { status: 500 });
  }
}
