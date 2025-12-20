"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Loader2, Database } from "lucide-react";
import { BluebeamProject } from "@/lib/supabase/bluebeamProjects";
import { getMarkupCount } from "@/lib/supabase/cadMarkups";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: BluebeamProject;
  onClick: () => void;
}

// Generate a consistent color based on project name
function getPlaceholderColor(name: string): string {
  const colors = [
    "bg-blue-100 text-blue-600",
    "bg-green-100 text-green-600",
    "bg-purple-100 text-purple-600",
    "bg-amber-100 text-amber-600",
    "bg-pink-100 text-pink-600",
    "bg-cyan-100 text-cyan-600",
    "bg-red-100 text-red-600",
    "bg-indigo-100 text-indigo-600",
  ];
  const index = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const [markupCount, setMarkupCount] = useState<number | null>(null);

  useEffect(() => {
    // Fetch markup count for this project
    getMarkupCount(project.id).then(({ count }) => {
      setMarkupCount(count);
    });
  }, [project.id]);

  const hasPdf = !!project.source_pdf_path;
  const hasCad = !!project.cad_extraction_id;
  const placeholderColor = getPlaceholderColor(project.project_name);

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] overflow-hidden"
      onClick={onClick}
    >
      {/* Thumbnail Area */}
      <div className="aspect-[4/3] relative overflow-hidden">
        {hasPdf ? (
          // PDF Thumbnail placeholder
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <FileText className="h-12 w-12" />
              <span className="text-xs">{project.total_pages || "?"} pages</span>
            </div>
          </div>
        ) : (
          // Color Placeholder
          <div className={cn("w-full h-full flex items-center justify-center", placeholderColor)}>
            <span className="text-4xl font-bold opacity-50">
              {project.project_name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {/* CAD Badge */}
        {hasCad && (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
            <Database className="h-3 w-3" />
            CAD
          </div>
        )}
      </div>

      {/* Project Info */}
      <CardContent className="p-3">
        <h3 className="font-semibold truncate" title={project.project_name}>
          {project.project_name}
        </h3>
        {project.client_name && (
          <p className="text-sm text-muted-foreground truncate">
            {project.client_name}
          </p>
        )}
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>
            {markupCount === null ? (
              <Loader2 className="h-3 w-3 animate-spin inline" />
            ) : markupCount === 0 ? (
              "No markups"
            ) : (
              `${markupCount} markup${markupCount !== 1 ? "s" : ""}`
            )}
          </span>
          <span>
            {hasCad ? (
              <span className="text-green-600">CAD linked</span>
            ) : hasPdf ? (
              <span className="text-blue-600">PDF only</span>
            ) : (
              <span className="text-amber-600">No files</span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
