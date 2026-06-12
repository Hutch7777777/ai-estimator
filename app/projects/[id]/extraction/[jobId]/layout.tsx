import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}): Promise<Metadata> {
  const { jobId } = await params;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('extraction_jobs')
      .select('project_name')
      .eq('id', jobId)
      .single();
    if (data?.project_name) {
      return { title: `Detection Editor — ${data.project_name}` };
    }
  } catch {
    // unauthenticated/missing row — fall through to the static title
  }
  return { title: 'Detection Editor' };
}

export default function DetectionEditorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
