'use client';

import { useEffect } from 'react';

export function DebugLogger() {
  useEffect(() => {
    console.log('App mounted at:', new Date().toISOString());

    // Log unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
