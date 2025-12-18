"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download,
  FileText,
  MapPin,
  User,
  Calendar,
  Briefcase,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Project {
  id: string;
  name: string;
  client_name: string;
  address: string;
  selected_trades: string[];
  status: string;
  created_at: string;
  updated_at?: string;
  hover_pdf_url?: string;
  excel_url?: string;
}

interface ProjectConfiguration {
  id: string;
  project_id: string;
  trade: string;
  configuration_data: Record<string, any>;
  created_at: string;
}

interface ProjectDetailDialogProps {
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectDetailDialog({
  projectId,
  open,
  onOpenChange,
}: ProjectDetailDialogProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [configurations, setConfigurations] = useState<ProjectConfiguration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch project details when dialog opens
  useEffect(() => {
    if (!open || !projectId) {
      setProject(null);
      setConfigurations([]);
      setError(null);
      return;
    }

    async function fetchProjectDetails() {
      try {
        setLoading(true);
        setError(null);

        // Fetch project
        const { data: projectData, error: projectError } = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();

        if (projectError) throw projectError;

        // Fetch configurations
        const { data: configData, error: configError } = await supabase
          .from("project_configurations")
          .select("*")
          .eq("project_id", projectId);

        if (configError) throw configError;

        setProject(projectData);
        setConfigurations(configData || []);
      } catch (err) {
        console.error("Error fetching project details:", err);
        setError(err instanceof Error ? err.message : "Failed to load project details");
      } finally {
        setLoading(false);
      }
    }

    fetchProjectDetails();
  }, [projectId, open]);

  // Format date for display
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format trade name
  const formatTradeName = (trade: string): string => {
    return trade.charAt(0).toUpperCase() + trade.slice(1);
  };

  // Get status display text
  const getStatusText = (status: string): string => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Format configuration key for display
  const formatConfigKey = (key: string): string => {
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Format configuration value for display
  const formatConfigValue = (value: any): string => {
    if (value === null || value === undefined) return "Not specified";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading project details...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : project ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">{project.name}</DialogTitle>
              <DialogDescription>
                View complete project details and configurations
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Project Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Project Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex items-start gap-3">
                      <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Client</p>
                        <p className="text-sm font-semibold">{project.client_name}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Address</p>
                        <p className="text-sm font-semibold">{project.address}</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Created</p>
                        <p className="text-sm font-semibold">{formatDate(project.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Status</p>
                        <Badge className="mt-1">{getStatusText(project.status)}</Badge>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Selected Trades</p>
                    <div className="flex flex-wrap gap-2">
                      {project.selected_trades.map((trade) => (
                        <Badge key={trade} variant="secondary">
                          {formatTradeName(trade)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trade Configurations */}
              {configurations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Trade Configurations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {configurations.map((config, index) => (
                      <div key={config.id}>
                        {index > 0 && <Separator className="my-4" />}
                        <div>
                          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                            <Badge variant="outline">{formatTradeName(config.trade)}</Badge>
                          </h4>
                          <div className="grid gap-3 md:grid-cols-2">
                            {Object.entries(config.configuration_data).map(([key, value]) => (
                              <div
                                key={key}
                                className="bg-muted/30 rounded-lg p-3 space-y-1"
                              >
                                <p className="text-xs font-medium text-muted-foreground">
                                  {formatConfigKey(key)}
                                </p>
                                <p className="text-sm font-semibold break-words">
                                  {formatConfigValue(value)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Files */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Files</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {project.hover_pdf_url && (
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">HOVER PDF</p>
                          <p className="text-xs text-muted-foreground">
                            Measurement report
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a
                          href={project.hover_pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View
                        </a>
                      </Button>
                    </div>
                  )}

                  {project.excel_url ? (
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-green-500/10 p-2">
                          <Download className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Excel Takeoff</p>
                          <p className="text-xs text-muted-foreground">
                            Generated estimate
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a href={project.excel_url} download>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-lg border border-dashed p-3 bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-muted p-2">
                          <Download className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Excel Takeoff
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Not yet generated
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
