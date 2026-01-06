"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Loader2, FolderOpen } from "lucide-react";
import { fetchProjects, createProject, BluebeamProject } from "@/lib/supabase/bluebeamProjects";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { ProjectCard } from "./ProjectCard";
import { toast } from "sonner";

interface ProjectGridProps {
  onProjectSelect: (project: BluebeamProject) => void;
}

export function ProjectGrid({ onProjectSelect }: ProjectGridProps) {
  const [projects, setProjects] = useState<BluebeamProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newClientName, setNewClientName] = useState("");

  const { organization, isLoading: isOrgLoading } = useOrganization();

  // Ref to prevent multiple simultaneous fetches
  const isFetchingRef = useRef(false);

  useEffect(() => {
    // Wait for organization to load
    if (isOrgLoading) return;

    const loadProjects = async () => {
      // Don't fetch if no organization
      if (!organization?.id) {
        setProjects([]);
        setLoading(false);
        return;
      }

      // Guard against multiple simultaneous fetches
      if (isFetchingRef.current) {
        console.log('ProjectGrid: Already fetching, skipping...');
        return;
      }

      isFetchingRef.current = true;
      console.log('ProjectGrid: loadProjects starting...');
      setLoading(true);

      try {
        const { data, error: fetchError } = await fetchProjects(organization.id);
        console.log('ProjectGrid: fetchProjects returned', { hasData: !!data, hasError: !!fetchError });
        if (fetchError) {
          setError(fetchError);
          toast.error("Failed to load projects");
          console.error('ProjectGrid: Error:', fetchError);
        } else {
          setError(null);
          setProjects(data || []);
          console.log('ProjectGrid: Set', data?.length || 0, 'projects');
        }
      } catch (err) {
        console.error('ProjectGrid: Exception in loadProjects:', err);
        setError(err instanceof Error ? err.message : "Failed to load projects");
        toast.error("Failed to load projects");
      } finally {
        console.log('ProjectGrid: Setting loading to false');
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    loadProjects();
  }, [organization?.id, isOrgLoading]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    if (!organization?.id) {
      toast.error("No organization selected");
      return;
    }

    setCreating(true);
    const { data, error } = await createProject(
      organization.id,
      newProjectName.trim(),
      newClientName.trim() || undefined
    );

    if (error) {
      toast.error("Failed to create project");
    } else if (data) {
      toast.success("Project created");
      setProjects((prev) => [data, ...prev]);
      onProjectSelect(data); // Open the new project immediately
      setDialogOpen(false);
      setNewProjectName("");
      setNewClientName("");
    }
    setCreating(false);
  };

  const filteredProjects = projects.filter((p) => {
    const query = searchQuery.toLowerCase();
    return (
      p.project_name.toLowerCase().includes(query) ||
      (p.client_name?.toLowerCase() || "").includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
        <div className="text-red-500 mb-4">
          <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load projects</h3>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">PDF Markup Projects</h2>
          <p className="text-muted-foreground">
            Select a project to view or edit markups
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Project Grid */}
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed rounded-lg p-8">
          <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {searchQuery ? "No projects found" : "No projects yet"}
          </h3>
          <p className="text-muted-foreground text-center mb-4">
            {searchQuery
              ? "Try a different search term"
              : "Create your first project to get started"}
          </p>
          {!searchQuery && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => onProjectSelect(project)}
            />
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white dark:bg-gray-950">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create a new project to start marking up plans.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="project-name"
                placeholder="e.g., 123 Main Street Renovation"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-name">Client Name (optional)</Label>
              <Input
                id="client-name"
                placeholder="e.g., John Smith"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                disabled={creating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || creating}
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Project"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
