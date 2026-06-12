'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, PencilRuler, ScanSearch, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BluebeamFreshImportModal } from '@/components/dashboard/BluebeamFreshImportModal';

// Phase C: the wizard still lives on the dashboard tab; Phase D flips this
// to '/projects/new'.
const NEW_PROJECT_HREF = '/project?tab=new';

interface AddMeasurementsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string;
  organizationId?: string;
  onJobCreated?: () => void;
}

/**
 * One entry point for measurements (UIUX audit §2 — "five doors, no
 * signage"): a single source choice that routes to the EXISTING importers.
 * UI unification only — importer internals and the pipeline are untouched.
 */
export function AddMeasurementsModal({
  open,
  onOpenChange,
  projectId,
  projectName,
  organizationId,
  onJobCreated,
}: AddMeasurementsModalProps) {
  const router = useRouter();
  const [bluebeamOpen, setBluebeamOpen] = useState(false);

  const options = [
    {
      title: 'HOVER report',
      description: 'Upload a HOVER measurement PDF — starts a new project with the wizard',
      icon: FileText,
      onSelect: () => {
        onOpenChange(false);
        router.push(NEW_PROJECT_HREF);
      },
    },
    {
      title: 'Marked-up plans (Bluebeam)',
      description: 'Import Bluebeam markups for this project and review them in the editor',
      icon: PencilRuler,
      onSelect: () => {
        onOpenChange(false);
        setBluebeamOpen(true);
      },
    },
    {
      title: 'Construction plans (AI detection)',
      description: 'Upload raw plans for AI extraction — starts with the project wizard',
      icon: ScanSearch,
      onSelect: () => {
        onOpenChange(false);
        router.push(NEW_PROJECT_HREF);
      },
    },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Measurements</DialogTitle>
            <DialogDescription>Where are your measurements coming from?</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {options.map((option) => (
              <button
                key={option.title}
                type="button"
                onClick={option.onSelect}
                className="w-full flex items-center gap-3 rounded-lg border p-3 text-left hover:border-brand hover:bg-muted transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15">
                  <option.icon className="h-5 w-5 text-brand-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{option.title}</p>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <BluebeamFreshImportModal
        open={bluebeamOpen}
        onOpenChange={setBluebeamOpen}
        projectId={projectId}
        projectName={projectName}
        organizationId={organizationId}
        onJobCreated={onJobCreated}
      />
    </>
  );
}
