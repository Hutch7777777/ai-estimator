import { redirect } from 'next/navigation';

/** Legacy path: /projects/[id]/extraction/[jobId] → /projects/[id]/review/[jobId]. */
export default async function LegacyExtractionRedirect({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}) {
  const { id, jobId } = await params;
  redirect(`/projects/${id}/review/${jobId}`);
}
