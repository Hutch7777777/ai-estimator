import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Legacy path: /dashboard/extractions/[jobId]/classify →
 * /projects/[projectId]/review/[jobId]. Classification is now a state of the
 * review flow. Jobs without a project use the '_' placeholder segment, which
 * the review flow tolerates (back-navigation goes to the projects list).
 */
export default async function LegacyClassifyRedirect({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  let projectId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('extraction_jobs')
      .select('project_id')
      .eq('id', jobId)
      .single();
    projectId = (data as { project_id: string | null } | null)?.project_id ?? null;
  } catch {
    // fall through to the placeholder segment
  }

  redirect(`/projects/${projectId ?? '_'}/review/${jobId}`);
}
