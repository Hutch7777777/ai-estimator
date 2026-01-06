// React hook for fetching extraction data with realtime updates

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getFullExtractionContext,
  subscribeToPageDetections,
  subscribeToJobTotals,
  type FullExtractionContext,
} from '@/lib/supabase/extractionQueries';
import type {
  ExtractionJob,
  ExtractionPage,
  ExtractionDetection,
  ExtractionElevationCalcs,
  ExtractionJobTotals,
} from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

export interface UseExtractionDataOptions {
  initialPageId?: string;
  includeDeleted?: boolean;
}

export interface ReviewProgress {
  total: number;
  reviewed: number;
  pending: number;
  percentComplete: number;
}

export interface UseExtractionDataReturn {
  // Data
  job: ExtractionJob | null;
  pages: ExtractionPage[];
  currentPage: ExtractionPage | null;
  currentPageId: string | null;
  currentPageDetections: ExtractionDetection[];
  allCurrentPageDetections: ExtractionDetection[]; // Includes building/exterior_wall for overlay
  detections: Map<string, ExtractionDetection[]>;
  elevationCalcs: Map<string, ExtractionElevationCalcs>;
  currentElevationCalcs: ExtractionElevationCalcs | null;
  jobTotals: ExtractionJobTotals | null;

  // State
  loading: boolean;
  error: Error | null;

  // Computed
  reviewProgress: ReviewProgress;

  // Actions
  setCurrentPageId: (id: string) => void;
  refresh: () => Promise<void>;

  // Optimistic update helpers
  updateDetectionLocally: (detection: ExtractionDetection) => void;
  removeDetectionLocally: (detectionId: string) => void;
  addDetectionLocally: (detection: ExtractionDetection) => void;
  updateJobTotalsLocally: (totals: ExtractionJobTotals) => void;
  updateElevationCalcsLocally: (pageId: string, calcs: ExtractionElevationCalcs) => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useExtractionData(
  jobId: string,
  options: UseExtractionDataOptions = {}
): UseExtractionDataReturn {
  const { initialPageId, includeDeleted = false } = options;

  // Core data state
  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [pages, setPages] = useState<ExtractionPage[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(initialPageId || null);
  const [detections, setDetections] = useState<Map<string, ExtractionDetection[]>>(new Map());
  const [elevationCalcs, setElevationCalcs] = useState<Map<string, ExtractionElevationCalcs>>(new Map());
  const [jobTotals, setJobTotals] = useState<ExtractionJobTotals | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Subscription refs for cleanup
  const pageSubscriptionRef = useRef<(() => void) | null>(null);
  const totalsSubscriptionRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const hasCompletedRef = useRef(false);
  const isFetchingRef = useRef(false);

  // Loading timeout to prevent infinite loading (10 seconds)
  const LOADING_TIMEOUT_MS = 10000;

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  const fetchData = useCallback(async () => {
    console.log('[useExtractionData] fetchData called with jobId:', jobId);

    // Prevent duplicate fetches
    if (isFetchingRef.current) {
      console.log('[useExtractionData] Already fetching, skipping duplicate call');
      return;
    }

    if (!jobId) {
      console.log('[useExtractionData] No jobId provided, setting error');
      setError(new Error('No job ID provided'));
      setLoading(false);
      return;
    }

    console.log('[useExtractionData] Setting loading=true');
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      console.log('[useExtractionData] Calling getFullExtractionContext...');
      const context: FullExtractionContext = await getFullExtractionContext(jobId);
      console.log('[useExtractionData] getFullExtractionContext returned:', {
        hasJob: !!context.job,
        pagesCount: context.pages.length,
        detectionsCount: context.detectionsByPage.size,
        hasJobTotals: !!context.jobTotals,
      });

      if (!isMountedRef.current) {
        console.log('[useExtractionData] Component unmounted during fetch, aborting');
        return;
      }

      if (!context.job) {
        console.log('[useExtractionData] No job found in context, setting error');
        setError(new Error('Extraction job not found'));
        setLoading(false);
        return;
      }

      console.log('[useExtractionData] Setting state with fetched data');
      setJob(context.job);
      setPages(context.pages);
      setDetections(context.detectionsByPage);
      setElevationCalcs(context.elevationCalcsByPage);
      setJobTotals(context.jobTotals);

      // Auto-select first elevation page if no initial page specified
      if (!initialPageId && context.pages.length > 0) {
        const firstElevation = context.pages.find((p) => p.page_type === 'elevation');
        const firstPage = firstElevation || context.pages[0];
        console.log('[useExtractionData] Auto-selecting page:', firstPage.id);
        setCurrentPageId(firstPage.id);
      }

      console.log('[useExtractionData] Data fetch complete, setting loading=false');
      hasCompletedRef.current = true;
    } catch (err) {
      if (!isMountedRef.current) {
        console.log('[useExtractionData] Component unmounted during error handling');
        return;
      }
      console.error('[useExtractionData] Error fetching extraction data:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch extraction data'));
      hasCompletedRef.current = true;
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        console.log('[useExtractionData] Finally block: setting loading=false');
        setLoading(false);
      }
    }
  }, [jobId, initialPageId]);

  // Global loading timeout to prevent infinite loading
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!hasCompletedRef.current && loading) {
        console.warn('[useExtractionData] Loading timeout reached after', LOADING_TIMEOUT_MS, 'ms');
        hasCompletedRef.current = true;
        setLoading(false);
        setError(new Error('Loading timeout - extraction data may be unavailable'));
      }
    }, LOADING_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, []); // Only run once on mount

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    console.log('[useExtractionData] Initial fetch effect running');
    fetchData();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchData]);

  // ==========================================================================
  // Realtime Subscriptions
  // ==========================================================================

  // Subscribe to page detections when currentPageId changes
  useEffect(() => {
    // Cleanup previous subscription
    if (pageSubscriptionRef.current) {
      pageSubscriptionRef.current();
      pageSubscriptionRef.current = null;
    }

    if (!currentPageId) return;

    const unsubscribe = subscribeToPageDetections(currentPageId, {
      onInsert: (detection) => {
        if (!isMountedRef.current) return;
        setDetections((prev) => {
          const newMap = new Map(prev);
          const pageDetections = [...(newMap.get(detection.page_id) || []), detection];
          pageDetections.sort((a, b) => a.detection_index - b.detection_index);
          newMap.set(detection.page_id, pageDetections);
          return newMap;
        });
      },
      onUpdate: (detection) => {
        if (!isMountedRef.current) return;
        setDetections((prev) => {
          const newMap = new Map(prev);
          const pageDetections = newMap.get(detection.page_id) || [];
          const index = pageDetections.findIndex((d) => d.id === detection.id);
          if (index >= 0) {
            pageDetections[index] = detection;
            newMap.set(detection.page_id, [...pageDetections]);
          }
          return newMap;
        });
      },
      onDelete: (detection) => {
        if (!isMountedRef.current) return;
        setDetections((prev) => {
          const newMap = new Map(prev);
          const pageDetections = newMap.get(detection.page_id) || [];
          newMap.set(
            detection.page_id,
            pageDetections.filter((d) => d.id !== detection.id)
          );
          return newMap;
        });
      },
    });

    pageSubscriptionRef.current = unsubscribe;

    return () => {
      if (pageSubscriptionRef.current) {
        pageSubscriptionRef.current();
        pageSubscriptionRef.current = null;
      }
    };
  }, [currentPageId]);

  // Subscribe to job totals
  useEffect(() => {
    // Cleanup previous subscription
    if (totalsSubscriptionRef.current) {
      totalsSubscriptionRef.current();
      totalsSubscriptionRef.current = null;
    }

    if (!jobId) return;

    const unsubscribe = subscribeToJobTotals(jobId, (totals) => {
      if (!isMountedRef.current) return;
      setJobTotals(totals);
    });

    totalsSubscriptionRef.current = unsubscribe;

    return () => {
      if (totalsSubscriptionRef.current) {
        totalsSubscriptionRef.current();
        totalsSubscriptionRef.current = null;
      }
    };
  }, [jobId]);

  // ==========================================================================
  // Derived Values
  // ==========================================================================

  const currentPage = useMemo(() => {
    if (!currentPageId) return null;
    return pages.find((p) => p.id === currentPageId) || null;
  }, [pages, currentPageId]);

  const currentPageDetections = useMemo(() => {
    if (!currentPageId) return [];

    const pageDetections = detections.get(currentPageId) || [];

    // Filter out deleted unless includeDeleted is true
    // Also filter out 'exterior_wall' and 'building' - these are used for calculations
    // behind the scenes but don't need to be shown in the editor UI
    const filtered = pageDetections.filter((d) => {
      if (d.class === 'exterior_wall' || d.class === 'building') return false;
      if (!includeDeleted && d.status === 'deleted') return false;
      return true;
    });

    // Sort by detection_index
    return [...filtered].sort((a, b) => a.detection_index - b.detection_index);
  }, [detections, currentPageId, includeDeleted]);

  // All detections including building/exterior_wall - needed for overlay calculations
  const allCurrentPageDetections = useMemo(() => {
    if (!currentPageId) return [];

    const pageDetections = detections.get(currentPageId) || [];

    // Filter out deleted unless includeDeleted is true
    // BUT keep exterior_wall and building for overlay/summary calculations
    const filtered = pageDetections.filter((d) => {
      if (!includeDeleted && d.status === 'deleted') return false;
      return true;
    });

    // Sort by detection_index
    return [...filtered].sort((a, b) => a.detection_index - b.detection_index);
  }, [detections, currentPageId, includeDeleted]);

  const currentElevationCalcs = useMemo(() => {
    if (!currentPageId) return null;
    return elevationCalcs.get(currentPageId) || null;
  }, [elevationCalcs, currentPageId]);

  const reviewProgress = useMemo((): ReviewProgress => {
    let total = 0;
    let pending = 0;

    detections.forEach((pageDetections) => {
      for (const detection of pageDetections) {
        // Skip exterior_wall and building detections (hidden from UI, used for backend calculations)
        if (detection.class === 'exterior_wall' || detection.class === 'building') continue;
        if (detection.status !== 'deleted') {
          total++;
          if (detection.status === 'auto') {
            pending++;
          }
        }
      }
    });

    const reviewed = total - pending;
    const percentComplete = total > 0 ? Math.round((reviewed / total) * 100) : 0;

    return { total, reviewed, pending, percentComplete };
  }, [detections]);

  // ==========================================================================
  // Actions
  // ==========================================================================

  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // ==========================================================================
  // Optimistic Update Helpers
  // ==========================================================================

  const updateDetectionLocally = useCallback((detection: ExtractionDetection) => {
    setDetections((prev) => {
      const newMap = new Map(prev);
      const pageDetections = newMap.get(detection.page_id) || [];
      const index = pageDetections.findIndex((d) => d.id === detection.id);

      if (index >= 0) {
        const updated = [...pageDetections];
        updated[index] = detection;
        newMap.set(detection.page_id, updated);
      }

      return newMap;
    });
  }, []);

  const removeDetectionLocally = useCallback((detectionId: string) => {
    setDetections((prev) => {
      const newMap = new Map(prev);

      // Find and remove from the correct page
      newMap.forEach((pageDetections, pageId) => {
        const index = pageDetections.findIndex((d) => d.id === detectionId);
        if (index >= 0) {
          newMap.set(
            pageId,
            pageDetections.filter((d) => d.id !== detectionId)
          );
        }
      });

      return newMap;
    });
  }, []);

  const addDetectionLocally = useCallback((detection: ExtractionDetection) => {
    setDetections((prev) => {
      const newMap = new Map(prev);
      const pageDetections = [...(newMap.get(detection.page_id) || []), detection];
      pageDetections.sort((a, b) => a.detection_index - b.detection_index);
      newMap.set(detection.page_id, pageDetections);
      return newMap;
    });
  }, []);

  const updateJobTotalsLocally = useCallback((totals: ExtractionJobTotals) => {
    setJobTotals(totals);
  }, []);

  const updateElevationCalcsLocally = useCallback(
    (pageId: string, calcs: ExtractionElevationCalcs) => {
      setElevationCalcs((prev) => {
        const newMap = new Map(prev);
        newMap.set(pageId, calcs);
        return newMap;
      });
    },
    []
  );

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    // Data
    job,
    pages,
    currentPage,
    currentPageId,
    currentPageDetections,
    allCurrentPageDetections,
    detections,
    elevationCalcs,
    currentElevationCalcs,
    jobTotals,

    // State
    loading,
    error,

    // Computed
    reviewProgress,

    // Actions
    setCurrentPageId,
    refresh,

    // Optimistic update helpers
    updateDetectionLocally,
    removeDetectionLocally,
    addDetectionLocally,
    updateJobTotalsLocally,
    updateElevationCalcsLocally,
  };
}
