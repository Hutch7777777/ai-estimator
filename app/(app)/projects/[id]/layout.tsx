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
      .from('projects')
      .select('name')
      .eq('id', id)
      .single();
    if (data?.name) {
      return { title: `Estimate Editor — ${data.name}` };
    }
  } catch {
    // unauthenticated/missing row — fall through to the static title
  }
  return { title: 'Estimate Editor' };
}

export default function ProjectEstimateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
