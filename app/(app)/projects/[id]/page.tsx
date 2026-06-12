'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Calculator,
  FileSpreadsheet,
  Layers,
  Loader2,
  Plus,
  Upload,
  Eye,
  CheckSquare,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stepper, type Step } from '@/components/ui/stepper';
import { AddMeasurementsModal } from '@/components/projects/AddMeasurementsModal';
import { createClient } from '@/lib/supabase/client';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { getJobDisplayName } from '@/lib/utils/jobDisplayName';

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

const STAGE_STEPS: Step[] = [
  { id: 1, title: 'Upload', description: 'Add measurements', icon: Upload },
  { id: 2, title: 'Review', description: 'Verify detections', icon: Eye },
  { id: 3, title: 'Estimate', description: 'Approve & price', icon: Calculator },
  { id: 4, title: 'Export', description: 'Takeoff & Excel', icon: CheckSquare },
];

function jobStatusBadgeClass(status: string): string {
  if (status === 'complete' || status === 'approved') return 'bg-brand/15 text-brand-foreground';
  if (status === 'failed') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
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
 * spine"): status, stage stepper, this project's extractions, takeoff
 * history, and the single Add Measurements entry point.
 */
export default function ProjectHubPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { organization } = useOrganization();

  const [project, setProject] = useState<HubProject | null>(null);
  const [jobs, setJobs] = useState<HubJob[]>([]);
  const [takeoffs, setTakeoffs] = useState<HubTakeoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const loadHub = useCallback(async () => {
    const supabase = createClient();
    const [projectRes, jobsRes, takeoffsRes] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, client_name, address, status, created_at')
        .eq('id', projectId)
        .single(),
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
    ]);

    setProject((projectRes.data as HubProject | null) ?? null);
    setJobs((jobsRes.data as HubJob[] | null) ?? []);
    setTakeoffs((takeoffsRes.data as HubTakeoff[] | null) ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
          <h1 className="text-2xl font-bold tracking-tight font-heading truncate">{displayName}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            {project?.status && <Badge variant="outline">{project.status}</Badge>}
            {project?.address && <span className="truncate">{project.address}</span>}
            {project?.created_at && <span>Created {formatDate(project.created_at)}</span>}
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
                    <p className="text-xs text-muted-foreground">
                      {job.total_pages} page{job.total_pages === 1 ? '' : 's'} · {formatDate(job.created_at)}
                    </p>
                  </div>
                  <Badge className={jobStatusBadgeClass(job.status)}>{job.status}</Badge>
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
                    <p className="font-medium">{formatMoney(takeoff.grand_total)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(takeoff.created_at)}</p>
                  </div>
                  {takeoff.status && <Badge variant="outline">{takeoff.status}</Badge>}
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
