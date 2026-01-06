'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';

export function NoOrganization() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <Building2 className="h-16 w-16 text-gray-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">No Organization Found</h2>
      <p className="text-gray-500 mb-6 max-w-md">
        You need to join or create an organization to access projects and estimates.
      </p>
      <Button onClick={() => router.push('/onboarding')}>
        Set Up Organization
      </Button>
    </div>
  );
}
