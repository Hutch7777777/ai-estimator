"use client";

import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ProjectFormData, ProjectIntakeType } from "@/lib/types/project-form";

interface TradeSelectionStepProps {
  data: ProjectFormData;
  onUpdate: (data: Partial<ProjectFormData>) => void;
  onValidationChange?: (isValid: boolean) => void;
  intakeType?: ProjectIntakeType | null;
}

const HOVER_TRADES = [
  { id: "siding", label: "Siding", description: "James Hardie siding installation" },
  { id: "roofing", label: "Roofing", description: "Roof installation and repairs" },
  { id: "windows", label: "Windows", description: "Window installation and replacement" },
  { id: "gutters", label: "Gutters", description: "Gutter installation and maintenance" },
];

const PLANS_EDITOR_TRADES = [
  { id: "siding", label: "Siding / Exterior Finishes", description: "Required for the review editor and siding takeoff engine" },
  { id: "windows", label: "Windows", description: "Include window detections and trim quantities" },
  { id: "gutters", label: "Gutters", description: "Include gutter and downspout detections when present" },
];

export function TradeSelectionStep({
  data,
  onUpdate,
  onValidationChange,
  intakeType,
}: TradeSelectionStepProps) {
  const trades = intakeType === "plans" ? PLANS_EDITOR_TRADES : HOVER_TRADES;

  // Validate whenever selected trades change
  useEffect(() => {
    const selectedTrades = data.selectedTrades || [];
    const hasTrade = selectedTrades.length > 0;
    const hasRequiredSiding = intakeType !== "plans" || selectedTrades.includes("siding");
    const isValid = hasTrade && hasRequiredSiding;
    onValidationChange?.(isValid);
  }, [data.selectedTrades, intakeType, onValidationChange]);

  const handleTradeToggle = (tradeId: string) => {
    if (intakeType === "plans" && tradeId === "siding") return;

    const currentTrades = data.selectedTrades || [];
    const newTrades = currentTrades.includes(tradeId)
      ? currentTrades.filter((id) => id !== tradeId)
      : [...currentTrades, tradeId];
    onUpdate({ selectedTrades: newTrades });
  };

  return (
    <Card className="shadow-soft rounded-xl">
      <CardHeader>
        <CardTitle className="font-heading">
          {intakeType === "plans" ? "Plan Scope" : "Select Trades"}
        </CardTitle>
        <CardDescription>
          {intakeType === "plans"
            ? "Choose the scopes the review editor should prepare for. Siding is required for the current takeoff engine."
            : "Choose which trades are included in this project"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {trades.map((trade) => (
          <div key={trade.id} className="flex items-start space-x-3 rounded-lg border p-4">
            <Checkbox
              id={trade.id}
              checked={data.selectedTrades?.includes(trade.id)}
              disabled={intakeType === "plans" && trade.id === "siding"}
              onCheckedChange={() => handleTradeToggle(trade.id)}
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor={trade.id}
                className="cursor-pointer text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {trade.label}
              </Label>
              <p className="text-sm text-muted-foreground">{trade.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
