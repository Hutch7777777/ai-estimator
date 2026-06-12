import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('takeoffs')
      .select('project_name')
      .eq('id', id)
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
  return children;
}
