// Extraction System Data Access Functions
// Using direct fetch instead of Supabase client to bypass client issues

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
// Direct Fetch API (bypasses Supabase client)
// =============================================================================

const SUPABASE_URL = 'https://okwtyttfqbfmcqtenize.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rd3R5dHRmcWJmbWNxdGVuaXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDYwNTEsImV4cCI6MjA3ODAyMjA1MX0.I1HRDRZpj4ExWp9_8tB_k1Bxzuc2SjqQ6DSyAar2AOE';

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
  console.log('[getJobDetections] Using direct fetch for job:', jobId);
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

export function subscribeToPageDetections(
  pageId: string,
  callbacks: DetectionCallbacks
): () => void {
  const supabase = getClient();

  const channel = supabase
    .channel(`page-detections-${pageId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'extraction_detection_details',
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => {
        if (callbacks.onInsert) {
          callbacks.onInsert(payload.new as ExtractionDetection);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'extraction_detection_details',
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => {
        if (callbacks.onUpdate) {
          callbacks.onUpdate(payload.new as ExtractionDetection);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'extraction_detection_details',
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => {
        if (callbacks.onDelete) {
          callbacks.onDelete(payload.old as ExtractionDetection);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Subscribed to page detections: ${pageId}`);
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
