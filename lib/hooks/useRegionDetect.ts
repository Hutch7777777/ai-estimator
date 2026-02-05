import { useState, useCallback } from 'react';
import type { DetectionClass } from '@/lib/types/extraction';

// =============================================================================
// useRegionDetect Hook
// Handles region-based Roboflow detection on selected canvas areas
// =============================================================================

/** Detection source for tracking where suggestions came from */
export type DetectionSource = 'claude' | 'roboflow_region' | 'roboflow_full' | 'sam';

/** Region coordinates in pixel space */
export interface DetectionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pending detection from region detection */
export interface RegionDetectionResult {
  id: string;
  class: DetectionClass;
  confidence: number;
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;
  polygon_points?: Array<{ x: number; y: number }>;
  source: DetectionSource;
}

export interface UseRegionDetectOptions {
  /** Page ID for the current page */
  pageId: string | undefined;
  /** Image URL for the current page */
  imageUrl: string | undefined;
  /** Confidence threshold for filtering detections */
  confidenceThreshold?: number;
  /** Callback when detections are found */
  onDetectionsFound?: (detections: RegionDetectionResult[]) => void;
  /** Callback when detection fails */
  onError?: (error: string) => void;
}

export interface UseRegionDetectReturn {
  /** Whether detection is currently in progress */
  isDetecting: boolean;
  /** Error message if detection failed */
  error: string | null;
  /** Last region that was selected */
  lastRegion: DetectionRegion | null;
  /** Trigger detection on a region */
  detectRegion: (region: DetectionRegion) => Promise<RegionDetectionResult[]>;
  /** Reset state */
  reset: () => void;
}

export function useRegionDetect({
  pageId,
  imageUrl,
  confidenceThreshold = 0.3,
  onDetectionsFound,
  onError,
}: UseRegionDetectOptions): UseRegionDetectReturn {
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRegion, setLastRegion] = useState<DetectionRegion | null>(null);

  const detectRegion = useCallback(
    async (region: DetectionRegion): Promise<RegionDetectionResult[]> => {
      if (!pageId || !imageUrl) {
        const errMsg = 'Page ID and image URL are required';
        setError(errMsg);
        onError?.(errMsg);
        return [];
      }

      // Validate region size
      if (region.width < 50 || region.height < 50) {
        const errMsg = 'Selection too small. Please draw a larger region (minimum 50x50 pixels).';
        setError(errMsg);
        onError?.(errMsg);
        return [];
      }

      setIsDetecting(true);
      setError(null);
      setLastRegion(region);

      try {
        const response = await fetch('/api/detect-region', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            page_id: pageId,
            image_url: imageUrl,
            region,
            confidence_threshold: confidenceThreshold,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          const errMsg = data.error || 'Detection failed';
          setError(errMsg);
          onError?.(errMsg);
          return [];
        }

        // Map detections with source tag
        const detectionsWithSource: RegionDetectionResult[] = (data.detections || []).map(
          (det: Omit<RegionDetectionResult, 'source'>) => ({
            ...det,
            source: 'roboflow_region' as DetectionSource,
          })
        );

        console.log('[useRegionDetect] Found', detectionsWithSource.length, 'detections in region');

        // Call callback if provided
        onDetectionsFound?.(detectionsWithSource);

        return detectionsWithSource;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Detection failed';
        setError(errMsg);
        onError?.(errMsg);
        return [];
      } finally {
        setIsDetecting(false);
      }
    },
    [pageId, imageUrl, confidenceThreshold, onDetectionsFound, onError]
  );

  const reset = useCallback(() => {
    setIsDetecting(false);
    setError(null);
    setLastRegion(null);
  }, []);

  return {
    isDetecting,
    error,
    lastRegion,
    detectRegion,
    reset,
  };
}
