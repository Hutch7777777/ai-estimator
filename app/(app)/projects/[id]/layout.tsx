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
    const { data } = await supabase.from('projects').select('name').eq('id', id).single();
    if (data?.name) {
      return { title: data.name };
    }
  } catch {
    // fall through to the static title
  }
  return { title: 'Project' };
}

export default function ProjectSegmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
