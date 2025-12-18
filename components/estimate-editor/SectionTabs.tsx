"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TakeoffSection, LineItemWithState } from "@/lib/types/database";
import { EstimateGrid } from "./EstimateGrid";
import { Badge } from "@/components/ui/badge";

interface SectionTabsProps {
  sections: TakeoffSection[];
  lineItems: LineItemWithState[];
  takeoffId: string;
  onLineItemsChange: (sectionId: string, items: LineItemWithState[]) => void;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
};

export function SectionTabs({
  sections,
  lineItems,
  takeoffId,
  onLineItemsChange,
  onSave,
  isSaving = false,
}: SectionTabsProps) {
  // Group line items by section
  const lineItemsBySection = lineItems.reduce((acc, item) => {
    if (!acc[item.section_id]) {
      acc[item.section_id] = [];
    }
    acc[item.section_id].push(item);
    return acc;
  }, {} as Record<string, LineItemWithState[]>);

  // Calculate totals for each section (from current line items state)
  const getSectionTotals = (sectionId: string) => {
    const items = lineItemsBySection[sectionId] || [];
    const material = items.reduce((sum, item) => sum + (item.material_extended || 0), 0);
    const labor = items.reduce((sum, item) => sum + (item.labor_extended || 0), 0);
    const equipment = items.reduce((sum, item) => sum + (item.equipment_extended || 0), 0);
    const total = material + labor + equipment;

    return { material, labor, equipment, total };
  };

  // Sort sections by sort_order
  const sortedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  // Get default active tab (first section)
  const defaultSection = sortedSections[0]?.id || "";

  return (
    <Tabs defaultValue={defaultSection} className="w-full">
      <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${sortedSections.length}, 1fr)` }}>
        {sortedSections.map((section) => {
          const items = lineItemsBySection[section.id] || [];
          const totals = getSectionTotals(section.id);
          const hasUnsavedChanges = items.some((item) => item.isNew || item.isModified);

          return (
            <TabsTrigger key={section.id} value={section.id} className="relative">
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <span>{section.display_name}</span>
                  {hasUnsavedChanges && (
                    <Badge variant="outline" className="h-4 px-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                      •
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-normal">
                  {items.length} items • {formatCurrency(totals.total)}
                </div>
              </div>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {sortedSections.map((section) => {
        const items = lineItemsBySection[section.id] || [];
        const totals = getSectionTotals(section.id);

        return (
          <TabsContent key={section.id} value={section.id} className="space-y-4">
            {/* Section Summary Card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg border">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Material</p>
                <p className="text-lg font-semibold">{formatCurrency(totals.material)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Labor</p>
                <p className="text-lg font-semibold">{formatCurrency(totals.labor)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Equipment</p>
                <p className="text-lg font-semibold">{formatCurrency(totals.equipment)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Section Total</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(totals.total)}</p>
              </div>
            </div>

            {/* Notes Display */}
            {section.notes && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Section Notes:</p>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">{section.notes}</p>
              </div>
            )}

            {/* Estimate Grid */}
            <EstimateGrid
              items={items}
              sectionId={section.id}
              takeoffId={takeoffId}
              onItemsChange={(updatedItems) => onLineItemsChange(section.id, updatedItems)}
              onSave={onSave}
              isSaving={isSaving}
            />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
