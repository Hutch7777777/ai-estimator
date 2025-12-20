"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Check,
  Pencil,
} from "lucide-react";
import {
  CadMaterialCallout,
  getCalloutsByTrade,
  confirmCallout,
  confirmHighConfidenceCallouts,
  EXTERIOR_TRADES,
  EXCLUDED_TRADES,
  ALL_TRADES,
  formatTradeLabel,
  formatCategoryLabel,
} from "@/lib/supabase/cadExtractions";
import { EditCalloutDialog } from "./EditCalloutDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CalloutClassificationPanelProps {
  extractionId: string;
  onClassificationChange?: () => void;
}

type FilterOption = "all" | "exterior" | "excluded" | "low_confidence";

export function CalloutClassificationPanel({
  extractionId,
  onClassificationChange,
}: CalloutClassificationPanelProps) {
  const [loading, setLoading] = useState(true);
  const [calloutsByTrade, setCalloutsByTrade] = useState<Record<
    string,
    CadMaterialCallout[]
  > | null>(null);
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterOption>("all");
  const [showLowConfidenceOnly, setShowLowConfidenceOnly] = useState(false);
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [editingCallout, setEditingCallout] = useState<CadMaterialCallout | null>(null);

  // Load callouts on mount
  useEffect(() => {
    loadCallouts();
  }, [extractionId]);

  const loadCallouts = async () => {
    setLoading(true);
    const { data, error } = await getCalloutsByTrade(extractionId);
    if (error) {
      toast.error("Failed to load callouts", { description: error });
    } else {
      setCalloutsByTrade(data);
      // Auto-expand trades with callouts
      const tradesWithCallouts = new Set(
        Object.entries(data || {})
          .filter(([, callouts]) => callouts.length > 0)
          .map(([trade]) => trade)
      );
      setExpandedTrades(tradesWithCallouts);
    }
    setLoading(false);
  };

  // Get filtered trades based on filter option
  const filteredTrades = useMemo(() => {
    if (filter === "exterior") return EXTERIOR_TRADES;
    if (filter === "excluded") return EXCLUDED_TRADES;
    return ALL_TRADES;
  }, [filter]);

  // Get filtered callouts for a trade
  const getFilteredCallouts = (trade: string): CadMaterialCallout[] => {
    const callouts = calloutsByTrade?.[trade] || [];
    if (!showLowConfidenceOnly) return callouts;
    return callouts.filter((c) => (c.match_confidence || 0) < 0.8);
  };

  // Get total counts
  const totalCounts = useMemo(() => {
    if (!calloutsByTrade) return { total: 0, lowConfidence: 0, unconfirmed: 0 };

    let total = 0;
    let lowConfidence = 0;
    let unconfirmed = 0;

    Object.values(calloutsByTrade).forEach((callouts) => {
      total += callouts.length;
      callouts.forEach((c) => {
        if ((c.match_confidence || 0) < 0.8) lowConfidence++;
        if (!c.user_corrected && c.trade !== "unknown") unconfirmed++;
      });
    });

    return { total, lowConfidence, unconfirmed };
  }, [calloutsByTrade]);

  const toggleTrade = (trade: string) => {
    const newExpanded = new Set(expandedTrades);
    if (newExpanded.has(trade)) {
      newExpanded.delete(trade);
    } else {
      newExpanded.add(trade);
    }
    setExpandedTrades(newExpanded);
  };

  const handleConfirm = async (callout: CadMaterialCallout) => {
    setConfirmingIds((prev) => new Set(prev).add(callout.id));

    const result = await confirmCallout(callout.id);

    if (result.success) {
      toast.success("Classification confirmed", {
        description: `"${callout.normalized_text}" confirmed as ${formatTradeLabel(callout.trade)}`,
      });
      await loadCallouts();
      onClassificationChange?.();
    } else {
      toast.error("Failed to confirm", { description: result.error });
    }

    setConfirmingIds((prev) => {
      const next = new Set(prev);
      next.delete(callout.id);
      return next;
    });
  };

  const handleBulkConfirm = async () => {
    setBulkConfirming(true);

    const result = await confirmHighConfidenceCallouts(extractionId);

    if (result.success) {
      toast.success("Bulk confirmation complete", {
        description: `${result.confirmedCount} high-confidence callouts confirmed`,
      });
      await loadCallouts();
      onClassificationChange?.();
    } else {
      toast.error("Bulk confirmation failed", { description: result.error });
    }

    setBulkConfirming(false);
  };

  const handleEditSaved = async () => {
    await loadCallouts();
    onClassificationChange?.();
  };

  // Get confidence icon and color
  const getConfidenceDisplay = (confidence: number | null) => {
    const conf = confidence || 0;
    const percentage = Math.round(conf * 100);

    if (conf >= 0.8) {
      return {
        icon: <CheckCircle className="h-4 w-4 text-green-600" />,
        color: "text-green-600",
        bgColor: "bg-green-50",
      };
    } else if (conf >= 0.5) {
      return {
        icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
        color: "text-amber-500",
        bgColor: "bg-amber-50",
      };
    } else {
      return {
        icon: <XCircle className="h-4 w-4 text-red-500" />,
        color: "text-red-500",
        bgColor: "bg-red-50",
      };
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading classifications...
        </CardContent>
      </Card>
    );
  }

  if (!calloutsByTrade || totalCounts.total === 0) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">
              Material Classifications
            </CardTitle>
            <Badge variant="outline">
              {totalCounts.total} callouts
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Filter:</Label>
              <Select
                value={filter}
                onValueChange={(v) => setFilter(v as FilterOption)}
              >
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Trades</SelectItem>
                  <SelectItem value="exterior">Exterior Only</SelectItem>
                  <SelectItem value="excluded">Excluded Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="low-confidence"
                checked={showLowConfidenceOnly}
                onCheckedChange={(checked) =>
                  setShowLowConfidenceOnly(checked as boolean)
                }
              />
              <Label
                htmlFor="low-confidence"
                className="text-xs cursor-pointer"
              >
                Show low confidence only ({totalCounts.lowConfidence})
              </Label>
            </div>
          </div>

          {/* Trade Sections */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredTrades.map((trade) => {
              const callouts = getFilteredCallouts(trade);
              if (callouts.length === 0) return null;

              const isExpanded = expandedTrades.has(trade);
              const isExcluded = EXCLUDED_TRADES.includes(trade);

              return (
                <div
                  key={trade}
                  className={cn(
                    "border rounded-lg",
                    isExcluded && "opacity-60"
                  )}
                >
                  {/* Trade Header */}
                  <button
                    onClick={() => toggleTrade(trade)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      <span className="font-medium">
                        {formatTradeLabel(trade)}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {callouts.length}
                      </Badge>
                      {isExcluded && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Excluded
                        </Badge>
                      )}
                    </div>
                  </button>

                  {/* Callout List */}
                  {isExpanded && (
                    <div className="border-t">
                      {callouts.map((callout) => {
                        const confDisplay = getConfidenceDisplay(
                          callout.match_confidence
                        );
                        const percentage = Math.round(
                          (callout.match_confidence || 0) * 100
                        );
                        const isConfirming = confirmingIds.has(callout.id);

                        return (
                          <div
                            key={callout.id}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 border-b last:border-b-0",
                              confDisplay.bgColor
                            )}
                          >
                            {/* Confidence Icon */}
                            {confDisplay.icon}

                            {/* Callout Text */}
                            <span className="flex-1 text-sm truncate font-mono">
                              {callout.normalized_text}
                            </span>

                            {/* Category Badge */}
                            {callout.material_type && (
                              <Badge variant="outline" className="text-[10px]">
                                {formatCategoryLabel(callout.material_type)}
                              </Badge>
                            )}

                            {/* Confidence Percentage */}
                            <span
                              className={cn("text-xs font-medium w-10 text-right", confDisplay.color)}
                            >
                              {percentage}%
                            </span>

                            {/* User Corrected Badge */}
                            {callout.user_corrected && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                              >
                                Reviewed
                              </Badge>
                            )}

                            {/* Actions */}
                            {!isExcluded && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => handleConfirm(callout)}
                                  disabled={isConfirming || callout.user_corrected}
                                  title={
                                    callout.user_corrected
                                      ? "Already reviewed"
                                      : "Confirm classification"
                                  }
                                >
                                  {isConfirming ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => setEditingCallout(callout)}
                                  title="Edit classification"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkConfirm}
              disabled={bulkConfirming || totalCounts.unconfirmed === 0}
            >
              {bulkConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirm All High-Confidence
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              {totalCounts.unconfirmed} unconfirmed
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EditCalloutDialog
        open={editingCallout !== null}
        onOpenChange={(open) => !open && setEditingCallout(null)}
        callout={editingCallout}
        onSaved={handleEditSaved}
      />
    </>
  );
}
