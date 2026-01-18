// React hook for syncing detection edits with the n8n webhook

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  DetectionEditRequest,
  DetectionEditResponse,
  ExtractionDetection,
  ExtractionElevationCalcs,
  ExtractionJobTotals,
  DetectionClass,
  EditType,
  PolygonPoint,
  PolygonPoints,
} from '@/lib/types/extraction';
import { isPolygonWithHoles } from '@/lib/types/extraction';

/**
 * Extract simple polygon points from PolygonPoints union type.
 * For polygons with holes, returns the outer boundary.
 */
function getSimplePolygonPoints(points: PolygonPoints | null | undefined): PolygonPoint[] | null {
  if (!points) return null;
  if (isPolygonWithHoles(points)) {
    return points.outer as PolygonPoint[];
  }
  return points as PolygonPoint[];
}

// =============================================================================
// Configuration
// =============================================================================

const WEBHOOK_URL =
  process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
  'https://n8n-production-293e.up.railway.app';
const SYNC_ENDPOINT = `${WEBHOOK_URL}/webhook/detection-edit-sync`;
const VALIDATE_ENDPOINT = `${WEBHOOK_URL}/webhook/validate-detections`;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // ms

// =============================================================================
// Types
// =============================================================================

export interface UseDetectionSyncOptions {
  jobId: string;
  pageId: string;
  scaleRatio?: number;
  dpi?: number;
  userId?: string;
  onSuccess?: (response: DetectionEditResponse) => void;
  onError?: (error: Error, editType: EditType) => void;
  onTotalsUpdated?: (
    elevationCalcs: ExtractionElevationCalcs,
    jobTotals: ExtractionJobTotals
  ) => void;
}

export interface UseDetectionSyncReturn {
  // Core sync function
  syncEdit: (
    editType: EditType,
    detectionId?: string,
    changes?: Record<string, unknown>
  ) => Promise<DetectionEditResponse>;

  // Convenience methods
  verifyDetection: (detectionId: string) => Promise<DetectionEditResponse>;
  moveDetection: (
    detectionId: string,
    pixelX: number,
    pixelY: number
  ) => Promise<DetectionEditResponse>;
  resizeDetection: (
    detectionId: string,
    pixelWidth: number,
    pixelHeight: number
  ) => Promise<DetectionEditResponse>;
  moveAndResizeDetection: (
    detectionId: string,
    pixelX: number,
    pixelY: number,
    pixelWidth: number,
    pixelHeight: number
  ) => Promise<DetectionEditResponse>;
  deleteDetection: (detectionId: string) => Promise<DetectionEditResponse>;
  reclassifyDetection: (
    detectionId: string,
    newClass: DetectionClass
  ) => Promise<DetectionEditResponse>;
  createDetection: (
    pixelX: number,
    pixelY: number,
    pixelWidth: number,
    pixelHeight: number,
    detectionClass: DetectionClass
  ) => Promise<DetectionEditResponse>;

  // State
  isSyncing: boolean;
  pendingEdits: number;
  lastError: Error | null;
  clearError: () => void;
}

// =============================================================================
// Validation Types (for local-first editing)
// =============================================================================

export interface ValidationDetection {
  page_id: string;
  class: DetectionClass;
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;
  confidence: number;
  source_detection_id: string;
  is_deleted: boolean;
  detection_index: number;
  matched_tag: string | null;
  polygon_points?: Array<{ x: number; y: number }> | null;
  markup_type?: 'polygon' | 'line' | 'point';
  // Material assignment from Properties Panel
  assigned_material_id?: string | null;
  // User notes/comments
  notes?: string | null;
}

export interface ValidationRequest {
  job_id: string;
  detections: ValidationDetection[];
}

export interface ValidationResult {
  success: boolean;
  message?: string;
  error?: string;
  updated_count?: number;
  deleted_count?: number;
  created_count?: number;
  elevation_totals?: ExtractionElevationCalcs[];
  job_totals?: ExtractionJobTotals;
  timestamp?: string;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useDetectionSync(
  options: UseDetectionSyncOptions
): UseDetectionSyncReturn {
  const {
    jobId,
    pageId,
    scaleRatio,
    dpi,
    userId,
    onSuccess,
    onError,
    onTotalsUpdated,
  } = options;

  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingEdits, setPendingEdits] = useState(0);
  const [lastError, setLastError] = useState<Error | null>(null);

  // Track abort controllers for cleanup
  const abortControllersRef = useRef<Set<AbortController>>(new Set());
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      // Abort all pending requests
      abortControllersRef.current.forEach((controller) => controller.abort());
      abortControllersRef.current.clear();
    };
  }, []);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  // Core sync function with retry logic
  const syncEdit = useCallback(
    async (
      editType: EditType,
      detectionId?: string,
      changes?: Record<string, unknown>
    ): Promise<DetectionEditResponse> => {
      const abortController = new AbortController();
      abortControllersRef.current.add(abortController);

      setPendingEdits((prev) => prev + 1);
      setIsSyncing(true);
      setLastError(null);

      const request: DetectionEditRequest = {
        job_id: jobId,
        page_id: pageId,
        edit_type: editType,
        detection_id: detectionId,
        changes: changes as DetectionEditRequest['changes'],
        user_id: userId,
        scale_ratio: scaleRatio,
        dpi,
      };

      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(SYNC_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
            signal: abortController.signal,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          // Parse response with better error handling for non-JSON responses
          let data: DetectionEditResponse;
          let responseText: string | undefined;
          try {
            responseText = await response.text();
            data = responseText ? JSON.parse(responseText) : null;
          } catch (parseError) {
            console.error('Failed to parse response:', parseError);
            console.error('Response text:', responseText?.substring(0, 500));
            throw new Error(`Invalid response from server: ${responseText?.substring(0, 100) || 'empty response'}`);
          }

          if (!data || !data.success) {
            throw new Error(data?.error || 'Sync failed');
          }

          // Success - cleanup and call callbacks
          abortControllersRef.current.delete(abortController);

          if (isMountedRef.current) {
            setPendingEdits((prev) => Math.max(0, prev - 1));
            setIsSyncing(pendingEdits > 1);

            if (onSuccess) {
              onSuccess(data);
            }

            if (
              onTotalsUpdated &&
              data.elevation_totals &&
              data.job_totals
            ) {
              onTotalsUpdated(data.elevation_totals, data.job_totals);
            }
          }

          return data;
        } catch (error) {
          // Don't retry if aborted
          if (error instanceof Error && error.name === 'AbortError') {
            throw error;
          }

          lastError = error instanceof Error ? error : new Error(String(error));

          // Wait before retrying (unless this was the last attempt)
          if (attempt < MAX_RETRIES) {
            await new Promise((resolve) =>
              setTimeout(resolve, RETRY_DELAYS[attempt])
            );
          }
        }
      }

      // All retries failed
      abortControllersRef.current.delete(abortController);

      if (isMountedRef.current) {
        setPendingEdits((prev) => Math.max(0, prev - 1));
        setIsSyncing(pendingEdits > 1);
        setLastError(lastError);

        if (onError && lastError) {
          onError(lastError, editType);
        }
      }

      // Return error response
      return {
        success: false,
        edit_type: editType,
        detection_id: detectionId || null,
        updated_detection: null,
        elevation_totals: null,
        job_totals: null,
        timestamp: new Date().toISOString(),
        error: lastError?.message || 'Unknown error',
      };
    },
    [jobId, pageId, scaleRatio, dpi, userId, onSuccess, onError, onTotalsUpdated, pendingEdits]
  );

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  const verifyDetection = useCallback(
    (detectionId: string) => syncEdit('verify', detectionId),
    [syncEdit]
  );

  const moveDetection = useCallback(
    (detectionId: string, pixelX: number, pixelY: number) =>
      syncEdit('move', detectionId, { pixel_x: pixelX, pixel_y: pixelY }),
    [syncEdit]
  );

  const resizeDetection = useCallback(
    (detectionId: string, pixelWidth: number, pixelHeight: number) =>
      syncEdit('resize', detectionId, {
        pixel_width: pixelWidth,
        pixel_height: pixelHeight,
      }),
    [syncEdit]
  );

  const moveAndResizeDetection = useCallback(
    (
      detectionId: string,
      pixelX: number,
      pixelY: number,
      pixelWidth: number,
      pixelHeight: number
    ) =>
      syncEdit('resize', detectionId, {
        pixel_x: pixelX,
        pixel_y: pixelY,
        pixel_width: pixelWidth,
        pixel_height: pixelHeight,
      }),
    [syncEdit]
  );

  const deleteDetection = useCallback(
    (detectionId: string) =>
      syncEdit('delete', detectionId, { status: 'deleted' }),
    [syncEdit]
  );

  const reclassifyDetection = useCallback(
    (detectionId: string, newClass: DetectionClass) =>
      syncEdit('reclassify', detectionId, { class: newClass }),
    [syncEdit]
  );

  const createDetection = useCallback(
    (
      pixelX: number,
      pixelY: number,
      pixelWidth: number,
      pixelHeight: number,
      detectionClass: DetectionClass
    ) =>
      syncEdit('create', undefined, {
        pixel_x: pixelX,
        pixel_y: pixelY,
        pixel_width: pixelWidth,
        pixel_height: pixelHeight,
        class: detectionClass,
      }),
    [syncEdit]
  );

  return {
    syncEdit,
    verifyDetection,
    moveDetection,
    resizeDetection,
    moveAndResizeDetection,
    deleteDetection,
    reclassifyDetection,
    createDetection,
    isSyncing,
    pendingEdits,
    lastError,
    clearError,
  };
}

// =============================================================================
// Optimistic Update Helpers
// =============================================================================

export function createOptimisticVerify(
  detection: ExtractionDetection
): ExtractionDetection {
  return {
    ...detection,
    status: 'verified',
    edited_at: new Date().toISOString(),
  };
}

export function createOptimisticMove(
  detection: ExtractionDetection,
  pixelX: number,
  pixelY: number
): ExtractionDetection {
  return {
    ...detection,
    pixel_x: pixelX,
    pixel_y: pixelY,
    status: 'edited',
    edited_at: new Date().toISOString(),
    original_bbox: detection.original_bbox || {
      pixel_x: detection.pixel_x,
      pixel_y: detection.pixel_y,
      pixel_width: detection.pixel_width,
      pixel_height: detection.pixel_height,
    },
  };
}

export function createOptimisticResize(
  detection: ExtractionDetection,
  pixelWidth: number,
  pixelHeight: number
): ExtractionDetection {
  return {
    ...detection,
    pixel_width: pixelWidth,
    pixel_height: pixelHeight,
    status: 'edited',
    edited_at: new Date().toISOString(),
    original_bbox: detection.original_bbox || {
      pixel_x: detection.pixel_x,
      pixel_y: detection.pixel_y,
      pixel_width: detection.pixel_width,
      pixel_height: detection.pixel_height,
    },
  };
}

export function createOptimisticMoveAndResize(
  detection: ExtractionDetection,
  pixelX: number,
  pixelY: number,
  pixelWidth: number,
  pixelHeight: number
): ExtractionDetection {
  return {
    ...detection,
    pixel_x: pixelX,
    pixel_y: pixelY,
    pixel_width: pixelWidth,
    pixel_height: pixelHeight,
    status: 'edited',
    edited_at: new Date().toISOString(),
    original_bbox: detection.original_bbox || {
      pixel_x: detection.pixel_x,
      pixel_y: detection.pixel_y,
      pixel_width: detection.pixel_width,
      pixel_height: detection.pixel_height,
    },
  };
}

export function createOptimisticDelete(
  detection: ExtractionDetection
): ExtractionDetection {
  return {
    ...detection,
    status: 'deleted',
    edited_at: new Date().toISOString(),
  };
}

export function createOptimisticReclassify(
  detection: ExtractionDetection,
  newClass: DetectionClass
): ExtractionDetection {
  return {
    ...detection,
    class: newClass,
    status: 'edited',
    edited_at: new Date().toISOString(),
  };
}

// =============================================================================
// Batch Validation Function (for local-first editing)
// =============================================================================

/**
 * Validates and saves all local detection changes to the database.
 * This is the batch save endpoint for local-first editing mode.
 *
 * @param jobId - The extraction job ID
 * @param detections - All detections from all pages (including deleted ones)
 * @returns ValidationResult with success status and updated totals
 */
export async function validateDetections(
  jobId: string,
  detections: ExtractionDetection[]
): Promise<ValidationResult> {
  try {
    const validationRequest: ValidationRequest = {
      job_id: jobId,
      detections: detections.map((d) => ({
        page_id: d.page_id,
        class: d.class,
        pixel_x: d.pixel_x,
        pixel_y: d.pixel_y,
        pixel_width: d.pixel_width,
        pixel_height: d.pixel_height,
        confidence: d.confidence,
        source_detection_id: d.id,
        is_deleted: d.status === 'deleted',
        detection_index: d.detection_index,
        matched_tag: d.matched_tag,
        // Convert polygon_points to simple format (for polygons with holes, use outer boundary)
        polygon_points: getSimplePolygonPoints(d.polygon_points),
        markup_type: d.markup_type,
        // Include material assignment and notes
        assigned_material_id: d.assigned_material_id ?? null,
        notes: d.notes ?? null,
      })),
    };

    // Log detailed breakdown by page and deletion status
    const pageBreakdown = new Map<string, { total: number; deleted: number }>();
    validationRequest.detections.forEach((d) => {
      const current = pageBreakdown.get(d.page_id) || { total: 0, deleted: 0 };
      current.total++;
      if (d.is_deleted) current.deleted++;
      pageBreakdown.set(d.page_id, current);
    });

    console.log('[validateDetections] Sending validation request:', {
      jobId,
      detectionCount: detections.length,
      deletedCount: validationRequest.detections.filter((d) => d.is_deleted).length,
      endpoint: VALIDATE_ENDPOINT,
    });
    pageBreakdown.forEach((counts, pageId) => {
      console.log(`[validateDetections] Page ${pageId}: ${counts.total} total, ${counts.deleted} deleted`);
    });

    const response = await fetch(VALIDATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validationRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[validateDetections] HTTP error:', response.status, errorText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        timestamp: new Date().toISOString(),
      };
    }

    // Parse response with better error handling
    let result: ValidationResult;
    let responseText: string | undefined;
    try {
      responseText = await response.text();
      result = responseText ? JSON.parse(responseText) : { success: false, error: 'Empty response' };
    } catch (parseError) {
      console.error('[validateDetections] Failed to parse response:', parseError);
      console.error('[validateDetections] Response text:', responseText?.substring(0, 500));
      return {
        success: false,
        error: `Invalid response from server: ${responseText?.substring(0, 100) || 'empty response'}`,
        timestamp: new Date().toISOString(),
      };
    }

    console.log('[validateDetections] Response:', {
      success: result.success,
      updatedCount: result.updated_count,
      deletedCount: result.deleted_count,
      createdCount: result.created_count,
    });

    return {
      ...result,
      timestamp: result.timestamp || new Date().toISOString(),
    };
  } catch (error) {
    console.error('[validateDetections] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}
