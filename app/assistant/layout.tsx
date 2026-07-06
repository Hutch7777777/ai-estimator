"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { NoOrganization } from "@/components/no-organization";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { useUser } from "@/lib/hooks/useUser";
import { clearStaleSupabaseAuth } from "@/lib/supabase/clear-stale-auth";

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  const loginRedirectStarted = useRef(false);
  const { user, isLoading: isUserLoading } = useUser();
  const { isLoading: isOrgLoading, hasNoOrganizations } = useOrganization();

  useEffect(() => {
    if (!isUserLoading && !user && !loginRedirectStarted.current) {
      loginRedirectStarted.current = true;
      clearStaleSupabaseAuth();
      window.location.replace("/login");
    }
  }, [isUserLoading, user]);

  if (isUserLoading || isOrgLoading) {
    return <WorkspaceLoading />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (hasNoOrganizations) {
    return <NoOrganization />;
  }

  return <>{children}</>;
}
