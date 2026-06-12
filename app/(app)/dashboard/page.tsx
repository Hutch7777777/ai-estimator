import type { Metadata } from 'next';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';

export const metadata: Metadata = {
  title: 'Dashboard',
};

/** The former /project "Overview" tab, now a first-class route. */
export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-title font-heading">Dashboard</h1>
        <p className="text-muted-foreground">Your organization at a glance</p>
      </div>
      <DashboardOverview />
    </div>
  );
}
