'use client';

import { useParams, useRouter } from 'next/navigation';
import { DetectionEditor } from '@/components/detection-editor';
import { toast } from 'sonner';

export default function ExtractionReviewPage() {
  const params = useParams();
  const router = useRouter();

  const projectId = params.id as string;
  const jobId = params.jobId as string;

  const handleComplete = () => {
    toast.success('Extraction approved successfully');
    // Navigate back to project page
    router.push(`/projects/${projectId}`);
  };

  const handleError = (error: Error) => {
    console.error('Detection editor error:', error);
    toast.error(error.message || 'An error occurred');
  };

  return (
    <div className="h-screen">
      <DetectionEditor
        jobId={jobId}
        projectId={projectId}
        onComplete={handleComplete}
        onError={handleError}
      />
    </div>
  );
}
