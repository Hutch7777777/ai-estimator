import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// Generated Supabase types in this repo lag the live schema. This helper is the
// central place where route handlers intentionally use an untyped client for
// access checks across extraction tables and live-only columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface ApiAccessContext {
  supabase: AnySupabaseClient;
  user: User | null;
  devBypass: boolean;
}

type AccessFailure = {
  ok: false;
  // Route handlers in this app often annotate their success response shape.
  // Auth failures are shared across those routes, so keep the failure response
  // intentionally broad enough to return from any handler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: NextResponse<any>;
};

type AccessSuccess<T> = {
  ok: true;
  ctx: ApiAccessContext;
  data: T;
};

type AccessResult<T = null> = AccessFailure | AccessSuccess<T>;

interface ProjectAccess {
  id: string;
  organization_id?: string | null;
}

interface ExtractionJobAccess {
  id: string;
  project_id: string;
  project?: ProjectAccess;
}

interface ExtractionPageAccess {
  id: string;
  job_id: string;
  page_number?: number | null;
  image_url?: string | null;
  original_image_url?: string | null;
  original_width?: number | null;
  original_height?: number | null;
  page_type?: string | null;
  elevation_name?: string | null;
  job: ExtractionJobAccess;
}

interface TakeoffAccess {
  id: string;
  project_id: string | null;
  project?: ProjectAccess;
  job?: ExtractionJobAccess;
}

export function isDevBypassServerEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonError(status: number, error: string, details?: string): NextResponse<any> {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(details ? { details } : {}),
    },
    { status }
  );
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function requireApiAuth(): Promise<AccessResult> {
  const devBypass = isDevBypassServerEnabled();
  const supabase = devBypass ? createServiceClient() : await createClient();

  if (devBypass) {
    return { ok: true, ctx: { supabase: supabase as AnySupabaseClient, user: null, devBypass }, data: null };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, response: jsonError(401, 'Unauthorized') };
  }

  return { ok: true, ctx: { supabase: supabase as AnySupabaseClient, user, devBypass }, data: null };
}

export async function requireProjectAccess(
  projectId: unknown,
  existingCtx?: ApiAccessContext
): Promise<AccessResult<ProjectAccess>> {
  const id = asString(projectId);
  if (!id) {
    return { ok: false, response: jsonError(400, 'project_id is required') };
  }

  const auth = existingCtx ? { ok: true as const, ctx: existingCtx, data: null } : await requireApiAuth();
  if (!auth.ok) return auth;

  const { data, error } = await auth.ctx.supabase
    .from('projects')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { ok: false, response: jsonError(500, 'Failed to verify project access', error.message) };
  }
  if (!data) {
    return { ok: false, response: jsonError(403, 'Forbidden') };
  }

  return { ok: true, ctx: auth.ctx, data: data as ProjectAccess };
}

export async function requireExtractionJobAccess(
  jobId: unknown,
  options: { claimedProjectId?: unknown; existingCtx?: ApiAccessContext } = {}
): Promise<AccessResult<ExtractionJobAccess>> {
  const id = asString(jobId);
  if (!id) {
    return { ok: false, response: jsonError(400, 'job_id is required') };
  }

  const auth = options.existingCtx
    ? { ok: true as const, ctx: options.existingCtx, data: null }
    : await requireApiAuth();
  if (!auth.ok) return auth;

  const { data, error } = await auth.ctx.supabase
    .from('extraction_jobs')
    .select('id, project_id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { ok: false, response: jsonError(500, 'Failed to verify job access', error.message) };
  }
  if (!data) {
    return { ok: false, response: jsonError(403, 'Forbidden') };
  }

  const projectId = asString((data as { project_id?: unknown }).project_id);
  if (!projectId) {
    return { ok: false, response: jsonError(403, 'Forbidden') };
  }

  const claimedProjectId = asString(options.claimedProjectId);
  if (claimedProjectId && claimedProjectId !== projectId) {
    return { ok: false, response: jsonError(400, 'project_id does not match job') };
  }

  const projectAccess = await requireProjectAccess(projectId, auth.ctx);
  if (!projectAccess.ok) return projectAccess;

  return {
    ok: true,
    ctx: auth.ctx,
    data: {
      id,
      project_id: projectId,
      project: projectAccess.data,
    },
  };
}

export async function requireExtractionPageAccess(
  pageId: unknown,
  options: { claimedJobId?: unknown; existingCtx?: ApiAccessContext } = {}
): Promise<AccessResult<ExtractionPageAccess>> {
  const id = asString(pageId);
  if (!id) {
    return { ok: false, response: jsonError(400, 'page_id is required') };
  }

  const auth = options.existingCtx
    ? { ok: true as const, ctx: options.existingCtx, data: null }
    : await requireApiAuth();
  if (!auth.ok) return auth;

  const { data, error } = await auth.ctx.supabase
    .from('extraction_pages')
    .select('id, job_id, page_number, image_url, original_image_url, original_width, original_height, page_type, elevation_name')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { ok: false, response: jsonError(500, 'Failed to verify page access', error.message) };
  }
  if (!data) {
    return { ok: false, response: jsonError(403, 'Forbidden') };
  }

  const page = data as ExtractionPageAccess;
  const claimedJobId = asString(options.claimedJobId);
  if (claimedJobId && claimedJobId !== page.job_id) {
    return { ok: false, response: jsonError(400, 'page_id does not match job') };
  }

  const jobAccess = await requireExtractionJobAccess(page.job_id, { existingCtx: auth.ctx });
  if (!jobAccess.ok) return jobAccess;

  return {
    ok: true,
    ctx: auth.ctx,
    data: {
      ...page,
      job: jobAccess.data,
    },
  };
}

export async function requireExtractionPagesForJobAccess(
  jobId: unknown,
  pageIds: unknown[],
  existingCtx?: ApiAccessContext
): Promise<AccessResult<ExtractionJobAccess>> {
  const jobAccess = await requireExtractionJobAccess(jobId, { existingCtx });
  if (!jobAccess.ok) return jobAccess;

  const ids = Array.from(new Set(pageIds.map(asString).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return jobAccess;

  const { data, error } = await jobAccess.ctx.supabase
    .from('extraction_pages')
    .select('id')
    .eq('job_id', jobAccess.data.id)
    .in('id', ids);

  if (error) {
    return { ok: false, response: jsonError(500, 'Failed to verify page access', error.message) };
  }
  if ((data?.length ?? 0) !== ids.length) {
    return { ok: false, response: jsonError(403, 'Forbidden') };
  }

  return jobAccess;
}

export async function requireTakeoffAccess(
  takeoffId: unknown,
  existingCtx?: ApiAccessContext
): Promise<AccessResult<TakeoffAccess>> {
  const id = asString(takeoffId);
  if (!id) {
    return { ok: false, response: jsonError(400, 'takeoff_id is required') };
  }

  const auth = existingCtx ? { ok: true as const, ctx: existingCtx, data: null } : await requireApiAuth();
  if (!auth.ok) return auth;

  const { data, error } = await auth.ctx.supabase
    .from('takeoffs')
    .select('id, project_id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { ok: false, response: jsonError(500, 'Failed to verify takeoff access', error.message) };
  }
  if (!data) {
    return { ok: false, response: jsonError(403, 'Forbidden') };
  }

  const takeoff = data as TakeoffAccess;
  const projectId = asString(takeoff.project_id);
  if (!projectId) {
    return { ok: true, ctx: auth.ctx, data: takeoff };
  }

  const projectAccess = await requireProjectAccess(projectId, auth.ctx);
  if (projectAccess.ok) {
    return { ok: true, ctx: auth.ctx, data: { ...takeoff, project: projectAccess.data } };
  }

  const jobAccess = await requireExtractionJobAccess(projectId, { existingCtx: auth.ctx });
  if (jobAccess.ok) {
    return { ok: true, ctx: auth.ctx, data: { ...takeoff, job: jobAccess.data } };
  }

  return {
    ok: false,
    response: projectAccess.response.status === 403 ? jobAccess.response : projectAccess.response,
  };
}

export function trustedPageImageUrl(page: Pick<ExtractionPageAccess, 'original_image_url' | 'image_url'>): string | null {
  return asString(page.original_image_url) || asString(page.image_url);
}
