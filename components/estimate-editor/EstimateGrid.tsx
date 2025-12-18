"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  CellValueChangedEvent,
  GridReadyEvent,
  GridApi,
  RowClassParams,
  ModuleRegistry,
  AllCommunityModule,
  ICellRendererParams,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Save, ChevronRight, ChevronDown, MoreVertical, Table } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { v4 as uuidv4 } from "uuid";
import { LineItemWithState } from "@/lib/types/database";
import { ProductSearchModal } from "./ProductSearchModal";
import { getProductAlternatives } from "@/lib/supabase/products";
import { Database } from "@/lib/types/database";

type ProductCatalog = Database["public"]["Tables"]["product_catalog"]["Row"];

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

interface EstimateGridProps {
  items: LineItemWithState[];
  sectionId: string;
  takeoffId: string;
  onItemsChange: (items: LineItemWithState[]) => void;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
}

const currencyFormatter = (params: { value: number | string | null | undefined }) => {
  if (params.value == null) return "$0.00";
  const value = typeof params.value === "string" ? parseFloat(params.value) : params.value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value || 0);
};

const numberParser = (params: { newValue: string }) => {
  const value = params.newValue;
  if (value === null || value === undefined || value === "") return 0;
  return parseFloat(value) || 0;
};

// Group display name mapping
const getGroupDisplayName = (presentationGroup: string | null | undefined): string => {
  if (!presentationGroup) return 'OTHER';

  const mapping: Record<string, string> = {
    'siding': 'SIDING & UNDERLAYMENT',
    'trim': 'TRIM & CORNERS',
    'flashing': 'FLASHING & ACCESSORIES',
    'belly_band': 'BELLY BAND',
    'fasteners': 'FASTENERS & ACCESSORIES',
    'labor': 'INSTALLATION LABOR',
  };

  return mapping[presentationGroup.toLowerCase()] || presentationGroup.toUpperCase();
};

// Transform flat items array into grouped structure with header rows
const createGroupedRows = (items: LineItemWithState[], expandedGroups: Record<string, boolean>): any[] => {
  console.log('📊 [createGroupedRows] Called with expandedGroups:', expandedGroups);

  // Group items by presentation_group
  const groups = new Map<string, LineItemWithState[]>();

  items.forEach((item) => {
    const groupKey = item.presentation_group || 'other';
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(item);
  });

  // Build rows array with group headers
  const rows: any[] = [];

  // Sort groups by a logical order
  const groupOrder = ['siding', 'trim', 'flashing', 'belly_band', 'fasteners', 'labor', 'other'];
  const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => {
    const indexA = groupOrder.indexOf(a.toLowerCase());
    const indexB = groupOrder.indexOf(b.toLowerCase());
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  sortedGroupKeys.forEach((groupKey) => {
    const groupItems = groups.get(groupKey)!;
    const itemCount = groupItems.length;
    const subtotal = groupItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
    const groupDisplayName = getGroupDisplayName(groupKey);
    const isExpanded = expandedGroups[groupKey] !== false; // Default to expanded if not set

    console.log(`📊 [createGroupedRows] Group ${groupKey}:`, {
      groupDisplayName,
      isExpanded,
      itemCount,
    });

    // Add group header row
    rows.push({
      isGroupHeader: true,
      groupName: groupDisplayName,
      groupKey, // Store the key for toggling
      itemCount,
      subtotal,
      isExpanded,
      // Add unique ID for getRowId
      id: `group-header-${groupKey}`,
    });

    // Only add group items if the group is expanded
    if (isExpanded) {
      rows.push(...groupItems);
    }
  });

  console.log('📊 [createGroupedRows] Total rows returned:', rows.length);

  return rows;
};

// Description cell renderer (simplified - no expand/collapse)
function DescriptionCellRenderer(props: ICellRendererParams<LineItemWithState>) {
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="flex-1 font-medium">{props.value}</span>
    </div>
  );
}

// Actions cell renderer with dropdown menu
function ActionsCellRenderer(props: {
  data: LineItemWithState;
  onOpenActionsMenu: (row: LineItemWithState) => void;
  onReplaceWithAlternative: (alt: any) => void;
  onDuplicateRow: (row: LineItemWithState) => void;
  onDeleteRow: (row: LineItemWithState) => void;
  onOpenSearchModal: (row: LineItemWithState) => void;
  alternatives: any;
  calculateCostDiff: (alt: { material_cost: number; labor_cost: number; equipment_cost: number }) => number;
  formatDollarDiff: (diff: number) => string;
  getPriceColor: (diff: number) => string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-8 w-8 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800"
          onClick={() => props.onOpenActionsMenu(props.data)}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 shadow-lg z-50"
        style={{ backgroundColor: 'white' }}
      >
        {/* View Alternatives Submenu */}
        {props.data.product_id && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>View Alternatives</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {props.alternatives.equivalent || props.alternatives.upgrade || props.alternatives.budget ? (
                  <>
                {props.alternatives.equivalent && props.alternatives.equivalent.length > 0 && (
                  <>
                    <DropdownMenuItem disabled className="font-semibold">
                      Equivalent Options
                    </DropdownMenuItem>
                    {props.alternatives.equivalent.map((alt: any) => {
                      const costDiff = props.calculateCostDiff(alt);
                      return (
                        <DropdownMenuItem
                          key={alt.id}
                          onClick={() => props.onReplaceWithAlternative(alt)}
                        >
                          {alt.name}
                          <span className={`ml-auto text-xs ${props.getPriceColor(costDiff)}`}>
                            {props.formatDollarDiff(costDiff)}
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}

                {props.alternatives.upgrade && props.alternatives.upgrade.length > 0 && (
                  <>
                    {props.alternatives.equivalent && <DropdownMenuSeparator />}
                    <DropdownMenuItem disabled className="font-semibold">
                      Upgrades
                    </DropdownMenuItem>
                    {props.alternatives.upgrade.map((alt: any) => {
                      const costDiff = props.calculateCostDiff(alt);
                      return (
                        <DropdownMenuItem
                          key={alt.id}
                          onClick={() => props.onReplaceWithAlternative(alt)}
                        >
                          {alt.name}
                          <span className={`ml-auto text-xs ${props.getPriceColor(costDiff)}`}>
                            {props.formatDollarDiff(costDiff)}
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}

                {props.alternatives.budget && props.alternatives.budget.length > 0 && (
                  <>
                    {(props.alternatives.equivalent || props.alternatives.upgrade) && <DropdownMenuSeparator />}
                    <DropdownMenuItem disabled className="font-semibold">
                      Budget Options
                    </DropdownMenuItem>
                    {props.alternatives.budget.map((alt: any) => {
                      const costDiff = props.calculateCostDiff(alt);
                      return (
                        <DropdownMenuItem
                          key={alt.id}
                          onClick={() => props.onReplaceWithAlternative(alt)}
                        >
                          {alt.name}
                          <span className={`ml-auto text-xs ${props.getPriceColor(costDiff)}`}>
                            {props.formatDollarDiff(costDiff)}
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
                  </>
                ) : (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    No alternatives available
                  </DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Replace Material */}
        <DropdownMenuItem onClick={() => {
          console.log('🎯 [Dropdown] Replace Material clicked for row:', {
            id: props.data.id,
            description: props.data.description,
          });
          props.onOpenSearchModal(props.data);
        }}>
          Replace Material...
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Duplicate Row */}
        <DropdownMenuItem onClick={() => props.onDuplicateRow(props.data)}>
          Duplicate Row
        </DropdownMenuItem>

        {/* Delete Row */}
        <DropdownMenuItem
          onClick={() => props.onDeleteRow(props.data)}
          className="text-destructive focus:text-destructive"
        >
          Delete Row
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Detail panel component for expanded rows
function DetailPanel(props: { data: LineItemWithState }) {
  const { data } = props;

  return (
    <div className="p-4 bg-muted/10 border-t border-b space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* SKU */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">SKU</div>
          <div className="text-sm">{data.sku || "—"}</div>
        </div>

        {/* Cost Breakdown */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Material Cost</div>
          <div className="text-sm font-mono">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.material_unit_cost || 0)} / {data.unit}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Labor Cost</div>
          <div className="text-sm font-mono">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.labor_unit_cost || 0)} / {data.unit}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Equipment Cost</div>
          <div className="text-sm font-mono">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.equipment_unit_cost || 0)} / {data.unit}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Extended Totals */}
        <div className="bg-muted/30 rounded p-2">
          <div className="text-xs font-medium text-muted-foreground mb-1">Material Total</div>
          <div className="text-sm font-semibold">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.material_extended || 0)}
          </div>
        </div>
        <div className="bg-muted/30 rounded p-2">
          <div className="text-xs font-medium text-muted-foreground mb-1">Labor Total</div>
          <div className="text-sm font-semibold">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.labor_extended || 0)}
          </div>
        </div>
        <div className="bg-muted/30 rounded p-2">
          <div className="text-xs font-medium text-muted-foreground mb-1">Equipment Total</div>
          <div className="text-sm font-semibold">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.equipment_extended || 0)}
          </div>
        </div>
      </div>

      {/* Notes and Calculation */}
      {(data.notes || data.formula_used) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.notes && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Notes</div>
              <div className="text-sm text-muted-foreground">{data.notes}</div>
            </div>
          )}
          {data.formula_used && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Calculation Source</div>
              <div className="text-xs text-muted-foreground font-mono">{data.formula_used}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EstimateGrid({
  items,
  sectionId,
  takeoffId,
  onItemsChange,
  onSave,
  isSaving = false,
}: EstimateGridProps) {
  const gridRef = useRef<AgGridReact<LineItemWithState>>(null);
  const [gridApi, setGridApi] = useState<GridApi<LineItemWithState> | null>(null);
  const [selectedRows, setSelectedRows] = useState<LineItemWithState[]>([]);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [contextMenuRow, setContextMenuRow] = useState<LineItemWithState | null>(null);
  const [rowToReplace, setRowToReplace] = useState<LineItemWithState | null>(null);
  const rowToReplaceRef = useRef<LineItemWithState | null>(null);
  const [alternatives, setAlternatives] = useState<{
    equivalent?: Array<{ id: string; name: string; sku: string | null; material_cost: number; labor_cost: number; equipment_cost: number; material_impact_percent: number }>;
    upgrade?: Array<{ id: string; name: string; sku: string | null; material_cost: number; labor_cost: number; equipment_cost: number; material_impact_percent: number }>;
    budget?: Array<{ id: string; name: string; sku: string | null; material_cost: number; labor_cost: number; equipment_cost: number; material_impact_percent: number }>;
  }>({});

  // Track which groups are expanded (default all to true)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    siding: true,
    trim: true,
    flashing: true,
    belly_band: true,
    fasteners: true,
    labor: true,
    other: true,
  });

  const toggleGroupExpansion = useCallback((groupKey: string) => {
    console.log('🔄 [toggleGroupExpansion] Called with groupKey:', groupKey);
    setExpandedGroups((prev) => {
      const currentState = prev[groupKey];
      const newState = !currentState;
      console.log('🔄 [toggleGroupExpansion] Current state:', currentState, '→ New state:', newState);
      console.log('🔄 [toggleGroupExpansion] Full state before:', prev);
      const updated = {
        ...prev,
        [groupKey]: newState,
      };
      console.log('🔄 [toggleGroupExpansion] Full state after:', updated);
      return updated;
    });
  }, []);

  // Helper function to calculate dollar cost difference for alternatives
  const calculateAlternativeCostDifference = useCallback(
    (alternative: { material_cost: number; labor_cost: number; equipment_cost: number }) => {
      if (!contextMenuRow) return 0;
      const altTotal = alternative.material_cost + alternative.labor_cost + (alternative.equipment_cost || 0);
      const currentTotal = contextMenuRow.material_unit_cost + contextMenuRow.labor_unit_cost + contextMenuRow.equipment_unit_cost;
      return altTotal - currentTotal;
    },
    [contextMenuRow]
  );

  // Helper function to get color class based on cost difference
  const getPriceColor = useCallback((dollarDiff: number) => {
    if (Math.abs(dollarDiff) < 0.01) return "text-muted-foreground"; // Gray for ~$0
    if (dollarDiff > 0) return "text-red-600"; // Red for cost increase
    return "text-green-600"; // Green for cost decrease (savings)
  }, []);

  // Helper function to format dollar difference
  const formatDollarDifference = useCallback((dollarDiff: number) => {
    const sign = dollarDiff > 0 ? "+" : dollarDiff < 0 ? "-" : "";
    return `${sign}$${Math.abs(dollarDiff).toFixed(2)}`;
  }, []);

  const recalculateRow = useCallback((data: LineItemWithState): LineItemWithState => {
    const quantity = Number(data.quantity) || 0;
    const materialUnit = Number(data.material_unit_cost) || 0;
    const laborUnit = Number(data.labor_unit_cost) || 0;
    const equipmentUnit = Number(data.equipment_unit_cost) || 0;

    const materialExtended = quantity * materialUnit;
    const laborExtended = quantity * laborUnit;
    const equipmentExtended = quantity * equipmentUnit;
    const lineTotal = materialExtended + laborExtended + equipmentExtended;

    return {
      ...data,
      material_extended: materialExtended,
      labor_extended: laborExtended,
      equipment_extended: equipmentExtended,
      line_total: lineTotal,
      isModified: true,
    };
  }, []);

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<LineItemWithState>) => {
      if (!event.data) return;

      const recalcFields = [
        "quantity",
        "material_unit_cost",
        "labor_unit_cost",
        "equipment_unit_cost",
      ];
      if (recalcFields.includes(event.colDef.field || "")) {
        const updatedRow = recalculateRow(event.data);
        const rowNode = event.node;
        if (rowNode) {
          rowNode.setData(updatedRow);
        }
        const updatedItems = items.map((item) =>
          item.id === updatedRow.id ? updatedRow : item
        );
        onItemsChange(updatedItems);
      } else {
        const updatedItems = items.map((item) =>
          item.id === event.data!.id ? { ...event.data!, isModified: true } : item
        );
        onItemsChange(updatedItems);
      }
    },
    [items, onItemsChange, recalculateRow]
  );

  const columnDefs = useMemo<ColDef<LineItemWithState>[]>(
    () => [
      {
        headerCheckboxSelection: true,
        checkboxSelection: true,
        width: 50,
        pinned: "left",
        lockPosition: true,
        suppressMovable: true,
      },
      {
        field: "description",
        headerName: "Description",
        flex: 2,
        minWidth: 250,
        editable: true,
        cellRenderer: (params: ICellRendererParams<LineItemWithState>) => {
          if (!params.data) return null;
          return DescriptionCellRenderer(params);
        },
      },
      {
        field: "quantity",
        headerName: "QTY",
        width: 100,
        editable: true,
        type: "numericColumn",
        valueParser: numberParser,
        valueFormatter: (params) => {
          const value = params.value;
          if (value == null) return "0";
          return Number(value).toFixed(2);
        },
        cellClass: "text-right",
      },
      {
        field: "unit",
        headerName: "Unit",
        width: 90,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: {
          values: ["EA", "PC", "SQ", "LF", "SF", "RL", "BX", "BDL", "GAL"],
        },
      },
      {
        field: "material_unit_cost",
        headerName: "Unit Price",
        width: 130,
        editable: true,
        type: "numericColumn",
        valueParser: numberParser,
        valueGetter: (params) => {
          if (!params.data) return 0;
          // Use primary unit cost: first non-zero value from material → labor → equipment
          return params.data.material_unit_cost ||
                 params.data.labor_unit_cost ||
                 params.data.equipment_unit_cost ||
                 0;
        },
        valueFormatter: currencyFormatter,
        cellClass: "text-right",
      },
      {
        field: "line_total",
        headerName: "Total",
        width: 140,
        editable: false,
        type: "numericColumn",
        valueFormatter: currencyFormatter,
        cellClass: "text-right font-semibold bg-primary/5",
      },
      {
        headerName: "",
        width: 50,
        pinned: "right",
        lockPosition: true,
        suppressMovable: true,
        cellRenderer: (params: ICellRendererParams<LineItemWithState>) => {
          if (!params.data) return null;
          return ActionsCellRenderer({
            data: params.data,
            onOpenActionsMenu: handleContextMenuOpen,
            onReplaceWithAlternative: handleReplaceWithAlternative,
            onDuplicateRow: handleDuplicateRow,
            onDeleteRow: handleDeleteSingleRow,
            onOpenSearchModal: (row: LineItemWithState) => {
              console.log('🔓 [EstimateGrid] Opening search modal for row (passed directly):', {
                id: row.id,
                description: row.description,
              });

              // Store the row passed directly from the dropdown
              setRowToReplace(row);
              rowToReplaceRef.current = row;

              console.log('🔓 [EstimateGrid] Row stored in state and ref');

              setIsProductSearchOpen(true);
            },
            alternatives,
            calculateCostDiff: calculateAlternativeCostDifference,
            formatDollarDiff: formatDollarDifference,
            getPriceColor: getPriceColor,
          });
        },
        suppressKeyboardEvent: (params) => {
          // Prevent keyboard events on the button
          return params.event.target instanceof HTMLButtonElement;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alternatives, calculateAlternativeCostDifference, formatDollarDifference, getPriceColor]
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      resizable: true,
      suppressMovable: false,
    }),
    []
  );

  // Transform items into grouped rows with headers
  const groupedRowData = useMemo(() => {
    return createGroupedRows(items, expandedGroups);
  }, [items, expandedGroups]);

  // Calculate grand total for pinned bottom row
  const pinnedBottomRowData = useMemo(() => {
    const grandTotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);

    return [{
      description: "GRAND TOTAL",
      line_total: grandTotal,
      // Set other fields to empty/null to avoid confusion
      quantity: null,
      unit: "",
      material_unit_cost: null,
    }];
  }, [items]);

  const onGridReady = useCallback((params: GridReadyEvent<LineItemWithState>) => {
    setGridApi(params.api);
    params.api.sizeColumnsToFit();
  }, []);

  const onSelectionChanged = useCallback(() => {
    if (gridApi) {
      const selected = gridApi.getSelectedRows();
      setSelectedRows(selected);
    }
  }, [gridApi]);

  const handleAddRow = useCallback(() => {
    const maxItemNumber = items.length > 0 ? Math.max(...items.map((item) => item.item_number)) : 0;

    const newItem: LineItemWithState = {
      id: uuidv4(),
      takeoff_id: takeoffId,
      section_id: sectionId,
      item_number: maxItemNumber + 1,
      description: "New Item",
      quantity: 0,
      unit: "EA",
      material_unit_cost: 0,
      labor_unit_cost: 0,
      equipment_unit_cost: 0,
      material_extended: 0,
      labor_extended: 0,
      equipment_extended: 0,
      line_total: 0,
      sku: null,
      product_id: null,
      calculation_source: "manual",
      source_id: null,
      formula_used: "Manually added",
      notes: null,
      is_optional: false,
      is_deleted: false,
      sort_order: maxItemNumber + 1,
      presentation_group: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isNew: true,
      isModified: true,
    };

    const updatedItems = [...items, newItem];
    onItemsChange(updatedItems);
  }, [items, sectionId, takeoffId, onItemsChange]);

  const handleDeleteRows = useCallback(() => {
    if (selectedRows.length === 0) return;

    const selectedIds = new Set(selectedRows.map((row) => row.id));
    const updatedItems = items
      .filter((item) => !selectedIds.has(item.id))
      .map((item, index) => ({
        ...item,
        item_number: index + 1,
        isModified: true,
      }));

    onItemsChange(updatedItems);
    setSelectedRows([]);
  }, [items, selectedRows, onItemsChange]);

  const handleGridExport = useCallback(async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Estimate');

      // Set column widths
      worksheet.columns = [
        { header: 'Description', key: 'description', width: 50 },
        { header: 'QTY', key: 'qty', width: 12 },
        { header: 'Unit', key: 'unit', width: 12 },
        { header: 'Unit Price', key: 'unitPrice', width: 15 },
        { header: 'Total', key: 'total', width: 15 },
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF374151' }
      };

      // Track group headers and data rows for formula calculation
      const groupHeaderRows: { rowNumber: number; startDataRow: number | null; endDataRow: number | null }[] = [];
      const allDataRows: number[] = [];
      let currentGroupIndex = -1;

      // Pass 1: Add all rows and track positions
      groupedRowData.forEach((row) => {
        if (row.isGroupHeader) {
          // Group header row - merge cells and style
          const excelRow = worksheet.addRow({
            description: `${row.groupName} (${row.itemCount} item${row.itemCount !== 1 ? 's' : ''})`,
            qty: '',
            unit: '',
            unitPrice: '',
            total: '' // Will be filled with formula later
          });
          worksheet.mergeCells(`A${excelRow.number}:D${excelRow.number}`);
          excelRow.font = { bold: true };
          excelRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF3F4F6' }
          };

          // Track this group header
          currentGroupIndex = groupHeaderRows.length;
          groupHeaderRows.push({
            rowNumber: excelRow.number,
            startDataRow: null,
            endDataRow: null
          });
        } else {
          // Regular data row
          const excelRow = worksheet.addRow({
            description: row.description || '',
            qty: row.quantity || 0,
            unit: row.unit || '',
            // Use primary unit cost: first non-zero value from material → labor → equipment
            unitPrice: row.material_unit_cost || row.labor_unit_cost || row.equipment_unit_cost || 0,
            total: '' // Will be filled with formula
          });

          // Add formula for line item total: QTY × Unit Price
          excelRow.getCell('total').value = {
            formula: `B${excelRow.number}*D${excelRow.number}`
          };

          // Format currency columns
          excelRow.getCell('unitPrice').numFmt = '"$"#,##0.00';
          excelRow.getCell('total').numFmt = '"$"#,##0.00';

          // Track this data row
          allDataRows.push(excelRow.number);

          // Update current group's range
          if (currentGroupIndex >= 0) {
            const group = groupHeaderRows[currentGroupIndex];
            if (group.startDataRow === null) {
              group.startDataRow = excelRow.number;
            }
            group.endDataRow = excelRow.number;
          }
        }
      });

      // Pass 2: Update group header formulas
      groupHeaderRows.forEach((group) => {
        if (group.startDataRow !== null && group.endDataRow !== null) {
          const headerRow = worksheet.getRow(group.rowNumber);
          headerRow.getCell('total').value = {
            formula: `SUM(E${group.startDataRow}:E${group.endDataRow})`
          };
          headerRow.getCell('total').numFmt = '"$"#,##0.00';
        }
      });

      // Add grand total row
      if (allDataRows.length > 0) {
        const firstDataRow = Math.min(...allDataRows);
        const lastDataRow = Math.max(...allDataRows);

        const excelRow = worksheet.addRow({
          description: 'GRAND TOTAL',
          qty: '',
          unit: '',
          unitPrice: '',
          total: ''
        });

        // Add formula for grand total: SUM of all line item totals
        excelRow.getCell('total').value = {
          formula: `SUM(E${firstDataRow}:E${lastDataRow})`
        };

        excelRow.font = { bold: true };
        excelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE5E7EB' }
        };
        excelRow.getCell('total').numFmt = '"$"#,##0.00';

        // Add top border to grand total row
        excelRow.eachCell((cell) => {
          cell.border = {
            ...cell.border,
            top: { style: 'medium', color: { argb: 'FF374151' } }
          };
        });
      }

      // Add borders to all cells
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
          };
        });
      });

      // Generate and download file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grid_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting grid:', error);
      alert('Failed to export grid. Please try again.');
    }
  }, [groupedRowData, pinnedBottomRowData]);

  const getRowClass = useCallback((params: RowClassParams<any>) => {
    // Group header rows get darker background
    if (params.data?.isGroupHeader) {
      return "bg-[#F3F4F6] dark:bg-gray-800 font-bold";
    }
    // Pinned bottom row (grand total) gets special styling
    if (params.node.rowPinned === 'bottom') {
      return "bg-[#F3F4F6] dark:bg-gray-800 font-bold border-t-2 border-gray-300 dark:border-gray-600";
    }
    // Low confidence rows get yellow background
    if ((params.data as any)?.low_confidence) {
      return "bg-[#FEF3C7] dark:bg-yellow-950/30";
    }
    if (params.data?.isNew) return "bg-green-50 dark:bg-green-950/20";
    if (params.data?.isModified) return "bg-yellow-50 dark:bg-yellow-950/20";
    return "";
  }, []);

  const handleReplaceProduct = useCallback(
    (product: ProductCatalog) => {
      console.log('📦 [EstimateGrid] handleReplaceProduct called');
      console.log('📦 [EstimateGrid] rowToReplace state:', rowToReplace);
      console.log('📦 [EstimateGrid] rowToReplaceRef.current:', rowToReplaceRef.current);

      // Use ref as fallback if state is null
      const row = rowToReplace || rowToReplaceRef.current;

      console.log('📦 [EstimateGrid] Final row to use:', row);
      console.log('📦 [EstimateGrid] Product received:', {
        id: product.id,
        name: product.product_name,
        sku: product.sku,
        physical_properties: product.physical_properties,
      });

      if (!row) {
        console.error('❌ [EstimateGrid] Both rowToReplace state AND ref are null! Cannot replace product.');
        return;
      }

      const materialCost = (product.physical_properties as any)?.material_cost || 0;
      const laborCost = (product.physical_properties as any)?.labor_cost || 0;
      const equipmentCost = (product.physical_properties as any)?.equipment_cost || 0;

      console.log('📦 [EstimateGrid] Extracted costs:', {
        materialCost,
        laborCost,
        equipmentCost,
      });

      const updatedRow: LineItemWithState = {
        ...row,
        description: product.product_name,
        sku: product.sku,
        product_id: product.id,
        material_unit_cost: materialCost,
        labor_unit_cost: laborCost,
        equipment_unit_cost: equipmentCost,
        isModified: true,
      };

      console.log('📦 [EstimateGrid] Updated row (before recalc):', updatedRow);

      const recalculated = recalculateRow(updatedRow);

      console.log('📦 [EstimateGrid] Recalculated row:', {
        id: recalculated.id,
        description: recalculated.description,
        quantity: recalculated.quantity,
        material_extended: recalculated.material_extended,
        labor_extended: recalculated.labor_extended,
        line_total: recalculated.line_total,
      });

      const updatedItems = items.map((item) =>
        item.id === recalculated.id ? recalculated : item
      );

      console.log('📦 [EstimateGrid] Updated items count:', updatedItems.length);
      console.log('📦 [EstimateGrid] Calling onItemsChange');

      onItemsChange(updatedItems);

      console.log('✅ [EstimateGrid] Product replacement complete');

      // Clear both state and ref
      setRowToReplace(null);
      rowToReplaceRef.current = null;
    },
    [rowToReplace, items, onItemsChange, recalculateRow]
  );

  const handleReplaceWithAlternative = useCallback(
    (alt: { id: string; name: string; sku: string | null; material_cost: number; labor_cost: number; equipment_cost: number }) => {
      if (!contextMenuRow) return;

      const updatedRow: LineItemWithState = {
        ...contextMenuRow,
        description: alt.name,
        sku: alt.sku,
        product_id: alt.id,
        material_unit_cost: alt.material_cost,
        labor_unit_cost: alt.labor_cost,
        equipment_unit_cost: alt.equipment_cost || 0,
        isModified: true,
      };

      const recalculated = recalculateRow(updatedRow);

      const updatedItems = items.map((item) =>
        item.id === recalculated.id ? recalculated : item
      );
      onItemsChange(updatedItems);
      setAlternatives({});
    },
    [contextMenuRow, items, onItemsChange, recalculateRow]
  );

  const handleDuplicateRow = useCallback(
    (row: LineItemWithState) => {
      const maxItemNumber = items.length > 0 ? Math.max(...items.map((item) => item.item_number)) : 0;

      const duplicatedItem: LineItemWithState = {
        ...row,
        id: uuidv4(),
        item_number: maxItemNumber + 1,
        sort_order: maxItemNumber + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isNew: true,
        isModified: true,
      };

      const updatedItems = [...items, duplicatedItem];
      onItemsChange(updatedItems);
    },
    [items, onItemsChange]
  );

  const handleDeleteSingleRow = useCallback(
    (row: LineItemWithState) => {
      const updatedItems = items
        .filter((item) => item.id !== row.id)
        .map((item, index) => ({
          ...item,
          item_number: index + 1,
          isModified: true,
        }));

      onItemsChange(updatedItems);
    },
    [items, onItemsChange]
  );

  const handleContextMenuOpen = useCallback(async (row: LineItemWithState) => {
    console.log('🎯 [EstimateGrid] handleContextMenuOpen called for row:', {
      id: row.id,
      description: row.description,
      product_id: row.product_id,
    });

    setContextMenuRow(row);

    // Fetch alternatives if product has an ID
    if (row.product_id) {
      console.log('🔍 [EstimateGrid] Fetching alternatives for product:', row.product_id);
      const { data } = await getProductAlternatives(row.product_id);
      if (data) {
        console.log('✅ [EstimateGrid] Alternatives fetched:', Object.keys(data));
        setAlternatives(data as any);
      }
    } else {
      console.log('⚠️ [EstimateGrid] No product_id, skipping alternatives fetch');
    }
  }, []);

  const isFullWidthRow = useCallback(
    (params: { rowNode: { data?: any } }) => {
      // Group header rows are always full width
      if (params.rowNode.data?.isGroupHeader) {
        return true;
      }
      // Individual items are not full width (detail panels disabled)
      return false;
    },
    []
  );

  const fullWidthCellRenderer = useCallback((params: { data: any }) => {
    console.log('🎨 [fullWidthCellRenderer] Called with data:', {
      hasData: !!params.data,
      isGroupHeader: params.data?.isGroupHeader,
      groupKey: params.data?.groupKey,
      isExpanded: params.data?.isExpanded,
    });

    // Render group header
    if (params.data?.isGroupHeader) {
      const formattedSubtotal = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(params.data.subtotal);

      const groupKey = params.data.groupKey;
      const isExpanded = params.data.isExpanded;

      console.log('🎨 [fullWidthCellRenderer] Rendering group header:', {
        groupName: params.data.groupName,
        groupKey,
        isExpanded,
      });

      // Handler function to toggle group
      const handleToggle = (e: React.MouseEvent | React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🖱️ [Group Header Click] Event triggered:', {
          eventType: e.type,
          groupKey,
          groupName: params.data.groupName,
          currentlyExpanded: isExpanded,
        });
        toggleGroupExpansion(groupKey);
      };

      return (
        <div
          className="w-full h-full px-4 py-3 font-bold text-base flex items-center gap-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          style={{
            minHeight: '42px',
            userSelect: 'none',
          }}
          onClick={handleToggle}
          onPointerDown={handleToggle}
          onMouseDown={handleToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleToggle(e as any);
            }
          }}
        >
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
          <span className="flex-1">
            {params.data.groupName} ({params.data.itemCount} item{params.data.itemCount !== 1 ? 's' : ''}) — {formattedSubtotal}
          </span>
        </div>
      );
    }

    // Render detail panel for regular items (currently not used)
    return <DetailPanel data={params.data} />;
  }, [toggleGroupExpansion]);

  const hasUnsavedChanges = items.some((item) => item.isNew || item.isModified);

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleAddRow}>
              <Plus className="mr-2 h-4 w-4" />
              Add Row
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteRows}
              disabled={selectedRows.length === 0}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete ({selectedRows.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGridExport}
            >
              <Table className="mr-2 h-4 w-4" />
              Grid Export
            </Button>
            {onSave && (
              <Button
                variant="default"
                size="sm"
                onClick={onSave}
                disabled={!hasUnsavedChanges || isSaving}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {items.length} items • Right-click for options
            {hasUnsavedChanges && (
              <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                (Unsaved changes)
              </span>
            )}
          </div>
        </div>

        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="ag-theme-alpine rounded-lg border overflow-hidden relative z-0"
              style={{ height: 500, width: "100%" }}
              onContextMenu={(e) => {
                // Find the clicked row
                const target = e.target as HTMLElement;
                const rowElement = target.closest('[row-id]');
                if (rowElement) {
                  const rowId = rowElement.getAttribute('row-id');
                  const row = items.find(item => item.id === rowId);
                  if (row) {
                    handleContextMenuOpen(row);
                  }
                }
              }}
            >
              <AgGridReact<LineItemWithState>
                ref={gridRef}
                theme="legacy"
                rowData={groupedRowData}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                pinnedBottomRowData={pinnedBottomRowData}
                onGridReady={onGridReady}
                onCellValueChanged={onCellValueChanged}
                onSelectionChanged={onSelectionChanged}
                rowSelection="multiple"
                getRowClass={getRowClass}
                animateRows={true}
                enableCellTextSelection={true}
                stopEditingWhenCellsLoseFocus={true}
                tooltipShowDelay={500}
                getRowId={(params) => params.data.id}
                isFullWidthRow={isFullWidthRow}
                fullWidthCellRenderer={fullWidthCellRenderer}
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent
            className="w-64 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 shadow-lg z-50"
            style={{ backgroundColor: 'white' }}
          >
            {contextMenuRow && (
              <>
                {/* View Alternatives Submenu */}
                {contextMenuRow.product_id && (
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>View Alternatives</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-56">
                      {alternatives.equivalent || alternatives.upgrade || alternatives.budget ? (
                        <>
                      {alternatives.equivalent && alternatives.equivalent.length > 0 && (
                        <>
                          <ContextMenuItem disabled className="font-semibold">
                            Equivalent Options
                          </ContextMenuItem>
                          {alternatives.equivalent.map((alt) => {
                            const costDiff = calculateAlternativeCostDifference(alt);
                            return (
                              <ContextMenuItem
                                key={alt.id}
                                onClick={() => handleReplaceWithAlternative(alt)}
                              >
                                {alt.name}
                                <span className={`ml-auto text-xs ${getPriceColor(costDiff)}`}>
                                  {formatDollarDifference(costDiff)}
                                </span>
                              </ContextMenuItem>
                            );
                          })}
                        </>
                      )}

                      {alternatives.upgrade && alternatives.upgrade.length > 0 && (
                        <>
                          {alternatives.equivalent && <ContextMenuSeparator />}
                          <ContextMenuItem disabled className="font-semibold">
                            Upgrades
                          </ContextMenuItem>
                          {alternatives.upgrade.map((alt) => {
                            const costDiff = calculateAlternativeCostDifference(alt);
                            return (
                              <ContextMenuItem
                                key={alt.id}
                                onClick={() => handleReplaceWithAlternative(alt)}
                              >
                                {alt.name}
                                <span className={`ml-auto text-xs ${getPriceColor(costDiff)}`}>
                                  {formatDollarDifference(costDiff)}
                                </span>
                              </ContextMenuItem>
                            );
                          })}
                        </>
                      )}

                      {alternatives.budget && alternatives.budget.length > 0 && (
                        <>
                          {(alternatives.equivalent || alternatives.upgrade) && <ContextMenuSeparator />}
                          <ContextMenuItem disabled className="font-semibold">
                            Budget Options
                          </ContextMenuItem>
                          {alternatives.budget.map((alt) => {
                            const costDiff = calculateAlternativeCostDifference(alt);
                            return (
                              <ContextMenuItem
                                key={alt.id}
                                onClick={() => handleReplaceWithAlternative(alt)}
                              >
                                {alt.name}
                                <span className={`ml-auto text-xs ${getPriceColor(costDiff)}`}>
                                  {formatDollarDifference(costDiff)}
                                </span>
                              </ContextMenuItem>
                            );
                          })}
                        </>
                      )}
                        </>
                      ) : (
                        <ContextMenuItem disabled className="text-muted-foreground">
                          No alternatives available
                        </ContextMenuItem>
                      )}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                )}

                {/* Replace Material */}
                <ContextMenuItem onClick={() => {
                  console.log('🔓 [ContextMenu] Opening search modal for row:', {
                    id: contextMenuRow?.id,
                    description: contextMenuRow?.description,
                  });

                  if (!contextMenuRow) {
                    console.error('❌ [ContextMenu] contextMenuRow is null!');
                    return;
                  }

                  setRowToReplace(contextMenuRow);
                  rowToReplaceRef.current = contextMenuRow;

                  console.log('🔓 [ContextMenu] Row stored in state and ref');

                  setIsProductSearchOpen(true);
                }}>
                  Replace Material...
                </ContextMenuItem>

                <ContextMenuSeparator />

                {/* Duplicate Row */}
                <ContextMenuItem onClick={() => handleDuplicateRow(contextMenuRow)}>
                  Duplicate Row
                </ContextMenuItem>

                {/* Delete Row */}
                <ContextMenuItem
                  onClick={() => handleDeleteSingleRow(contextMenuRow)}
                  className="text-destructive focus:text-destructive"
                >
                  Delete Row
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>

        <div className="flex gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-950/40 border" />
            <span>New row</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-yellow-100 dark:bg-yellow-950/40 border" />
            <span>Modified</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-[#FEF3C7] border" />
            <span>Low confidence</span>
          </div>
        </div>
      </div>

      {/* Product Search Modal */}
      <ProductSearchModal
        isOpen={isProductSearchOpen}
        onClose={() => {
          console.log('🔒 [EstimateGrid] Closing modal - clearing row references');
          setIsProductSearchOpen(false);
          setRowToReplace(null);
          rowToReplaceRef.current = null;
        }}
        currentProduct={
          rowToReplace
            ? {
                id: rowToReplace.id,
                product_name: rowToReplace.description,
                sku: rowToReplace.sku,
                quantity: rowToReplace.quantity,
                material_unit_cost: rowToReplace.material_unit_cost,
                labor_unit_cost: rowToReplace.labor_unit_cost,
              }
            : null
        }
        onReplace={handleReplaceProduct}
      />
    </>
  );
}
