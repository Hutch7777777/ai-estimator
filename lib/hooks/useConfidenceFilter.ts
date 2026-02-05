'use client';

import { useState, useMemo, useCallback } from 'react';
import type { ExtractionDetection } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

export interface UseConfidenceFilterOptions {
  /** Initial minimum confidence threshold (0-1). Default: 0 */
  initialMinConfidence?: number;
  /** Initial show low confidence setting. Default: true */
  initialShowLowConfidence?: boolean;
}

export interface UseConfidenceFilterResult {
  /** Current minimum confidence threshold (0-1) */
  minConfidence: number;
  /** Set minimum confidence threshold */
  setMinConfidence: (value: number) => void;
  /** Whether to show low confidence detections (dimmed) */
  showLowConfidence: boolean;
  /** Set show low confidence toggle */
  setShowLowConfidence: (show: boolean) => void;
  /** Filter detections based on current settings */
  filterDetections: (detections: ExtractionDetection[]) => {
    visible: ExtractionDetection[];
    dimmed: ExtractionDetection[];
    hidden: ExtractionDetection[];
  };
  /** Get confidence level for a detection ('high' | 'low' | 'hidden') */
  getConfidenceLevel: (detection: ExtractionDetection) => 'high' | 'low' | 'hidden';
  /** Check if a detection passes the confidence filter */
  passesFilter: (detection: ExtractionDetection) => boolean;
  /** Reset filter to defaults */
  resetFilter: () => void;
  /** Whether the filter is currently active (threshold > 0) */
  isActive: boolean;
}

// =============================================================================
// Hook
// =============================================================================

export function useConfidenceFilter(
  options: UseConfidenceFilterOptions = {}
): UseConfidenceFilterResult {
  const {
    initialMinConfidence = 0,
    initialShowLowConfidence = true,
  } = options;

  const [minConfidence, setMinConfidence] = useState(initialMinConfidence);
  const [showLowConfidence, setShowLowConfidence] = useState(initialShowLowConfidence);

  // Check if filter is active
  const isActive = minConfidence > 0;

  // Get the confidence value from a detection (defaults to 1 if not set)
  const getDetectionConfidence = useCallback((detection: ExtractionDetection): number => {
    // confidence can be stored at top level or in metadata
    if (typeof detection.confidence === 'number') {
      return detection.confidence;
    }
    // Default to 1.0 (high confidence) for legacy detections without confidence
    return 1.0;
  }, []);

  // Get confidence level for styling
  const getConfidenceLevel = useCallback(
    (detection: ExtractionDetection): 'high' | 'low' | 'hidden' => {
      const confidence = getDetectionConfidence(detection);

      if (confidence >= minConfidence) {
        return 'high';
      }

      if (showLowConfidence) {
        return 'low';
      }

      return 'hidden';
    },
    [minConfidence, showLowConfidence, getDetectionConfidence]
  );

  // Check if a detection passes the confidence filter
  const passesFilter = useCallback(
    (detection: ExtractionDetection): boolean => {
      const confidence = getDetectionConfidence(detection);
      return confidence >= minConfidence;
    },
    [minConfidence, getDetectionConfidence]
  );

  // Filter detections into visible, dimmed, and hidden categories
  const filterDetections = useCallback(
    (detections: ExtractionDetection[]) => {
      const visible: ExtractionDetection[] = [];
      const dimmed: ExtractionDetection[] = [];
      const hidden: ExtractionDetection[] = [];

      for (const detection of detections) {
        const level = getConfidenceLevel(detection);

        switch (level) {
          case 'high':
            visible.push(detection);
            break;
          case 'low':
            dimmed.push(detection);
            break;
          case 'hidden':
            hidden.push(detection);
            break;
        }
      }

      return { visible, dimmed, hidden };
    },
    [getConfidenceLevel]
  );

  // Reset filter to defaults
  const resetFilter = useCallback(() => {
    setMinConfidence(initialMinConfidence);
    setShowLowConfidence(initialShowLowConfidence);
  }, [initialMinConfidence, initialShowLowConfidence]);

  return {
    minConfidence,
    setMinConfidence,
    showLowConfidence,
    setShowLowConfidence,
    filterDetections,
    getConfidenceLevel,
    passesFilter,
    resetFilter,
    isActive,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get opacity value based on confidence level
 * Used for rendering detections with appropriate visibility
 */
export function getConfidenceOpacity(level: 'high' | 'low' | 'hidden'): number {
  switch (level) {
    case 'high':
      return 1.0;
    case 'low':
      return 0.3;
    case 'hidden':
      return 0;
  }
}

/**
 * Get stroke dash pattern based on confidence level
 * Low confidence detections get dashed outlines
 */
export function getConfidenceStrokeDash(level: 'high' | 'low' | 'hidden'): number[] | undefined {
  switch (level) {
    case 'high':
      return undefined; // Solid line
    case 'low':
      return [5, 5]; // Dashed line
    case 'hidden':
      return undefined;
  }
}

/**
 * Format confidence as a percentage string
 */
export function formatConfidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
