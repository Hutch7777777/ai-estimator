export const EXTRACTION_JOB_STATUSES = [
  'pending',
  'importing',
  'converting',
  'analyzing',
  'classifying',
  'classified',
  'processing',
  'refining',
  'complete',
  'approved',
  'failed',
] as const;

export type JobStatus = (typeof EXTRACTION_JOB_STATUSES)[number];

export const ACTIVE_EXTRACTION_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  'pending',
  'importing',
  'converting',
  'analyzing',
  'classifying',
  'processing',
  'refining',
]);

export const EXTRACTION_JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'Queued',
  importing: 'Importing',
  converting: 'Converting PDF',
  analyzing: 'Analyzing Plans',
  classifying: 'Classifying Pages',
  classified: 'Ready for Review',
  processing: 'Detecting Objects',
  refining: 'Refining Detections',
  complete: 'Complete',
  approved: 'Approved',
  failed: 'Failed',
};

const ALLOWED_TRANSITIONS: Record<JobStatus, ReadonlySet<JobStatus>> = {
  pending: new Set(['importing', 'converting', 'analyzing', 'classifying', 'failed']),
  importing: new Set(['complete', 'failed']),
  converting: new Set(['analyzing', 'classifying', 'failed']),
  analyzing: new Set(['classified', 'failed']),
  classifying: new Set(['classified', 'failed']),
  classified: new Set(['processing', 'refining', 'failed']),
  processing: new Set(['refining', 'complete', 'failed']),
  refining: new Set(['classified', 'complete', 'failed']),
  complete: new Set(['refining', 'approved', 'failed']),
  approved: new Set(),
  failed: new Set(['pending', 'importing', 'converting', 'classifying', 'processing', 'refining']),
};

export function isExtractionJobStatus(value: unknown): value is JobStatus {
  return typeof value === 'string'
    && (EXTRACTION_JOB_STATUSES as readonly string[]).includes(value);
}

export function isExtractionJobActive(status: JobStatus): boolean {
  return ACTIVE_EXTRACTION_JOB_STATUSES.has(status);
}

export function canTransitionExtractionJob(
  current: JobStatus,
  next: JobStatus
): boolean {
  return current === next || ALLOWED_TRANSITIONS[current].has(next);
}
