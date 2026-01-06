"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, AlertCircle } from "lucide-react";
import {
  fetchProjects,
  createProject,
  BluebeamProject,
} from "@/lib/supabase/bluebeamProjects";
import { useOrganization } from "@/lib/hooks/useOrganization";

interface ProjectSelectorProps {
  selectedProject: BluebeamProject | null;
  onProjectSelect: (project: BluebeamProject | null) => void;
  onProjectCreated?: (project: BluebeamProject) => void;
  disabled?: boolean;
}

export function ProjectSelector({
  selectedProject,
  onProjectSelect,
  onProjectCreated,
  disabled = false,
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<BluebeamProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { organization, isLoading: isOrgLoading } = useOrganization();

  // Load projects when organization is available
  useEffect(() => {
    if (isOrgLoading) return;
    loadProjects();
  }, [organization?.id, isOrgLoading]);

  const loadProjects = async () => {
    if (!organization?.id) {
      setProjects([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await fetchProjects(organization.id);
    if (error) {
      console.error("Error loading projects:", error);
      setError(error);
    } else {
      setProjects(data || []);
    }
    setLoading(false);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    if (!organization?.id) {
      setError("No organization selected");
      return;
    }

    setCreating(true);
    setError(null);

    const { data: newProject, error } = await createProject(
      organization.id,
      newProjectName.trim(),
      newClientName.trim() || undefined
    );

    if (error) {
      setError(error);
      setCreating(false);
      return;
    }

    if (newProject) {
      setProjects((prev) => [newProject, ...prev]);
      onProjectSelect(newProject);
      onProjectCreated?.(newProject);
      setDialogOpen(false);
      setNewProjectName("");
      setNewClientName("");
    }

    setCreating(false);
  };

  const handleSelectChange = (value: string) => {
    if (value === "__none__") {
      onProjectSelect(null);
    } else {
      const project = projects.find((p) => p.id === value);
      onProjectSelect(project || null);
    }
  };

  // Show error state inline
  if (error && !loading && projects.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-red-50 border-red-200 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load projects</span>
          <Button variant="ghost" size="sm" onClick={() => window.location.reload()} className="h-6 px-2 text-red-700 hover:text-red-800">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedProject?.id || "__none__"}
        onValueChange={handleSelectChange}
        disabled={disabled || loading}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder={loading ? "Loading..." : "Select project"}>
            {selectedProject ? (
              <span className="truncate">
                {selectedProject.project_name}
                {selectedProject.client_name && (
                  <span className="text-muted-foreground ml-1">
                    — {selectedProject.client_name}
                  </span>
                )}
              </span>
            ) : loading ? (
              "Loading..."
            ) : (
              "Select project"
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">No project selected</span>
          </SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              <span className="truncate">
                {project.project_name}
                {project.client_name && (
                  <span className="text-muted-foreground ml-1">
                    — {project.client_name}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled={disabled}
            title="Create new project"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-white dark:bg-gray-950 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create a new project to save your markups.
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
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
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
