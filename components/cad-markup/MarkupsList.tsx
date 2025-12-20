// MarkupsList Component
// Editable table displaying all markups (polygons, markers, measurements) in a unified list

import { useState, useCallback, useMemo } from "react";
import {
  Polygon,
  CountMarker,
  LinearMeasurement,
  MarkupSelection,
} from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

export interface MarkupsListProps {
  polygons: Polygon[];
  markers: CountMarker[];
  measurements: LinearMeasurement[];
  selection: MarkupSelection | null;
  onSelect: (selection: MarkupSelection | null) => void;
  onUpdatePolygon: (id: string, updates: Partial<Polygon>) => void;
  onUpdateMarker: (id: string, updates: Partial<CountMarker>) => void;
  onUpdateMeasurement: (id: string, updates: Partial<LinearMeasurement>) => void;
  onDeletePolygon: (id: string) => void;
  onDeleteMarker: (id: string) => void;
  onDeleteMeasurement: (id: string) => void;
}

interface MarkupListItem {
  id: string;
  type: "polygon" | "marker" | "measurement";
  subject: string;
  materialLabel: string;
  materialColor: string;
  value: number;
  unit: "SF" | "EA" | "LF";
  notes: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getMaterialLabel(material: { trade: string; category: string; productName?: string }): string {
  return material.productName || material.category || material.trade || "Unknown";
}

function markupsToListItems(
  polygons: Polygon[],
  markers: CountMarker[],
  measurements: LinearMeasurement[]
): MarkupListItem[] {
  const items: MarkupListItem[] = [];

  // Add completed polygons
  for (const polygon of polygons) {
    if (!polygon.isComplete) continue;
    const label = getMaterialLabel(polygon.material);
    items.push({
      id: polygon.id,
      type: "polygon",
      subject: polygon.subject || label,
      materialLabel: label,
      materialColor: polygon.material.color,
      value: polygon.area,
      unit: "SF",
      notes: polygon.notes || "",
    });
  }

  // Add markers
  for (const marker of markers) {
    const label = getMaterialLabel(marker.material);
    items.push({
      id: marker.id,
      type: "marker",
      subject: marker.subject || label,
      materialLabel: label,
      materialColor: marker.material.color,
      value: marker.count,
      unit: "EA",
      notes: marker.notes || "",
    });
  }

  // Add measurements
  for (const measurement of measurements) {
    const label = getMaterialLabel(measurement.material);
    items.push({
      id: measurement.id,
      type: "measurement",
      subject: measurement.subject || label,
      materialLabel: label,
      materialColor: measurement.material.color,
      value: measurement.lengthFeet,
      unit: "LF",
      notes: measurement.notes || "",
    });
  }

  return items;
}

function getTypeBadgeVariant(type: MarkupListItem["type"]): "default" | "secondary" | "outline" {
  switch (type) {
    case "polygon":
      return "default";
    case "marker":
      return "secondary";
    case "measurement":
      return "outline";
  }
}

function getTypeLabel(type: MarkupListItem["type"]): string {
  switch (type) {
    case "polygon":
      return "Area";
    case "marker":
      return "Count";
    case "measurement":
      return "Linear";
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MarkupsList({
  polygons,
  markers,
  measurements,
  selection,
  onSelect,
  onUpdatePolygon,
  onUpdateMarker,
  onUpdateMeasurement,
  onDeletePolygon,
  onDeleteMarker,
  onDeleteMeasurement,
}: MarkupsListProps) {
  // Track which cells are being edited
  const [editingCell, setEditingCell] = useState<{
    id: string;
    field: "subject" | "notes";
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Convert markups to unified list items
  const items = useMemo(
    () => markupsToListItems(polygons, markers, measurements),
    [polygons, markers, measurements]
  );

  // Calculate totals by unit type
  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        if (item.unit === "SF") acc.totalSF += item.value;
        else if (item.unit === "EA") acc.totalEA += item.value;
        else if (item.unit === "LF") acc.totalLF += item.value;
        return acc;
      },
      { totalSF: 0, totalEA: 0, totalLF: 0 }
    );
  }, [items]);

  // Handle row click for selection
  const handleRowClick = useCallback(
    (item: MarkupListItem) => {
      // If clicking the already selected item, deselect
      if (selection?.id === item.id && selection?.type === item.type) {
        onSelect(null);
      } else {
        onSelect({ id: item.id, type: item.type });
      }
    },
    [selection, onSelect]
  );

  // Start editing a cell
  const startEditing = useCallback(
    (item: MarkupListItem, field: "subject" | "notes") => {
      setEditingCell({ id: item.id, field });
      setEditValue(field === "subject" ? item.subject : item.notes);
    },
    []
  );

  // Save edit and stop editing
  const saveEdit = useCallback(() => {
    if (!editingCell) return;

    const { id, field } = editingCell;
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const updates = { [field]: editValue };

    switch (item.type) {
      case "polygon":
        onUpdatePolygon(id, updates);
        break;
      case "marker":
        onUpdateMarker(id, updates);
        break;
      case "measurement":
        onUpdateMeasurement(id, updates);
        break;
    }

    setEditingCell(null);
    setEditValue("");
  }, [editingCell, editValue, items, onUpdatePolygon, onUpdateMarker, onUpdateMeasurement]);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  // Handle keyboard events in edit mode
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit]
  );

  // Handle delete
  const handleDelete = useCallback(
    (item: MarkupListItem, e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger row selection

      switch (item.type) {
        case "polygon":
          onDeletePolygon(item.id);
          break;
        case "marker":
          onDeleteMarker(item.id);
          break;
        case "measurement":
          onDeleteMeasurement(item.id);
          break;
      }

      // Clear selection if deleting selected item
      if (selection?.id === item.id) {
        onSelect(null);
      }
    },
    [selection, onSelect, onDeletePolygon, onDeleteMarker, onDeleteMeasurement]
  );

  // Check if a row is selected
  const isRowSelected = useCallback(
    (item: MarkupListItem) => {
      return selection?.id === item.id && selection?.type === item.type;
    },
    [selection]
  );

  // Render editable cell
  const renderEditableCell = useCallback(
    (item: MarkupListItem, field: "subject" | "notes", value: string) => {
      const isEditing = editingCell?.id === item.id && editingCell?.field === field;

      if (isEditing) {
        return (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            autoFocus
            className="h-7 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        );
      }

      return (
        <span
          className="cursor-text hover:bg-muted/50 px-1 py-0.5 rounded inline-block min-w-[60px]"
          onClick={(e) => {
            e.stopPropagation();
            startEditing(item, field);
          }}
        >
          {value || <span className="text-muted-foreground italic">Click to edit</span>}
        </span>
      );
    },
    [editingCell, editValue, handleKeyDown, saveEdit, startEditing]
  );

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Markups</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No markups yet. Use the toolbar to draw areas, place count markers, or measure
            distances.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Markups ({items.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Subject</TableHead>
              <TableHead className="w-[80px]">Type</TableHead>
              <TableHead className="w-[120px]">Material</TableHead>
              <TableHead className="w-[100px] text-right">Value</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const selected = isRowSelected(item);

              return (
                <TableRow
                  key={`${item.type}-${item.id}`}
                  className={`cursor-pointer transition-colors ${
                    selected ? "bg-blue-50 ring-2 ring-blue-500 ring-inset" : "hover:bg-muted/50"
                  }`}
                  onClick={() => handleRowClick(item)}
                >
                  <TableCell className="font-medium">
                    {renderEditableCell(item, "subject", item.subject)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getTypeBadgeVariant(item.type)}>{getTypeLabel(item.type)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.materialColor }}
                      />
                      <span className="text-sm">{item.materialLabel}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {item.value.toFixed(item.unit === "EA" ? 0 : 1)} {item.unit}
                  </TableCell>
                  <TableCell>{renderEditableCell(item, "notes", item.notes)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(item, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-medium">
                Totals
              </TableCell>
              <TableCell colSpan={3}>
                <div className="flex gap-4 justify-end font-mono text-sm">
                  {totals.totalSF > 0 && (
                    <span>
                      <span className="font-semibold">{totals.totalSF.toFixed(1)}</span> SF
                    </span>
                  )}
                  {totals.totalEA > 0 && (
                    <span>
                      <span className="font-semibold">{totals.totalEA}</span> EA
                    </span>
                  )}
                  {totals.totalLF > 0 && (
                    <span>
                      <span className="font-semibold">{totals.totalLF.toFixed(1)}</span> LF
                    </span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
