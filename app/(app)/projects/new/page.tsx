import type { Metadata } from 'next';
import { ProjectForm } from '@/components/project-form/ProjectForm';

export const metadata: Metadata = {
  title: 'New Project',
};

/** The former /project "New Project" tab — the existing wizard, untouched. */
export default function NewProjectPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <ProjectForm />
    </div>
  );
}
