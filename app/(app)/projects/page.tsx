import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectsTable } from '@/components/projects/ProjectsTable';
import { JobsByProject } from '@/components/projects/JobsByProject';

export const metadata: Metadata = {
  title: 'Projects',
};

/**
 * The projects list: the former "Past Projects" and "Extractions" tabs,
 * merged — projects up top, imports/extractions grouped under their project
 * below (UIUX audit §1.2).
 */
export default function ProjectsListPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-heading">Projects</h1>
          <p className="text-muted-foreground">All projects for your organization</p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>

      <ProjectsTable />

      <div>
        <h2 className="mb-3 text-lg font-semibold font-heading">Imports & Extractions</h2>
        <JobsByProject />
      </div>
    </div>
  );
}
