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
      <div className="container mx-auto py-12 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-6 p-8 bg-white dark:bg-gray-900 rounded-lg shadow-lg border">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">
              {STATUS_MESSAGES[processingStatus] || 'Processing...'}
            </h2>
            <p className="text-muted-foreground">
              {job?.project_name || 'Untitled Project'}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              This may take a few minutes. You&apos;ll be redirected when complete.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>Polling for updates...</span>
          </div>
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
