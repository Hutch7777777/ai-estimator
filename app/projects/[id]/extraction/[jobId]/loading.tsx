import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-gray-600 dark:text-gray-400">Loading extraction...</p>
      </div>
    </div>
  );
}
