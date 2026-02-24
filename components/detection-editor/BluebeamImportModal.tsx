'use client';

import { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Pencil,
  Trash2,
  Plus,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ExtractionDetection, DetectionClass } from '@/lib/types/extraction';

// =============================================================================
// API Endpoint (uses existing n8n proxy pattern)
// =============================================================================

const DETECTION_EDIT_SYNC_ENDPOINT = '/api/n8n/detection-edit-sync';

interface DetectionEditRequest {
  job_id: string;
  page_id: string;
  edit_type: 'verify' | 'move' | 'resize' | 'delete' | 'reclassify' | 'create';
  detection_id?: string;
  changes?: {
    pixel_x?: number;
    pixel_y?: number;
    pixel_width?: number;
    pixel_height?: number;
    class?: DetectionClass;
    status?: string;
  };
}

interface DetectionEditResponse {
  success: boolean;
  error?: string;
  detection_id?: string;
}

/**
 * Send a detection edit via the existing n8n sync API.
 * This avoids creating duplicate Supabase clients.
 */
async function syncDetectionEdit(request: DetectionEditRequest): Promise<DetectionEditResponse> {
  try {
    const response = await fetch(DETECTION_EDIT_SYNC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return data;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// =============================================================================
// Types
// =============================================================================

interface BluebeamImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  currentDetections: Map<string, ExtractionDetection[]>;
  pages: Array<{ id: string; page_number: number; scale_ratio?: number | null }>;
  onImportComplete: () => void;
}

type ImportState = 'upload' | 'reviewing' | 'applying' | 'complete' | 'error';

interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ChangeRecord {
  change_type: 'matched' | 'modified' | 'deleted' | 'added';
  detection_id: string | null;
  page_id: string | null;
  page_number: number;
  detection_class: string | null;
  original_bbox: BoundingBox | null;
  imported_bbox: BoundingBox | null;
  bbox_shift: { dx: number; dy: number; dw: number; dh: number } | null;
  iou: number | null;
  annotation_subject: string | null;
  annotation_contents: string | null;
}

interface ImportDiffResponse {
  success: boolean;
  job_id: string;
  summary: {
    matched: number;
    modified: number;
    deleted: number;
    added: number;
    total_annotations: number;
    total_detections: number;
    annotations_with_metadata: number;
  };
  changes: ChangeRecord[];
  changes_by_page: Record<string, {
    matched: ChangeRecord[];
    modified: ChangeRecord[];
    deleted: ChangeRecord[];
    added: ChangeRecord[];
  }>;
  import_timestamp: string;
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const EXTRACTION_API_URL = process.env.NEXT_PUBLIC_EXTRACTION_API_URL || 'https://extraction-api-production.up.railway.app';
const MAX_FILE_SIZE_MB = 100;

// =============================================================================
// Helper Components
// =============================================================================

function ChangeIcon({ type }: { type: string }) {
  switch (type) {
    case 'modified':
      return <Pencil className="w-4 h-4 text-yellow-500" />;
    case 'deleted':
      return <Trash2 className="w-4 h-4 text-red-500" />;
    case 'added':
      return <Plus className="w-4 h-4 text-green-500" />;
    case 'matched':
      return <Check className="w-4 h-4 text-gray-400" />;
    default:
      return null;
  }
}

function formatBbox(bbox: BoundingBox | null): string {
  if (!bbox) return 'N/A';
  return `${Math.round(bbox.w)}×${Math.round(bbox.h)} at (${Math.round(bbox.x)}, ${Math.round(bbox.y)})`;
}

interface ChangeRowProps {
  change: ChangeRecord;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function ChangeRow({ change, selected, onToggle, disabled }: ChangeRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
      <div
        className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
          selected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Selection checkbox (only for non-matched changes) */}
        {change.change_type !== 'matched' && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            disabled={disabled}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
        )}

        {/* Change icon */}
        <ChangeIcon type={change.change_type} />

        {/* Class name */}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 capitalize">
          {change.detection_class?.replace('_', ' ') || 'Unknown'}
        </span>

        {/* Page number */}
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Page {change.page_number}
        </span>

        {/* IoU for modified */}
        {change.change_type === 'modified' && change.iou !== null && (
          <span className="text-xs text-yellow-600 dark:text-yellow-400">
            IoU: {Math.round(change.iou * 100)}%
          </span>
        )}

        <div className="flex-1" />

        {/* Expand indicator */}
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-200 dark:border-gray-700 text-xs space-y-1">
          {change.original_bbox && (
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400 w-20">Original:</span>
              <span className="text-gray-700 dark:text-gray-300 font-mono">
                {formatBbox(change.original_bbox)}
              </span>
            </div>
          )}
          {change.imported_bbox && (
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400 w-20">Imported:</span>
              <span className="text-gray-700 dark:text-gray-300 font-mono">
                {formatBbox(change.imported_bbox)}
              </span>
            </div>
          )}
          {change.bbox_shift && change.change_type === 'modified' && (
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400 w-20">Shift:</span>
              <span className="text-gray-700 dark:text-gray-300 font-mono">
                Δx={Math.round(change.bbox_shift.dx)}, Δy={Math.round(change.bbox_shift.dy)},
                Δw={Math.round(change.bbox_shift.dw)}, Δh={Math.round(change.bbox_shift.dh)}
              </span>
            </div>
          )}
          {change.annotation_contents && (
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400 w-20">Contents:</span>
              <span className="text-gray-700 dark:text-gray-300">
                {change.annotation_contents}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function BluebeamImportModal({
  isOpen,
  onClose,
  jobId,
  currentDetections,
  pages,
  onImportComplete,
}: BluebeamImportModalProps) {
  // State
  const [state, setState] = useState<ImportState>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [diffResult, setDiffResult] = useState<ImportDiffResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedChanges, setSelectedChanges] = useState<Set<string>>(new Set());
  const [applyProgress, setApplyProgress] = useState({ current: 0, total: 0 });

  // =============================================================================
  // File Validation & Dropzone
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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    const validationError = validateFile(file);

    if (validationError) {
      setErrorMessage(validationError);
      setState('error');
      toast.error(validationError);
      return;
    }

    setSelectedFile(file);
    setErrorMessage('');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: isUploading,
  });

  // =============================================================================
  // Upload & Analyze
  // =============================================================================

  const handleUploadAndAnalyze = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('pdf_file', selectedFile);
      formData.append('job_id', jobId);

      const response = await fetch(`${EXTRACTION_API_URL}/import-bluebeam`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Import analysis failed');
      }

      setDiffResult(data);

      // Pre-select all modified, deleted, and added changes
      const initialSelected = new Set<string>();
      for (const change of data.changes) {
        if (change.change_type !== 'matched') {
          // Create unique key for each change
          const key = change.detection_id || `new-${change.page_number}-${data.changes.indexOf(change)}`;
          initialSelected.add(key);
        }
      }
      setSelectedChanges(initialSelected);

      setState('reviewing');
      toast.success('PDF analyzed successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to analyze PDF');
      setErrorMessage(error.message);
      setState('error');
      toast.error(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  // =============================================================================
  // Apply Changes
  // =============================================================================

  const applicableChanges = useMemo(() => {
    if (!diffResult) return [];
    return diffResult.changes.filter((c) => {
      if (c.change_type === 'matched') return false;
      const key = c.detection_id || `new-${c.page_number}-${diffResult.changes.indexOf(c)}`;
      return selectedChanges.has(key);
    });
  }, [diffResult, selectedChanges]);

  const handleApplyChanges = async () => {
    if (!diffResult || applicableChanges.length === 0) return;

    setState('applying');
    setApplyProgress({ current: 0, total: applicableChanges.length });

    try {
      // Build lookup for existing detections
      const detectionsById = new Map<string, ExtractionDetection>();
      for (const dets of currentDetections.values()) {
        for (const det of dets) {
          detectionsById.set(det.id, det);
        }
      }

      // Track results
      let modifiedCount = 0;
      let deletedCount = 0;
      let addedCount = 0;
      const errors: string[] = [];

      // =======================================================================
      // SURGICAL UPDATES via existing n8n API - avoids duplicate Supabase clients
      // =======================================================================

      // 1. MODIFIED: Update only pixel coordinates for modified detections
      const modifiedChanges = applicableChanges.filter(
        (c) => c.change_type === 'modified' && c.detection_id && c.imported_bbox && c.page_id
      );

      for (const change of modifiedChanges) {
        if (!change.detection_id || !change.imported_bbox || !change.page_id) continue;

        // Use 'resize' edit_type to update position (preserves class, materials, etc.)
        const result = await syncDetectionEdit({
          job_id: jobId,
          page_id: change.page_id,
          edit_type: 'resize',
          detection_id: change.detection_id,
          changes: {
            pixel_x: change.imported_bbox.x,
            pixel_y: change.imported_bbox.y,
            pixel_width: change.imported_bbox.w,
            pixel_height: change.imported_bbox.h,
          },
        });

        if (!result.success) {
          console.error(`[BluebeamImport] Failed to update detection ${change.detection_id}:`, result.error);
          errors.push(`Failed to update ${change.detection_class || 'detection'}: ${result.error}`);
        } else {
          modifiedCount++;
          console.log(`[BluebeamImport] Updated detection ${change.detection_id}`);
        }

        setApplyProgress((prev) => ({ ...prev, current: prev.current + 1 }));
      }

      // 2. DELETED: Use 'delete' edit_type
      const deletedChanges = applicableChanges.filter(
        (c) => c.change_type === 'deleted' && c.detection_id && c.page_id
      );

      for (const change of deletedChanges) {
        if (!change.detection_id || !change.page_id) continue;

        const result = await syncDetectionEdit({
          job_id: jobId,
          page_id: change.page_id,
          edit_type: 'delete',
          detection_id: change.detection_id,
          changes: { status: 'deleted' },
        });

        if (!result.success) {
          console.error(`[BluebeamImport] Failed to delete detection ${change.detection_id}:`, result.error);
          errors.push(`Failed to delete ${change.detection_class || 'detection'}: ${result.error}`);
        } else {
          deletedCount++;
          console.log(`[BluebeamImport] Deleted detection ${change.detection_id}`);
        }

        setApplyProgress((prev) => ({ ...prev, current: prev.current + 1 }));
      }

      // 3. ADDED: Use 'create' edit_type
      const addedChanges = applicableChanges.filter(
        (c) => c.change_type === 'added' && c.imported_bbox && c.page_id
      );

      for (const change of addedChanges) {
        if (!change.imported_bbox || !change.page_id) continue;

        const result = await syncDetectionEdit({
          job_id: jobId,
          page_id: change.page_id,
          edit_type: 'create',
          changes: {
            pixel_x: change.imported_bbox.x,
            pixel_y: change.imported_bbox.y,
            pixel_width: change.imported_bbox.w,
            pixel_height: change.imported_bbox.h,
            class: (change.detection_class || 'siding') as DetectionClass,
          },
        });

        if (!result.success) {
          console.error(`[BluebeamImport] Failed to create detection:`, result.error);
          errors.push(`Failed to add ${change.detection_class || 'detection'}: ${result.error}`);
        } else {
          addedCount++;
          console.log(`[BluebeamImport] Created new detection on page ${change.page_number}`);
        }

        setApplyProgress((prev) => ({ ...prev, current: prev.current + 1 }));
      }

      // Report results
      const successCount = modifiedCount + deletedCount + addedCount;
      console.log(`[BluebeamImport] Complete: ${modifiedCount} modified, ${deletedCount} deleted, ${addedCount} added`);

      if (errors.length > 0) {
        console.error(`[BluebeamImport] ${errors.length} errors occurred:`, errors);
        if (successCount > 0) {
          toast.warning(`Applied ${successCount} changes with ${errors.length} errors`);
        } else {
          throw new Error(`All operations failed. First error: ${errors[0]}`);
        }
      } else {
        toast.success(`Successfully applied ${successCount} changes`);
      }

      setState('complete');

      // Notify parent to refresh
      onImportComplete();

      // Close after a brief delay
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to apply changes');
      setErrorMessage(error.message);
      setState('error');
      toast.error(error.message);
    }
  };

  // =============================================================================
  // Selection Handlers
  // =============================================================================

  const toggleChange = (change: ChangeRecord) => {
    if (!diffResult) return;
    const key = change.detection_id || `new-${change.page_number}-${diffResult.changes.indexOf(change)}`;
    setSelectedChanges((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (!diffResult) return;
    const all = new Set<string>();
    for (const change of diffResult.changes) {
      if (change.change_type !== 'matched') {
        const key = change.detection_id || `new-${change.page_number}-${diffResult.changes.indexOf(change)}`;
        all.add(key);
      }
    }
    setSelectedChanges(all);
  };

  const selectNone = () => {
    setSelectedChanges(new Set());
  };

  // =============================================================================
  // Close Handler
  // =============================================================================

  const handleClose = () => {
    // Reset state
    setState('upload');
    setSelectedFile(null);
    setDiffResult(null);
    setErrorMessage('');
    setSelectedChanges(new Set());
    setApplyProgress({ current: 0, total: 0 });
    onClose();
  };

  // =============================================================================
  // Render
  // =============================================================================

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-500" />
            Import from Bluebeam
          </DialogTitle>
        </DialogHeader>

        {/* STATE 1: Upload */}
        {state === 'upload' && (
          <div className="flex flex-col gap-4">
            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${
                  isDragActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }
                ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
              {isDragActive ? (
                <p className="text-blue-600 dark:text-blue-400 font-medium">
                  Drop the PDF here...
                </p>
              ) : (
                <>
                  <p className="text-gray-600 dark:text-gray-300 font-medium mb-1">
                    Drag & drop your Bluebeam-edited PDF here
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    or click to browse (max {MAX_FILE_SIZE_MB}MB)
                  </p>
                </>
              )}
            </div>

            {/* Selected file preview */}
            {selectedFile && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <FileText className="w-8 h-8 text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleUploadAndAnalyze}
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload & Analyze
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STATE 2: Reviewing */}
        {state === 'reviewing' && diffResult && (
          <div className="flex flex-col gap-4 flex-1 overflow-hidden">
            {/* Summary */}
            <div className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm">
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-300">
                  {diffResult.summary.matched} matched
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-yellow-500" />
                <span className="text-yellow-600 dark:text-yellow-400">
                  {diffResult.summary.modified} modified
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-red-500" />
                <span className="text-red-600 dark:text-red-400">
                  {diffResult.summary.deleted} deleted
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-green-500" />
                <span className="text-green-600 dark:text-green-400">
                  {diffResult.summary.added} added
                </span>
              </div>
            </div>

            {/* Selection controls */}
            {(diffResult.summary.modified > 0 ||
              diffResult.summary.deleted > 0 ||
              diffResult.summary.added > 0) && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {selectedChanges.size} selected
                </span>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Select none
                </button>
              </div>
            )}

            {/* Changes list */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {diffResult.changes
                .filter((c) => c.change_type !== 'matched')
                .map((change, idx) => {
                  const key = change.detection_id || `new-${change.page_number}-${idx}`;
                  return (
                    <ChangeRow
                      key={key}
                      change={change}
                      selected={selectedChanges.has(key)}
                      onToggle={() => toggleChange(change)}
                    />
                  );
                })}

              {diffResult.summary.modified === 0 &&
                diffResult.summary.deleted === 0 &&
                diffResult.summary.added === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                    <CheckCircle className="w-12 h-12 mb-3 text-green-500" />
                    <p className="font-medium">No changes detected</p>
                    <p className="text-sm">
                      All {diffResult.summary.matched} annotations match the current detections
                    </p>
                  </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleApplyChanges}
                disabled={selectedChanges.size === 0}
              >
                Apply {selectedChanges.size} Change{selectedChanges.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}

        {/* STATE 3: Applying */}
        {state === 'applying' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
              Applying changes...
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Processing {applicableChanges.length} changes
            </p>
          </div>
        )}

        {/* STATE 4: Complete */}
        {state === 'complete' && (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
              Import complete!
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Successfully applied all changes
            </p>
          </div>
        )}

        {/* STATE 5: Error */}
        {state === 'error' && (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-red-600 dark:text-red-400">
              {errorMessage || 'An error occurred'}
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setState('upload');
                  setErrorMessage('');
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
