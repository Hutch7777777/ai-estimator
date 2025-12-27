"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectFormData } from "@/app/project/new/page";
import { projectInfoSchema, validateField } from "@/lib/validation/project-form";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectInfoStepProps {
  data: ProjectFormData;
  onUpdate: (data: Partial<ProjectFormData>) => void;
  onValidationChange?: (isValid: boolean) => void;
}

export function ProjectInfoStep({ data, onUpdate, onValidationChange }: ProjectInfoStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Validate whenever data changes
  useEffect(() => {
    const result = projectInfoSchema.safeParse({
      projectName: data.projectName || "",
      customerName: data.customerName || "",
      address: data.address || "",
      notes: data.notes || "",
    });

    const newErrors: Record<string, string> = {};
    if (!result.success && result.error?.issues) {
      result.error.issues.forEach((err: any) => {
        const field = err.path[0] as string;
        newErrors[field] = err.message;
      });
    }

    setErrors(newErrors);
    onValidationChange?.(result.success);
  }, [data.projectName, data.customerName, data.address, data.notes, onValidationChange]);

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isFieldValid = (field: string) => {
    return touched[field] && !errors[field] && data[field as keyof ProjectFormData];
  };

  const showError = (field: string) => {
    return touched[field] && errors[field];
  };
  return (
    <Card className="shadow-soft rounded-xl">
      <CardHeader>
        <CardTitle className="font-heading">Project Information</CardTitle>
        <CardDescription>
          Enter basic information about your construction project
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Project Name */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="projectName" className="flex items-center gap-2">
              Project Name
              {isFieldValid("projectName") && (
                <CheckCircle2 className="h-4 w-4 text-[#00cc6a]" />
              )}
              {showError("projectName") && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </Label>
            <span className="text-xs text-muted-foreground">Required</span>
          </div>
          <Input
            id="projectName"
            placeholder="e.g., Smith Residence Siding"
            value={data.projectName}
            onChange={(e) => onUpdate({ projectName: e.target.value })}
            onBlur={() => handleBlur("projectName")}
            className={cn(
              showError("projectName") && "border-red-500 focus-visible:ring-red-500",
              isFieldValid("projectName") && "border-[#00cc6a] focus-visible:ring-[#00cc6a]"
            )}
          />
          {showError("projectName") && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.projectName}
            </p>
          )}
        </div>

        {/* Customer Name */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="customerName" className="flex items-center gap-2">
              Customer Name
              {isFieldValid("customerName") && (
                <CheckCircle2 className="h-4 w-4 text-[#00cc6a]" />
              )}
              {showError("customerName") && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </Label>
            <span className="text-xs text-muted-foreground">Required</span>
          </div>
          <Input
            id="customerName"
            placeholder="e.g., John Smith"
            value={data.customerName}
            onChange={(e) => onUpdate({ customerName: e.target.value })}
            onBlur={() => handleBlur("customerName")}
            className={cn(
              showError("customerName") && "border-red-500 focus-visible:ring-red-500",
              isFieldValid("customerName") && "border-[#00cc6a] focus-visible:ring-[#00cc6a]"
            )}
          />
          {showError("customerName") && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.customerName}
            </p>
          )}
        </div>

        {/* Address */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="address" className="flex items-center gap-2">
              Project Address
              {isFieldValid("address") && (
                <CheckCircle2 className="h-4 w-4 text-[#00cc6a]" />
              )}
              {showError("address") && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </Label>
            <span className="text-xs text-muted-foreground">Required</span>
          </div>
          <Input
            id="address"
            placeholder="e.g., 123 Main St, City, State ZIP"
            value={data.address}
            onChange={(e) => onUpdate({ address: e.target.value })}
            onBlur={() => handleBlur("address")}
            className={cn(
              showError("address") && "border-red-500 focus-visible:ring-red-500",
              isFieldValid("address") && "border-[#00cc6a] focus-visible:ring-[#00cc6a]"
            )}
          />
          {showError("address") && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.address}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
