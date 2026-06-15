'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LoadingState } from '@/components/ui/loading-state';
import { DetectionEditor } from '@/components/detection-editor';
import { createClient } from '@/lib/supabase/client';
import { isDevBypassEnabled } from '@/lib/hooks/useOrganization';
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
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setStage('editor');
    }, 5000);

    async function resolveStage() {
      try {
        let status: string | null | undefined;

        if (isDevBypassEnabled()) {
          const endpoint = `extraction_jobs?id=eq.${jobId}&select=status`;
          const response = await fetch(`/api/dev/org-data?rest=${encodeURIComponent(endpoint)}`);
          const rows = response.ok ? await response.json() : [];
          status = Array.isArray(rows) ? rows[0]?.status : undefined;
        } else {
          const supabase = createClient();
          const { data } = await supabase
            .from('extraction_jobs')
            .select('status')
            .eq('id', jobId)
            .single();
          status = data?.status;
        }

        if (cancelled) return;
        window.clearTimeout(timeoutId);
        setStage(status === 'classified' ? 'classify' : 'editor');
      } catch (error) {
        console.error('Failed to resolve review stage:', error);
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          setStage('editor');
        }
      }
    }

    resolveStage();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
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
    return <LoadingState label="Loading review…" className="h-screen" />;
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
