import type { Metadata } from 'next';
import { ProjectAuthGuard } from './ProjectAuthGuard';

// Server layout so the segment can carry a <title>; the auth/org gating
// lives in the ProjectAuthGuard client component (moved verbatim from the
// previous client layout).
export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <ProjectAuthGuard>{children}</ProjectAuthGuard>;
}
