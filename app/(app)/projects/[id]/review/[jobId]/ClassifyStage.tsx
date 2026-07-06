'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Play,
  Check,
  FileUp,
  FileSearch,
  Layers,
  Sparkles,
  ZoomIn,
  RefreshCw,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { isDevBypassEnabled } from '@/lib/hooks/useOrganization';
import { createClient } from '@/lib/supabase/client';
import type { ExtractionJob, ExtractionPage, PageType } from '@/lib/types/extraction';

// =============================================================================
// Constants
// =============================================================================

const LOCAL_EXTRACTION_API_URL =
  process.env.NEXT_PUBLIC_LOCAL_EXTRACTION_API_URL || 'http://localhost:5050';
const EXTRACTION_API_URL = isDevBypassEnabled()
  ? LOCAL_EXTRACTION_API_URL
  : process.env.NEXT_PUBLIC_EXTRACTION_API_URL || 'https://extraction-api-production.up.railway.app';

// Polling interval for post-confirm status checking
const POLLING_INTERVAL = 3000;

// Processing steps configuration
const PROCESSING_STEPS = [
  { id: 'upload', label: 'PDF uploaded', icon: FileUp },
  { id: 'convert', label: 'Converting pages', icon: Layers },
  { id: 'classify', label: 'Classifying page types', icon: FileSearch },
  { id: 'detect', label: 'Running AI detection', icon: Sparkles },
  { id: 'refine', label: 'Refining AI markups', icon: Sparkles },
] as const;

// Get step status based on job processing status
function getStepStatus(stepId: string, processingStatus: string): 'complete' | 'active' | 'pending' {
  const statusOrder = ['upload', 'convert', 'classify', 'detect', 'refine'];
  const stepIndex = statusOrder.indexOf(stepId);

  // Map job status to current step
  let currentStepIndex = -1;
  if (processingStatus === 'converting') currentStepIndex = 1;
  else if (processingStatus === 'classifying') currentStepIndex = 2;
  else if (processingStatus === 'processing') currentStepIndex = 3;
  else if (processingStatus === 'refining') currentStepIndex = 4;
  else if (processingStatus === 'complete') currentStepIndex = 5; // All complete

  // Upload is always complete once we're processing
  if (stepId === 'upload') return 'complete';
  // Classify step is complete since we're past classification review
  if (stepId === 'classify') return 'complete';
  // Convert is complete since pages are already converted
  if (stepId === 'convert') return 'complete';

  if (stepIndex < currentStepIndex) return 'complete';
  if (stepIndex === currentStepIndex) return 'active';
  return 'pending';
}

// StepItem component for processing steps
function StepItem({
  status,
  label,
  icon: Icon
}: {
  status: 'complete' | 'active' | 'pending';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3">
      {status === 'complete' && (
        <div className="w-8 h-8 bg-brand rounded-full flex items-center justify-center flex-shrink-0">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
      {status === 'active' && (
        <div className="w-8 h-8 border-2 border-brand rounded-full flex items-center justify-center flex-shrink-0 bg-brand/15">
          <div className="w-2 h-2 bg-brand rounded-full animate-pulse" />
        </div>
      )}
      {status === 'pending' && (
        <div className="w-8 h-8 border-2 border-border rounded-full flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`} />
        <span className={`text-sm ${status === 'pending' ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
          {label}
          {status === 'active' && '...'}
        </span>
      </div>
    </div>
  );
}

const PAGE_TYPES: PageType[] = [
  'cover',
  'detail',
  'schedule',
  'floor_plan',
  'roof_plan',
  'elevation',
  'section',
  'site_plan',
  'other',
];

// =============================================================================
// Helper Functions
// =============================================================================

const getBadgeColor = (type: PageType | null): string => {
  switch (type) {
    case 'elevation':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'floor_plan':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'roof_plan':
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
    case 'schedule':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'section':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'detail':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'cover':
    case 'site_plan':
    case 'other':
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
};

const formatPageType = (type: PageType | null): string => {
  if (!type) return 'unclassified';
  return type.replace(/_/g, ' ');
};

function hasCreditError(error?: string | null): boolean {
  return Boolean(error && /credit balance is too low|purchase credits|plans & billing/i.test(error));
}

function hasModelNotFoundError(error?: string | null): boolean {
  return Boolean(error && /not_found_error.*model:|model: claude-sonnet-4-20250514/i.test(error));
}

function summarizeClassifierError(error?: string | null): string | null {
  if (!error) return null;
  if (hasCreditError(error)) {
    return 'Anthropic reported that the account credit balance is too low.';
  }
  if (hasModelNotFoundError(error)) {
    return 'Anthropic rejected the retired Claude Sonnet 4 model. The extraction API needs to use claude-sonnet-4-6.';
  }

  const messageMatch = error.match(/"message"\s*:\s*"([^"]+)"/);
  const message = messageMatch?.[1] || error;
  return message.length > 180 ? `${message.slice(0, 180)}...` : message;
}

function restUrl(endpoint: string): string {
  if (isDevBypassEnabled()) {
    return `/api/dev/org-data?rest=${encodeURIComponent(endpoint)}`;
  }
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${endpoint}`;
}

async function restHeaders(write = false): Promise<HeadersInit | undefined> {
  if (isDevBypassEnabled()) {
    return write ? { 'Content-Type': 'application/json' } : undefined;
  }

  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return {
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${token}`,
    ...(write ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function fetchRest(endpoint: string, init: RequestInit = {}) {
  const isWrite = init.method === 'PATCH';
  const headers = await restHeaders(isWrite);
  return fetch(restUrl(endpoint), {
    ...init,
    headers: {
      ...headers,
      ...init.headers,
    },
  });
}

// =============================================================================
// Component
// =============================================================================

interface ClassifyStageProps {
  jobId: string;
  projectId: string;
  /** Called when detection finishes — the review page swaps in the editor. */
  onDetectionComplete: () => void;
}

export function ClassifyStage({ jobId, projectId, onDetectionComplete }: ClassifyStageProps) {
  const router = useRouter();

  // State
  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [pages, setPages] = useState<ExtractionPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Image preview lightbox state
  const [previewPage, setPreviewPage] = useState<ExtractionPage | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number>(0);

  // Post-confirm processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('processing');
  const [retryingClassification, setRetryingClassification] = useState(false);
  const [retryStartedAt, setRetryStartedAt] = useState<number | null>(null);

  // =============================================================================
  // Data Fetching
  // =============================================================================

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch job info
      const jobResponse = await fetchRest(`extraction_jobs?id=eq.${jobId}&select=*`);

      if (!jobResponse.ok) {
        throw new Error(`Failed to fetch job: ${jobResponse.statusText}`);
      }

      const jobRows = await jobResponse.json();
      const jobData = Array.isArray(jobRows) ? jobRows[0] : jobRows;
      if (!jobData) {
        throw new Error('Extraction job not found');
      }
      setJob(jobData);

      // Fetch pages
      const pagesResponse = await fetchRest(
        `extraction_pages?job_id=eq.${jobId}&select=*&order=page_number.asc`
      );

      if (!pagesResponse.ok) {
        throw new Error(`Failed to fetch pages: ${pagesResponse.statusText}`);
      }

      const pagesData = await pagesResponse.json();
      setPages(pagesData || []);
    } catch (err) {
      console.error('[ClassificationReview] Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // =============================================================================
  // Post-Confirm Polling
  // =============================================================================

  useEffect(() => {
    if (!isProcessing) return;


    const interval = setInterval(async () => {
      try {
        const response = await fetchRest(`extraction_jobs?id=eq.${jobId}&select=status,project_id`);

        if (response.ok) {
          const rows = await response.json();
          const data = Array.isArray(rows) ? rows[0] : rows;
          if (!data) return;
          setProcessingStatus(data.status);

          if (data.status === 'complete') {
            clearInterval(interval);
            toast.success('Detection complete!');
            // Stay in the review flow — parent swaps the classify stage
            // for the Detection Editor.
            onDetectionComplete();
          } else if (data.status === 'failed') {
            clearInterval(interval);
            setIsProcessing(false);
            toast.error('Detection failed. Please try again.');
          }
        }
      } catch (err) {
        console.error('[ClassificationReview] Polling error:', err);
        // Don't stop polling on network errors - keep trying
      }
    }, POLLING_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [isProcessing, jobId, onDetectionComplete]);

  useEffect(() => {
    if (!retryingClassification) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetchRest(`extraction_jobs?id=eq.${jobId}&select=status,error_message`);
        if (!response.ok) return;

        const rows = await response.json();
        const data = Array.isArray(rows) ? rows[0] : rows;
        if (!data) return;

        const hasSettledLongEnough = !retryStartedAt || Date.now() - retryStartedAt > 5000;
        if (!hasSettledLongEnough) return;

        if (data.status === 'classified') {
          clearInterval(interval);
          setRetryingClassification(false);
          setRetryStartedAt(null);
          await fetchData();
          toast.success('Page classification refreshed');
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setRetryingClassification(false);
          setRetryStartedAt(null);
          await fetchData();
          toast.error(data.error_message || 'Page classification failed');
        }
      } catch (err) {
        console.error('[ClassificationReview] Retry polling error:', err);
      }
    }, POLLING_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [retryingClassification, jobId, retryStartedAt, fetchData]);

  // =============================================================================
  // Handlers
  // =============================================================================

  const handleTypeChange = async (pageId: string, newType: PageType) => {
    // Optimistic update
    setPages(prev =>
      prev.map(p => (
        p.id === pageId
          ? { ...p, page_type: newType, page_type_confidence: 1, status: 'classified', error_message: null }
          : p
      ))
    );

    try {
      const response = await fetchRest(`extraction_pages?id=eq.${pageId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          page_type: newType,
          page_type_confidence: 1,
          status: 'classified',
          error_message: null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update page type: ${response.statusText}`);
      }

      toast.success(`Page updated to ${formatPageType(newType)}`);
    } catch (err) {
      console.error('[ClassificationReview] Error updating page type:', err);
      toast.error('Failed to update page type');
      // Revert optimistic update
      fetchData();
    }
  };

  const handleRetryClassification = async () => {
    setRetryingClassification(true);
    setRetryStartedAt(Date.now());

    try {
      const response = await fetch(`${EXTRACTION_API_URL}/analyze-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to restart page classification: ${errorText}`);
      }

      toast.success('Page classification restarted');
    } catch (err) {
      console.error('[ClassificationReview] Error retrying classification:', err);
      setRetryingClassification(false);
      setRetryStartedAt(null);
      toast.error(err instanceof Error ? err.message : 'Failed to restart page classification');
    }
  };

  const handleConfirmAndRunDetection = async () => {
    if (elevationCount === 0) {
      toast.error('Select at least one elevation page before running detection.');
      return;
    }

    setSaving(true);

    try {
      const typedPagesNeedingPromotion = pages.filter(
        page => page.page_type && page.status !== 'classified' && page.status !== 'complete'
      );

      if (typedPagesNeedingPromotion.length > 0) {
        await Promise.all(
          typedPagesNeedingPromotion.map(page =>
            fetchRest(`extraction_pages?id=eq.${page.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                status: 'classified',
                error_message: null,
                page_type_confidence: page.page_type_confidence ?? 1,
              }),
            })
          )
        );

        setPages(prev => prev.map(page => (
          page.page_type && page.status !== 'complete'
            ? { ...page, status: 'classified', error_message: null }
            : page
        )));
      }

      const response = await fetch(`${EXTRACTION_API_URL}/process-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to start detection: ${errorText}`);
      }

      // Transition to processing state - show overlay and start polling
      setSaving(false);
      setIsProcessing(true);
      setProcessingStatus('processing');
      toast.success('Detection started - please wait...');
    } catch (err) {
      console.error('[ClassificationReview] Error starting detection:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to start detection');
      setSaving(false);
    }
  };

  const handleBack = () => {
    router.push(projectId !== '_' ? `/projects/${projectId}` : '/projects');
  };

  // Lightbox navigation handlers
  const handlePrevPage = useCallback(() => {
    if (previewIndex > 0) {
      const newIndex = previewIndex - 1;
      setPreviewIndex(newIndex);
      setPreviewPage(pages[newIndex]);
    }
  }, [previewIndex, pages]);

  const handleNextPage = useCallback(() => {
    if (previewIndex < pages.length - 1) {
      const newIndex = previewIndex + 1;
      setPreviewIndex(newIndex);
      setPreviewPage(pages[newIndex]);
    }
  }, [previewIndex, pages]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!previewPage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevPage();
      } else if (e.key === 'ArrowRight') {
        handleNextPage();
      } else if (e.key === 'Escape') {
        setPreviewPage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewPage, handlePrevPage, handleNextPage]);

  // =============================================================================
  // Computed Values
  // =============================================================================

  const elevationCount = pages.filter(p => p.page_type === 'elevation').length;
  const unclassifiedCount = pages.filter(p => !p.page_type).length;
  const failedClassificationPages = pages.filter(p => p.status === 'failed' && !p.page_type);
  const classifierError = pages.find(p => p.error_message)?.error_message || job?.error_message || null;
  const classifierErrorSummary = summarizeClassifierError(classifierError);
  const aiClassificationFailed =
    pages.length > 0 &&
    unclassifiedCount > 0 &&
    (failedClassificationPages.length > 0 ||
      ((job?.results_summary?.failed ?? 0) > 0 && (job?.results_summary?.successful ?? 0) === 0));
  const creditError = hasCreditError(classifierError);

  // =============================================================================
  // Render
  // =============================================================================

  if (loading) {
    return (
      <div className="container mx-auto py-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  // Show processing overlay when detection is running
  if (isProcessing) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-border shadow-lg p-8 max-w-md w-full">
          {/* Animated spinner icon */}
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-brand/15 rounded-full flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-semibold text-foreground text-center mb-2">
            Processing Your Plans
          </h1>

          {/* Project name */}
          <p className="text-muted-foreground text-center mb-8">
            {job?.project_name || 'Untitled Project'}
          </p>

          {/* Progress steps */}
          <div className="space-y-4 mb-8">
            {PROCESSING_STEPS.map((step) => (
              <StepItem
                key={step.id}
                status={getStepStatus(step.id, processingStatus)}
                label={step.label}
                icon={step.icon}
              />
            ))}
          </div>

          {/* Subtitle */}
          <p className="text-sm text-muted-foreground text-center">
            This usually takes 1-2 minutes
          </p>

          {/* Cancel button */}
          <button
            onClick={handleBack}
            className="mt-6 w-full text-sm text-muted-foreground hover:text-muted-foreground transition-colors py-2"
          >
            Cancel and return to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Review Page Classifications</h1>
          <p className="text-muted-foreground">
            {job?.project_name || 'Untitled Project'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={handleConfirmAndRunDetection}
            disabled={saving || retryingClassification || elevationCount === 0}
            title={elevationCount === 0 ? 'Select at least one elevation page before running detection' : undefined}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Confirm & Run Detection
          </Button>
        </div>
      </div>

      {aiClassificationFailed && (
        <Alert variant={creditError ? 'destructive' : 'default'} className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>AI page classification needs attention</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>
              {unclassifiedCount} of {pages.length} pages do not have a page type. You can retry AI
              classification after the service is available, or approve the pages manually here.
            </p>
            {classifierErrorSummary && (
              <p className="text-xs opacity-90">{classifierErrorSummary}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetryClassification}
                disabled={retryingClassification}
              >
                {retryingClassification ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Retry AI Classification
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={fetchData}>
                Refresh
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!aiClassificationFailed && elevationCount === 0 && pages.length > 0 && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No elevation pages selected</AlertTitle>
          <AlertDescription>
            Markup detection needs at least one approved elevation page.
          </AlertDescription>
        </Alert>
      )}

      {/* Thumbnail Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {pages.map(page => (
          <Card
            key={page.id}
            className={`overflow-hidden transition-all ${
              page.page_type === 'elevation'
                ? 'ring-2 ring-green-500'
                : ''
            }`}
          >
            <CardContent className="p-0">
              {/* Thumbnail Image - Clickable for preview */}
              <div
                className="aspect-[3/4] bg-muted relative cursor-pointer group"
                onClick={() => {
                  setPreviewPage(page);
                  setPreviewIndex(pages.findIndex(p => p.id === page.id));
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.thumbnail_url || page.image_url}
                  alt={`Page ${page.page_number}`}
                  className="w-full h-full object-contain"
                />
                {/* Hover overlay with zoom icon */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Footer */}
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm font-medium">
                  Page {page.page_number}
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-auto p-0">
                      <Badge className={`${getBadgeColor(page.page_type)} cursor-pointer`}>
                        {formatPageType(page.page_type)}
                        <ChevronDown className="ml-1 h-3 w-3" />
                      </Badge>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {PAGE_TYPES.map(type => (
                      <DropdownMenuItem
                        key={type}
                        onClick={() => handleTypeChange(page.id, type)}
                        className={page.page_type === type ? 'bg-accent' : ''}
                      >
                        <Badge className={`${getBadgeColor(type)} mr-2`}>
                          {formatPageType(type)}
                        </Badge>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{elevationCount}</span>{' '}
          elevation{elevationCount !== 1 ? 's' : ''} will be processed for object detection
        </p>
      </div>

      {/* Image Preview Lightbox */}
      <Dialog open={!!previewPage} onOpenChange={(open) => !open && setPreviewPage(null)}>
        <DialogContent
          className="p-0 flex flex-col"
          style={{ width: '85vw', height: '85vh', maxWidth: '1400px' }}
          showCloseButton={false}
        >
          {/* Visually hidden title for accessibility */}
          <DialogTitle className="sr-only">
            Page {previewPage?.page_number ?? ''} Preview
          </DialogTitle>

          {previewPage && (
            <>
              {/* Header - fixed at top */}
              <div className="flex items-center justify-between p-4 border-b bg-background shrink-0">
                <div className="flex items-center gap-4">
                  <span className="font-semibold">Page {previewPage.page_number}</span>
                  <Badge className={getBadgeColor(previewPage.page_type)}>
                    {formatPageType(previewPage.page_type)}
                  </Badge>
                  {previewPage.elevation_name && (
                    <span className="text-sm text-muted-foreground">
                      {previewPage.elevation_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {previewIndex + 1} of {pages.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewPage(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>

              {/* Scrollable Image Container */}
              <div className="flex-1 relative bg-muted/50 overflow-auto min-h-0">
                {/* Previous Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background shadow-md"
                  onClick={handlePrevPage}
                  disabled={previewIndex === 0}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>

                {/* Image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewPage.image_url}
                  alt={`Page ${previewPage.page_number}`}
                  className="w-full h-auto"
                />

                {/* Next Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background shadow-md"
                  onClick={handleNextPage}
                  disabled={previewIndex === pages.length - 1}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </div>

              {/* Footer */}
              {/* Footer - fixed at bottom */}
              <div className="p-4 border-t bg-background shrink-0 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Use ← → arrow keys to navigate
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Badge className={`${getBadgeColor(previewPage.page_type)} mr-2`}>
                        {formatPageType(previewPage.page_type)}
                      </Badge>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {PAGE_TYPES.map(type => (
                      <DropdownMenuItem
                        key={type}
                        onClick={() => {
                          handleTypeChange(previewPage.id, type);
                          setPreviewPage({ ...previewPage, page_type: type });
                        }}
                        className={previewPage.page_type === type ? 'bg-accent' : ''}
                      >
                        <Badge className={`${getBadgeColor(type)} mr-2`}>
                          {formatPageType(type)}
                        </Badge>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
