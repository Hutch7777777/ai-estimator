"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
} from "lucide-react";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/types/extraction";

// =============================================================================
// Types
// =============================================================================

interface ExtractionUploadStepProps {
  projectId: string;
  projectName?: string;
  onJobCreated?: (jobId: string) => void;
  onComplete?: (jobId: string) => void;
  onError?: (error: Error) => void;
}

type UploadState = 'idle' | 'uploading' | 'starting' | 'processing' | 'complete' | 'error';

interface StartJobResponse {
  success: boolean;
  job_id?: string;
  status?: JobStatus;
  error?: string;
  message?: string;
}

// =============================================================================
// Constants
// =============================================================================

const EXTRACTION_API_URL = process.env.NEXT_PUBLIC_EXTRACTION_API_URL || 'https://extraction-api-production.up.railway.app';
const STORAGE_BUCKET = 'project-pdfs';
const MAX_FILE_SIZE_MB = 100;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes

const JOB_STATUS_CONFIG: Record<JobStatus, { label: string; color: string; progress: number }> = {
  converting: { label: 'Converting PDF pages...', color: 'text-blue-600', progress: 25 },
  classifying: { label: 'Classifying page types...', color: 'text-blue-600', progress: 50 },
  classified: { label: 'Ready for classification review', color: 'text-purple-600', progress: 60 },
  processing: { label: 'Detecting objects with AI...', color: 'text-purple-600', progress: 75 },
  complete: { label: 'Extraction complete!', color: 'text-green-600', progress: 100 },
  failed: { label: 'Extraction failed', color: 'text-red-600', progress: 0 },
};

// =============================================================================
// Component
// =============================================================================

export function ExtractionUploadStep({
  projectId,
  projectName,
  onJobCreated,
  onComplete,
  onError,
}: ExtractionUploadStepProps) {
  const router = useRouter();
  const { organization } = useOrganization();

  // State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Refs for cleanup
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollStartTimeRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // =============================================================================
  // File Validation
  // =============================================================================

  const validateFile = (file: File): string | null => {
    if (file.type !== 'application/pdf') {
      return 'Please upload a PDF file only.';
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File size must be less than ${MAX_FILE_SIZE_MB}MB.`;
    }
    return null;
  };

  // =============================================================================
  // Dropzone
  // =============================================================================

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    const validationError = validateFile(file);

    if (validationError) {
      setErrorMessage(validationError);
      setUploadState('error');
      toast.error(validationError);
      return;
    }

    setSelectedFile(file);
    setUploadState('idle');
    setErrorMessage('');
    toast.success('PDF ready for extraction', {
      description: `${file.name} (${formatFileSize(file.size)})`,
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: uploadState !== 'idle' && uploadState !== 'error',
  });

  // =============================================================================
  // Helpers
  // =============================================================================

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // =============================================================================
  // Upload PDF to Storage
  // =============================================================================

  const uploadPdfToStorage = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${projectId}/${timestamp}_${sanitizedName}`;

    setUploadProgress(0);

    // Use direct fetch to Supabase Storage API (Supabase JS client has issues)
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': file.type,
          'Cache-Control': '3600',
          'x-upsert': 'false'
        },
        body: file
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ExtractionUpload] Storage upload failed:', response.status, errorText);
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    setUploadProgress(100);

    // Construct public URL
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`;
    return publicUrl;
  };

  // =============================================================================
  // Start Extraction Job
  // =============================================================================

  const startExtractionJob = async (uploadedPdfUrl: string): Promise<string> => {
    const payload = {
      project_id: projectId,
      pdf_url: uploadedPdfUrl,
      project_name: projectName || `Project ${projectId.slice(0, 8)}`,
      organization_id: organization?.id,
    };

    console.log('[ExtractionUpload] Starting job with payload:', payload);

    const response = await fetch(`${EXTRACTION_API_URL}/start-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ExtractionUpload] Start job failed:', response.status, errorText);
      throw new Error(`Failed to start extraction: ${response.statusText}`);
    }

    const data: StartJobResponse = await response.json();

    if (!data.success || !data.job_id) {
      throw new Error(data.error || data.message || 'Failed to create extraction job');
    }

    console.log('[ExtractionUpload] Job created:', data.job_id);
    return data.job_id;
  };

  // =============================================================================
  // Poll Job Status
  // =============================================================================

  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      // Use direct fetch to Supabase REST API (Supabase JS client has issues)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/extraction_jobs?id=eq.${jobId}&select=status`,
        {
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Accept': 'application/vnd.pgrst.object+json'
          }
        }
      );

      if (!response.ok) {
        console.error('[ExtractionUpload] Poll error:', response.status);
        return;
      }

      const data = await response.json();

      if (!isMountedRef.current) return;

      const status = data?.status as JobStatus;
      setJobStatus(status);

      if (status === 'complete') {
        // Job finished successfully
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setUploadState('complete');
        toast.success('Extraction complete!', {
          description: 'Click "Review Detections" to continue',
        });
        onComplete?.(jobId);
      } else if (status === 'failed') {
        // Job failed
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setUploadState('error');
        setErrorMessage('Extraction processing failed. Please try again.');
        onError?.(new Error('Extraction failed'));
      }

      // Check for timeout
      if (pollStartTimeRef.current) {
        const elapsed = Date.now() - pollStartTimeRef.current;
        if (elapsed > MAX_POLL_DURATION_MS) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setUploadState('error');
          setErrorMessage('Extraction is taking longer than expected. Check back later.');
        }
      }
    } catch (err) {
      console.error('[ExtractionUpload] Poll exception:', err);
    }
  }, [onComplete, onError]);

  const startPolling = useCallback((jobId: string) => {
    pollStartTimeRef.current = Date.now();

    // Initial poll
    pollJobStatus(jobId);

    // Set up interval
    pollIntervalRef.current = setInterval(() => {
      pollJobStatus(jobId);
    }, POLL_INTERVAL_MS);
  }, [pollJobStatus]);

  // =============================================================================
  // Main Handler
  // =============================================================================

  const handleStartExtraction = async () => {
    if (!selectedFile) return;

    if (!organization?.id) {
      toast.error('No organization selected', {
        description: 'Please select an organization before starting extraction',
      });
      return;
    }

    try {
      // Step 1: Upload PDF
      setUploadState('uploading');
      toast.loading('Uploading PDF...', { id: 'extraction-progress' });

      const uploadedPdfUrl = await uploadPdfToStorage(selectedFile);
      setPdfUrl(uploadedPdfUrl);

      // Step 2: Start extraction job
      setUploadState('starting');
      toast.loading('Starting extraction...', { id: 'extraction-progress' });

      const jobId = await startExtractionJob(uploadedPdfUrl);
      setCurrentJobId(jobId);
      onJobCreated?.(jobId);

      // Step 3: Start polling for status
      setUploadState('processing');
      setJobStatus('converting');
      toast.loading('Processing...', { id: 'extraction-progress' });

      startPolling(jobId);

    } catch (error) {
      console.error('[ExtractionUpload] Error:', error);
      setUploadState('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
      toast.error('Extraction failed', {
        id: 'extraction-progress',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      onError?.(error instanceof Error ? error : new Error('Unknown error'));
    }
  };

  // =============================================================================
  // Navigation
  // =============================================================================

  const handleReviewDetections = () => {
    if (currentJobId) {
      router.push(`/projects/${projectId}/extraction/${currentJobId}`);
    }
  };

  // =============================================================================
  // Reset
  // =============================================================================

  const handleRetry = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setUploadState('idle');
    setUploadProgress(0);
    setErrorMessage('');
    setCurrentJobId(null);
    setJobStatus(null);
    setPdfUrl(null);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadState('idle');
    setErrorMessage('');
  };

  // =============================================================================
  // Render
  // =============================================================================

  const statusConfig = jobStatus ? JOB_STATUS_CONFIG[jobStatus] : null;

  return (
    <div className="space-y-6">
      <Card className="shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle className="font-heading">Upload Construction Plans</CardTitle>
          <CardDescription>
            Upload your construction plan PDF for AI-powered object detection.
            We&apos;ll identify windows, doors, gables, and other elements automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dropzone - only show when idle or error */}
          {(uploadState === 'idle' || uploadState === 'error') && !selectedFile && (
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                isDragActive
                  ? "border-primary bg-primary/10"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              {isDragActive ? (
                <p className="text-sm text-foreground">Drop the PDF file here...</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Drag and drop your construction plan PDF here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF files only, maximum {MAX_FILE_SIZE_MB}MB
                  </p>
                </>
              )}
            </div>
          )}

          {/* Selected file preview */}
          {selectedFile && uploadState === 'idle' && (
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-3">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatFileSize(selectedFile.size)} &bull; PDF
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRemoveFile}
                  className="flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Uploading State */}
          {uploadState === 'uploading' && (
            <Alert>
              <Upload className="h-4 w-4" />
              <AlertTitle>Uploading PDF...</AlertTitle>
              <AlertDescription>
                <Progress value={uploadProgress} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-2">{uploadProgress}% complete</p>
              </AlertDescription>
            </Alert>
          )}

          {/* Starting Job State */}
          {uploadState === 'starting' && (
            <Alert className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <AlertTitle className="text-blue-900 dark:text-blue-100">
                Starting extraction job...
              </AlertTitle>
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                Initializing AI processing pipeline
              </AlertDescription>
            </Alert>
          )}

          {/* Processing State */}
          {uploadState === 'processing' && statusConfig && (
            <Alert className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <AlertTitle className="text-blue-900 dark:text-blue-100">
                AI is analyzing your plans...
              </AlertTitle>
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                <Progress value={statusConfig.progress} className="mt-3" />
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    {jobStatus === 'converting' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                    <span className={jobStatus === 'converting' ? '' : 'text-muted-foreground'}>
                      Converting PDF pages to images
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {jobStatus === 'classifying' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    ) : jobStatus === 'processing' || jobStatus === 'complete' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <div className="h-4 w-4" />
                    )}
                    <span className={jobStatus === 'classifying' ? '' : 'text-muted-foreground'}>
                      Classifying page types (elevation, floor plan, etc.)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {jobStatus === 'processing' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                    ) : jobStatus === 'complete' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <div className="h-4 w-4" />
                    )}
                    <span className={jobStatus === 'processing' ? '' : 'text-muted-foreground'}>
                      Detecting windows, doors, gables, and more
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  This usually takes 1-3 minutes depending on the number of pages...
                </p>
                {currentJobId && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Job ID: <code className="bg-muted px-1 rounded">{currentJobId}</code>
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Complete State */}
          {uploadState === 'complete' && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-900 dark:text-green-100">
                Extraction complete!
              </AlertTitle>
              <AlertDescription className="text-green-800 dark:text-green-200">
                <p>
                  AI has detected objects on your construction plans.
                  Review and edit the detections before finalizing.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button onClick={handleReviewDetections} className="gap-2">
                    <Eye className="h-4 w-4" />
                    Review Detections
                  </Button>
                  <Button variant="outline" onClick={handleRetry}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Upload Another
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Error State */}
          {uploadState === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>
                <p className="mb-3">{errorMessage}</p>
                <Button variant="outline" onClick={handleRetry}>
                  Try Again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Start Button */}
          {uploadState === 'idle' && selectedFile && (
            <Button
              onClick={handleStartExtraction}
              className="w-full"
              size="lg"
            >
              Start AI Extraction
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle className="text-base font-heading">What gets detected?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Windows</Badge>
            <Badge variant="secondary">Doors</Badge>
            <Badge variant="secondary">Garage Doors</Badge>
            <Badge variant="secondary">Gables</Badge>
            <Badge variant="secondary">Roofs</Badge>
            <Badge variant="secondary">Buildings</Badge>
            <Badge variant="secondary">Trim</Badge>
            <Badge variant="secondary">Fascia</Badge>
            <Badge variant="secondary">Gutters</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            After extraction, you can review, edit, and add any missed detections
            using our interactive editor.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
