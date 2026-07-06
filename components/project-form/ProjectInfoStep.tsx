"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectFormData, ProjectIntakeType } from "@/lib/types/project-form";
import { projectInfoSchema } from "@/lib/validation/project-form";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectInfoStepProps {
  data: ProjectFormData;
  onUpdate: (data: Partial<ProjectFormData>) => void;
  onValidationChange?: (isValid: boolean) => void;
  intakeType?: ProjectIntakeType | null;
}

const COPY_BY_INTAKE: Record<ProjectIntakeType, {
  title: string;
  description: string;
  projectNameLabel: string;
  projectNamePlaceholder: string;
  customerNameLabel: string;
  customerNamePlaceholder: string;
  addressLabel: string;
  addressPlaceholder: string;
}> = {
  hover: {
    title: "Project Information",
    description: "Enter basic information about your construction project",
    projectNameLabel: "Project Name",
    projectNamePlaceholder: "e.g., Smith Residence Siding",
    customerNameLabel: "Customer Name",
    customerNamePlaceholder: "e.g., John Smith",
    addressLabel: "Project Address",
    addressPlaceholder: "e.g., 123 Main St, City, State ZIP",
  },
  plans: {
    title: "Plan Set Details",
    description: "Identify the job before uploading the construction plans",
    projectNameLabel: "Project / Plan Set Name",
    projectNamePlaceholder: "e.g., Smith Residence Exterior Plans",
    customerNameLabel: "Client / Builder",
    customerNamePlaceholder: "e.g., John Smith or Acme Builders",
    addressLabel: "Project Site Address",
    addressPlaceholder: "e.g., 123 Main St, City, State ZIP",
  },
};

export function ProjectInfoStep({
  data,
  onUpdate,
  onValidationChange,
  intakeType,
}: ProjectInfoStepProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const copy = COPY_BY_INTAKE[intakeType ?? "hover"];

  const validationResult = useMemo(() => (
    projectInfoSchema.safeParse({
      projectName: data.projectName || "",
      customerName: data.customerName || "",
      address: data.address || "",
      notes: data.notes || "",
    })
  ), [data.projectName, data.customerName, data.address, data.notes]);

  const errors = useMemo(() => {
    const newErrors: Record<string, string> = {};
    if (!validationResult.success) {
      validationResult.error.issues.forEach((err) => {
        const field = String(err.path[0] ?? "");
        if (field) newErrors[field] = err.message;
      });
    }
    return newErrors;
  }, [validationResult]);

  useEffect(() => {
    onValidationChange?.(validationResult.success);
  }, [validationResult.success, onValidationChange]);

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
        <CardTitle className="font-heading">{copy.title}</CardTitle>
        <CardDescription>
          {copy.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Project Name */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="projectName" className="flex items-center gap-2">
              {copy.projectNameLabel}
              {isFieldValid("projectName") && (
                <CheckCircle2 className="h-4 w-4 text-brand-foreground" />
              )}
              {showError("projectName") && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </Label>
            <span className="text-xs text-muted-foreground">Required</span>
          </div>
          <Input
            id="projectName"
            placeholder={copy.projectNamePlaceholder}
            value={data.projectName}
            onChange={(e) => onUpdate({ projectName: e.target.value })}
            onBlur={() => handleBlur("projectName")}
            className={cn(
              showError("projectName") && "border-red-500 focus-visible:ring-red-500",
              isFieldValid("projectName") && "border-brand focus-visible:ring-brand"
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
              {copy.customerNameLabel}
              {isFieldValid("customerName") && (
                <CheckCircle2 className="h-4 w-4 text-brand-foreground" />
              )}
              {showError("customerName") && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </Label>
            <span className="text-xs text-muted-foreground">Required</span>
          </div>
          <Input
            id="customerName"
            placeholder={copy.customerNamePlaceholder}
            value={data.customerName}
            onChange={(e) => onUpdate({ customerName: e.target.value })}
            onBlur={() => handleBlur("customerName")}
            className={cn(
              showError("customerName") && "border-red-500 focus-visible:ring-red-500",
              isFieldValid("customerName") && "border-brand focus-visible:ring-brand"
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
              {copy.addressLabel}
              {isFieldValid("address") && (
                <CheckCircle2 className="h-4 w-4 text-brand-foreground" />
              )}
              {showError("address") && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </Label>
            <span className="text-xs text-muted-foreground">Required</span>
          </div>
          <Input
            id="address"
            placeholder={copy.addressPlaceholder}
            value={data.address}
            onChange={(e) => onUpdate({ address: e.target.value })}
            onBlur={() => handleBlur("address")}
            className={cn(
              showError("address") && "border-red-500 focus-visible:ring-red-500",
              isFieldValid("address") && "border-brand focus-visible:ring-brand"
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
