import type { Metadata } from 'next';

// Auth/org gating happens once in the (app) group layout.
export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
