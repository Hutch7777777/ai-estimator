"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import confetti from "canvas-confetti";
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
} from "lucide-react";
import { ProjectFormData } from "@/lib/types/project-form";
import { submitProject } from "@/lib/project-submission";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { cn } from "@/lib/utils";

interface HoverUploadStepProps {
  data: ProjectFormData;
  onUpdate: (data: Partial<ProjectFormData>) => void;
}

type UploadState = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

export function HoverUploadStep({ data, onUpdate }: HoverUploadStepProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(data.pdfFile || null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const { organization } = useOrganization();

  // Validation helper
  const validateFile = (file: File): string | null => {
    if (file.type !== 'application/pdf') {
      return 'Please upload a PDF file only.';
    }
    if (file.size > 25 * 1024 * 1024) {
      return 'File size must be less than 25MB.';
    }
    return null;
  };

  // Dropzone configuration
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    const validationError = validateFile(file);

    if (validationError) {
      setErrorMessage(validationError);
      setUploadState('error');
      toast.error(validationError, {
        description: 'Please select a valid PDF file under 25MB'
      });
      return;
    }

    setSelectedFile(file);
    onUpdate({ pdfFile: file });
    setUploadState('idle');
    setErrorMessage('');
    toast.success('PDF file ready', {
      description: `${file.name} (${formatFileSize(file.size)})`
    });
  }, [onUpdate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    disabled: uploadState !== 'idle',
  });

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // Format trade name
  const formatTradeName = (trade: string): string => {
    return trade.charAt(0).toUpperCase() + trade.slice(1);
  };

  // Celebration confetti effect
  const triggerConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const colors = ['#00cc6a', '#00b35e', '#dcfce7', '#94a3b8']; // Green accent and silver

    (function frame() {
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      });
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };

  // Main handler — delegates to the shared, idempotent submission flow.
  // On retry after a failure, stages that already succeeded (upload,
  // project insert) are skipped instead of creating duplicates.
  const handleGenerateEstimate = async () => {
    if (!selectedFile && !data.pdfUrl) return;

    // Verify organization is selected before proceeding
    if (!organization?.id) {
      toast.error("No organization selected", {
        description: "Please select an organization before generating an estimate",
      });
      return;
    }

    try {
      setUploadState('uploading');
      setProgress(0);

      const result = await submitProject(
        { ...data, pdfFile: selectedFile ?? data.pdfFile },
        organization.id,
        {
          onUploadStart: () => {
            toast.loading('Uploading HOVER PDF...', { id: 'upload-progress' });
          },
          onUploaded: (pdfUrl) => {
            setProgress(100);
            onUpdate({ pdfUrl });
            toast.success('PDF uploaded successfully!', { id: 'upload-progress' });
          },
          onProjectSaved: (projectId) => {
            onUpdate({ projectId });
          },
          onProcessingStart: () => {
            setUploadState('processing');
            toast.loading('AI is analyzing your project...', { id: 'processing' });
          },
        }
      );

      onUpdate({ pdfUrl: result.pdfUrl, projectId: result.projectId });

      // Complete (file has been automatically downloaded)
      setUploadState('complete');
      toast.success('Your estimate is ready!', {
        id: 'processing',
        description: 'Check your Downloads folder for the Excel file'
      });

      // Celebrate with confetti!
      triggerConfetti();

    } catch (error) {
      console.error('Error generating estimate:', error);
      toast.dismiss('upload-progress');
      setUploadState('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
      toast.error('Failed to generate estimate', {
        id: 'processing',
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    }
  };

  // Retry handler
  const handleRetry = () => {
    setUploadState('idle');
    setProgress(0);
    setErrorMessage('');
  };

  // Remove file handler
  const handleRemoveFile = () => {
    setSelectedFile(null);
    onUpdate({ pdfFile: null, pdfUrl: '' });
    setUploadState('idle');
  };

  return (
    <div className="space-y-6">
      {/* Project Summary */}
      <Card className="shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle className="font-heading">Project Summary</CardTitle>
          <CardDescription>Review your project details before generating the estimate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Project Name</p>
                <p className="text-sm font-semibold">{data.projectName || 'Not specified'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Customer Name</p>
                <p className="text-sm font-semibold">{data.customerName || 'Not specified'}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Address</p>
              <p className="text-sm font-semibold">{data.address || 'Not specified'}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Selected Trades</p>
              <div className="flex flex-wrap gap-2">
                {data.selectedTrades?.map(trade => (
                  <Badge key={trade} variant="secondary">
                    {formatTradeName(trade)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Upload Section */}
      <Card className="shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle className="font-heading">Upload HOVER PDF</CardTitle>
          <CardDescription>
            Upload your HOVER measurement report to generate the estimate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedFile && uploadState === 'idle' && (
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
                    Drag and drop your HOVER PDF here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF files only, maximum 25MB
                  </p>
                </>
              )}
            </div>
          )}

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
                    {formatFileSize(selectedFile.size)} • PDF
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
              <AlertTitle>Uploading HOVER plans...</AlertTitle>
              <AlertDescription>
                <Progress value={progress} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-2">{progress}% complete</p>
              </AlertDescription>
            </Alert>
          )}

          {/* Processing State */}
          {uploadState === 'processing' && (
            <Alert className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <AlertTitle className="text-blue-900 dark:text-blue-100">
                AI is analyzing your project...
              </AlertTitle>
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#00cc6a]" />
                    <span>Extracted measurements from HOVER PDF</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span>Calculating material quantities...</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4" />
                    <span>Applying pricing logic</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4" />
                    <span>Generating takeoff spreadsheet</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  This usually takes 2-3 minutes...
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Complete State */}
          {uploadState === 'complete' && (
            <Alert className="border-[#00cc6a] bg-[#dcfce7]">
              <CheckCircle2 className="h-4 w-4 text-[#00cc6a]" />
              <AlertTitle className="text-[#0f172a]">
                Your estimate has been downloaded!
              </AlertTitle>
              <AlertDescription className="text-[#475569]">
                <p>
                  Your Excel takeoff has been generated and automatically downloaded to your computer.
                  Check your Downloads folder for the file.
                </p>
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

          {/* Generate Button */}
          {uploadState === 'idle' && selectedFile && (
            <Button
              onClick={handleGenerateEstimate}
              className="w-full"
              size="lg"
            >
              Generate Estimate
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
