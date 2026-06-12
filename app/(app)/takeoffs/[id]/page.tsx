import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Legacy path: /takeoffs/[id] → /projects/[projectId]/takeoff/[id].
 * The project id comes from the takeoff row; takeoffs without a resolvable
 * project fall back to the projects list (nothing 404s).
 */
export default async function LegacyTakeoffRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let projectId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('takeoffs').select('project_id').eq('id', id).single();
    projectId = (data as { project_id: string | null } | null)?.project_id ?? null;
  } catch {
    // fall through to the list redirect
  }

  redirect(projectId ? `/projects/${projectId}/takeoff/${id}` : '/projects');
}
