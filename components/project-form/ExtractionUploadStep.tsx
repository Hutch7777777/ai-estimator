"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
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

type UploadState = 'idle' | 'uploading' | 'starting' | 'started' | 'error';

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
  const { organization } = useOrganization();

  // State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
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

      const uploadedPdfUrl = await uploadPdfToStorage(selectedFile);

      // Step 2: Start extraction job
      setUploadState('starting');

      const jobId = await startExtractionJob(uploadedPdfUrl);
      onJobCreated?.(jobId);

      // Step 3: Job started successfully - close modal immediately
      setUploadState('started');
      toast.success('Extraction started!', {
        description: 'Your job will appear in the list below',
      });

      // Call onComplete to close modal and refresh parent
      onComplete?.(jobId);

    } catch (error) {
      console.error('[ExtractionUpload] Error:', error);
      setUploadState('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
      toast.error('Upload failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      onError?.(error instanceof Error ? error : new Error('Unknown error'));
    }
  };

  // =============================================================================
  // Reset
  // =============================================================================

  const handleRetry = () => {
    setUploadState('idle');
    setUploadProgress(0);
    setErrorMessage('');
    setSelectedFile(null);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadState('idle');
    setErrorMessage('');
  };

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className="space-y-4">
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
          <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          {isDragActive ? (
            <p className="text-sm text-foreground">Drop the PDF here...</p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground mb-1">
                Drop your construction plan PDF here
              </p>
              <p className="text-xs text-muted-foreground">
                or click to browse • Max {MAX_FILE_SIZE_MB}MB
              </p>
            </>
          )}
        </div>
      )}

      {/* Selected file preview */}
      {selectedFile && uploadState === 'idle' && (
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRemoveFile}
              className="flex-shrink-0 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Uploading State */}
      {uploadState === 'uploading' && (
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Uploading PDF...
            </span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      )}

      {/* Starting Job State */}
      {uploadState === 'starting' && (
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Starting extraction job...
            </span>
          </div>
        </div>
      )}

      {/* Started State (brief - modal will close) */}
      {uploadState === 'started' && (
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-900 dark:text-green-100">
              Job started! Closing...
            </span>
          </div>
        </div>
      )}

      {/* Error State */}
      {uploadState === 'error' && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-sm font-medium text-red-900 dark:text-red-100">
              {errorMessage || 'Something went wrong'}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            Try Again
          </Button>
        </div>
      )}

      {/* Start Button */}
      {uploadState === 'idle' && selectedFile && (
        <Button
          onClick={handleStartExtraction}
          className="w-full"
          size="lg"
        >
          <Upload className="h-4 w-4 mr-2" />
          Start AI Extraction
        </Button>
      )}
    </div>
  );
}
