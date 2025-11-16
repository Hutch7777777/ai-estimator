"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectFormData } from "@/app/project/new/page";

interface ProjectInfoStepProps {
  data: ProjectFormData;
  onUpdate: (data: Partial<ProjectFormData>) => void;
}

export function ProjectInfoStep({ data, onUpdate }: ProjectInfoStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Information</CardTitle>
        <CardDescription>
          Enter basic information about your construction project
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="projectName">Project Name</Label>
          <Input
            id="projectName"
            placeholder="e.g., Smith Residence Siding"
            value={data.projectName}
            onChange={(e) => onUpdate({ projectName: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="customerName">Customer Name</Label>
          <Input
            id="customerName"
            placeholder="e.g., John Smith"
            value={data.customerName}
            onChange={(e) => onUpdate({ customerName: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Project Address</Label>
          <Input
            id="address"
            placeholder="e.g., 123 Main St, City, State ZIP"
            value={data.address}
            onChange={(e) => onUpdate({ address: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
