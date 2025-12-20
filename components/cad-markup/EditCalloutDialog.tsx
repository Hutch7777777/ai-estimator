"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  CadMaterialCallout,
  ALL_TRADES,
  TRADE_CATEGORIES,
  EXCLUDED_TRADES,
  formatTradeLabel,
  formatCategoryLabel,
  updateCalloutTrade,
  recordTrainingExample,
} from "@/lib/supabase/cadExtractions";
import { toast } from "sonner";

interface EditCalloutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callout: CadMaterialCallout | null;
  onSaved: () => void;
}

export function EditCalloutDialog({
  open,
  onOpenChange,
  callout,
  onSaved,
}: EditCalloutDialogProps) {
  const [trade, setTrade] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [addToTraining, setAddToTraining] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when callout changes
  useEffect(() => {
    if (callout) {
      setTrade(callout.trade || "unknown");
      setCategory(callout.material_type || "");
      setAddToTraining(true);
    }
  }, [callout]);

  // Get categories for selected trade
  const categories = trade ? TRADE_CATEGORIES[trade] || [] : [];

  // Handle trade change - reset category if not valid for new trade
  const handleTradeChange = (newTrade: string) => {
    setTrade(newTrade);
    const newCategories = TRADE_CATEGORIES[newTrade] || [];
    if (!newCategories.includes(category)) {
      setCategory("");
    }
  };

  const handleSave = async () => {
    if (!callout) return;

    setIsSaving(true);

    try {
      // Update the callout classification
      const result = await updateCalloutTrade(
        callout.id,
        trade,
        category || undefined
      );

      if (!result.success) {
        toast.error("Failed to update classification", {
          description: result.error,
        });
        return;
      }

      // Record training example if checkbox is checked
      if (addToTraining) {
        const wasCorrection = trade !== callout.trade;
        await recordTrainingExample(
          callout.normalized_text,
          trade,
          category,
          wasCorrection
        );
      }

      toast.success("Classification updated", {
        description: `"${callout.normalized_text}" classified as ${formatTradeLabel(trade)}`,
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error("Error saving classification");
    } finally {
      setIsSaving(false);
    }
  };

  const confidence = callout?.match_confidence
    ? Math.round(callout.match_confidence * 100)
    : 0;

  const isExcluded = EXCLUDED_TRADES.includes(trade);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-gray-950 z-50">
        <DialogHeader>
          <DialogTitle>Edit Classification</DialogTitle>
          <DialogDescription>
            Update the trade and category for this material callout.
          </DialogDescription>
        </DialogHeader>

        {callout && (
          <div className="space-y-4 py-4">
            {/* Callout Text Display */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Callout Text
              </Label>
              <div className="p-3 bg-muted/50 rounded-md font-mono text-sm break-words">
                {callout.normalized_text}
              </div>
            </div>

            {/* Current Classification */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Current:</span>
              <Badge variant="outline">
                {formatTradeLabel(callout.trade)}
              </Badge>
              {callout.material_type && (
                <>
                  <span>/</span>
                  <Badge variant="secondary" className="max-w-[200px] truncate">
                    {formatCategoryLabel(callout.material_type)}
                  </Badge>
                </>
              )}
              <span className="ml-2">- {confidence}% confidence</span>
            </div>

            {/* Trade Select */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Trade
              </Label>
              <Select value={trade} onValueChange={handleTradeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trade..." />
                </SelectTrigger>
                <SelectContent className="z-[200]" position="popper" sideOffset={5}>
                  {ALL_TRADES.filter((t) => t !== "unknown").map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      className={
                        EXCLUDED_TRADES.includes(t) ? "text-muted-foreground" : ""
                      }
                    >
                      {formatTradeLabel(t)}
                      {EXCLUDED_TRADES.includes(t) && " (excluded)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Select */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Category
              </Label>
              <Select
                value={category}
                onValueChange={setCategory}
                disabled={categories.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      categories.length === 0
                        ? "No categories for this trade"
                        : "Select category..."
                    }
                  />
                </SelectTrigger>
                <SelectContent className="z-[200]" position="popper" sideOffset={5}>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {formatCategoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Excluded Trade Warning */}
            {isExcluded && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                This trade is excluded from exterior estimates. The callout will
                be dimmed in the classification panel.
              </div>
            )}

            {/* Add to Training Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="add-to-training"
                checked={addToTraining}
                onCheckedChange={(checked) =>
                  setAddToTraining(checked as boolean)
                }
              />
              <Label
                htmlFor="add-to-training"
                className="text-sm cursor-pointer"
              >
                Add to training data (improve future classifications)
              </Label>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !trade}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Classification"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
