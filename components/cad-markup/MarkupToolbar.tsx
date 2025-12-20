"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  MousePointer2,
  Pentagon as PolygonIcon,
  Circle,
  Ruler,
  Undo,
  Redo,
  Trash2,
  Download,
  ChevronDown,
  Info,
  Scaling,
  FileSpreadsheet,
  FileJson,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolMode, MarkupMaterial } from "./types";
import { CategoryPicker } from "./CategoryPicker";
import { useState } from "react";

interface MarkupToolbarProps {
  currentTool: ToolMode;
  selectedMaterial: MarkupMaterial;
  onToolChange: (tool: ToolMode) => void;
  onMaterialChange: (material: MarkupMaterial) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearAll: () => void;
  onExportCSV: () => void;
  onExportExcel: () => void;
  onExportJSON: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function MarkupToolbar({
  currentTool,
  selectedMaterial,
  onToolChange,
  onMaterialChange,
  onUndo,
  onRedo,
  onClearAll,
  onExportCSV,
  onExportExcel,
  onExportJSON,
  canUndo,
  canRedo,
}: MarkupToolbarProps) {
  const [tipsOpen, setTipsOpen] = useState(false);

  const tools: Array<{
    mode: ToolMode;
    icon: typeof MousePointer2;
    label: string;
    description: string;
  }> = [
    {
      mode: "select",
      icon: MousePointer2,
      label: "Select",
      description: "Select and edit existing markups",
    },
    {
      mode: "draw",
      icon: PolygonIcon,
      label: "Draw Area",
      description: "Click to add points, double-click to finish",
    },
    {
      mode: "count",
      icon: Circle,
      label: "Count",
      description: "Click to add count markers",
    },
    {
      mode: "linear",
      icon: Ruler,
      label: "Linear",
      description: "Measure linear dimensions",
    },
    {
      mode: "calibrate",
      icon: Scaling,
      label: "Calibrate",
      description: "Click two points on a known dimension to set scale",
    },
  ];

  const showMaterialPicker = currentTool === "draw" || currentTool === "count" || currentTool === "linear";

  return (
    <Card className="h-full shadow-soft rounded-xl flex flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="font-heading text-lg">Tools</CardTitle>
      </CardHeader>

      <CardContent className="flex-1 space-y-6 overflow-y-auto">
        {/* Tool Selection */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Select Tool</p>
          <div className="grid grid-cols-2 gap-2">
            {tools.map((tool) => {
              const Icon = tool.icon;
              const isActive = currentTool === tool.mode;

              return (
                <Button
                  key={tool.mode}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="h-auto flex-col gap-1 p-3"
                  onClick={() => onToolChange(tool.mode)}
                  title={tool.description}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs">{tool.label}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Material Selection */}
        {showMaterialPicker && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Material</p>
            <CategoryPicker
              value={selectedMaterial}
              onChange={onMaterialChange}
            />
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Actions</p>
          <div className="space-y-2">
            {/* Undo/Redo row */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 justify-start"
                onClick={onUndo}
                disabled={!canUndo}
              >
                <Undo className="h-4 w-4 mr-2" />
                Undo
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 justify-start"
                onClick={onRedo}
                disabled={!canRedo}
              >
                <Redo className="h-4 w-4 mr-2" />
                Redo
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={onClearAll}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
            {/* Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <div className="flex items-center">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </div>
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={onExportCSV}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportJSON}>
                  <FileJson className="h-4 w-4 mr-2" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tips */}
        <Collapsible open={tipsOpen} onOpenChange={setTipsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                <span className="text-sm font-medium">Tips</span>
              </div>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${tipsOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2 text-xs text-muted-foreground">
            <div className="p-3 bg-gray-50 rounded-lg space-y-2">
              <p>
                <strong>Draw Area:</strong> Click to add points, double-click or click the first
                point to close the polygon
              </p>
              <p>
                <strong>Zoom:</strong> Scroll wheel to zoom in/out
              </p>
              <p>
                <strong>Pan:</strong> Hold Alt + drag to pan the view
              </p>
              <p>
                <strong>Linear:</strong> Click start and end points to measure distance
              </p>
              <p>
                <strong>Count:</strong> Click to add numbered markers
              </p>
              <p>
                <strong>Calibrate:</strong> Click two points on a known dimension, then enter the real-world distance
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
