'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  Calculator,
  FileSpreadsheet,
  Layers,
  Plus,
  RefreshCw,
  SearchX,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DimensionStepper } from '@/components/ui/dimension-stepper';
import { AddMeasurementsModal } from '@/components/projects/AddMeasurementsModal';
import { createClient } from '@/lib/supabase/client';
import { useOrganization, isDevBypassEnabled } from '@/lib/hooks/useOrganization';
import { getJobDisplayName } from '@/lib/utils/jobDisplayName';
import { withTimeout } from '@/lib/utils/withTimeout';

interface HubProject {
  id: string;
  name: string | null;
  client_name: string | null;
  address: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  status: string | null;
  created_at: string;
}

interface HubJob {
  id: string;
  project_name: string | null;
  status: string;
  total_pages: number;
  source_pdf_url: string | null;
  created_at: string;
  completed_at?: string | null;
}

interface HubTakeoff {
  id: string;
  status: string | null;
  grand_total: number | null;
  created_at: string;
}

type HubView = 'loading' | 'error' | 'notfound' | 'ready';

function stageDate(iso?: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Project hub — the center of the project lifecycle (UIUX audit §1 "one
 * spine"). Reads are 10s-timeout guarded with explicit
 * loading/error/not-found states; the dev auth bypass routes them through
 * the dev-only service-role API (see app/api/dev/org-data/route.ts) because
 * the anon-key client gets nothing back under RLS without a session.
 */
export default function ProjectHubPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { organization } = useOrganization();

  const [view, setView] = useState<HubView>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [project, setProject] = useState<HubProject | null>(null);
  const [jobs, setJobs] = useState<HubJob[]>([]);
  const [takeoffs, setTakeoffs] = useState<HubTakeoff[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const loadHub = useCallback(async () => {
    setView('loading');
    try {
      let projectRow: HubProject | null;
      let jobRows: HubJob[];
      let takeoffRows: HubTakeoff[];

      if (isDevBypassEnabled()) {
        const response = await withTimeout(fetch(`/api/dev/org-data?hub=${projectId}`));
        if (!response.ok) throw new Error(`Dev data route failed (HTTP ${response.status})`);
        const data = await response.json();
        projectRow = data.project ?? null;
        jobRows = data.jobs ?? [];
        takeoffRows = data.takeoffs ?? [];
      } else {
        const supabase = createClient();
        const [projectRes, jobsRes] = await withTimeout(
          Promise.all([
            supabase
              .from('projects')
              .select('id, name, client_name, address, city, state, zip_code, status, created_at')
              .eq('id', projectId)
              .maybeSingle(),
            supabase
              .from('extraction_jobs')
              .select('id, project_name, status, total_pages, source_pdf_url, created_at, completed_at')
              .eq('project_id', projectId)
              .order('created_at', { ascending: false }),
          ])
        );
        if (projectRes.error) throw new Error(projectRes.error.message);
        if (jobsRes.error) throw new Error(jobsRes.error.message);
        projectRow = (projectRes.data as HubProject | null) ?? null;
        jobRows = (jobsRes.data as HubJob[] | null) ?? [];

        // Takeoffs: n8n keys some takeoff rows by the EXTRACTION JOB id
        // rather than the project id (the extraction_id = job_id confusion
        // family — CONFIRMED_WORK_PLAN.md finding #1/#3). The viewer loads by
        // takeoff id alone so it renders either way; the hub must accept both
        // keys. Deliberately NO organization_id filter (n8n rows have it
        // NULL; project access is org-checked upstream) and select('*')
        // (named-column selects 400 if the hand-maintained Takeoff type has
        // drifted from the live schema). Read-side fix only — no schema
        // change. Errors throw to the error view — never silently empty.
        const takeoffKeys = [projectId, ...jobRows.map((j) => j.id)];
        const takeoffsRes = await withTimeout(
          supabase
            .from('takeoffs')
            .select('*')
            .in('project_id', takeoffKeys)
            .order('created_at', { ascending: false })
        );
        if (takeoffsRes.error) {
          console.error('[ProjectHub] takeoffs read failed:', takeoffsRes.error);
          throw new Error(takeoffsRes.error.message);
        }
        takeoffRows = (takeoffsRes.data as unknown as HubTakeoff[] | null) ?? [];
      }

      setProject(projectRow);
      setJobs(jobRows);
      setTakeoffs(takeoffRows);
      // No row back = missing OR RLS-filtered; both read as "no access" here.
      setView(projectRow ? 'ready' : 'notfound');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load project');
      setView('error');
    }
  }, [projectId]);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  if (view === 'loading') {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (view === 'error') {
    return (
      <div className="mx-auto w-full max-w-[600px] px-4 py-16 text-center space-y-4">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold font-heading">Couldn’t load this project</h1>
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        <div className="flex justify-center gap-2">
          <Button onClick={loadHub}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
          <Button variant="outline" asChild>
            <Link href="/projects">Back to Projects</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (view === 'notfound') {
    return (
      <div className="mx-auto w-full max-w-[600px] px-4 py-16 text-center space-y-4">
        <SearchX className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold font-heading">Project not found</h1>
        <p className="text-sm text-muted-foreground">
          This project doesn’t exist, or your account doesn’t have access to it.
        </p>
        <Button variant="outline" asChild>
          <Link href="/projects">Back to Projects</Link>
        </Button>
      </div>
    );
  }

  const displayName = project
    ? project.client_name && project.address
      ? `${project.client_name} — ${project.address.split(',')[0].trim()}`
      : project.name || 'Project'
    : 'Project';

  const currentStep =
    takeoffs.length > 0
      ? 4
      : jobs.some((j) => j.status === 'approved')
        ? 3
        : jobs.length > 0
          ? 2
          : 1;

  // Status pill derives from pipeline state — projects.status goes stale (the
  // pipeline never writes it back), and the header must not contradict the
  // rows below it. Fallback to the column only when nothing has happened yet.
  const derivedStatus =
    takeoffs.length > 0 ? 'approved' : jobs[0]?.status ?? project?.status ?? 'pending';
  const latestTakeoff = takeoffs[0] ?? null;

  // "City, ST 55104" line: prefer the structured columns; fall back to
  // whatever follows the street in the freeform address.
  const localityFromColumns = [
    project?.city,
    [project?.state, project?.zip_code].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  const projectLocality =
    localityFromColumns ||
    (project?.address?.includes(',') ? project.address.split(',').slice(1).join(',').trim() : null);

  // Per-stage event dates: Upload = earliest import, Review = approval,
  // Estimate = first takeoff, Export = latest takeoff. Guard: never show a
  // later date left of an earlier one — a date earlier than anything already
  // shown to its left is hidden.
  const jobsOldestFirst = [...jobs].reverse();
  const approvalIso =
    jobs
      .filter((j) => j.status === 'approved')
      .map((j) => j.completed_at ?? j.created_at)
      .sort()[0] ?? null;
  const rawStageDates: Array<string | null> = [
    jobsOldestFirst[0]?.created_at ?? project?.created_at ?? null,
    approvalIso,
    takeoffs[takeoffs.length - 1]?.created_at ?? null,
    takeoffs.length > 1 ? takeoffs[0]?.created_at ?? null : null,
  ];
  let latestShown = 0;
  const stageDates = rawStageDates.map((iso) => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (t < latestShown) return null;
    latestShown = t;
    return stageDate(iso);
  });

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 space-y-6">
      {/* Header — architectural title block: name + status left; client /
          locality / sheet-id meta right-aligned against a 2px ink rule.
          Typographic only. */}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-title font-heading truncate">{displayName}</h1>
            <StatusBadge status={derivedStatus} size="sm">{derivedStatus}</StatusBadge>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="border-r-2 border-ink pr-4 text-right leading-snug">
            {project?.client_name && (
              <p className="text-sm font-medium text-foreground">{project.client_name}</p>
            )}
            {projectLocality && (
              <p className="text-xs text-muted-foreground">{projectLocality}</p>
            )}
            {project && (
              <p className="font-num text-[10px] uppercase text-muted-foreground">
                {project.id.slice(0, 8).toUpperCase()} · REV {formatDate(project.created_at)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {latestTakeoff ? (
              <Button variant="outline" asChild>
                <Link href={`/projects/${projectId}/takeoff/${latestTakeoff.id}`}>
                  <Calculator className="mr-2 h-4 w-4" />
                  Open Estimate
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <Calculator className="mr-2 h-4 w-4" />
                Open Estimate
              </Button>
            )}
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Measurements
            </Button>
          </div>
          {!latestTakeoff && (
            <p className="text-[11px] text-muted-foreground">
              No takeoff yet — approve a reviewed extraction to generate one.
            </p>
          )}
        </div>
      </div>

      {/* Stage stepper — the dimension string */}
      <Card>
        <CardContent className="pt-6 px-8">
          <DimensionStepper
            stages={[
              { id: 1, label: 'Upload', date: stageDates[0] },
              { id: 2, label: 'Review', date: stageDates[1] },
              { id: 3, label: 'Estimate', date: stageDates[2] },
              { id: 4, label: 'Export', date: stageDates[3] },
            ]}
            currentStage={currentStep}
          />
        </CardContent>
      </Card>

      {/* Measurements / extractions for THIS project */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Measurements & Files
          </CardTitle>
          <CardDescription>Extractions and imports for this project</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No measurements yet — use “Add Measurements” to get started.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {jobs.map((job) => (
                <div key={job.id} className="row-hover -mx-2 flex items-center gap-4 rounded-sm px-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{getJobDisplayName(job, project)}</p>
                    <p className="text-xs text-muted-foreground font-num">                      {job.total_pages} page{job.total_pages === 1 ? '' : 's'} · {formatDate(job.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={job.status} size="sm">{job.status}</StatusBadge>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/projects/${projectId}/review/${job.id}`}>Review</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Takeoff history */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Takeoff History
          </CardTitle>
          <CardDescription>Generated takeoffs for this project</CardDescription>
        </CardHeader>
        <CardContent>
          {takeoffs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No takeoffs yet — approve a reviewed extraction to generate one.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {takeoffs.map((takeoff) => (
                <div key={takeoff.id} className="row-hover -mx-2 flex items-center gap-4 rounded-sm px-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium font-num text-brand-foreground">{formatMoney(takeoff.grand_total)}</p>
                    <p className="text-xs text-muted-foreground font-num">{formatDate(takeoff.created_at)}</p>
                  </div>
                  {takeoff.status && <StatusBadge status={takeoff.status} size="sm">{takeoff.status}</StatusBadge>}
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/projects/${projectId}/takeoff/${takeoff.id}`}>View</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddMeasurementsModal
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        projectName={displayName}
        organizationId={organization?.id}
        onJobCreated={loadHub}
      />
    </div>
  );
}
