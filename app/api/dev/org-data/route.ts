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

function invalidRestEndpoint(restEndpoint: string): boolean {
  return restEndpoint.includes('://') || restEndpoint.startsWith('/');
}

async function forwardRestRequest(
  request: NextRequest,
  restEndpoint: string,
  method: 'GET' | 'PATCH'
) {
  if (invalidRestEndpoint(restEndpoint)) {
    return NextResponse.json({ error: 'Invalid REST endpoint' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing Supabase service config' }, { status: 500 });
  }

  const headers: HeadersInit = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': request.headers.get('content-type') || 'application/json',
  };
  const prefer = request.headers.get('prefer');
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${supabaseUrl}/rest/v1/${restEndpoint}`, {
    method,
    headers,
    body: method === 'PATCH' ? await request.text() : undefined,
  });

  const text = await response.text();
  if (response.status === 204 || response.status === 304) {
    return new NextResponse(null, { status: response.status });
  }

  const contentType = response.headers.get('content-type') || 'application/json';
  return new NextResponse(text, {
    status: response.status,
    headers: { 'Content-Type': contentType },
  });
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
      const [projectRes, jobsRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, client_name, address, city, state, zip_code, status, created_at')
          .eq('id', hubProjectId)
          .maybeSingle(),
        supabase
          .from('extraction_jobs')
          .select('id, project_name, status, total_pages, source_pdf_url, created_at, completed_at')
          .eq('project_id', hubProjectId)
          .order('created_at', { ascending: false }),
      ]);

      // Takeoffs may be keyed by the extraction job id instead of the project
      // id (extraction_id = job_id family) — accept both keys, mirroring the
      // hub's client-side query.
      //
      // Deliberately NO organization_id filter: n8n-created takeoff rows have
      // organization_id = NULL, and project access is org-checked upstream.
      // select('*') on purpose: the hand-maintained Takeoff type has drifted
      // from the live schema, and a named-column select 400s on any missing
      // column (which used to be swallowed into an empty array — the "hub
      // shows no takeoffs" bug). The working viewer route also selects '*'.
      const jobRows = jobsRes.data ?? [];
      const takeoffKeys = [hubProjectId, ...jobRows.map((j: { id: string }) => j.id)];
      const takeoffsRes = await supabase
        .from('takeoffs')
        .select('*')
        .in('project_id', takeoffKeys)
        .order('created_at', { ascending: false });

      // Never swallow read errors into empty arrays — log server-side and
      // surface them in the dev payload so a curl shows the cause directly.
      if (projectRes.error) console.error('[dev/org-data] hub project read failed:', projectRes.error);
      if (jobsRes.error) console.error('[dev/org-data] hub jobs read failed:', jobsRes.error);
      if (takeoffsRes.error) console.error('[dev/org-data] hub takeoffs read failed:', takeoffsRes.error);
      const hubErrors =
        projectRes.error || jobsRes.error || takeoffsRes.error
          ? {
              errors: {
                project: projectRes.error?.message ?? null,
                jobs: jobsRes.error?.message ?? null,
                takeoffs: takeoffsRes.error?.message ?? null,
              },
            }
          : {};

      return NextResponse.json({
        project: projectRes.data ?? null,
        jobs: jobRows,
        takeoffs: takeoffsRes.data ?? [],
        ...hubErrors,
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

    // ?rest=<postgrest endpoint> -> raw dev-only service-role PostgREST read.
    // This keeps client loaders that normally use anon-key REST working in
    // local dev-bypass mode, where there is no real Supabase session for RLS.
    const restEndpoint = searchParams.get('rest');
    if (restEndpoint) {
      return forwardRestRequest(request, restEndpoint, 'GET');
    }

    return NextResponse.json({ error: 'Missing query: hub | list | name' }, { status: 400 });
  } catch (error) {
    console.error('[dev/org-data] read failed:', error);
    return NextResponse.json({ error: 'Read failed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!devGuardActive()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const restEndpoint = searchParams.get('rest');
  if (!restEndpoint) {
    return NextResponse.json({ error: 'Missing query: rest' }, { status: 400 });
  }

  // Keep dev writes intentionally narrow: classification review only needs to
  // update extraction page types.
  if (!restEndpoint.startsWith('extraction_pages?')) {
    return NextResponse.json({ error: 'Unsupported dev write endpoint' }, { status: 400 });
  }

  try {
    return await forwardRestRequest(request, restEndpoint, 'PATCH');
  } catch (error) {
    console.error('[dev/org-data] write failed:', error);
    return NextResponse.json(
      { error: 'Write failed', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
