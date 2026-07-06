'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { clearStaleSupabaseAuth } from '@/lib/supabase/clear-stale-auth';

/**
 * Workspace loading state with a fallback so a stuck auth/org load is never
 * a dead end. Looks identical to the previous inline spinner, but after a
 * grace period it surfaces recovery actions (reload, or clear the session
 * and sign in again) instead of spinning forever.
 */
export function WorkspaceLoading({
  label = 'Loading your workspace...',
  fallbackAfterMs = 12000,
}: {
  label?: string;
  fallbackAfterMs?: number;
}) {
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowFallback(true), fallbackAfterMs);
    return () => clearTimeout(timer);
  }, [fallbackAfterMs]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">{label}</p>

        {showFallback && (
          <div className="mt-2 max-w-sm space-y-3">
            <p className="text-sm text-muted-foreground">
              This is taking longer than usual. Your session may need to be
              refreshed.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => {
                  clearStaleSupabaseAuth();
                  window.location.assign('/login');
                }}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                Sign in again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
