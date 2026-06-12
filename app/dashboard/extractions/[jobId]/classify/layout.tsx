import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Classify Pages',
};

export default function ClassifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
