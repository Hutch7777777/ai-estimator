'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, MoreHorizontal, Pencil, Trash2, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { getJobDisplayName, type ProjectNameSource } from '@/lib/utils/jobDisplayName';

interface JobRow {
  id: string;
  project_id: string | null;
  project_name: string | null;
  status: string;
  total_pages: number;
  source_pdf_url: string | null;
  created_at: string;
}

interface ProjectRow extends ProjectNameSource {
  id: string;
}

function statusBadgeClass(status: string): string {
  if (status === 'complete' || status === 'approved') return 'bg-brand/15 text-brand-foreground';
  if (status === 'failed') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
}

/**
 * Extraction jobs grouped under their project (the former Extractions tab,
 * merged into the projects list — UIUX audit §1.2). Jobs without a project
 * land in "Unassigned imports".
 *
 * NOTE: like the ExtractionsTable it replaces, the jobs query is NOT
 * org-filtered (extraction_jobs has no organization_id —
 * docs/EXTRACTIONS_ORG_FILTER_DIAGNOSIS.md). Grouping uses the org's
 * projects, so cross-org jobs can only ever appear under "Unassigned".
 */
export function JobsByProject() {
  const { organization } = useOrganization();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organization?.id) return;
    const supabase = createClient();
    const [projectsRes, jobsRes] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, client_name, address')
        .eq('organization_id', organization.id),
      supabase
        .from('extraction_jobs')
        .select('id, project_id, project_name, status, total_pages, source_pdf_url, created_at')
        .order('created_at', { ascending: false }),
    ]);
    setProjects((projectsRes.data as ProjectRow[] | null) ?? []);
    setJobs((jobsRes.data as JobRow[] | null) ?? []);
    setLoading(false);
  }, [organization?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRename = async (job: JobRow) => {
    const name = window.prompt('Project name for this import:', job.project_name ?? '');
    if (name === null || !name.trim()) return;
    const response = await fetch(`/api/extraction-jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: name.trim() }),
    });
    if (response.ok) {
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, project_name: name.trim() } : j)));
      toast.success('Import renamed');
    } else {
      toast.error('Failed to rename import');
    }
  };

  const handleDelete = async (job: JobRow) => {
    if (!window.confirm('Delete this import and all its pages/detections?')) return;
    const response = await fetch(`/api/extraction-jobs/${job.id}`, { method: 'DELETE' });
    if (response.ok) {
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      toast.success('Import deleted');
    } else {
      toast.error('Failed to delete import');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const groups = new Map<string, JobRow[]>();
  const unassigned: JobRow[] = [];
  for (const job of jobs) {
    if (job.project_id && projectById.has(job.project_id)) {
      const list = groups.get(job.project_id) ?? [];
      list.push(job);
      groups.set(job.project_id, list);
    } else {
      unassigned.push(job);
    }
  }

  if (jobs.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No imports or extractions yet.</p>
    );
  }

  const renderJobRow = (job: JobRow, project: ProjectRow | null) => (
    <div key={job.id} className="flex items-center gap-3 py-2 pl-6">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{getJobDisplayName(job, project)}</p>
        <p className="text-xs text-muted-foreground">
          {job.total_pages} page{job.total_pages === 1 ? '' : 's'} ·{' '}
          {new Date(job.created_at).toLocaleDateString()}
        </p>
      </div>
      <Badge className={statusBadgeClass(job.status)}>{job.status}</Badge>
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/projects/${job.project_id ?? '_'}/review/${job.id}`}>Review</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleRename(job)}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDelete(job)} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([projectId, projectJobs]) => {
        const project = projectById.get(projectId)!;
        const label = project.client_name
          ? `${project.client_name}${project.address ? ` — ${project.address.split(',')[0].trim()}` : ''}`
          : project.name || 'Project';
        return (
          <div key={projectId} className="rounded-lg border">
            <Link
              href={`/projects/${projectId}`}
              className="flex items-center gap-2 border-b bg-muted px-4 py-2 font-medium hover:bg-accent transition-colors"
            >
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{label}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {projectJobs.length} import{projectJobs.length === 1 ? '' : 's'}
              </span>
            </Link>
            <div className="divide-y divide-border px-2">
              {projectJobs.map((job) => renderJobRow(job, project))}
            </div>
          </div>
        );
      })}

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-dashed">
          <div className="flex items-center gap-2 border-b bg-muted px-4 py-2 font-medium">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span>Unassigned imports</span>
            <span className="ml-auto text-xs text-muted-foreground">{unassigned.length}</span>
          </div>
          <div className="divide-y divide-border px-2">
            {unassigned.map((job) => renderJobRow(job, null))}
          </div>
        </div>
      )}
    </div>
  );
}
