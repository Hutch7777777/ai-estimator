// Extraction System Data Access Functions
// Using direct fetch instead of Supabase client to bypass client issues

import type React from 'react';
import { createClient } from '@supabase/supabase-js';
import type {
  ExtractionJob,
  ExtractionPage,
  ExtractionDetection,
  ExtractionElevationCalcs,
  ExtractionJobTotals,
  DetectionClass,
  DetectionStatus,
} from '@/lib/types/extraction';

// =============================================================================
// Draft Detection Type (for extraction_detections_draft table)
// =============================================================================

interface DraftDetection extends Omit<ExtractionDetection, 'status'> {
  is_deleted: boolean;
  status?: DetectionStatus;
}

/**
 * Maps a draft detection record to the standard ExtractionDetection format
 */
function mapDraftToDetection(draft: DraftDetection): ExtractionDetection {
  return {
    ...draft,
    status: draft.is_deleted ? 'deleted' : (draft.status || 'auto'),
  } as ExtractionDetection;
}

// =============================================================================
// Direct Fetch API (bypasses Supabase client)
// =============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function directFetch<T>(endpoint: string): Promise<T | null> {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  console.log('[directFetch] Fetching:', url);

  try {
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[directFetch] Error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('[directFetch] Success, rows:', Array.isArray(data) ? data.length : 1);
    return data;
  } catch (error) {
    console.error('[directFetch] Exception:', error);
    return null;
  }
}

// Keep Supabase client for realtime subscriptions only
let _extractionClient: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_extractionClient) {
    _extractionClient = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _extractionClient;
}

// =============================================================================
// Jobs
// =============================================================================

export async function getExtractionJob(jobId: string): Promise<ExtractionJob | null> {
  console.log('[getExtractionJob] Using direct fetch for:', jobId);
  const data = await directFetch<ExtractionJob[]>(
    `extraction_jobs?id=eq.${jobId}&select=*`
  );
  return data?.[0] || null;
}

export async function getProjectExtractionJobs(projectId: string): Promise<ExtractionJob[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('extraction_jobs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching project extraction jobs:', error);
    return [];
  }

  return (data as ExtractionJob[]) || [];
}

// =============================================================================
// Pages
// =============================================================================

export async function getExtractionPages(jobId: string): Promise<ExtractionPage[]> {
  console.log('[getExtractionPages] Using direct fetch for job:', jobId);
  const data = await directFetch<ExtractionPage[]>(
    `extraction_pages?job_id=eq.${jobId}&select=*&order=page_number.asc`
  );
  return data || [];
}

export async function getExtractionPage(pageId: string): Promise<ExtractionPage | null> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('extraction_pages')
    .select('*')
    .eq('id', pageId)
    .single();

  if (error) {
    console.error('Error fetching extraction page:', error);
    return null;
  }

  return data as ExtractionPage;
}

export async function getElevationPages(jobId: string): Promise<ExtractionPage[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('extraction_pages')
    .select('*')
    .eq('job_id', jobId)
    .eq('page_type', 'elevation')
    .order('page_number', { ascending: true });

  if (error) {
    console.error('Error fetching elevation pages:', error);
    return [];
  }

  return (data as ExtractionPage[]) || [];
}

// =============================================================================
// Detections
// =============================================================================

export async function getPageDetections(
  pageId: string,
  includeDeleted = false
): Promise<ExtractionDetection[]> {
  const supabase = getClient();

  // First, check if drafts exist for this page in extraction_detections_draft
  let draftQuery = supabase
    .from('extraction_detections_draft')
    .select('*')
    .eq('page_id', pageId)
    .order('detection_index', { ascending: true });

  if (!includeDeleted) {
    draftQuery = draftQuery.eq('is_deleted', false);
  }

  const { data: drafts, error: draftError } = await draftQuery;

  if (draftError) {
    console.error('Error fetching draft detections:', draftError);
  }

  // If drafts exist, use them
  if (drafts && drafts.length > 0) {
    console.log(`[getPageDetections] Found ${drafts.length} drafts for page ${pageId}`);
    return (drafts as unknown as DraftDetection[]).map(mapDraftToDetection);
  }

  // No drafts - fall back to original detections
  console.log(`[getPageDetections] No drafts found for page ${pageId}, loading originals`);
  let query = supabase
    .from('extraction_detection_details')
    .select('*')
    .eq('page_id', pageId)
    .order('detection_index', { ascending: true });

  if (!includeDeleted) {
    query = query.neq('status', 'deleted');
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching page detections:', error);
    return [];
  }

  return (data as ExtractionDetection[]) || [];
}

export async function getJobDetections(
  jobId: string,
  includeDeleted = false
): Promise<ExtractionDetection[]> {
  console.log('[getJobDetections] Checking for drafts first for job:', jobId);

  // First, check if drafts exist in extraction_detections_draft
  const deletedFilter = includeDeleted ? '' : '&is_deleted=eq.false';
  const drafts = await directFetch<DraftDetection[]>(
    `extraction_detections_draft?job_id=eq.${jobId}&select=*${deletedFilter}`
  );

  // If drafts exist, use them (user has made edits)
  if (drafts && drafts.length > 0) {
    console.log(`[getJobDetections] Found ${drafts.length} drafts, using draft data`);
    // Map draft fields to detection format (is_deleted -> status='deleted')
    return drafts.map(mapDraftToDetection);
  }

  // No drafts found - fall back to original AI detections
  console.log('[getJobDetections] No drafts found, loading original detections');
  const statusFilter = includeDeleted ? '' : '&status=neq.deleted';
  const data = await directFetch<ExtractionDetection[]>(
    `extraction_detection_details?job_id=eq.${jobId}&select=*${statusFilter}`
  );
  return data || [];
}

export async function getDetectionsByClass(
  pageId: string,
  detectionClass: DetectionClass
): Promise<ExtractionDetection[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('extraction_detection_details')
    .select('*')
    .eq('page_id', pageId)
    .eq('class', detectionClass)
    .neq('status', 'deleted')
    .order('detection_index', { ascending: true });

  if (error) {
    console.error('Error fetching detections by class:', error);
    return [];
  }

  return (data as ExtractionDetection[]) || [];
}

export async function getLowConfidenceDetections(
  jobId: string,
  threshold = 0.7
): Promise<ExtractionDetection[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('extraction_detection_details')
    .select('*')
    .eq('job_id', jobId)
    .lt('confidence', threshold)
    .neq('status', 'deleted')
    .order('confidence', { ascending: true });

  if (error) {
    console.error('Error fetching low confidence detections:', error);
    return [];
  }

  return (data as ExtractionDetection[]) || [];
}

// =============================================================================
// Calculations
// =============================================================================

export async function getElevationCalcs(
  pageId: string
): Promise<ExtractionElevationCalcs | null> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('extraction_elevation_calcs')
    .select('*')
    .eq('page_id', pageId)
    .single();

  if (error) {
    console.error('Error fetching elevation calcs:', error);
    return null;
  }

  return data as ExtractionElevationCalcs;
}

export async function getJobElevationCalcs(
  jobId: string
): Promise<ExtractionElevationCalcs[]> {
  console.log('[getJobElevationCalcs] Using direct fetch for job:', jobId);
  const data = await directFetch<ExtractionElevationCalcs[]>(
    `extraction_elevation_calcs?job_id=eq.${jobId}&select=*`
  );
  return data || [];
}

export async function getJobTotals(jobId: string): Promise<ExtractionJobTotals | null> {
  console.log('[getJobTotals] Using direct fetch for job:', jobId);
  const data = await directFetch<ExtractionJobTotals[]>(
    `extraction_job_totals?job_id=eq.${jobId}&select=*`
  );
  return data?.[0] || null;
}

// =============================================================================
// Aggregations
// =============================================================================

export async function getDetectionCountsByClass(
  pageId: string
): Promise<Record<DetectionClass, number>> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('extraction_detection_details')
    .select('class')
    .eq('page_id', pageId)
    .neq('status', 'deleted');

  if (error) {
    console.error('Error fetching detection counts by class:', error);
    return {} as Record<DetectionClass, number>;
  }

  const counts: Record<string, number> = {};
  const rows = (data || []) as Array<{ class: DetectionClass }>;
  for (const row of rows) {
    const cls = row.class;
    counts[cls] = (counts[cls] || 0) + 1;
  }

  return counts as Record<DetectionClass, number>;
}

export async function getDetectionCountsByStatus(
  pageId: string
): Promise<Record<DetectionStatus, number>> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('extraction_detection_details')
    .select('status')
    .eq('page_id', pageId);

  if (error) {
    console.error('Error fetching detection counts by status:', error);
    return {} as Record<DetectionStatus, number>;
  }

  const counts: Record<string, number> = {};
  const rows = (data || []) as Array<{ status: DetectionStatus }>;
  for (const row of rows) {
    const status = row.status;
    counts[status] = (counts[status] || 0) + 1;
  }

  return counts as Record<DetectionStatus, number>;
}

export async function getReviewProgress(jobId: string): Promise<{
  total: number;
  reviewed: number;
  pending: number;
  percentComplete: number;
}> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('extraction_detection_details')
    .select('status')
    .eq('job_id', jobId)
    .neq('status', 'deleted');

  if (error) {
    console.error('Error fetching review progress:', error);
    return { total: 0, reviewed: 0, pending: 0, percentComplete: 0 };
  }

  const rows = (data || []) as Array<{ status: DetectionStatus }>;
  const total = rows.length;
  const pending = rows.filter((d) => d.status === 'auto').length;
  const reviewed = total - pending;
  const percentComplete = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  return { total, reviewed, pending, percentComplete };
}

// =============================================================================
// Full Context
// =============================================================================

export interface FullExtractionContext {
  job: ExtractionJob | null;
  pages: ExtractionPage[];
  detectionsByPage: Map<string, ExtractionDetection[]>;
  elevationCalcsByPage: Map<string, ExtractionElevationCalcs>;
  jobTotals: ExtractionJobTotals | null;
}

// Helper to add timeout to a promise
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  queryName: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${queryName} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export async function getFullExtractionContext(
  jobId: string
): Promise<FullExtractionContext> {
  console.log('[getFullExtractionContext] Starting fetch for jobId:', jobId);

  // Individual query timeout (5 seconds per query)
  const QUERY_TIMEOUT_MS = 5000;

  // Fetch all data in parallel with individual logging and timeouts
  console.log('[getFullExtractionContext] Starting parallel queries...');

  const jobPromise = withTimeout(
    getExtractionJob(jobId).then(result => {
      console.log('[getFullExtractionContext] getExtractionJob completed:', !!result);
      return result;
    }),
    QUERY_TIMEOUT_MS,
    'getExtractionJob'
  ).catch(err => {
    console.error('[getFullExtractionContext] getExtractionJob failed:', err.message);
    return null;
  });

  const pagesPromise = withTimeout(
    getExtractionPages(jobId).then(result => {
      console.log('[getFullExtractionContext] getExtractionPages completed:', result.length, 'pages');
      return result;
    }),
    QUERY_TIMEOUT_MS,
    'getExtractionPages'
  ).catch(err => {
    console.error('[getFullExtractionContext] getExtractionPages failed:', err.message);
    return [] as ExtractionPage[];
  });

  const detectionsPromise = withTimeout(
    getJobDetections(jobId, false).then(result => {
      console.log('[getFullExtractionContext] getJobDetections completed:', result.length, 'detections');
      // Debug: Log breakdown by class and markup_type
      const byClass: Record<string, number> = {};
      const byMarkupType: Record<string, number> = {};
      const corners = result.filter(d => d.class === 'corner_inside' || d.class === 'corner_outside');
      result.forEach(d => {
        byClass[d.class] = (byClass[d.class] || 0) + 1;
        byMarkupType[d.markup_type || 'undefined'] = (byMarkupType[d.markup_type || 'undefined'] || 0) + 1;
      });
      console.log('[getFullExtractionContext] Detection breakdown by class:', byClass);
      console.log('[getFullExtractionContext] Detection breakdown by markup_type:', byMarkupType);
      if (corners.length > 0) {
        console.log('[getFullExtractionContext] Corner detections found:', corners.map(c => ({
          id: c.id.slice(0, 8),
          class: c.class,
          markup_type: c.markup_type,
          page_id: c.page_id.slice(0, 8),
          pixel_x: c.pixel_x,
          pixel_y: c.pixel_y
        })));
      }
      return result;
    }),
    QUERY_TIMEOUT_MS,
    'getJobDetections'
  ).catch(err => {
    console.error('[getFullExtractionContext] getJobDetections failed:', err.message);
    return [] as ExtractionDetection[];
  });

  const elevationCalcsPromise = withTimeout(
    getJobElevationCalcs(jobId).then(result => {
      console.log('[getFullExtractionContext] getJobElevationCalcs completed:', result.length, 'calcs');
      return result;
    }),
    QUERY_TIMEOUT_MS,
    'getJobElevationCalcs'
  ).catch(err => {
    console.error('[getFullExtractionContext] getJobElevationCalcs failed:', err.message);
    return [] as ExtractionElevationCalcs[];
  });

  const jobTotalsPromise = withTimeout(
    getJobTotals(jobId).then(result => {
      console.log('[getFullExtractionContext] getJobTotals completed:', !!result);
      return result;
    }),
    QUERY_TIMEOUT_MS,
    'getJobTotals'
  ).catch(err => {
    console.error('[getFullExtractionContext] getJobTotals failed:', err.message);
    return null;
  });

  const [job, pages, allDetections, elevationCalcs, jobTotals] = await Promise.all([
    jobPromise,
    pagesPromise,
    detectionsPromise,
    elevationCalcsPromise,
    jobTotalsPromise,
  ]);

  console.log('[getFullExtractionContext] All queries completed (some may have timed out)');

  // Group detections by page
  const detectionsByPage = new Map<string, ExtractionDetection[]>();
  for (const detection of allDetections) {
    const pageDetections = detectionsByPage.get(detection.page_id) || [];
    pageDetections.push(detection);
    detectionsByPage.set(detection.page_id, pageDetections);
  }

  // Map elevation calcs by page
  const elevationCalcsByPage = new Map<string, ExtractionElevationCalcs>();
  for (const calc of elevationCalcs) {
    elevationCalcsByPage.set(calc.page_id, calc);
  }

  console.log('[getFullExtractionContext] Returning context');
  return {
    job,
    pages,
    detectionsByPage,
    elevationCalcsByPage,
    jobTotals,
  };
}

// =============================================================================
// Realtime Subscriptions
// =============================================================================

export interface DetectionCallbacks {
  onInsert?: (detection: ExtractionDetection) => void;
  onUpdate?: (detection: ExtractionDetection) => void;
  onDelete?: (detection: ExtractionDetection) => void;
}

export interface SubscriptionOptions {
  /**
   * Optional ref to check if user is currently editing.
   * When true, realtime updates will be skipped to preserve local changes.
   */
  editingModeRef?: React.MutableRefObject<boolean>;
}

export function subscribeToPageDetections(
  pageId: string,
  callbacks: DetectionCallbacks,
  options?: SubscriptionOptions
): () => void {
  const supabase = getClient();
  const { editingModeRef } = options || {};

  // Subscribe to extraction_detections_draft table (where edits are saved)
  const channel = supabase
    .channel(`page-detections-draft-${pageId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'extraction_detections_draft',
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => {
        // Skip realtime updates while in editing mode to preserve local changes
        if (editingModeRef?.current) {
          console.log('[subscribeToPageDetections] Skipping INSERT - editing mode active');
          return;
        }
        if (callbacks.onInsert) {
          callbacks.onInsert(mapDraftToDetection(payload.new as DraftDetection));
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'extraction_detections_draft',
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => {
        // Skip realtime updates while in editing mode to preserve local changes
        if (editingModeRef?.current) {
          console.log('[subscribeToPageDetections] Skipping UPDATE - editing mode active');
          return;
        }
        if (callbacks.onUpdate) {
          callbacks.onUpdate(mapDraftToDetection(payload.new as DraftDetection));
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'extraction_detections_draft',
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => {
        // Skip realtime updates while in editing mode to preserve local changes
        if (editingModeRef?.current) {
          console.log('[subscribeToPageDetections] Skipping DELETE - editing mode active');
          return;
        }
        if (callbacks.onDelete) {
          callbacks.onDelete(mapDraftToDetection(payload.old as DraftDetection));
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Subscribed to page detections (draft): ${pageId}`);
      }
    });

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToJobTotals(
  jobId: string,
  onUpdate: (totals: ExtractionJobTotals) => void
): () => void {
  const supabase = getClient();

  const channel = supabase
    .channel(`job-totals-${jobId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'extraction_job_totals',
        filter: `job_id=eq.${jobId}`,
      },
      (payload) => {
        if (payload.new) {
          onUpdate(payload.new as ExtractionJobTotals);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Subscribed to job totals: ${jobId}`);
      }
    });

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to status updates for a single extraction job
 * Use this when monitoring a specific job's progress
 */
export function subscribeToJobStatus(
  jobId: string,
  onStatusChange: (job: ExtractionJob) => void
): () => void {
  const supabase = getClient();

  const channel = supabase
    .channel(`job-status-${jobId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'extraction_jobs',
        filter: `id=eq.${jobId}`,
      },
      (payload) => {
        if (payload.new) {
          console.log(`[subscribeToJobStatus] Job ${jobId} updated:`, payload.new.status);
          onStatusChange(payload.new as ExtractionJob);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[subscribeToJobStatus] Subscribed to job: ${jobId}`);
      }
    });

  return () => {
    console.log(`[subscribeToJobStatus] Unsubscribing from job: ${jobId}`);
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to all extraction job updates (for dashboard)
 * Watches for both new jobs (INSERT) and status updates (UPDATE)
 */
export function subscribeToAllJobs(
  onJobUpdate: (job: ExtractionJob) => void,
  onJobInsert?: (job: ExtractionJob) => void
): () => void {
  const supabase = getClient();

  const channel = supabase
    .channel('all-extraction-jobs')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'extraction_jobs',
      },
      (payload) => {
        if (payload.new) {
          console.log('[subscribeToAllJobs] New job inserted:', payload.new.id);
          // Call onJobInsert if provided, otherwise fall back to onJobUpdate
          if (onJobInsert) {
            onJobInsert(payload.new as ExtractionJob);
          } else {
            onJobUpdate(payload.new as ExtractionJob);
          }
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'extraction_jobs',
      },
      (payload) => {
        if (payload.new) {
          console.log('[subscribeToAllJobs] Job updated:', payload.new.id, '->', payload.new.status);
          onJobUpdate(payload.new as ExtractionJob);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[subscribeToAllJobs] Subscribed to all extraction jobs');
      }
    });

  return () => {
    console.log('[subscribeToAllJobs] Unsubscribing from all jobs');
    supabase.removeChannel(channel);
  };
}
