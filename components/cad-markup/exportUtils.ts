// Export utilities for CAD markup data
// Supports CSV, Excel (exceljs), and JSON exports

import * as ExcelJS from "exceljs";
import {
  Polygon,
  CountMarker,
  LinearMeasurement,
} from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface ExportData {
  polygons: Polygon[];
  markers: CountMarker[];
  measurements: LinearMeasurement[];
  projectName?: string;
  exportDate: string;
}

export interface MarkupRow {
  id: string;
  page: number;
  type: "Area" | "Count" | "Linear";
  subject: string;
  material: string;
  trade: string;
  category: string;
  value: number;
  unit: "SF" | "EA" | "LF";
  notes: string;
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Get display label for a material
 */
function getMaterialLabel(material: { trade: string; category: string; productName?: string }): string {
  return material.productName || material.category || material.trade || "Unknown";
}

/**
 * Convert markup data to flat rows for export
 */
export function markupsToRows(data: ExportData): MarkupRow[] {
  const rows: MarkupRow[] = [];

  // Add polygon rows
  for (const polygon of data.polygons) {
    if (!polygon.isComplete) continue;

    const label = getMaterialLabel(polygon.material);
    rows.push({
      id: polygon.id,
      page: polygon.pageNumber,
      type: "Area",
      subject: polygon.subject || label,
      material: label,
      trade: polygon.material.trade,
      category: polygon.material.category,
      value: polygon.area,
      unit: "SF",
      notes: polygon.notes || "",
    });
  }

  // Add marker rows
  for (const marker of data.markers) {
    const label = getMaterialLabel(marker.material);
    rows.push({
      id: marker.id,
      page: marker.pageNumber,
      type: "Count",
      subject: marker.subject || label,
      material: label,
      trade: marker.material.trade,
      category: marker.material.category,
      value: marker.count,
      unit: "EA",
      notes: marker.notes || "",
    });
  }

  // Add measurement rows
  for (const measurement of data.measurements) {
    const label = getMaterialLabel(measurement.material);
    rows.push({
      id: measurement.id,
      page: measurement.pageNumber,
      type: "Linear",
      subject: measurement.subject || label,
      material: label,
      trade: measurement.material.trade,
      category: measurement.material.category,
      value: measurement.lengthFeet,
      unit: "LF",
      notes: measurement.notes || "",
    });
  }

  return rows;
}

// ============================================================================
// CSV EXPORT
// ============================================================================

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCsvValue(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export markup data to CSV format
 */
export function exportToCSV(data: ExportData): string {
  const rows = markupsToRows(data);

  // Header row
  const headers = ["ID", "Page", "Type", "Subject", "Material", "Value", "Unit", "Notes"];
  const lines: string[] = [headers.map(escapeCsvValue).join(",")];

  // Data rows
  for (const row of rows) {
    const values = [
      row.id,
      row.page,
      row.type,
      row.subject,
      row.material,
      row.value,
      row.unit,
      row.notes,
    ];
    lines.push(values.map(escapeCsvValue).join(","));
  }

  return lines.join("\n");
}

// ============================================================================
// EXCEL EXPORT
// ============================================================================

/**
 * Export markup data to Excel format using exceljs
 * Returns a Blob that can be downloaded
 */
export async function exportToExcel(data: ExportData): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties = { fullCalcOnLoad: true };
  workbook.creator = "AI Estimator";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Markups");

  // Define columns
  worksheet.columns = [
    { header: "ID", key: "id", width: 15 },
    { header: "Page", key: "page", width: 8 },
    { header: "Type", key: "type", width: 10 },
    { header: "Subject", key: "subject", width: 25 },
    { header: "Material", key: "material", width: 20 },
    { header: "Value", key: "value", width: 12 },
    { header: "Unit", key: "unit", width: 8 },
    { header: "Notes", key: "notes", width: 30 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  // Add data rows
  const rows = markupsToRows(data);
  for (const row of rows) {
    worksheet.addRow({
      id: row.id,
      page: row.page,
      type: row.type,
      subject: row.subject,
      material: row.material,
      value: row.value,
      unit: row.unit,
      notes: row.notes,
    });
  }

  // Group by category and add subtotals
  const categoryGroups = new Map<string, { label: string; areas: number; counts: number; linears: number }>();

  for (const row of rows) {
    const key = `${row.trade}:${row.category}`;
    if (!categoryGroups.has(key)) {
      categoryGroups.set(key, { label: row.material, areas: 0, counts: 0, linears: 0 });
    }
    const group = categoryGroups.get(key)!;
    if (row.type === "Area") group.areas += row.value;
    else if (row.type === "Count") group.counts += row.value;
    else if (row.type === "Linear") group.linears += row.value;
  }

  // Add blank row before subtotals
  worksheet.addRow({});

  // Add subtotals section
  const subtotalHeaderRow = worksheet.addRow({
    id: "",
    type: "",
    subject: "SUBTOTALS BY MATERIAL",
    material: "",
    value: "",
    unit: "",
    notes: "",
  });
  subtotalHeaderRow.font = { bold: true };
  subtotalHeaderRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE7E6E6" },
  };

  for (const [, totals] of Array.from(categoryGroups.entries())) {
    if (totals.areas > 0) {
      worksheet.addRow({
        id: "",
        type: "Area",
        subject: "",
        material: totals.label,
        value: totals.areas,
        unit: "SF",
        notes: "",
      });
    }
    if (totals.counts > 0) {
      worksheet.addRow({
        id: "",
        type: "Count",
        subject: "",
        material: totals.label,
        value: totals.counts,
        unit: "EA",
        notes: "",
      });
    }
    if (totals.linears > 0) {
      worksheet.addRow({
        id: "",
        type: "Linear",
        subject: "",
        material: totals.label,
        value: totals.linears,
        unit: "LF",
        notes: "",
      });
    }
  }

  // Add grand totals
  worksheet.addRow({});
  const grandTotalAreas = rows.filter((r) => r.type === "Area").reduce((sum, r) => sum + r.value, 0);
  const grandTotalCounts = rows.filter((r) => r.type === "Count").reduce((sum, r) => sum + r.value, 0);
  const grandTotalLinears = rows.filter((r) => r.type === "Linear").reduce((sum, r) => sum + r.value, 0);

  const grandTotalHeaderRow = worksheet.addRow({
    id: "",
    type: "",
    subject: "GRAND TOTALS",
    material: "",
    value: "",
    unit: "",
    notes: "",
  });
  grandTotalHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  grandTotalHeaderRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF92D050" },
  };

  if (grandTotalAreas > 0) {
    const row = worksheet.addRow({
      id: "",
      type: "Area",
      subject: "Total Areas",
      material: "",
      value: grandTotalAreas,
      unit: "SF",
      notes: "",
    });
    row.font = { bold: true };
  }

  if (grandTotalCounts > 0) {
    const row = worksheet.addRow({
      id: "",
      type: "Count",
      subject: "Total Counts",
      material: "",
      value: grandTotalCounts,
      unit: "EA",
      notes: "",
    });
    row.font = { bold: true };
  }

  if (grandTotalLinears > 0) {
    const row = worksheet.addRow({
      id: "",
      type: "Linear",
      subject: "Total Linear",
      material: "",
      value: grandTotalLinears,
      unit: "LF",
      notes: "",
    });
    row.font = { bold: true };
  }

  // Generate buffer and convert to Blob
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ============================================================================
// JSON EXPORT
// ============================================================================

/**
 * Export markup data to JSON format
 * Pretty-printed with 2-space indent
 */
export function exportToJSON(data: ExportData): string {
  const exportObject = {
    metadata: {
      projectName: data.projectName || "Untitled Project",
      exportDate: data.exportDate,
      exportedBy: "AI Estimator CAD Markup",
    },
    summary: {
      totalPolygons: data.polygons.filter((p) => p.isComplete).length,
      totalMarkers: data.markers.length,
      totalMeasurements: data.measurements.length,
      totalArea: data.polygons
        .filter((p) => p.isComplete)
        .reduce((sum, p) => sum + p.area, 0),
      totalCount: data.markers.reduce((sum, m) => sum + m.count, 0),
      totalLinear: data.measurements.reduce((sum, m) => sum + m.lengthFeet, 0),
    },
    polygons: data.polygons.filter((p) => p.isComplete),
    markers: data.markers,
    measurements: data.measurements,
  };

  return JSON.stringify(exportObject, null, 2);
}

// ============================================================================
// FILE DOWNLOAD
// ============================================================================

/**
 * Trigger a file download in the browser
 */
export function downloadFile(
  content: Blob | string,
  filename: string,
  mimeType: string
): void {
  const blob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
