"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { ProjectFormData } from "@/app/project/new/page";

interface PDFUploadStepProps {
  data: ProjectFormData;
  onUpdate: (data: Partial<ProjectFormData>) => void;
}

export function PDFUploadStep({ data, onUpdate }: PDFUploadStepProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onUpdate({ pdfFile: file });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload HOVER PDF</CardTitle>
        <CardDescription>
          Upload your HOVER measurement report for this project
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="pdfFile">HOVER PDF File</Label>
          <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 transition-colors hover:border-muted-foreground/50">
            <div className="text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
              <div className="mt-4">
                <Label htmlFor="pdfFile" className="cursor-pointer text-sm font-medium text-primary hover:underline">
                  Choose a file
                </Label>
                <Input
                  id="pdfFile"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <p className="mt-1 text-xs text-muted-foreground">or drag and drop</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">PDF up to 10MB</p>
            </div>
          </div>
          {data.pdfFile && (
            <p className="text-sm text-muted-foreground">
              Selected file: <span className="font-medium">{data.pdfFile.name}</span>
            </p>
          )}
        </div>

        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> The PDF will be uploaded to Supabase Storage and processed to extract measurements and quantities.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
