"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOrganization, isDevBypassEnabled } from "@/lib/hooks/useOrganization";
import { useTakeoffData, useLineItemsSave } from "@/lib/hooks";
import { LineItemWithState, Project } from "@/lib/types/database";
import {
  SectionTabs,
  EstimateSummary,
} from "@/components/estimate-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeletons";
import { ErrorState } from "@/components/ui/error-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Clock,
  MapPin,
  User,
  Briefcase,
} from "lucide-react";

export default function ProjectEstimatePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Local state for line items (synced with database)
  const [localLineItems, setLocalLineItems] = useState<LineItemWithState[]>([]);

  const supabase = createClient();
  const { organization, isLoading: isOrgLoading } = useOrganization();

  // Fetch takeoff data
  const {
    takeoff,
    sections,
    lineItems,
    loading: takeoffLoading,
    error: takeoffError,
    refresh,
  } = useTakeoffData(projectId);

  // Save hook
  const {
    saveLineItems,
    isSaving,
    error: saveError,
    lastSaved,
  } = useLineItemsSave();

  // Legacy route: the project hub now opens the concrete takeoff viewer. Keep
  // this URL useful in local dev by resolving it to the latest generated takeoff.
  useEffect(() => {
    if (!isDevBypassEnabled()) return;

    let cancelled = false;
    fetch(`/api/dev/org-data?hub=${projectId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { takeoffs?: Array<{ id?: string }> } | null) => {
        const latestTakeoffId = data?.takeoffs?.[0]?.id;
        if (!cancelled && latestTakeoffId) {
          router.replace(`/projects/${projectId}/takeoff/${latestTakeoffId}`);
        }
      })
      .catch((error) => {
        console.error("Failed to resolve latest takeoff:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  // Fetch project details with organization ownership verification
  useEffect(() => {
    async function fetchProject() {
      // Wait for organization to be loaded
      if (isOrgLoading) return;

      // Don't fetch if no organization is selected
      if (!organization?.id) {
        setProjectError("No organization selected");
        setProjectLoading(false);
        return;
      }

      try {
        setProjectLoading(true);
        setProjectError(null);

        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();

        if (error) throw error;

        if (!data) {
          setProjectError("Project not found");
          return;
        }

        // Verify the project belongs to the user's organization
        if (data.organization_id !== organization.id) {
          setProjectError("You don't have access to this project");
          return;
        }

        setProject(data);
      } catch (err) {
        console.error("Error fetching project:", err);
        setProjectError(err instanceof Error ? err.message : "Failed to load project");
      } finally {
        setProjectLoading(false);
      }
    }

    fetchProject();
  }, [projectId, supabase, organization?.id, isOrgLoading]);

  // No-infinite-spinner guard: useTakeoffData has no internal timeout, so a
  // stalled load could otherwise sit on the skeleton forever. Mirror the
  // useExtractionData 10s pattern with a slightly longer page-level window.
  const stillLoading = isOrgLoading || projectLoading || takeoffLoading;
  useEffect(() => {
    if (!stillLoading) {
      setTimedOut(false);
      return;
    }
    const id = setTimeout(() => setTimedOut(true), 12_000);
    return () => clearTimeout(id);
  }, [stillLoading]);

  // Sync line items from hook to local state
  useEffect(() => {
    setLocalLineItems(lineItems);
  }, [lineItems]);

  // Handle line items change for a specific section
  const handleLineItemsChange = useCallback((sectionId: string, updatedItems: LineItemWithState[]) => {
    setLocalLineItems((prev) => {
      // Replace items for this section, keep others
      const otherItems = prev.filter((item) => item.section_id !== sectionId);
      return [...otherItems, ...updatedItems];
    });
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      await saveLineItems(localLineItems);

      // Clear isNew and isModified flags after successful save
      setLocalLineItems((prev) =>
        prev.map((item) => ({
          ...item,
          isNew: false,
          isModified: false,
        }))
      );

      // Refresh to get updated totals from database
      await refresh();
    } catch (err) {
      console.error("Save failed:", err);
      // Error is already set by useLineItemsSave hook
    }
  }, [localLineItems, saveLineItems, refresh]);

  // Timed-out load — never leave the screen on an endless skeleton.
  if (stillLoading && timedOut) {
    return (
      <div className="container mx-auto py-8">
        <ErrorState
          title="Taking longer than expected"
          message="The estimate is still loading. This can happen if the connection stalls."
          onRetry={() => {
            setTimedOut(false);
            refresh();
          }}
          backHref={`/projects/${projectId}`}
          backLabel="Back to project"
        />
      </div>
    );
  }

  // Loading state
  if (stillLoading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error state
  if (projectError || takeoffError) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {projectError || takeoffError}
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/project")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
      </div>
    );
  }

  // No takeoff found
  if (!takeoff) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No Estimate Available</AlertTitle>
          <AlertDescription>
            This project does not have an estimate yet. Estimates are created automatically
            after HOVER PDF processing is complete.
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/project")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
      </div>
    );
  }

  // Check project status
  const canEdit = project && ["extracted", "calculated", "priced"].includes(project.status);

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/project")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-heading font-bold">{project?.name}</h1>
              <p className="text-muted-foreground">Estimate Editor</p>
            </div>
          </div>
        </div>
        {lastSaved && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-green-600" />
            Last saved: {lastSaved.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Project Info Card */}
      {project && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Client</p>
                  <p className="font-medium">{project.client_name}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">{project.address}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Trades</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {project.selected_trades.map((trade) => (
                      <Badge key={trade} variant="secondary" className="text-xs">
                        {trade.charAt(0).toUpperCase() + trade.slice(1)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {new Date(project.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Error Alert */}
      {saveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Save Error</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {/* Cannot Edit Warning */}
      {!canEdit && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Read-Only Mode</AlertTitle>
          <AlertDescription>
            This estimate is in read-only mode. Project status: {project?.status}
          </AlertDescription>
        </Alert>
      )}

      {/* Estimate Summary */}
      <EstimateSummary
        takeoff={takeoff}
        sections={sections}
        lineItems={localLineItems}
        projectInfo={{
          clientName: project?.client_name || "Unknown Client",
          address: project?.address || "Unknown Address",
          projectName: project?.name || "Untitled Project",
        }}
        onApprove={() => {
          // TODO: Implement approval workflow
          console.log("Approve estimate");
        }}
        onSend={() => {
          // TODO: Implement send to client
          console.log("Send to client");
        }}
      />

      {/* Section Tabs with Grids */}
      {sections.length > 0 ? (
        <SectionTabs
          sections={sections}
          lineItems={localLineItems}
          takeoffId={takeoff.id}
          onLineItemsChange={handleLineItemsChange}
          onSave={canEdit ? handleSave : undefined}
          isSaving={isSaving}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Sections</CardTitle>
            <CardDescription>
              This estimate does not have any sections yet.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
