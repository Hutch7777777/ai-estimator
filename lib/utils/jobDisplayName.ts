/**
 * Shared display-name rule for extraction jobs (docs/JOB_NAMING_PROPOSAL.md).
 *
 * Fallback chain, most → least informative:
 *   1. stored project_name (unless it's a known placeholder or UUID fragment)
 *   2. "{client_name} — {street}" from the linked project
 *   3. project address / project name
 *   4. cleaned source-PDF filename
 *   5. date-stamped "Import {Mon D}" — never a bare UUID
 *
 * Display-only: never writes anything back.
 */

export interface JobNameSource {
  project_name?: string | null;
  source_pdf_url?: string | null;
  created_at?: string | null;
}

export interface ProjectNameSource {
  name?: string | null;
  client_name?: string | null;
  address?: string | null;
}

const PLACEHOLDER_NAMES = new Set(['bluebeam import', 'untitled project', 'untitled']);
const UUID_FRAGMENT = /^[0-9a-f]{8}-/i;

function cleanFilename(url: string): string | null {
  const last = url.split('/').pop() ?? '';
  const base = decodeURIComponent(last).replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
  if (!base) return null;
  return base
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function streetOf(address: string): string {
  return address.split(',')[0].trim();
}

export function getJobDisplayName(job: JobNameSource, project?: ProjectNameSource | null): string {
  const stored = job.project_name?.trim();
  if (stored && !PLACEHOLDER_NAMES.has(stored.toLowerCase()) && !UUID_FRAGMENT.test(stored)) {
    return stored;
  }

  if (project?.client_name) {
    const street = project.address ? streetOf(project.address) : '';
    return street ? `${project.client_name} — ${street}` : project.client_name;
  }
  if (project?.address) return streetOf(project.address);
  if (project?.name) return project.name;

  if (job.source_pdf_url) {
    const fromFile = cleanFilename(job.source_pdf_url);
    if (fromFile) return fromFile;
  }

  if (job.created_at) {
    const d = new Date(job.created_at);
    return `Import ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  return stored || 'Untitled Import';
}
