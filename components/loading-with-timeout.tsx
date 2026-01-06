'use client';

import { useEffect, useState } from 'react';

interface LoadingWithTimeoutProps {
  isLoading: boolean;
  timeout?: number;
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
  timeoutComponent?: React.ReactNode;
}

export function LoadingWithTimeout({
  isLoading,
  timeout = 10000,
  children,
  loadingComponent,
  timeoutComponent,
}: LoadingWithTimeoutProps) {
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setHasTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      if (isLoading) {
        setHasTimedOut(true);
        console.warn('Loading timeout reached');
      }
    }, timeout);

    return () => clearTimeout(timer);
  }, [isLoading, timeout]);

  if (hasTimedOut) {
    return timeoutComponent || (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-amber-600">Loading is taking longer than expected...</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Refresh Page
        </button>
      </div>
    );
  }

  if (isLoading) {
    return loadingComponent || (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return <>{children}</>;
}
