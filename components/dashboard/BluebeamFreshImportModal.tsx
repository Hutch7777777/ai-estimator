"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileText,
  CheckCircle,
  Loader2,
  AlertCircle,
  Eye,
} from "lucide-react";
import { useRouter } from "next/navigation";

const EXTRACTION_API_URL = process.env.NEXT_PUBLIC_EXTRACTION_API_URL;

interface DetectionSummaryItem {
  count: number;
  total_sf?: number;
  total_lf?: number;
}

interface ImportResult {
  success: boolean;
  job_id: string;
  total_pages: number;
  total_detections: number;
  detection_summary: Record<string, DetectionSummaryItem>;
  pages: Array<{ page_number: number; annotation_count: number }>;
  error?: string;
}

interface BluebeamFreshImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string;
  organizationId?: string;
  onJobCreated?: (jobId: string) => void;
}

type ModalStep = "upload" | "processing" | "summary" | "error";

export function BluebeamFreshImportModal({
  open,
  onOpenChange,
  projectId,
  projectName,
  organizationId,
  onJobCreated,
}: BluebeamFreshImportModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<ModalStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [progress, setProgress] = useState<string>("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    multiple: false,
  });

  const handleImport = async () => {
    if (!selectedFile) return;

    setStep("processing");
    setProgress("Uploading and processing PDF...");

    try {
      const formData = new FormData();
      formData.append("pdf_file", selectedFile);
      formData.append("project_id", projectId);
      if (projectName) formData.append("project_name", projectName);
      if (organizationId) formData.append("organization_id", organizationId);

      const response = await fetch(`${EXTRACTION_API_URL}/import-bluebeam-fresh`, {
        method: "POST",
        body: formData,
      });

      const data: ImportResult = await response.json();

      if (data.success) {
        setResult(data);
        setStep("summary");
        onJobCreated?.(data.job_id);
      } else {
        setErrorMessage(data.error || "Import failed");
        setStep("error");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Network error");
      setStep("error");
    }
  };

  const handleReview = () => {
    if (result?.job_id) {
      router.push(`/projects/${projectId}/extraction/${result.job_id}`);
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setStep("upload");
    setSelectedFile(null);
    setResult(null);
    setErrorMessage("");
    onOpenChange(false);
  };

  const formatClassName = (cls: string) =>
    cls.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Marked Up Plans</DialogTitle>
          <DialogDescription>
            Upload a PDF with Bluebeam annotations. Markups will be imported as
            detections for review and pricing.
          </DialogDescription>
        </DialogHeader>

        {/* STEP: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${isDragActive ? "border-emerald-500 bg-emerald-50" : "border-gray-300 hover:border-gray-400"}
                ${selectedFile ? "border-emerald-500 bg-emerald-50/50" : ""}`}
            >
              <input {...getInputProps()} />
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-10 w-10 text-emerald-600" />
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                  <p className="text-xs text-gray-400">Click or drop to replace</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-10 w-10 text-gray-400" />
                  <p className="text-sm text-gray-600">
                    Drop your marked-up PDF here, or click to browse
                  </p>
                  <p className="text-xs text-gray-400">
                    Supports Bluebeam polygons, polylines, rectangles, and count markers
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedFile}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Annotations
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Processing */}
        {step === "processing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
            <p className="text-sm text-gray-600">{progress}</p>
            <p className="text-xs text-gray-400">
              Converting pages and parsing annotations...
            </p>
          </div>
        )}

        {/* STEP: Summary */}
        {step === "summary" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Import Complete</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500">Pages</p>
                <p className="text-2xl font-bold">{result.total_pages}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500">Annotations</p>
                <p className="text-2xl font-bold">{result.total_detections}</p>
              </div>
            </div>

            {Object.keys(result.detection_summary).length > 0 && (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {Object.entries(result.detection_summary)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([cls, data]) => (
                    <div
                      key={cls}
                      className="flex justify-between px-3 py-2 text-sm"
                    >
                      <span>{formatClassName(cls)}</span>
                      <span className="text-gray-500">
                        {data.count}
                        {data.total_sf ? ` · ${data.total_sf.toFixed(1)} SF` : ""}
                        {data.total_lf ? ` · ${data.total_lf.toFixed(1)} LF` : ""}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button
                onClick={handleReview}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Eye className="h-4 w-4 mr-2" />
                Review in Detection Editor
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Error */}
        {step === "error" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Import Failed</span>
            </div>
            <p className="text-sm text-gray-600">{errorMessage}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setStep("upload");
                  setErrorMessage("");
                }}
              >
                Try Again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
