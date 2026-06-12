'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FolderX, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Projects error:', error);
  }, [error]);

  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center gap-6 p-8">
      <div className="rounded-full bg-destructive/10 p-4">
        <FolderX className="h-10 w-10 text-destructive" />
      </div>

      <div className="text-center space-y-2 max-w-md">
        <h2 className="text-xl font-semibold">Failed to load project</h2>
        <p className="text-muted-foreground">
          {error.message || 'We couldn\'t load this project. It may have been deleted or you may not have access.'}
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={reset} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/project" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
        </Button>
      </div>
    </div>
  );
}
