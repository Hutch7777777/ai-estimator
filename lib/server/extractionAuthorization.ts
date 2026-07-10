import { createClient } from '@/lib/supabase/server';

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getAuthorizedProjectOrganization(
  supabase: ServerSupabaseClient,
  projectId: string
): Promise<string | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle();
  return project?.organization_id || null;
}

/**
 * Resolve a job to an organization only when the caller can read the job and
 * its tenant through Supabase RLS. Legacy jobs may inherit ownership through
 * their project until the organization_id backfill is fully validated.
 */
export async function getAuthorizedJobOrganization(
  supabase: ServerSupabaseClient,
  jobId: string
): Promise<string | null> {
  const { data: job } = await supabase
    .from('extraction_jobs')
    .select('organization_id, project_id')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) return null;
  if (job.organization_id) return job.organization_id;
  if (!job.project_id) return null;

  return getAuthorizedProjectOrganization(supabase, job.project_id);
}

export async function getAuthorizedPageOrganization(
  supabase: ServerSupabaseClient,
  pageId: string
): Promise<string | null> {
  const { data: page } = await supabase
    .from('extraction_pages')
    .select('job_id')
    .eq('id', pageId)
    .maybeSingle();
  return page?.job_id
    ? getAuthorizedJobOrganization(supabase, page.job_id)
    : null;
}

export async function getAuthorizedTakeoffOrganization(
  supabase: ServerSupabaseClient,
  takeoffId: string
): Promise<string | null> {
  const { data: takeoff } = await supabase
    .from('takeoffs')
    .select('project_id')
    .eq('id', takeoffId)
    .maybeSingle();
  return takeoff?.project_id
    ? getAuthorizedProjectOrganization(supabase, takeoff.project_id)
    : null;
}

export async function userBelongsToOrganization(
  supabase: ServerSupabaseClient,
  userId: string,
  organizationId: string
): Promise<boolean> {
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(membership);
}
