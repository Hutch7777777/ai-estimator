import type { Metadata } from 'next';
import { ProjectsTable } from '@/components/projects/ProjectsTable';

export const metadata: Metadata = {
  title: 'Projects',
};

/**
 * The projects list — Phase B baseline (the former "Past Projects" tab).
 * Phase D merges extraction jobs into this list, grouped under their project.
 */
export default function ProjectsListPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight font-heading">Projects</h1>
        <p className="text-muted-foreground">All projects for your organization</p>
      </div>
      <ProjectsTable />
    </div>
  );
}
