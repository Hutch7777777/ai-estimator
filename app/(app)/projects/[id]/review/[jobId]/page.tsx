'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { DetectionEditor } from '@/components/detection-editor';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ClassifyStage } from './ClassifyStage';

/**
 * Unified review flow. Page classification is a STATE of this flow, not a
 * separate namespace (UIUX audit §1.1): jobs with status 'classified' get the
 * classification review first, then the Detection Editor swaps in without a
 * navigation. projectId may be '_' for legacy orphan jobs without a project.
 */
export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();

  const projectId = params.id as string;
  const jobId = params.jobId as string;

  const [stage, setStage] = useState<'loading' | 'classify' | 'editor'>('loading');

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('extraction_jobs')
      .select('status')
      .eq('id', jobId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setStage(data?.status === 'classified' ? 'classify' : 'editor');
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const handleComplete = () => {
    toast.success('Extraction approved successfully');
    router.push(projectId !== '_' ? `/projects/${projectId}` : '/projects');
  };

  const handleError = (error: Error) => {
    console.error('Detection editor error:', error);
    toast.error(error.message || 'An error occurred');
  };

  if (stage === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (stage === 'classify') {
    return (
      <ClassifyStage
        jobId={jobId}
        projectId={projectId}
        onDetectionComplete={() => setStage('editor')}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 min-h-0">
        <DetectionEditor
          jobId={jobId}
          projectId={projectId}
          onComplete={handleComplete}
          onError={handleError}
        />
      </div>
    </div>
  );
}
