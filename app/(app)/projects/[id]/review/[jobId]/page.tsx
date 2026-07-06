'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LoadingState } from '@/components/ui/loading-state';
import { DetectionEditor } from '@/components/detection-editor';
import { createClient } from '@/lib/supabase/client';
import { isDevBypassEnabled } from '@/lib/hooks/useOrganization';
import { toast } from 'sonner';
import { ClassifyStage } from './ClassifyStage';
import { AlertCircle, Check, FileSearch, Layers, Loader2, RefreshCw, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ReviewStage = 'loading' | 'preparing' | 'classify' | 'detecting' | 'editor' | 'failed';

interface JobStageSnapshot {
  status?: string | null;
  project_name?: string | null;
  error_message?: string | null;
}

interface ExtractionPagesRetryClient {
  from(table: 'extraction_pages'): {
    update(values: { status: 'classified'; error_message: null }): {
      eq(column: 'job_id', value: string): {
        not(column: 'page_type', operator: 'is', value: null): Promise<{
          error: { message: string } | null;
        }>;
      };
    };
  };
}

const POLL_INTERVAL_MS = 3000;
const LOCAL_EXTRACTION_API_URL =
  process.env.NEXT_PUBLIC_LOCAL_EXTRACTION_API_URL || 'http://localhost:5050';
const EXTRACTION_API_URL = isDevBypassEnabled()
  ? LOCAL_EXTRACTION_API_URL
  : process.env.NEXT_PUBLIC_EXTRACTION_API_URL || 'https://extraction-api-production.up.railway.app';

function getStageForStatus(status?: string | null): ReviewStage {
  switch (status) {
    case 'importing':
    case 'converting':
    case 'classifying':
    case 'analyzing':
      return 'preparing';
    case 'classified':
      return 'classify';
    case 'processing':
    case 'refining':
      return 'detecting';
    case 'complete':
    case 'approved':
      return 'editor';
    case 'failed':
      return 'failed';
    default:
      return 'loading';
  }
}

function WaitingStage({
  title,
  description,
  activeStep,
  projectName,
  onBack,
}: {
  title: string;
  description: string;
  activeStep: 'pages' | 'markups';
  projectName?: string | null;
  onBack: () => void;
}) {
  const steps = [
    { id: 'upload', label: 'PDF uploaded', icon: Check },
    { id: 'pages', label: 'Detecting pages', icon: FileSearch },
    { id: 'review', label: 'Approve page types', icon: Layers },
    { id: 'markups', label: 'Running markups', icon: ScanSearch },
  ] as const;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-lg">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15">
            <Loader2 className="h-8 w-8 animate-spin text-brand-foreground" />
          </div>
        </div>
        <h1 className="text-center text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {projectName || 'Construction plan upload'}
        </p>
        <p className="mt-4 text-center text-sm text-muted-foreground">{description}</p>

        <div className="mt-8 space-y-4">
          {steps.map((step) => {
            const isActive = step.id === activeStep;
            const isComplete =
              activeStep === 'markups'
                ? step.id === 'upload' || step.id === 'pages' || step.id === 'review'
                : step.id === 'upload';

            return (
              <div key={step.id} className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                    isActive
                      ? 'border-brand bg-brand/15 text-brand-foreground'
                      : isComplete
                        ? 'border-brand bg-brand text-white'
                        : 'border-border text-muted-foreground'
                  }`}
                >
                  {isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <step.icon className="h-4 w-4" />
                  )}
                </div>
                <span className={isActive || isComplete ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        <Button variant="ghost" className="mt-6 w-full" onClick={onBack}>
          Return to projects
        </Button>
      </div>
    </div>
  );
}

function FailedStage({
  message,
  retrying,
  onRetry,
  onBack,
}: {
  message?: string | null;
  retrying: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-lg">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">Plan processing failed</h1>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
          {message || 'The extraction job failed before the editor could open.'}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={onRetry} disabled={retrying}>
            {retrying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Retry Detection
          </Button>
          <Button variant="outline" onClick={onBack}>
            Return to projects
          </Button>
        </div>
      </div>
    </div>
  );
}

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

  const [stage, setStage] = useState<ReviewStage>('loading');
  const [jobSnapshot, setJobSnapshot] = useState<JobStageSnapshot | null>(null);
  const [retryingDetection, setRetryingDetection] = useState(false);
  const [pollNonce, setPollNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    async function resolveStage() {
      try {
        let snapshot: JobStageSnapshot | null = null;

        if (isDevBypassEnabled()) {
          const endpoint = `extraction_jobs?id=eq.${jobId}&select=status,project_name,error_message`;
          const response = await fetch(`/api/dev/org-data?rest=${encodeURIComponent(endpoint)}`);
          const rows = response.ok ? await response.json() : [];
          snapshot = Array.isArray(rows) ? rows[0] : null;
        } else {
          const supabase = createClient();
          const { data } = await supabase
            .from('extraction_jobs')
            .select('status, project_name, error_message')
            .eq('id', jobId)
            .single();
          snapshot = data;
        }

        if (cancelled) return;
        const nextStage = getStageForStatus(snapshot?.status);
        setJobSnapshot(snapshot);
        setStage(nextStage === 'loading' ? 'editor' : nextStage);

        if (nextStage === 'loading' || nextStage === 'preparing' || nextStage === 'detecting') {
          timeoutId = window.setTimeout(resolveStage, POLL_INTERVAL_MS);
        }
      } catch (error) {
        console.error('Failed to resolve review stage:', error);
        if (!cancelled) {
          setStage('editor');
        }
      }
    }

    resolveStage();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [jobId, pollNonce]);

  const handleRetryDetection = async () => {
    setRetryingDetection(true);

    try {
      if (isDevBypassEnabled()) {
        const endpoint = `extraction_pages?job_id=eq.${jobId}&page_type=not.is.null`;
        const response = await fetch(`/api/dev/org-data?rest=${encodeURIComponent(endpoint)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'classified', error_message: null }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to prepare pages for retry: ${errorText}`);
        }
      } else {
        // extraction_pages is intentionally accessed through REST in this flow;
        // the generated app DB type does not include the extraction schema.
        const supabase = createClient() as unknown as ExtractionPagesRetryClient;
        const { error } = await supabase
          .from('extraction_pages')
          .update({ status: 'classified', error_message: null })
          .eq('job_id', jobId)
          .not('page_type', 'is', null);

        if (error) throw error;
      }

      const response = await fetch(`${EXTRACTION_API_URL}/process-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to restart detection: ${errorText}`);
      }

      toast.success('Detection restarted');
      setJobSnapshot(prev => ({
        ...prev,
        status: 'processing',
        error_message: null,
      }));
      setStage('detecting');
      setPollNonce(value => value + 1);
    } catch (error) {
      console.error('Failed to retry detection:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to retry detection');
    } finally {
      setRetryingDetection(false);
    }
  };

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

  if (stage === 'preparing') {
    return (
      <WaitingStage
        title="Detecting Plan Pages"
        description="We are converting the PDF and classifying pages like floor plans, elevations, schedules, and details."
        activeStep="pages"
        projectName={jobSnapshot?.project_name}
        onBack={() => router.push(projectId !== '_' ? `/projects/${projectId}` : '/projects')}
      />
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

  if (stage === 'detecting') {
    return (
      <WaitingStage
        title="Running Markups"
        description="Your approved page types are being detected and refined. The editor will open when the markups are ready."
        activeStep="markups"
        projectName={jobSnapshot?.project_name}
        onBack={() => router.push(projectId !== '_' ? `/projects/${projectId}` : '/projects')}
      />
    );
  }

  if (stage === 'failed') {
    return (
      <FailedStage
        message={jobSnapshot?.error_message}
        retrying={retryingDetection}
        onRetry={handleRetryDetection}
        onBack={() => router.push(projectId !== '_' ? `/projects/${projectId}` : '/projects')}
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
