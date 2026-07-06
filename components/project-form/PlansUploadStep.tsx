"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  FileSearch,
  FileText,
  ListChecks,
  Loader2,
  PencilRuler,
  ScanSearch,
  Upload,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDevBypassEnabled, useOrganization } from "@/lib/hooks/useOrganization";
import { cn } from "@/lib/utils";
import type { ProjectFormData } from "@/lib/types/project-form";
import type { JobStatus } from "@/lib/types/extraction";

interface PlansUploadStepProps {
  data: ProjectFormData;
  onUpdate: (data: Partial<ProjectFormData>) => void;
  onChangeType?: () => void;
}

type UploadState = "idle" | "uploading" | "creating" | "starting" | "complete" | "error";

interface StartJobResponse {
  success: boolean;
  job_id?: string;
  status?: JobStatus;
  error?: string;
  message?: string;
}

const LOCAL_EXTRACTION_API_URL =
  process.env.NEXT_PUBLIC_LOCAL_EXTRACTION_API_URL || "http://localhost:5050";
const EXTRACTION_API_URL = isDevBypassEnabled()
  ? LOCAL_EXTRACTION_API_URL
  : process.env.NEXT_PUBLIC_EXTRACTION_API_URL || "https://extraction-api-production.up.railway.app";
const STORAGE_BUCKET = "project-pdfs";
const MAX_FILE_SIZE_MB = 100;

const PIPELINE_STEPS = [
  { label: "Upload plans", icon: Upload },
  { label: "Detect pages", icon: FileSearch },
  { label: "Approve pages", icon: ListChecks },
  { label: "Run markups", icon: ScanSearch },
  { label: "Open editor", icon: PencilRuler },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTradeName(trade: string): string {
  return trade.charAt(0).toUpperCase() + trade.slice(1);
}

export function PlansUploadStep({ data, onUpdate, onChangeType }: PlansUploadStepProps) {
  const router = useRouter();
  const { organization } = useOrganization();

  const [selectedFile, setSelectedFile] = useState<File | null>(data.pdfFile || null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const validateFile = (file: File): string | null => {
    if (file.type !== "application/pdf") return "Please upload a PDF file only.";
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File size must be less than ${MAX_FILE_SIZE_MB}MB.`;
    }
    return null;
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    const validationError = validateFile(file);

    if (validationError) {
      setErrorMessage(validationError);
      setUploadState("error");
      toast.error(validationError);
      return;
    }

    setSelectedFile(file);
    onUpdate({
      pdfFile: file,
      projectName: data.projectName.trim()
        ? data.projectName
        : file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "),
    });
    setUploadState("idle");
    setErrorMessage("");
  }, [data.projectName, onUpdate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: uploadState !== "idle",
  });

  const createProjectSnapshot = async (projectId: string, pdfUrl: string) => {
    if (!organization?.id) {
      throw new Error("Please select an organization before starting extraction.");
    }
    if (!data.projectName.trim() || !data.customerName.trim() || !data.address.trim()) {
      throw new Error("Project name, customer name, and address are required.");
    }
    const selectedTrades = data.selectedTrades?.length
      ? data.selectedTrades.includes("siding")
        ? data.selectedTrades
        : ["siding", ...data.selectedTrades]
      : ["siding"];

    if (!selectedTrades.length) {
      throw new Error("Select at least one trade before uploading plans.");
    }

    const response = await fetch("/api/projects/plan-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        organization_id: organization.id,
        project_name: data.projectName,
        client_name: data.customerName,
        address: data.address,
        selected_trades: selectedTrades,
        markup_percent: data.markupPercent,
        pdf_url: pdfUrl,
        configurations: data.configurations,
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string; details?: string } | null;
      throw new Error(result?.details || result?.error || `Project save failed: ${response.statusText}`);
    }
  };

  const uploadPdfToStorage = async (file: File, projectId: string): Promise<string> => {
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `${projectId}/${timestamp}_${sanitizedName}`;

    setUploadProgress(0);

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`,
      {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "Content-Type": file.type,
          "Cache-Control": "3600",
          "x-upsert": "false",
        },
        body: file,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[PlansUploadStep] Storage upload failed:", response.status, errorText);
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    setUploadProgress(100);
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`;
  };

  const startExtractionJob = async (projectId: string, uploadedPdfUrl: string): Promise<string> => {
    const selectedTrades = data.selectedTrades?.length
      ? data.selectedTrades.includes("siding")
        ? data.selectedTrades
        : ["siding", ...data.selectedTrades]
      : ["siding"];

    const payload = {
      project_id: projectId,
      pdf_url: uploadedPdfUrl,
      project_name: data.projectName || `Project ${projectId.slice(0, 8)}`,
      client_name: data.customerName,
      address: data.address,
      selected_trades: selectedTrades,
      markup_percent: data.markupPercent,
      intake_type: "plans",
      estimate_source: "construction_plans",
      organization_id: organization?.id,
    };

    const response = await fetch(`${EXTRACTION_API_URL}/start-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[PlansUploadStep] Start job failed:", response.status, errorText);
      throw new Error(`Failed to start extraction: ${response.statusText}`);
    }

    const result: StartJobResponse = await response.json();
    if (!result.success || !result.job_id) {
      throw new Error(result.error || result.message || "Failed to create extraction job");
    }

    return result.job_id;
  };

  const stampExtractionJobName = async (jobId: string) => {
    const response = await fetch(`/api/extraction-jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_name: data.projectName }),
    });

    if (!response.ok) {
      console.warn("[PlansUploadStep] Could not stamp extraction job name:", await response.text());
    }
  };

  const handleStartPlansExtraction = async () => {
    if (!selectedFile) return;
    if (!data.projectName.trim() || !data.customerName.trim() || !data.address.trim()) {
      toast.error("Project details are required", {
        description: "Add the project name, client or builder, and site address before upload.",
      });
      return;
    }

    const projectId = crypto.randomUUID();

    try {
      setUploadState("uploading");
      toast.loading("Uploading plan set...", { id: "plans-upload" });
      const pdfUrl = await uploadPdfToStorage(selectedFile, projectId);
      onUpdate({ pdfUrl });
      toast.success("Plans uploaded", { id: "plans-upload" });

      setUploadState("creating");
      toast.loading("Creating project...", { id: "plans-project" });
      await createProjectSnapshot(projectId, pdfUrl);
      toast.success("Project created", { id: "plans-project" });

      setUploadState("starting");
      toast.loading("Starting AI extraction...", { id: "plans-extraction" });
      const jobId = await startExtractionJob(projectId, pdfUrl);
      await stampExtractionJobName(jobId);

      setUploadState("complete");
      toast.success("Extraction started", {
        id: "plans-extraction",
        description: "Opening the review workspace.",
      });
      router.push(`/projects/${projectId}/review/${jobId}`);
    } catch (error) {
      console.error("[PlansUploadStep] Error:", error);
      setUploadState("error");
      setErrorMessage(error instanceof Error ? error.message : "An unknown error occurred");
      toast.dismiss("plans-upload");
      toast.dismiss("plans-project");
      toast.error("Failed to start plan extraction", {
        id: "plans-extraction",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleRetry = () => {
    setUploadState("idle");
    setUploadProgress(0);
    setErrorMessage("");
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    onUpdate({ pdfFile: null, pdfUrl: "" });
    setUploadState("idle");
    setErrorMessage("");
  };

  const projectDetailsComplete =
    Boolean(data.projectName.trim()) &&
    Boolean(data.customerName.trim()) &&
    Boolean(data.address.trim());

  return (
    <div className="space-y-6">
      <Card className="border-2 shadow-lg">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary">Construction Plans</Badge>
              </div>
              <CardTitle className="font-heading text-2xl">Upload Plans for Page Detection</CardTitle>
              <CardDescription className="mt-2 text-base">
                Upload the plan set first. After conversion, you will approve page types before AI markups open in the editor.
              </CardDescription>
            </div>
            {onChangeType && (
              <Button variant="ghost" size="sm" onClick={onChangeType}>
                Change Type
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            {PIPELINE_STEPS.map((step, index) => (
              <div key={step.label} className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-brand-foreground">
                    <step.icon className="h-4 w-4" />
                  </div>
                  <span className="font-num text-xs text-muted-foreground">{index + 1}</span>
                </div>
                <p className="text-sm font-medium">{step.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="shadow-soft rounded-xl">
          <CardHeader>
            <CardTitle className="font-heading">Upload Construction Plans</CardTitle>
            <CardDescription>
              PDF plan sets up to {MAX_FILE_SIZE_MB}MB are supported.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedFile && uploadState === "idle" && (
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  isDragActive
                    ? "border-brand bg-brand/15"
                    : "border-border bg-muted hover:border-brand hover:bg-accent"
                )}
              >
                <input {...getInputProps()} />
                <ScanSearch className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                {isDragActive ? (
                  <p className="text-sm text-foreground">Drop the plan set here...</p>
                ) : (
                  <>
                    <p className="mb-1 text-sm font-medium text-foreground">
                      Drag and drop your construction plans, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF files only, maximum {MAX_FILE_SIZE_MB}MB
                    </p>
                  </>
                )}
              </div>
            )}

            {selectedFile && uploadState === "idle" && (
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted p-3">
                <div className="rounded-md bg-brand/15 p-2">
                  <FileText className="h-5 w-5 text-brand-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="shrink-0 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Remove selected file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {uploadState === "creating" && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Creating project...</AlertTitle>
                <AlertDescription>Saving the project before page detection starts.</AlertDescription>
              </Alert>
            )}

            {uploadState === "uploading" && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Uploading plans...</AlertTitle>
                <AlertDescription>
                  {uploadProgress > 0 ? `${uploadProgress}% uploaded` : "Preparing upload"}
                </AlertDescription>
              </Alert>
            )}

            {uploadState === "starting" && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Starting page detection...</AlertTitle>
                <AlertDescription>Converting and classifying plan pages.</AlertDescription>
              </Alert>
            )}

            {uploadState === "complete" && (
              <Alert className="border-brand/30 bg-brand/10">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Page detection started</AlertTitle>
                <AlertDescription>Opening page classification review.</AlertDescription>
              </Alert>
            )}

            {uploadState === "error" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Could not start page detection</AlertTitle>
                <AlertDescription>{errorMessage || "Something went wrong"}</AlertDescription>
                <Button variant="outline" size="sm" onClick={handleRetry} className="mt-3">
                  Try Again
                </Button>
              </Alert>
            )}

            {uploadState === "idle" && (
              <Button
                onClick={handleStartPlansExtraction}
                className="w-full"
                disabled={!selectedFile || !projectDetailsComplete}
              >
                <Upload className="mr-2 h-4 w-4" />
                Start Page Detection
              </Button>
            )}

            {!projectDetailsComplete && (
              <p className="text-xs text-muted-foreground">
                Complete the project details to start page detection.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-soft rounded-xl">
          <CardHeader>
            <CardTitle className="font-heading">Project Details</CardTitle>
            <CardDescription>These details follow the plan set into the review workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plans-project-name">Project / Plan Set Name</Label>
              <Input
                id="plans-project-name"
                value={data.projectName}
                onChange={(event) => onUpdate({ projectName: event.target.value })}
                placeholder="e.g., Smith Residence Exterior Plans"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plans-client-name">Client / Builder</Label>
              <Input
                id="plans-client-name"
                value={data.customerName}
                onChange={(event) => onUpdate({ customerName: event.target.value })}
                placeholder="e.g., John Smith or Acme Builders"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plans-address">Project Site Address</Label>
              <Input
                id="plans-address"
                value={data.address}
                onChange={(event) => onUpdate({ address: event.target.value })}
                placeholder="e.g., 123 Main St, City, State ZIP"
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Initial scope</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(data.selectedTrades?.length ? data.selectedTrades : ["siding"]).map((trade) => (
                  <Badge key={trade} variant="secondary">
                    {formatTradeName(trade)}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
