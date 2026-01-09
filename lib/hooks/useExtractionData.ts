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
  AllDetectionClasses,
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

  // Local-first editing state
  hasUnsavedChanges: boolean;
  canUndo: boolean;
  canRedo: boolean;
  editingModeRef: React.MutableRefObject<boolean>;

  // Actions
  setCurrentPageId: (id: string) => void;
  refresh: () => Promise<void>;

  // Optimistic update helpers
  updateDetectionLocally: (detection: ExtractionDetection) => void;
  removeDetectionLocally: (detectionId: string) => void;
  addDetectionLocally: (detection: ExtractionDetection) => void;
  updateJobTotalsLocally: (totals: ExtractionJobTotals) => void;
  updateElevationCalcsLocally: (pageId: string, calcs: ExtractionElevationCalcs) => void;

  // Local-first editing actions
  undo: () => void;
  redo: () => void;
  resetToSaved: () => Promise<void>;
  clearUnsavedChanges: () => void;
  restoreDrafts: (drafts: Map<string, ExtractionDetection[]>) => void;
  getAllDetections: () => ExtractionDetection[];

  // Realtime conflict prevention (deprecated - use editingModeRef instead)
  markAsRecentlyEdited: (detectionId: string) => void;
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

  // Local-first editing state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [undoStack, setUndoStack] = useState<Map<string, ExtractionDetection[]>[]>([]);
  const [redoStack, setRedoStack] = useState<Map<string, ExtractionDetection[]>[]>([]);
  const editingModeRef = useRef(false);
  const MAX_UNDO_STACK_SIZE = 50;
  const LOCALSTORAGE_KEY_PREFIX = 'detection-drafts-';
  const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

  // Subscription refs for cleanup
  const pageSubscriptionRef = useRef<(() => void) | null>(null);
  const totalsSubscriptionRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const hasCompletedRef = useRef(false);
  const isFetchingRef = useRef(false);

  // Track recently edited detections to prevent realtime overwrites
  // Map<detectionId, expirationTimestamp>
  const recentlyEditedRef = useRef<Map<string, number>>(new Map());
  const RECENTLY_EDITED_TTL_MS = 5000; // 5 seconds

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
  // Recently Edited Tracking (prevents realtime overwrites of optimistic updates)
  // ==========================================================================

  const markAsRecentlyEdited = useCallback((detectionId: string) => {
    const expiresAt = Date.now() + RECENTLY_EDITED_TTL_MS;
    recentlyEditedRef.current.set(detectionId, expiresAt);
    console.log('[useExtractionData] Marked detection as recently edited:', detectionId, 'expires:', new Date(expiresAt).toISOString());

    // Auto-cleanup after TTL
    setTimeout(() => {
      const currentExpiry = recentlyEditedRef.current.get(detectionId);
      if (currentExpiry && currentExpiry <= Date.now()) {
        recentlyEditedRef.current.delete(detectionId);
        console.log('[useExtractionData] Cleared recently edited flag for:', detectionId);
      }
    }, RECENTLY_EDITED_TTL_MS + 100);
  }, []);

  const isRecentlyEdited = useCallback((detectionId: string): boolean => {
    const expiresAt = recentlyEditedRef.current.get(detectionId);
    if (!expiresAt) return false;

    if (Date.now() < expiresAt) {
      return true;
    }

    // Expired, clean up
    recentlyEditedRef.current.delete(detectionId);
    return false;
  }, []);

  // ==========================================================================
  // Undo/Redo System
  // ==========================================================================

  // Deep clone the detections map for undo/redo stack
  const cloneDetectionsMap = useCallback((map: Map<string, ExtractionDetection[]>): Map<string, ExtractionDetection[]> => {
    const cloned = new Map<string, ExtractionDetection[]>();
    map.forEach((detections, pageId) => {
      cloned.set(pageId, detections.map(d => ({ ...d })));
    });
    return cloned;
  }, []);

  // Push current state to undo stack before making changes
  const pushToUndoStack = useCallback(() => {
    setUndoStack(prev => {
      const cloned = cloneDetectionsMap(detections);
      const newStack = [...prev, cloned];
      // Limit stack size
      if (newStack.length > MAX_UNDO_STACK_SIZE) {
        return newStack.slice(newStack.length - MAX_UNDO_STACK_SIZE);
      }
      return newStack;
    });
    // Clear redo stack when new action is performed
    setRedoStack([]);
  }, [detections, cloneDetectionsMap]);

  // Undo: restore previous state
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;

    setUndoStack(prev => {
      const newStack = [...prev];
      const previousState = newStack.pop();

      if (previousState) {
        // Push current state to redo stack
        setRedoStack(redoPrev => [...redoPrev, cloneDetectionsMap(detections)]);
        // Restore previous state
        setDetections(previousState);
      }

      return newStack;
    });

    // If undo stack will be empty, we're back to saved state
    if (undoStack.length === 1) {
      setHasUnsavedChanges(false);
      editingModeRef.current = false;
    }
  }, [undoStack, detections, cloneDetectionsMap]);

  // Redo: restore next state
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;

    setRedoStack(prev => {
      const newStack = [...prev];
      const nextState = newStack.pop();

      if (nextState) {
        // Push current state to undo stack
        setUndoStack(undoPrev => [...undoPrev, cloneDetectionsMap(detections)]);
        // Restore next state
        setDetections(nextState);
        // Re-enable unsaved changes flag
        setHasUnsavedChanges(true);
        editingModeRef.current = true;
      }

      return newStack;
    });
  }, [redoStack, detections, cloneDetectionsMap]);

  // Clear unsaved changes (called after successful validation)
  const clearUnsavedChanges = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
    setHasUnsavedChanges(false);
    editingModeRef.current = false;
    // Clear localStorage backup
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`${LOCALSTORAGE_KEY_PREFIX}${jobId}`);
    }
    console.log('[useExtractionData] Cleared unsaved changes and localStorage backup');
  }, [jobId]);

  // Reset to saved state (discard all local changes)
  const resetToSaved = useCallback(async () => {
    // Clear undo/redo stacks
    setUndoStack([]);
    setRedoStack([]);
    setHasUnsavedChanges(false);
    editingModeRef.current = false;
    // Clear localStorage backup
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`${LOCALSTORAGE_KEY_PREFIX}${jobId}`);
    }
    // Re-fetch from database
    await fetchData();
    console.log('[useExtractionData] Reset to saved state');
  }, [jobId, fetchData]);

  // Restore drafts from localStorage
  const restoreDrafts = useCallback((drafts: Map<string, ExtractionDetection[]>) => {
    setDetections(drafts);
    setHasUnsavedChanges(true);
    editingModeRef.current = true;
    console.log('[useExtractionData] Restored drafts from localStorage');
  }, []);

  // Get all detections from all pages (for validation submission)
  const getAllDetections = useCallback((): ExtractionDetection[] => {
    const allDetections: ExtractionDetection[] = [];
    detections.forEach((pageDetections) => {
      allDetections.push(...pageDetections);
    });
    return allDetections;
  }, [detections]);

  // Computed undo/redo availability
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // ==========================================================================
  // localStorage Auto-Save
  // ==========================================================================

  // Auto-save drafts to localStorage every 30 seconds when there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges || typeof window === 'undefined') return;

    const saveToLocalStorage = () => {
      try {
        // Convert Map to array for JSON serialization
        const detectionsArray: [string, ExtractionDetection[]][] = [];
        detections.forEach((pageDetections, pageId) => {
          detectionsArray.push([pageId, pageDetections]);
        });

        const draftData = {
          timestamp: Date.now(),
          jobId,
          detections: detectionsArray,
        };

        localStorage.setItem(`${LOCALSTORAGE_KEY_PREFIX}${jobId}`, JSON.stringify(draftData));
        console.log('[useExtractionData] Auto-saved drafts to localStorage');
      } catch (err) {
        console.error('[useExtractionData] Failed to save drafts to localStorage:', err);
      }
    };

    // Save immediately on first change
    saveToLocalStorage();

    // Then save every 30 seconds
    const intervalId = setInterval(saveToLocalStorage, AUTO_SAVE_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [hasUnsavedChanges, detections, jobId]);

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

    const unsubscribe = subscribeToPageDetections(
      currentPageId,
      {
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

          // Skip realtime updates for recently edited detections to preserve optimistic updates
          if (isRecentlyEdited(detection.id)) {
            console.log('[useExtractionData] Skipping realtime update for recently edited detection:', detection.id);
            return;
          }

          console.log('[useExtractionData] Applying realtime update for detection:', detection.id);
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
      },
      // Pass editingModeRef to skip realtime updates during local editing
      { editingModeRef }
    );

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
      const cls = d.class as AllDetectionClasses;
      if (cls === 'exterior_wall' || cls === 'building') return false;
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
        const cls = detection.class as AllDetectionClasses;
        if (cls === 'exterior_wall' || cls === 'building') continue;
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
  // Optimistic Update Helpers (with undo support)
  // ==========================================================================

  const updateDetectionLocally = useCallback((detection: ExtractionDetection) => {
    // Push current state to undo stack BEFORE making changes
    pushToUndoStack();

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

    // Enable editing mode and mark as unsaved
    setHasUnsavedChanges(true);
    editingModeRef.current = true;
  }, [pushToUndoStack]);

  const removeDetectionLocally = useCallback((detectionId: string) => {
    // Push current state to undo stack BEFORE making changes
    pushToUndoStack();

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

    // Enable editing mode and mark as unsaved
    setHasUnsavedChanges(true);
    editingModeRef.current = true;
  }, [pushToUndoStack]);

  const addDetectionLocally = useCallback((detection: ExtractionDetection) => {
    // Push current state to undo stack BEFORE making changes
    pushToUndoStack();

    setDetections((prev) => {
      const newMap = new Map(prev);
      const pageDetections = [...(newMap.get(detection.page_id) || []), detection];
      pageDetections.sort((a, b) => a.detection_index - b.detection_index);
      newMap.set(detection.page_id, pageDetections);
      return newMap;
    });

    // Enable editing mode and mark as unsaved
    setHasUnsavedChanges(true);
    editingModeRef.current = true;
  }, [pushToUndoStack]);

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

    // Local-first editing state
    hasUnsavedChanges,
    canUndo,
    canRedo,
    editingModeRef,

    // Actions
    setCurrentPageId,
    refresh,

    // Optimistic update helpers
    updateDetectionLocally,
    removeDetectionLocally,
    addDetectionLocally,
    updateJobTotalsLocally,
    updateElevationCalcsLocally,

    // Local-first editing actions
    undo,
    redo,
    resetToSaved,
    clearUnsavedChanges,
    restoreDrafts,
    getAllDetections,

    // Realtime conflict prevention (deprecated - use editingModeRef instead)
    markAsRecentlyEdited,
  };
}
