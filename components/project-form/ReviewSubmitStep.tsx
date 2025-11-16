"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { ProjectFormData } from "@/app/project/new/page";

interface ReviewSubmitStepProps {
  data: ProjectFormData;
  onUpdate: (data: Partial<ProjectFormData>) => void;
}

export function ReviewSubmitStep({ data, onUpdate }: ReviewSubmitStepProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Review & Submit</CardTitle>
          <CardDescription>
            Review your project details before submitting
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Project Info */}
          <div>
            <h3 className="mb-3 flex items-center text-sm font-medium">
              <CheckCircle2 className="mr-2 h-4 w-4 text-primary" />
              Project Information
            </h3>
            <div className="ml-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Project Name:</span>
                <span className="font-medium">{data.projectName || "Not provided"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer Name:</span>
                <span className="font-medium">{data.customerName || "Not provided"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Address:</span>
                <span className="font-medium">{data.address || "Not provided"}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Selected Trades */}
          <div>
            <h3 className="mb-3 flex items-center text-sm font-medium">
              <CheckCircle2 className="mr-2 h-4 w-4 text-primary" />
              Selected Trades
            </h3>
            <div className="ml-6">
              {data.selectedTrades && data.selectedTrades.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {data.selectedTrades.map((trade) => (
                    <span
                      key={trade}
                      className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary"
                    >
                      {trade}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No trades selected</p>
              )}
            </div>
          </div>

          <Separator />

          {/* PDF Upload */}
          <div>
            <h3 className="mb-3 flex items-center text-sm font-medium">
              <CheckCircle2 className="mr-2 h-4 w-4 text-primary" />
              HOVER PDF
            </h3>
            <div className="ml-6 text-sm">
              {data.pdfFile ? (
                <span className="font-medium">{data.pdfFile.name}</span>
              ) : (
                <span className="text-muted-foreground">No file uploaded</span>
              )}
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any special instructions or notes for this project..."
              value={data.notes}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">What happens next?</p>
            <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
              <li>Your project will be saved to the database</li>
              <li>The HOVER PDF will be uploaded to Supabase Storage</li>
              <li>An n8n webhook will be triggered to process the Excel generation</li>
              <li>You'll receive real-time updates via Supabase Realtime</li>
              <li>Download your Excel takeoff when processing is complete (30-60 seconds)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
