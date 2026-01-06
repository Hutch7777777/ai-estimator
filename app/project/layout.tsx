'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useUser } from '@/lib/hooks/useUser';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { NoOrganization } from '@/components/no-organization';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading: isUserLoading, hasSession } = useUser();
  const { isLoading: isOrgLoading, hasNoOrganizations } = useOrganization();

  // Redirect to login if user loading is complete and no user/session
  useEffect(() => {
    if (!isUserLoading && !user && !hasSession) {
      router.push('/login');
    }
  }, [isUserLoading, user, hasSession, router]);

  // Step 1: Wait for user auth to complete first
  if (isUserLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Step 2: If no user after loading complete, show redirect message
  // The useEffect above will handle the actual redirect
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Step 3: User exists, now wait for organization loading
  if (isOrgLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  // Step 4: User exists but has no organizations - show onboarding
  if (hasNoOrganizations) {
    return <NoOrganization />;
  }

  // Step 5: User and organization ready - render children
  return <>{children}</>;
}
