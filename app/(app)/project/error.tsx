'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Project route error:', error);
  }, [error]);

  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center gap-6 p-8">
      <div className="rounded-full bg-amber-100 dark:bg-amber-900/20 p-4">
        <AlertTriangle className="h-10 w-10 text-amber-600 dark:text-amber-500" />
      </div>

      <div className="text-center space-y-2 max-w-md">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground">
          {error.message || 'An error occurred while loading the project dashboard. Please try again.'}
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={reset} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/project" className="gap-2">
            <Home className="h-4 w-4" />
            Go to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
