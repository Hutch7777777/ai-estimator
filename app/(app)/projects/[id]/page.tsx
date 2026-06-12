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
  Upload,
  Eye,
  CheckSquare,
  SearchX,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper, type Step } from '@/components/ui/stepper';
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
}

interface HubTakeoff {
  id: string;
  status: string | null;
  grand_total: number | null;
  created_at: string;
}

type HubView = 'loading' | 'error' | 'notfound' | 'ready';

const STAGE_STEPS: Step[] = [
  { id: 1, title: 'Upload', description: 'Add measurements', icon: Upload },
  { id: 2, title: 'Review', description: 'Verify detections', icon: Eye },
  { id: 3, title: 'Estimate', description: 'Approve & price', icon: Calculator },
  { id: 4, title: 'Export', description: 'Takeoff & Excel', icon: CheckSquare },
];

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
        const [projectRes, jobsRes, takeoffsRes] = await withTimeout(
          Promise.all([
            supabase
              .from('projects')
              .select('id, name, client_name, address, status, created_at')
              .eq('id', projectId)
              .maybeSingle(),
            supabase
              .from('extraction_jobs')
              .select('id, project_name, status, total_pages, source_pdf_url, created_at')
              .eq('project_id', projectId)
              .order('created_at', { ascending: false }),
            supabase
              .from('takeoffs')
              .select('id, status, grand_total, created_at')
              .eq('project_id', projectId)
              .order('created_at', { ascending: false }),
          ])
        );
        if (projectRes.error) throw new Error(projectRes.error.message);
        projectRow = (projectRes.data as HubProject | null) ?? null;
        jobRows = (jobsRes.data as HubJob[] | null) ?? [];
        takeoffRows = (takeoffsRes.data as HubTakeoff[] | null) ?? [];
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

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title font-heading truncate">{displayName}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            {project?.status && <StatusBadge status={project.status} size="sm">{project.status}</StatusBadge>}
            {project?.address && <span className="truncate">{project.address}</span>}
            {project?.created_at && <span className="font-num">Created {formatDate(project.created_at)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/projects/${projectId}/estimate`}>
              <Calculator className="mr-2 h-4 w-4" />
              Open Estimate
            </Link>
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Measurements
          </Button>
        </div>
      </div>

      {/* Stage stepper */}
      <Card>
        <CardContent className="pt-6">
          <Stepper steps={STAGE_STEPS} currentStep={currentStep} />
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
                <div key={job.id} className="flex items-center gap-4 py-3">
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
                <div key={takeoff.id} className="flex items-center gap-4 py-3">
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
