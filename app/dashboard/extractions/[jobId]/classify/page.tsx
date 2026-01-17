'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  Play,
  Check,
  FileUp,
  FileSearch,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { ExtractionJob, ExtractionPage, PageType } from '@/lib/types/extraction';

// =============================================================================
// Constants
// =============================================================================

const EXTRACTION_API_URL = process.env.NEXT_PUBLIC_EXTRACTION_API_URL || 'https://extraction-api-production.up.railway.app';

// Polling interval for post-confirm status checking
const POLLING_INTERVAL = 3000;

// Status messages for processing states
const STATUS_MESSAGES: Record<string, string> = {
  processing: 'Detecting objects with AI...',
  complete: 'Detection complete!',
  failed: 'Detection failed',
};

// Processing steps configuration
const PROCESSING_STEPS = [
  { id: 'upload', label: 'PDF uploaded', icon: FileUp },
  { id: 'convert', label: 'Converting pages', icon: Layers },
  { id: 'classify', label: 'Classifying page types', icon: FileSearch },
  { id: 'detect', label: 'Running AI detection', icon: Sparkles },
] as const;

// Get step status based on job processing status
function getStepStatus(stepId: string, processingStatus: string): 'complete' | 'active' | 'pending' {
  const statusOrder = ['upload', 'convert', 'classify', 'detect'];
  const stepIndex = statusOrder.indexOf(stepId);

  // Map job status to current step
  let currentStepIndex = -1;
  if (processingStatus === 'converting') currentStepIndex = 1;
  else if (processingStatus === 'classifying') currentStepIndex = 2;
  else if (processingStatus === 'processing') currentStepIndex = 3;
  else if (processingStatus === 'complete') currentStepIndex = 4; // All complete

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
        <div className="w-8 h-8 bg-[#00cc6a] rounded-full flex items-center justify-center flex-shrink-0">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
      {status === 'active' && (
        <div className="w-8 h-8 border-2 border-[#00cc6a] rounded-full flex items-center justify-center flex-shrink-0 bg-[#dcfce7]">
          <div className="w-2 h-2 bg-[#00cc6a] rounded-full animate-pulse" />
        </div>
      )}
      {status === 'pending' && (
        <div className="w-8 h-8 border-2 border-[#e2e8f0] rounded-full flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-[#94a3b8]" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${status === 'pending' ? 'text-[#94a3b8]' : 'text-[#0f172a]'}`} />
        <span className={`text-sm ${status === 'pending' ? 'text-[#94a3b8]' : 'text-[#0f172a] font-medium'}`}>
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

// =============================================================================
// Component
// =============================================================================

export default function ClassificationReviewPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  // State
  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [pages, setPages] = useState<ExtractionPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-confirm processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('processing');

  // =============================================================================
  // Data Fetching
  // =============================================================================

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch job info
      const jobResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/extraction_jobs?id=eq.${jobId}&select=*`,
        {
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Accept': 'application/vnd.pgrst.object+json',
          },
        }
      );

      if (!jobResponse.ok) {
        throw new Error(`Failed to fetch job: ${jobResponse.statusText}`);
      }

      const jobData = await jobResponse.json();
      setJob(jobData);

      // Fetch pages
      const pagesResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/extraction_pages?job_id=eq.${jobId}&select=*&order=page_number.asc`,
        {
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
        }
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

    console.log('[ClassificationReview] Starting post-confirm polling');

    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/extraction_jobs?id=eq.${jobId}&select=status,project_id`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
              'Accept': 'application/vnd.pgrst.object+json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log('[ClassificationReview] Poll status:', data.status);
          setProcessingStatus(data.status);

          if (data.status === 'complete') {
            clearInterval(interval);
            toast.success('Detection complete!');
            // Navigate to Detection Editor
            if (data.project_id) {
              router.push(`/projects/${data.project_id}/extraction/${jobId}`);
            } else {
              // Fallback if no project_id - go to dashboard
              router.push('/project');
            }
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
      console.log('[ClassificationReview] Stopping polling');
      clearInterval(interval);
    };
  }, [isProcessing, jobId, router]);

  // =============================================================================
  // Handlers
  // =============================================================================

  const handleTypeChange = async (pageId: string, newType: PageType) => {
    // Optimistic update
    setPages(prev =>
      prev.map(p => (p.id === pageId ? { ...p, page_type: newType } : p))
    );

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/extraction_pages?id=eq.${pageId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ page_type: newType }),
        }
      );

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

  const handleConfirmAndRunDetection = async () => {
    setSaving(true);

    try {
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
    router.push('/project');
  };

  // =============================================================================
  // Computed Values
  // =============================================================================

  const elevationCount = pages.filter(p => p.page_type === 'elevation').length;

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
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-lg p-8 max-w-md w-full">
          {/* Animated spinner icon */}
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-[#dcfce7] rounded-full flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-[#00cc6a] border-t-transparent rounded-full animate-spin" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-semibold text-[#0f172a] text-center mb-2">
            Processing Your Plans
          </h1>

          {/* Project name */}
          <p className="text-[#475569] text-center mb-8">
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
          <p className="text-sm text-[#94a3b8] text-center">
            This usually takes 1-2 minutes
          </p>

          {/* Cancel button */}
          <button
            onClick={handleBack}
            className="mt-6 w-full text-sm text-[#94a3b8] hover:text-[#475569] transition-colors py-2"
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
          <Button onClick={handleConfirmAndRunDetection} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Confirm & Run Detection
          </Button>
        </div>
      </div>

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
              {/* Thumbnail Image */}
              <div className="aspect-[3/4] bg-muted relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.thumbnail_url || page.image_url}
                  alt={`Page ${page.page_number}`}
                  className="w-full h-full object-contain"
                />
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
    </div>
  );
}
