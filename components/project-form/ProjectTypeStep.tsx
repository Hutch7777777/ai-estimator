"use client";

import { FileText, ScanSearch, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProjectIntakeType } from "@/lib/types/project-form";

interface ProjectTypeStepProps {
  onSelect: (type: ProjectIntakeType) => void;
}

const PROJECT_TYPES: Array<{
  id: ProjectIntakeType;
  title: string;
  description: string;
  badge: string;
  icon: typeof FileText;
}> = [
  {
    id: "hover",
    title: "HOVER Report",
    description: "Upload a HOVER measurement PDF and generate the estimate from the report.",
    badge: "Measurement PDF",
    icon: FileText,
  },
  {
    id: "plans",
    title: "Construction Plans",
    description: "Upload a plan set for AI extraction, review, and approval in the editor.",
    badge: "Plan Set",
    icon: ScanSearch,
  },
];

export function ProjectTypeStep({ onSelect }: ProjectTypeStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title font-heading">New Project</h1>
        <p className="text-muted-foreground">Choose how this project will start.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PROJECT_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => onSelect(type.id)}
            className="group text-left"
          >
            <Card className="h-full border-2 transition-colors group-hover:border-brand group-hover:bg-accent">
              <CardHeader className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand/15 text-brand-foreground">
                    <type.icon className="h-5 w-5" />
                  </div>
                  <Badge variant="outline">{type.badge}</Badge>
                </div>
                <div>
                  <CardTitle className="font-heading">{type.title}</CardTitle>
                  <CardDescription className="mt-2">{type.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm font-medium text-brand-foreground">
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
