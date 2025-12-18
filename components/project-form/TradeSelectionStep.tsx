"use client";

import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ProjectFormData } from "@/app/project/new/page";

interface TradeSelectionStepProps {
  data: ProjectFormData;
  onUpdate: (data: Partial<ProjectFormData>) => void;
  onValidationChange?: (isValid: boolean) => void;
}

const AVAILABLE_TRADES = [
  { id: "siding", label: "Siding", description: "James Hardie siding installation" },
  { id: "roofing", label: "Roofing", description: "Roof installation and repairs" },
  { id: "windows", label: "Windows", description: "Window installation and replacement" },
  { id: "gutters", label: "Gutters", description: "Gutter installation and maintenance" },
];

export function TradeSelectionStep({ data, onUpdate, onValidationChange }: TradeSelectionStepProps) {
  // Validate whenever selected trades change
  useEffect(() => {
    const isValid = (data.selectedTrades?.length || 0) > 0;
    onValidationChange?.(isValid);
  }, [data.selectedTrades, onValidationChange]);

  const handleTradeToggle = (tradeId: string) => {
    const currentTrades = data.selectedTrades || [];
    const newTrades = currentTrades.includes(tradeId)
      ? currentTrades.filter((id) => id !== tradeId)
      : [...currentTrades, tradeId];
    onUpdate({ selectedTrades: newTrades });
  };

  return (
    <Card className="shadow-soft rounded-xl">
      <CardHeader>
        <CardTitle className="font-heading">Select Trades</CardTitle>
        <CardDescription>
          Choose which trades are included in this project
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {AVAILABLE_TRADES.map((trade) => (
          <div key={trade.id} className="flex items-start space-x-3 rounded-lg border p-4">
            <Checkbox
              id={trade.id}
              checked={data.selectedTrades?.includes(trade.id)}
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
