import { redirect } from 'next/navigation';

/**
 * Phase B placeholder: /projects/[id] was the estimate editor, which now
 * lives at /projects/[id]/estimate. Phase C replaces this redirect with the
 * project hub.
 */
export default async function ProjectHubPlaceholder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/estimate`);
}
