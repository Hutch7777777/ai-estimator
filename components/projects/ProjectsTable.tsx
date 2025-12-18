"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Download,
  Eye,
  Trash2,
  Search,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  Edit,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ProjectDetailDialog } from "@/components/projects/ProjectDetailDialog";
import { ProjectCard } from "@/components/projects/ProjectCard";

interface Project {
  id: string;
  name: string;
  client_name: string;
  address: string;
  selected_trades: string[];
  status: string;
  created_at: string;
  hover_pdf_url?: string;
  excel_url?: string;
}

type ProjectStatus =
  | "pending"
  | "extracted"
  | "calculated"
  | "priced"
  | "approved"
  | "sent_to_client"
  | "won"
  | "lost"
  | "on_hold";

export function ProjectsTable() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  // Fetch projects from database
  useEffect(() => {
    async function fetchProjects() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;

        setProjects(data || []);
        setFilteredProjects(data || []);
      } catch (err) {
        console.error("Error fetching projects:", err);
        setError(err instanceof Error ? err.message : "Failed to load projects");
      } finally {
        setLoading(false);
      }
    }

    fetchProjects();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("projects-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects",
        },
        (payload) => {
          console.log("Project change detected:", payload);

          if (payload.eventType === "INSERT") {
            // Add new project to the list
            setProjects((prev) => [payload.new as Project, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            // Update existing project
            setProjects((prev) =>
              prev.map((p) => (p.id === payload.new.id ? (payload.new as Project) : p))
            );
          } else if (payload.eventType === "DELETE") {
            // Remove deleted project
            setProjects((prev) => prev.filter((p) => p.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Filter projects based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProjects(projects);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.client_name.toLowerCase().includes(query) ||
        project.address.toLowerCase().includes(query)
    );
    setFilteredProjects(filtered);
  }, [searchQuery, projects]);

  // Format date for display
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Format trade name for display
  const formatTradeName = (trade: string): string => {
    return trade.charAt(0).toUpperCase() + trade.slice(1);
  };

  // Map project status to StatusBadge status
  const mapStatusToBadgeStatus = (
    status: string
  ): "draft" | "pending" | "processing" | "complete" | "error" => {
    switch (status as ProjectStatus) {
      case "won":
      case "approved":
        return "complete";
      case "pending":
        return "pending";
      case "extracted":
      case "calculated":
      case "priced":
        return "processing";
      case "sent_to_client":
        return "pending";
      case "lost":
        return "error";
      case "on_hold":
        return "draft";
      default:
        return "draft";
    }
  };

  // Get status display text
  const getStatusText = (status: string): string => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Handle Excel download
  const handleDownload = (project: Project) => {
    if (project.excel_url) {
      window.open(project.excel_url, "_blank");
    } else {
      alert("Excel file not available for this project");
    }
  };

  // Handle project deletion
  const handleDelete = async (projectId: string) => {
    if (!confirm("Are you sure you want to delete this project?")) {
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId);

      if (deleteError) throw deleteError;

      // Remove from local state
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setFilteredProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      console.error("Error deleting project:", err);
      alert("Failed to delete project. Please try again.");
    }
  };

  // Handle view details
  const handleViewDetails = (project: Project) => {
    setSelectedProjectId(project.id);
    setDialogOpen(true);
  };

  // Handle edit estimate
  const handleEditEstimate = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  // Check if project has an estimate (status >= extracted)
  const hasEstimate = (status: string): boolean => {
    const statusesWithEstimate = ["extracted", "calculated", "priced", "approved", "sent_to_client", "won", "lost"];
    return statusesWithEstimate.includes(status);
  };

  // Export to CSV
  const exportToCSV = () => {
    if (filteredProjects.length === 0) {
      alert("No projects to export");
      return;
    }

    // CSV headers
    const headers = [
      "Project Name",
      "Client Name",
      "Address",
      "Status",
      "Trades",
      "Created Date",
      "HOVER PDF",
      "Excel File",
    ];

    // Convert projects to CSV rows
    const rows = filteredProjects.map((project) => [
      project.name,
      project.client_name,
      project.address,
      getStatusText(project.status),
      project.selected_trades?.join(", ") || "",
      new Date(project.created_at).toLocaleDateString(),
      project.hover_pdf_url || "N/A",
      project.excel_url || "N/A",
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `projects_export_${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card className="border-2 shadow-soft rounded-xl">
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-2xl font-heading">Past Projects</CardTitle>
              <CardDescription className="mt-1">
                View and manage all completed estimates
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={filteredProjects.length === 0}
                className="gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by project, client, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading projects...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title={searchQuery ? "No projects found" : "No projects yet"}
            description={
              searchQuery
                ? "Try adjusting your search query"
                : "Create your first estimate to get started"
            }
          />
        ) : (
          <>
            {/* Mobile Card View (< 768px) */}
            <div className="grid gap-4 md:hidden">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onView={handleViewDetails}
                  onEdit={handleEditEstimate}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  mapStatusToBadgeStatus={mapStatusToBadgeStatus}
                  getStatusText={getStatusText}
                  formatTradeName={formatTradeName}
                  formatDate={formatDate}
                />
              ))}
            </div>

            {/* Desktop Table View (>= 768px) */}
            <div className="hidden md:block rounded-lg border">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">Address</TableHead>
                  <TableHead className="hidden lg:table-cell">Trades</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell>{project.client_name}</TableCell>
                    <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                      {project.address}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {project.selected_trades?.slice(0, 2).map((trade) => (
                          <Badge key={trade} variant="secondary" className="text-xs">
                            {formatTradeName(trade)}
                          </Badge>
                        ))}
                        {project.selected_trades?.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{project.selected_trades.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={mapStatusToBadgeStatus(project.status)}>
                        {getStatusText(project.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {formatDate(project.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditEstimate(project.id)}
                          className="h-8 w-8"
                          title="Edit Estimate"
                        >
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Edit estimate</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewDetails(project)}
                          className="h-8 w-8"
                        >
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View details</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(project)}
                          disabled={!project.excel_url}
                          className="h-8 w-8"
                        >
                          <Download className="h-4 w-4" />
                          <span className="sr-only">Download Excel</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(project.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete project</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}

        {/* Summary footer */}
        {!loading && !error && filteredProjects.length > 0 && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Showing {filteredProjects.length} of {projects.length} projects
          </div>
        )}
      </CardContent>

      {/* Project Detail Dialog */}
      <ProjectDetailDialog
        projectId={selectedProjectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </Card>
  );
}
