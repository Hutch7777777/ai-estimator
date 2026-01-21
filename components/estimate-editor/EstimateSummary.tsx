"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Takeoff, LineItemWithState, TakeoffSection } from "@/lib/types/database";
import {
  LaborSection,
  OverheadSection,
  ProjectTotals,
  LaborLineItem,
  OverheadLineItem,
} from "@/lib/types/extraction";
import {
  Download,
  Send,
  CheckCircle,
  FileSpreadsheet,
  DollarSign,
  FileText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { exportProfessionalEstimate, exportVendorTakeoff } from "@/lib/utils/excelExportProfessional";
import {
  separateItemsByType,
  calculateMaterialTotal,
  calculateLaborTotal,
  calculateOverheadTotal,
} from "@/lib/utils/itemHelpers";

interface EstimateSummaryProps {
  takeoff: Takeoff;
  sections: TakeoffSection[];
  lineItems: LineItemWithState[];
  projectInfo: {
    clientName: string;
    address: string;
    projectName: string;
  };
  onApprove?: () => void;
  onSend?: () => void;
  // NEW: V2 response data from Mike Skjei methodology
  labor?: LaborSection;
  overhead?: OverheadSection;
  projectTotals?: ProjectTotals;
  // Optional display flags
  showBreakdown?: boolean;
  showLaborDetails?: boolean;
  showOverheadDetails?: boolean;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case "draft":
      return "bg-[#f1f5f9] text-[#475569]";
    case "in_progress":
      return "bg-blue-100 text-blue-800";
    case "review":
      return "bg-amber-100 text-amber-800";
    case "approved":
      return "bg-[#dcfce7] text-[#166534]";
    case "sent":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-[#f1f5f9] text-[#475569]";
  }
};

export function EstimateSummary({
  takeoff,
  sections,
  lineItems,
  projectInfo,
  onApprove,
  onSend,
  // NEW V2 props
  labor: laborSection,
  overhead: overheadSection,
  projectTotals,
  showBreakdown = true,
  showLaborDetails = false,
  showOverheadDetails = false,
}: EstimateSummaryProps) {
  // State for proposal generation
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  // State for collapsible sections
  const [laborDetailsOpen, setLaborDetailsOpen] = useState(showLaborDetails);
  const [overheadDetailsOpen, setOverheadDetailsOpen] = useState(showOverheadDetails);

  // Determine if we have V2 project totals from the API
  const hasProjectTotals = !!projectTotals;

  // Separate items by type (material, labor, overhead) - for fallback calculation
  const { materials, labor: laborItems, overhead: overheadItems } = separateItemsByType(lineItems);

  // Calculate current totals from line items (reflects unsaved changes) - FALLBACK
  const legacyTotals = {
    material: materials.reduce((sum, item) => sum + calculateMaterialTotal(item), 0),
    labor: laborItems.reduce((sum, item) => sum + calculateLaborTotal(item), 0),
    overhead: overheadItems.reduce((sum, item) => sum + calculateOverheadTotal(item), 0),
    total: 0,
    markup: 0,
  };

  const legacyTotalCosts = legacyTotals.material + legacyTotals.labor + legacyTotals.overhead;
  const legacyMarkupRate = takeoff?.markup_percent ?? 15;
  const legacyMarkupAmount = legacyTotalCosts * (legacyMarkupRate / 100);
  legacyTotals.total = legacyTotalCosts + legacyMarkupAmount;
  legacyTotals.markup = legacyMarkupAmount;

  // Use project_totals if available, otherwise fall back to line item calculation
  const displayData = hasProjectTotals ? {
    // Materials
    materialCost: projectTotals.material_cost,
    materialMarkup: projectTotals.material_markup_amount,
    materialTotal: projectTotals.material_total,
    materialMarkupRate: projectTotals.material_markup_rate,

    // Labor breakdown
    installationLabor: projectTotals.installation_labor_subtotal,
    overheadCost: projectTotals.overhead_subtotal,
    laborSubtotal: projectTotals.labor_cost_before_markup,
    laborMarkup: projectTotals.labor_markup_amount,
    laborTotal: projectTotals.labor_total,
    laborMarkupRate: projectTotals.labor_markup_rate,

    // Final totals
    subtotal: projectTotals.subtotal,
    projectInsurance: projectTotals.project_insurance,
    grandTotal: projectTotals.grand_total,
  } : {
    // Fallback to legacy calculation from line items
    materialCost: legacyTotals.material,
    materialMarkup: legacyTotals.material * (legacyMarkupRate / 100),
    materialTotal: legacyTotals.material * (1 + legacyMarkupRate / 100),
    materialMarkupRate: legacyMarkupRate / 100,

    installationLabor: legacyTotals.labor,
    overheadCost: legacyTotals.overhead,
    laborSubtotal: legacyTotals.labor + legacyTotals.overhead,
    laborMarkup: (legacyTotals.labor + legacyTotals.overhead) * (legacyMarkupRate / 100),
    laborTotal: (legacyTotals.labor + legacyTotals.overhead) * (1 + legacyMarkupRate / 100),
    laborMarkupRate: legacyMarkupRate / 100,

    subtotal: legacyTotals.total,
    projectInsurance: 0, // Not calculated in legacy mode
    grandTotal: legacyTotals.total,
  };

  // For backward compatibility with existing UI code
  const currentTotals = {
    material: displayData.materialCost,
    labor: displayData.installationLabor,
    overhead: displayData.overheadCost,
    markup: displayData.materialMarkup + displayData.laborMarkup,
    total: displayData.grandTotal,
  };

  // Handle Excel export for full estimate (professional format)
  const handleExportFullEstimate = async () => {
    try {
      // Group line items by section ID for professional export format
      const lineItemsBySection: Record<string, typeof lineItems> = {};
      sections.forEach(section => {
        lineItemsBySection[section.id] = lineItems.filter(
          item => item.section_id === section.id
        );
      });

      // Transform projectInfo to match professional export format
      const exportProjectInfo = {
        customerName: projectInfo.clientName,
        jobAddress: projectInfo.address,
        projectId: takeoff.project_id,
      };

      await exportProfessionalEstimate(
        takeoff,
        sections,
        lineItemsBySection,
        exportProjectInfo
      );
    } catch (error) {
      console.error("Error exporting full estimate:", error);
      alert("Failed to export estimate. Please try again.");
    }
  };

  // Handle Excel export for vendor takeoff
  const handleExportVendorTakeoff = async () => {
    try {
      // Group line items by section ID
      const lineItemsBySection: Record<string, typeof lineItems> = {};
      sections.forEach(section => {
        lineItemsBySection[section.id] = lineItems.filter(
          item => item.section_id === section.id
        );
      });

      // Transform projectInfo to match export format
      const exportProjectInfo = {
        customerName: projectInfo.clientName,
        jobAddress: projectInfo.address,
      };

      await exportVendorTakeoff(
        sections,
        lineItemsBySection,
        exportProjectInfo
      );
    } catch (error) {
      console.error("Error exporting vendor takeoff:", error);
      alert("Failed to export vendor takeoff. Please try again.");
    }
  };

  // Handle Proposal download from n8n
  const handleDownloadProposal = async () => {
    if (!takeoff?.id) {
      console.error('No takeoff ID available');
      return;
    }

    setIsGeneratingProposal(true);

    try {
      const response = await fetch('https://n8n-production-293e.up.railway.app/webhook/generate-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ takeoff_id: takeoff.id })
      });

      if (!response.ok) {
        throw new Error('Failed to generate proposal');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Proposal_${projectInfo.clientName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error generating proposal:', error);
      alert('Failed to generate proposal. Please try again.');
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  const hasUnsavedChanges = lineItems.some((item) => item.isNew || item.isModified);

  // Calculate percentage breakdown
  const materialPercent =
    currentTotals.total > 0 ? (currentTotals.material / currentTotals.total) * 100 : 0;
  const laborPercent =
    currentTotals.total > 0 ? (currentTotals.labor / currentTotals.total) * 100 : 0;
  const overheadPercent =
    currentTotals.total > 0 ? (currentTotals.overhead / currentTotals.total) * 100 : 0;
  const markupPercent =
    currentTotals.total > 0 ? (currentTotals.markup / currentTotals.total) * 100 : 0;

  const totalLineItems = lineItems.length;

  return (
    <Card className="border-2 shadow-soft">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-2xl font-heading flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-primary" />
              Estimate Summary
            </CardTitle>
            <CardDescription className="mt-1">
              Complete cost breakdown across all trades
            </CardDescription>
          </div>
          <Badge className={getStatusColor(takeoff.status)}>
            {takeoff.status.replace("_", " ").toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Grand Total Card */}
        <div className="p-6 bg-[#f0fdf4] rounded-lg border border-[#00cc6a]/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#475569] uppercase tracking-wide font-medium">
                Grand Total
              </p>
              <p className="text-4xl font-bold text-[#00cc6a] mt-1">
                {formatCurrency(currentTotals.total)}
              </p>
              {hasUnsavedChanges && (
                <p className="text-xs text-amber-600 mt-1 font-medium">
                  (Includes unsaved changes)
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Line Items</p>
              <p className="text-2xl font-semibold">{totalLineItems}</p>
            </div>
          </div>
        </div>

        {/* Cost Breakdown - V2 Detailed View */}
        {hasProjectTotals && showBreakdown ? (
          <div className="space-y-4">
            {/* Materials Section */}
            <div className="p-4 bg-white border border-[#e2e8f0] rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-green-700 uppercase tracking-wide">
                  Materials
                </p>
                <Badge variant="outline" className="text-xs bg-green-50">
                  {((displayData.materialMarkupRate ?? 0) * 100).toFixed(0)}% Markup
                </Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Material Cost</span>
                  <span>{formatCurrency(displayData.materialCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Markup ({((displayData.materialMarkupRate ?? 0) * 100).toFixed(0)}%)</span>
                  <span>{formatCurrency(displayData.materialMarkup)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>Material Total</span>
                  <span className="text-green-700">{formatCurrency(displayData.materialTotal)}</span>
                </div>
              </div>
            </div>

            {/* Labor Section */}
            <div className="p-4 bg-white border border-[#e2e8f0] rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-amber-700 uppercase tracking-wide">
                  Labor
                </p>
                <Badge variant="outline" className="text-xs bg-amber-50">
                  {((displayData.laborMarkupRate ?? 0) * 100).toFixed(0)}% Markup
                </Badge>
              </div>
              <div className="space-y-2 text-sm">
                {/* Installation Labor with optional details */}
                <Collapsible open={laborDetailsOpen} onOpenChange={setLaborDetailsOpen}>
                  <div className="flex justify-between items-center">
                    <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                      {laborDetailsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      Installation Labor
                    </CollapsibleTrigger>
                    <span>{formatCurrency(displayData.installationLabor)}</span>
                  </div>
                  <CollapsibleContent className="pl-4 mt-2 space-y-1 border-l-2 border-amber-200">
                    {laborSection?.installation_items?.map((item: LaborLineItem, index: number) => (
                      <div key={item.rate_id || index} className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.rate_name} ({item.quantity.toFixed(2)} {item.unit})</span>
                        <span>{formatCurrency(item.total_cost)}</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>

                {/* Overhead with optional details */}
                <Collapsible open={overheadDetailsOpen} onOpenChange={setOverheadDetailsOpen}>
                  <div className="flex justify-between items-center">
                    <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                      {overheadDetailsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      Overhead
                    </CollapsibleTrigger>
                    <span>{formatCurrency(displayData.overheadCost)}</span>
                  </div>
                  <CollapsibleContent className="pl-4 mt-2 space-y-1 border-l-2 border-purple-200">
                    {overheadSection?.items?.map((item: OverheadLineItem, index: number) => (
                      <div key={item.cost_id || index} className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.cost_name}</span>
                        <span>{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground">Labor Subtotal</span>
                  <span>{formatCurrency(displayData.laborSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Markup ({((displayData.laborMarkupRate ?? 0) * 100).toFixed(0)}%)</span>
                  <span>{formatCurrency(displayData.laborMarkup)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>Labor Total</span>
                  <span className="text-amber-700">{formatCurrency(displayData.laborTotal)}</span>
                </div>
              </div>
            </div>

            {/* Totals Section */}
            <div className="p-4 bg-slate-50 border border-[#e2e8f0] rounded-lg">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal (Materials + Labor)</span>
                  <span>{formatCurrency(displayData.subtotal)}</span>
                </div>
                {displayData.projectInsurance > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Project Insurance ($24.38/$1,000)</span>
                    <span>{formatCurrency(displayData.projectInsurance)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Legacy 4-column grid view */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-[#e2e8f0] rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-green-600 uppercase tracking-wide font-medium">
                  Material
                </p>
                <Badge variant="outline" className="text-xs">
                  {materialPercent.toFixed(1)}%
                </Badge>
              </div>
              <p className="text-2xl font-bold text-[#0f172a]">
                {formatCurrency(currentTotals.material)}
              </p>
            </div>

            <div className="p-4 bg-white border border-[#e2e8f0] rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-amber-600 uppercase tracking-wide font-medium">
                  Labor
                </p>
                <Badge variant="outline" className="text-xs">
                  {laborPercent.toFixed(1)}%
                </Badge>
              </div>
              <p className="text-2xl font-bold text-[#0f172a]">
                {formatCurrency(currentTotals.labor)}
              </p>
            </div>

            <div className="p-4 bg-white border border-[#e2e8f0] rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-purple-600 uppercase tracking-wide font-medium">
                  Overhead
                </p>
                <Badge variant="outline" className="text-xs">
                  {overheadPercent.toFixed(1)}%
                </Badge>
              </div>
              <p className="text-2xl font-bold text-[#0f172a]">
                {formatCurrency(currentTotals.overhead)}
              </p>
            </div>

            <div className="p-4 bg-white border border-[#e2e8f0] rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className={`text-xs uppercase tracking-wide font-medium ${
                  currentTotals.markup < 0 ? 'text-red-600' : 'text-blue-600'
                }`}>
                  Markup
                </p>
                <Badge variant="outline" className="text-xs">
                  {markupPercent.toFixed(1)}%
                </Badge>
              </div>
              <p className={`text-2xl font-bold ${
                currentTotals.markup < 0 ? 'text-red-600' : 'text-[#0f172a]'
              }`}>
                {formatCurrency(currentTotals.markup)}
              </p>
            </div>
          </div>
        )}

        {/* Visual Breakdown Bar */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Cost Distribution</p>
          <div className="h-6 w-full flex rounded-md overflow-hidden border border-[#e2e8f0]">
            {materialPercent > 0 && (
              <div
                className="bg-green-500 flex items-center justify-center text-xs text-white font-medium"
                style={{ width: `${materialPercent}%` }}
                title={`Material: ${formatCurrency(currentTotals.material)}`}
              >
                {materialPercent > 10 && `${materialPercent.toFixed(0)}%`}
              </div>
            )}
            {laborPercent > 0 && (
              <div
                className="bg-amber-500 flex items-center justify-center text-xs text-white font-medium"
                style={{ width: `${laborPercent}%` }}
                title={`Labor: ${formatCurrency(currentTotals.labor)}`}
              >
                {laborPercent > 10 && `${laborPercent.toFixed(0)}%`}
              </div>
            )}
            {overheadPercent > 0 && (
              <div
                className="bg-purple-500 flex items-center justify-center text-xs text-white font-medium"
                style={{ width: `${overheadPercent}%` }}
                title={`Overhead: ${formatCurrency(currentTotals.overhead)}`}
              >
                {overheadPercent > 10 && `${overheadPercent.toFixed(0)}%`}
              </div>
            )}
            {Math.abs(markupPercent) > 0 && (
              <div
                className={`flex items-center justify-center text-xs text-white font-medium ${
                  currentTotals.markup < 0 ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.abs(markupPercent)}%` }}
                title={`Markup: ${formatCurrency(currentTotals.markup)}`}
              >
                {Math.abs(markupPercent) > 10 && `${markupPercent.toFixed(0)}%`}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="space-y-3">
          {/* Export Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleExportFullEstimate}
            >
              <Download className="mr-2 h-4 w-4" />
              Full Estimate
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleExportVendorTakeoff}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Vendor Takeoff
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDownloadProposal}
              disabled={isGeneratingProposal}
            >
              {isGeneratingProposal ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-[#e2e8f0] border-t-[#0f172a]" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Proposal
                </>
              )}
            </Button>
          </div>

          {/* Workflow Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            {onApprove && takeoff.status === "review" && (
              <Button variant="default" className="flex-1" onClick={onApprove}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve Estimate
              </Button>
            )}
            {onSend && takeoff.status === "approved" && (
              <Button variant="default" className="flex-1" onClick={onSend}>
                <Send className="mr-2 h-4 w-4" />
                Send to Client
              </Button>
            )}
          </div>
        </div>

        {/* Metadata */}
        {takeoff.notes && (
          <div className="p-4 bg-muted/50 rounded-lg border">
            <p className="text-sm font-medium text-foreground mb-1">Notes:</p>
            <p className="text-sm text-muted-foreground">{takeoff.notes}</p>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <div>
            Created: {new Date(takeoff.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          {takeoff.approved_by && takeoff.approved_at && (
            <div>
              Approved by {takeoff.approved_by} on{" "}
              {new Date(takeoff.approved_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
