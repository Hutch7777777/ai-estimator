import type { Metadata } from 'next';
import { ProjectForm } from '@/components/project-form/ProjectForm';
import type { ProjectIntakeType } from '@/lib/types/project-form';

export const metadata: Metadata = {
  title: 'New Project',
};

function parseProjectType(type: string | undefined): ProjectIntakeType | undefined {
  return type === 'hover' || type === 'plans' ? type : undefined;
}

/** New project intake: choose source first, then enter the matching workflow. */
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <ProjectForm initialType={parseProjectType(type)} />
    </div>
  );
}
