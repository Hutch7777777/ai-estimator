"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Takeoff, LineItemWithState, TakeoffSection } from "@/lib/types/database";
import {
  Download,
  Send,
  CheckCircle,
  FileSpreadsheet,
  TrendingUp,
  DollarSign,
  FileText,
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
}: EstimateSummaryProps) {
  // State for proposal generation
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);

  // Separate items by type (material, labor, overhead)
  const { materials, labor, overhead } = separateItemsByType(lineItems);

  // Calculate current totals from line items (reflects unsaved changes)
  const currentTotals = {
    material: materials.reduce((sum, item) => sum + calculateMaterialTotal(item), 0),
    labor: labor.reduce((sum, item) => sum + calculateLaborTotal(item), 0),
    overhead: overhead.reduce((sum, item) => sum + calculateOverheadTotal(item), 0),
    total: 0, // Will be calculated below
    markup: 0, // Will be calculated below
  };

  const totalCosts = currentTotals.material + currentTotals.labor + currentTotals.overhead;
  // Calculate markup using markup_percent field (check multiple sources with fallback to 15%)
  const markupRate = takeoff?.markup_percent ?? 15;
  const markupAmount = totalCosts * (markupRate / 100);
  const grandTotal = totalCosts + markupAmount;
  const markup = markupAmount;

  currentTotals.total = grandTotal;
  currentTotals.markup = markup;

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
      const response = await fetch('http://localhost:5678/webhook/generate-proposal', {
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

        {/* Cost Breakdown */}
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
