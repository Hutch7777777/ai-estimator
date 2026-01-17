"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useOrganization } from "@/lib/hooks/useOrganization";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Eye,
  Loader2,
  AlertCircle,
  Layers,
  FileImage,
  Upload,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExtractionUploadStep } from "@/components/project-form/ExtractionUploadStep";
import type { JobStatus } from "@/lib/types/extraction";

// =============================================================================
// Constants
// =============================================================================

// Status states that indicate active processing (should trigger polling)
const ACTIVE_STATUSES: JobStatus[] = ['converting', 'classifying', 'processing'];

// Polling interval in milliseconds
const POLLING_INTERVAL = 4000;

interface ExtractionJobWithProject {
  id: string;
  project_id: string | null;
  project_name: string | null;
  status: JobStatus;
  total_pages: number;
  elevation_count: number;
  created_at: string;
  completed_at: string | null;
}

export function ExtractionsTable() {
  const [jobs, setJobs] = useState<ExtractionJobWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [tempProjectId] = useState(() => crypto.randomUUID());
  const [refreshKey, setRefreshKey] = useState(0);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { organization, isLoading: isOrgLoading } = useOrganization();

  // ==========================================================================
  // Inline Editing Functions
  // ==========================================================================

  const startEditing = (jobId: string, currentName: string | null) => {
    setEditingId(jobId);
    setEditValue(currentName || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveProjectName = async (jobId: string) => {
    if (!editValue.trim()) {
      toast.error('Project name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/extraction-jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: editValue.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update project name');
      }

      // Update local state
      setJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, project_name: editValue.trim() } : job
      ));

      setEditingId(null);
      setEditValue('');
      toast.success('Project name updated');
    } catch (err) {
      console.error('[ExtractionsTable] Error saving project name:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update project name');
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch extraction jobs using direct fetch (Supabase JS client has issues)
  useEffect(() => {
    async function fetchJobs() {
      // Wait for organization to be loaded
      if (isOrgLoading) {
        return;
      }

      // Don't fetch if no organization is selected
      if (!organization?.id) {
        setJobs([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Use direct fetch since Supabase JS client has issues
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/extraction_jobs?select=id,project_id,project_name,status,total_pages,elevation_count,created_at,completed_at&order=created_at.desc`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
            }
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setJobs(data || []);
      } catch (err) {
        console.error("[ExtractionsTable] Error fetching extraction jobs:", err);
        setError(err instanceof Error ? err.message : "Failed to load extraction jobs");
      } finally {
        setLoading(false);
      }
    }

    fetchJobs();
  }, [organization?.id, isOrgLoading, refreshKey]);

  // Add timeout for organization loading to prevent infinite loading state
  useEffect(() => {
    if (!isOrgLoading) return;

    const timeout = setTimeout(() => {
      if (isOrgLoading) {
        setError("Organization loading timed out. Please refresh the page.");
        setLoading(false);
      }
    }, 15000); // 15 second timeout

    return () => clearTimeout(timeout);
  }, [isOrgLoading]);

  // ==========================================================================
  // Auto-polling for active jobs
  // ==========================================================================

  // Check if any jobs are in an active (processing) state
  const hasActiveJobs = useMemo(() =>
    jobs.some(job => ACTIVE_STATUSES.includes(job.status)),
    [jobs]
  );

  // Poll for updates when there are active jobs
  useEffect(() => {
    // Don't poll if no active jobs, still loading, or no organization
    if (!hasActiveJobs || loading || isOrgLoading || !organization?.id) return;

    console.log('[ExtractionsTable] Starting polling - active jobs detected');

    const interval = setInterval(async () => {
      try {
        // Silent refresh - don't set loading state to avoid UI flicker
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/extraction_jobs?select=id,project_id,project_name,status,total_pages,elevation_count,created_at,completed_at&order=created_at.desc`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          setJobs(data || []);
          console.log('[ExtractionsTable] Polling update:', data?.length, 'jobs');
        }
      } catch (err) {
        console.error('[ExtractionsTable] Polling error:', err);
        // Don't set error state for polling failures - just log and continue
      }
    }, POLLING_INTERVAL);

    return () => {
      console.log('[ExtractionsTable] Stopping polling');
      clearInterval(interval);
    };
  }, [hasActiveJobs, loading, isOrgLoading, organization?.id]);

  // Format date for display
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get status badge variant
  const getStatusVariant = (status: JobStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "complete":
      case "approved":
        return "default"; // green-ish
      case "failed":
        return "destructive";
      case "converting":
      case "classifying":
      case "processing":
        return "secondary"; // blue/gray
      default:
        return "outline";
    }
  };

  // Get status display text
  const getStatusText = (status: JobStatus): string => {
    switch (status) {
      case "converting":
        return "Converting PDF";
      case "classifying":
        return "Classifying Pages";
      case "classified":
        return "Ready for Review";
      case "processing":
        return "Detecting Objects";
      case "complete":
        return "Complete";
      case "approved":
        return "Approved";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  // Get status color classes
  const getStatusClasses = (status: JobStatus): string => {
    switch (status) {
      case "complete":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "approved":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "converting":
      case "classifying":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "classified":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "processing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  // Loading state
  if (loading || isOrgLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // Empty state
  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <EmptyState
            icon={Layers}
            title="No extraction jobs yet"
            description="Upload a construction PDF to start detecting windows, doors, and other elements."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileImage className="h-5 w-5" />
              Extraction Jobs
            </CardTitle>
            <CardDescription>
              AI-powered detection jobs for construction plan PDFs
            </CardDescription>
          </div>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Plans
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Pages</TableHead>
              <TableHead className="text-center">Elevations</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium">
                  {editingId === job.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 w-48"
                        autoFocus
                        disabled={isSaving}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveProjectName(job.id);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        placeholder="Enter project name"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => saveProjectName(job.id)}
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={cancelEditing}
                        disabled={isSaving}
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <span>{job.project_name || "Untitled Project"}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 transition-opacity"
                        onClick={() => startEditing(job.id, job.project_name)}
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={getStatusClasses(job.status)}>
                    {getStatusText(job.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {job.total_pages}
                </TableCell>
                <TableCell className="text-center">
                  {job.elevation_count}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(job.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  {job.status === "classified" ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/extractions/${job.id}/classify`}>
                        <Eye className="mr-2 h-4 w-4" />
                        Review
                      </Link>
                    </Button>
                  ) : (job.status === "complete" || job.status === "approved") && job.project_id ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/projects/${job.project_id}/extraction/${job.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        Review
                      </Link>
                    </Button>
                  ) : job.status === "failed" ? (
                    <span className="text-sm text-muted-foreground">Failed</span>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-950">
          <DialogHeader>
            <DialogTitle>Upload Construction Plans</DialogTitle>
            <DialogDescription>
              Upload a PDF of your construction plans for AI-powered object detection
            </DialogDescription>
          </DialogHeader>
          <ExtractionUploadStep
            projectId={tempProjectId}
            onComplete={() => {
              setUploadDialogOpen(false);
              setRefreshKey(prev => prev + 1);
            }}
            onError={(error) => {
              console.error("Extraction error:", error);
            }}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
