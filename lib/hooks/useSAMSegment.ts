'use client';

import { useState, useCallback, useRef } from 'react';
import type { DetectionClass } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

export type SAMDetectionSource = 'replicate_sam' | 'roboflow_sam' | 'extraction_api_sam';

export interface SAMClickPoint {
  x: number;
  y: number;
  label: 0 | 1; // 0 = background (exclude), 1 = foreground (include)
}

export interface SAMSegmentResult {
  id: string;
  polygon_points: Array<{ x: number; y: number }>;
  bounding_box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  mask_url?: string;
  source: SAMDetectionSource;
  /** Class assigned by user after segmentation */
  class?: DetectionClass;
  /** Confidence is always 1.0 for SAM (user-verified) */
  confidence: number;
}

export interface SAMPendingDetection {
  id: string;
  class: DetectionClass;
  confidence: number;
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;
  polygon_points: Array<{ x: number; y: number }>;
  source: 'sam';
}

export interface UseSAMSegmentOptions {
  /** Image URL to segment */
  imageUrl?: string;
  /** Image dimensions for coordinate reference */
  imageWidth?: number;
  imageHeight?: number;
  /** Callback when segmentation completes successfully */
  onSegmentComplete?: (result: SAMSegmentResult) => void;
  /** Callback when user confirms a detection with a class */
  onDetectionConfirmed?: (detection: SAMPendingDetection) => void;
  /** Callback for errors */
  onError?: (error: string) => void;
}

export interface SAMAlternative {
  key: string;
  description: string;
}

export interface UseSAMSegmentReturn {
  /** Whether SAM is currently processing */
  isSegmenting: boolean;
  /** Current segmentation result (before class assignment) */
  currentResult: SAMSegmentResult | null;
  /** Click points accumulated for multi-point segmentation */
  clickPoints: SAMClickPoint[];
  /** Error message if any */
  error: string | null;
  /** Whether SAM is available (API configured) */
  isAvailable: boolean;
  /** Whether the feature is disabled server-side */
  isFeatureDisabled: boolean;
  /** Alternative tools to use when SAM is disabled */
  alternatives: SAMAlternative[];
  /** Trigger segmentation with a click point */
  segment: (clickPoint: { x: number; y: number }) => Promise<void>;
  /** Add a refinement point (include or exclude) */
  addRefinementPoint: (point: SAMClickPoint) => Promise<void>;
  /** Confirm the current result with a class */
  confirmWithClass: (cls: DetectionClass) => void;
  /** Cancel/clear current segmentation */
  cancel: () => void;
  /** Reset all state */
  reset: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useSAMSegment({
  imageUrl,
  imageWidth,
  imageHeight,
  onSegmentComplete,
  onDetectionConfirmed,
  onError,
}: UseSAMSegmentOptions): UseSAMSegmentReturn {
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [currentResult, setCurrentResult] = useState<SAMSegmentResult | null>(null);
  const [clickPoints, setClickPoints] = useState<SAMClickPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(true); // Assume available until proven otherwise
  const [isFeatureDisabled, setIsFeatureDisabled] = useState(false);
  const [alternatives, setAlternatives] = useState<SAMAlternative[]>([]);

  // Abort controller for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Perform SAM segmentation with a single click point
   */
  const segment = useCallback(async (clickPoint: { x: number; y: number }) => {
    if (!imageUrl || !imageWidth || !imageHeight) {
      const errMsg = 'Image URL and dimensions required for SAM segmentation';
      setError(errMsg);
      onError?.(errMsg);
      return;
    }

    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsSegmenting(true);
    setError(null);
    setCurrentResult(null);
    setClickPoints([{ ...clickPoint, label: 1 }]);

    try {
      console.log('[useSAMSegment] Starting segmentation at:', clickPoint);

      const response = await fetch('/api/sam-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          click_point: clickPoint,
          image_width: imageWidth,
          image_height: imageHeight,
        }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Check if SAM feature is disabled server-side
        if (data.feature_disabled) {
          setIsFeatureDisabled(true);
          setIsAvailable(false);
          if (data.alternatives) {
            setAlternatives(data.alternatives);
          }
        } else if (response.status === 503) {
          setIsAvailable(false);
        }
        throw new Error(data.error || 'SAM segmentation failed');
      }

      const result: SAMSegmentResult = {
        id: data.id,
        polygon_points: data.polygon_points || [],
        bounding_box: data.bounding_box,
        mask_url: data.mask_url,
        source: data.source,
        confidence: 1.0, // SAM results are user-verified
      };

      console.log('[useSAMSegment] Segmentation complete:', {
        id: result.id,
        pointCount: result.polygon_points.length,
      });

      setCurrentResult(result);
      onSegmentComplete?.(result);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[useSAMSegment] Request aborted');
        return;
      }

      const errMsg = err instanceof Error ? err.message : 'SAM segmentation failed';
      console.error('[useSAMSegment] Error:', errMsg);
      setError(errMsg);
      onError?.(errMsg);
    } finally {
      setIsSegmenting(false);
    }
  }, [imageUrl, imageWidth, imageHeight, onSegmentComplete, onError]);

  /**
   * Add a refinement point for multi-point segmentation
   * label: 1 = include this area, 0 = exclude this area
   */
  const addRefinementPoint = useCallback(async (point: SAMClickPoint) => {
    if (!imageUrl || !imageWidth || !imageHeight) {
      return;
    }

    // Add to click points
    const newPoints = [...clickPoints, point];
    setClickPoints(newPoints);

    // For now, just re-segment with the new primary point
    // Full multi-point support would send all points to SAM
    // This is a simplified implementation
    if (point.label === 1) {
      await segment({ x: point.x, y: point.y });
    }
  }, [clickPoints, imageUrl, imageWidth, imageHeight, segment]);

  /**
   * Confirm the current segmentation result with a detection class
   */
  const confirmWithClass = useCallback((cls: DetectionClass) => {
    if (!currentResult || !currentResult.polygon_points.length) {
      console.warn('[useSAMSegment] No result to confirm');
      return;
    }

    // Calculate bounding box from polygon if not provided
    const bbox = currentResult.bounding_box || calculateBoundingBox(currentResult.polygon_points);

    const detection: SAMPendingDetection = {
      id: currentResult.id,
      class: cls,
      confidence: 1.0,
      pixel_x: bbox?.x || 0,
      pixel_y: bbox?.y || 0,
      pixel_width: bbox?.width || 0,
      pixel_height: bbox?.height || 0,
      polygon_points: currentResult.polygon_points,
      source: 'sam',
    };

    console.log('[useSAMSegment] Detection confirmed:', {
      id: detection.id,
      class: detection.class,
    });

    onDetectionConfirmed?.(detection);

    // Clear current result after confirmation
    setCurrentResult(null);
    setClickPoints([]);
  }, [currentResult, onDetectionConfirmed]);

  /**
   * Cancel current segmentation
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setCurrentResult(null);
    setClickPoints([]);
    setError(null);
    setIsSegmenting(false);
  }, []);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    cancel();
    setIsAvailable(true);
    setIsFeatureDisabled(false);
    setAlternatives([]);
  }, [cancel]);

  return {
    isSegmenting,
    currentResult,
    clickPoints,
    error,
    isAvailable,
    isFeatureDisabled,
    alternatives,
    segment,
    addRefinementPoint,
    confirmWithClass,
    cancel,
    reset,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function calculateBoundingBox(
  points: Array<{ x: number; y: number }>
): { x: number; y: number; width: number; height: number } | undefined {
  if (!points || points.length === 0) return undefined;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
