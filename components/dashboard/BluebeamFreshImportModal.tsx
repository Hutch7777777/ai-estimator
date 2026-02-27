"use client";

import { useState, useCallback, useMemo } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileText,
  CheckCircle,
  Loader2,
  AlertCircle,
  Eye,
  ArrowLeft,
} from "lucide-react";
import { useRouter } from "next/navigation";

const EXTRACTION_API_URL = process.env.NEXT_PUBLIC_EXTRACTION_API_URL;

// Detection classes available for mapping
const DETECTION_CLASSES = [
  { value: "SKIP", label: "Skip (Don't Import)" },
  { value: "siding", label: "Siding" },
  { value: "window", label: "Window" },
  { value: "door", label: "Door" },
  { value: "garage", label: "Garage" },
  { value: "roof", label: "Roof" },
  { value: "gable", label: "Gable" },
  { value: "trim", label: "Trim" },
  { value: "fascia", label: "Fascia" },
  { value: "soffit", label: "Soffit" },
  { value: "eave", label: "Eave" },
  { value: "rake", label: "Rake" },
  { value: "ridge", label: "Ridge" },
  { value: "valley", label: "Valley" },
  { value: "gutter", label: "Gutter" },
  { value: "downspout", label: "Downspout" },
  { value: "flashing", label: "Flashing" },
  { value: "corner_outside", label: "Outside Corner" },
  { value: "corner_inside", label: "Inside Corner" },
  { value: "belly_band", label: "Belly Band" },
  { value: "corbel", label: "Corbel" },
  { value: "column", label: "Column" },
  { value: "post", label: "Post" },
  { value: "shutter", label: "Shutter" },
  { value: "vent", label: "Vent" },
  { value: "wrb", label: "WRB / House Wrap" },
  { value: "unknown", label: "Unknown" },
];

interface SubjectInfo {
  subject: string;
  count: number;
  annotation_type: string;
  sample_content: string | null;
  suggested_class: string;
}

interface PreviewResult {
  success: boolean;
  total_pages: number;
  total_annotations: number;
  subjects: SubjectInfo[];
  error?: string;
}

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

type ModalStep = "upload" | "scanning" | "mapping" | "importing" | "summary" | "error";

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
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [classMapping, setClassMapping] = useState<Record<string, string>>({});
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

  // Calculate import stats based on current mapping
  const importStats = useMemo(() => {
    if (!previewResult) return { total: 0, toImport: 0, toSkip: 0 };

    let toSkip = 0;
    let toImport = 0;

    for (const subject of previewResult.subjects) {
      const mappedClass = classMapping[subject.subject] ?? subject.suggested_class;
      if (mappedClass === "SKIP") {
        toSkip += subject.count;
      } else {
        toImport += subject.count;
      }
    }

    return {
      total: previewResult.total_annotations,
      toImport,
      toSkip,
    };
  }, [previewResult, classMapping]);

  // Scan PDF for preview
  const handleScan = async () => {
    if (!selectedFile) return;

    setStep("scanning");
    setProgress("Scanning annotations...");

    try {
      const formData = new FormData();
      formData.append("pdf_file", selectedFile);

      const response = await fetch(`${EXTRACTION_API_URL}/import-bluebeam-fresh/preview`, {
        method: "POST",
        body: formData,
      });

      const data: PreviewResult = await response.json();

      if (data.success) {
        setPreviewResult(data);
        // Initialize class mapping with suggested classes
        const initialMapping: Record<string, string> = {};
        for (const subject of data.subjects) {
          initialMapping[subject.subject] = subject.suggested_class;
        }
        setClassMapping(initialMapping);
        setStep("mapping");
      } else {
        setErrorMessage(data.error || "Failed to scan PDF");
        setStep("error");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Network error");
      setStep("error");
    }
  };

  // Import with class mapping
  const handleImport = async () => {
    if (!selectedFile) return;

    setStep("importing");
    setProgress("Converting pages and importing annotations...");

    try {
      const formData = new FormData();
      formData.append("pdf_file", selectedFile);
      formData.append("project_id", projectId);
      if (projectName) formData.append("project_name", projectName);
      if (organizationId) formData.append("organization_id", organizationId);
      formData.append("class_mapping", JSON.stringify(classMapping));

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
    setPreviewResult(null);
    setClassMapping({});
    setResult(null);
    setErrorMessage("");
    onOpenChange(false);
  };

  const handleClassChange = (subject: string, newClass: string) => {
    setClassMapping((prev) => ({
      ...prev,
      [subject]: newClass,
    }));
  };

  const formatClassName = (cls: string) =>
    cls.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Determine modal width based on step
  const modalWidth = step === "mapping" ? "sm:max-w-4xl" : "sm:max-w-lg";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={modalWidth}>
        <DialogHeader>
          <DialogTitle>Import Marked Up Plans</DialogTitle>
          <DialogDescription>
            {step === "mapping"
              ? "Map each Bluebeam subject to a detection class. Set to 'Skip' to exclude."
              : "Upload a PDF with Bluebeam annotations. Markups will be imported as detections for review and pricing."}
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
                onClick={handleScan}
                disabled={!selectedFile}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Upload className="h-4 w-4 mr-2" />
                Scan Annotations
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Scanning */}
        {step === "scanning" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
            <p className="text-sm text-gray-600">{progress}</p>
            <p className="text-xs text-gray-400">
              Reading annotation subjects from PDF...
            </p>
          </div>
        )}

        {/* STEP: Mapping */}
        {step === "mapping" && previewResult && (
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex gap-4">
                <span>
                  <span className="font-medium">{previewResult.total_pages}</span> pages
                </span>
                <span>
                  <span className="font-medium">{previewResult.subjects.length}</span> unique subjects
                </span>
              </div>
              <div className="flex gap-4">
                <span className="text-emerald-600">
                  <span className="font-medium">{importStats.toImport}</span> to import
                </span>
                {importStats.toSkip > 0 && (
                  <span className="text-gray-500">
                    <span className="font-medium">{importStats.toSkip}</span> skipped
                  </span>
                )}
              </div>
            </div>

            {/* Mapping table */}
            <div className="border rounded-lg max-h-96 overflow-y-auto pb-48">
              <Table>
                <TableHeader className="sticky top-0 bg-white">
                  <TableRow>
                    <TableHead className="w-[40%]">Subject</TableHead>
                    <TableHead className="w-[15%] text-center">Count</TableHead>
                    <TableHead className="w-[15%]">Type</TableHead>
                    <TableHead className="w-[30%]">Map To Class</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewResult.subjects.map((subject) => {
                    const currentClass = classMapping[subject.subject] ?? subject.suggested_class;
                    const isSkipped = currentClass === "SKIP";

                    return (
                      <TableRow
                        key={subject.subject}
                        className={isSkipped ? "bg-gray-50 text-gray-400" : ""}
                      >
                        <TableCell className="font-medium">
                          <div className="truncate max-w-xs" title={subject.subject}>
                            {subject.subject}
                          </div>
                          {subject.sample_content && (
                            <div className="text-xs text-gray-400 truncate">
                              e.g., {subject.sample_content}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{subject.count}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {subject.annotation_type}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={currentClass}
                            onValueChange={(value) => handleClassChange(subject.subject, value)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DETECTION_CLASSES.map((cls) => (
                                <SelectItem key={cls.value} value={cls.value}>
                                  {cls.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setStep("upload")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importStats.toImport === 0}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  Import {importStats.toImport} Annotations
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP: Importing */}
        {step === "importing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
            <p className="text-sm text-gray-600">{progress}</p>
            <p className="text-xs text-gray-400">
              This may take a minute for large PDFs...
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
                <p className="text-gray-500">Detections</p>
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
