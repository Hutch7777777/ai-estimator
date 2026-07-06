import { redirect } from 'next/navigation';

/**
 * Legacy path: the five-tab /project dashboard dissolved into first-class
 * routes (UIUX audit §1.2 — "tab-as-app antipattern"). Every old tab deep
 * link lands on its new home; nothing 404s.
 */
const TAB_TARGETS: Record<string, string> = {
  overview: '/dashboard',
  new: '/projects/new',
  cad: '/projects',
  extractions: '/projects',
  past: '/projects',
};

export default async function LegacyProjectDashboardRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  redirect(TAB_TARGETS[tab ?? ''] ?? '/dashboard');
}
