import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { SidebarAutoCollapse } from '@/components/layout/SidebarAutoCollapse';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; takeoffId: string }>;
}): Promise<Metadata> {
  const { takeoffId } = await params;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('takeoffs')
      .select('project_name')
      .eq('id', takeoffId)
      .single();
    if (data?.project_name) {
      return { title: `Takeoff — ${data.project_name}` };
    }
  } catch {
    // unauthenticated/missing row — fall through to the static title
  }
  return { title: 'Takeoff' };
}

export default function TakeoffLayout({ children }: { children: React.ReactNode }) {
  // Canvas/table-heavy — start the app sidebar collapsed to icon rail.
  return (
    <>
      <SidebarAutoCollapse />
      {children}
    </>
  );
}
