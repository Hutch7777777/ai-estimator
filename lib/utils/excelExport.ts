/**
 * Excel Export Utilities
 *
 * Generates Excel files for estimates using ExcelJS in the browser.
 * Two export formats:
 * 1. Full Estimate - Complete pricing breakdown
 * 2. Vendor Takeoff - For supplier quotes (no pricing)
 */

import ExcelJS from "exceljs";
import { Takeoff, TakeoffSection, LineItemWithState } from "@/lib/types/database";
import { separateItemsByType } from "./itemHelpers";

interface ProjectInfo {
  clientName: string;
  address: string;
  projectName: string;
}

/**
 * Format currency for display
 */
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Generate filename with sanitization
 */
const generateFilename = (clientName: string, suffix: string): string => {
  const sanitized = clientName.replace(/[^a-z0-9]/gi, "_");
  const date = new Date().toISOString().split("T")[0];
  return `${sanitized}_${suffix}_${date}.xlsx`;
};

/**
 * Download Excel file in browser
 */
const downloadExcel = async (workbook: ExcelJS.Workbook, filename: string) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Apply common header styling
 */
const styleHeader = (row: ExcelJS.Row) => {
  row.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A8A" }, // Navy blue
  };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 25;
};

/**
 * Apply section header styling
 */
const styleSectionHeader = (row: ExcelJS.Row) => {
  row.font = { bold: true, size: 12 };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" }, // Light gray
  };
  row.height = 22;
};

/**
 * Apply subtotal/total row styling
 */
const styleTotalRow = (row: ExcelJS.Row, isGrandTotal = false) => {
  row.font = { bold: true, size: isGrandTotal ? 13 : 11 };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: isGrandTotal ? "FFFDE68A" : "FFFEF3C7" }, // Yellow shades
  };
};

/**
 * Export Full Estimate with complete pricing
 */
export async function exportFullEstimate(
  takeoff: Takeoff,
  sections: TakeoffSection[],
  lineItems: LineItemWithState[],
  projectInfo: ProjectInfo
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Estimate");

  // Set column widths
  worksheet.columns = [
    { key: "description", width: 40 },
    { key: "sku", width: 15 },
    { key: "quantity", width: 10 },
    { key: "unit", width: 8 },
    { key: "materialCost", width: 12 },
    { key: "laborCost", width: 12 },
    { key: "equipmentCost", width: 12 },
    { key: "materialExt", width: 12 },
    { key: "laborExt", width: 12 },
    { key: "equipmentExt", width: 12 },
    { key: "lineTotal", width: 12 },
  ];

  let rowIndex = 1;

  // Title and Project Info
  const titleRow = worksheet.getRow(rowIndex++);
  titleRow.getCell(1).value = `ESTIMATE - ${projectInfo.projectName}`;
  titleRow.font = { bold: true, size: 16 };
  titleRow.height = 25;

  const clientRow = worksheet.getRow(rowIndex++);
  clientRow.getCell(1).value = `Client: ${projectInfo.clientName}`;
  clientRow.font = { size: 11 };

  const addressRow = worksheet.getRow(rowIndex++);
  addressRow.getCell(1).value = `Address: ${projectInfo.address}`;
  addressRow.font = { size: 11 };

  const dateRow = worksheet.getRow(rowIndex++);
  dateRow.getCell(1).value = `Date: ${new Date().toLocaleDateString("en-US")}`;
  dateRow.font = { size: 11 };

  rowIndex++; // Blank row

  // Column Headers
  const headerRow = worksheet.getRow(rowIndex++);
  headerRow.values = [
    "Description",
    "SKU",
    "QTY",
    "Unit",
    "Mat $/Unit",
    "Labor $/Unit",
    "Equip $/Unit",
    "Mat Total",
    "Labor Total",
    "Equip Total",
    "Line Total",
  ];
  styleHeader(headerRow);

  // Add borders to header
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Grand totals tracking
  let grandTotal = {
    material: 0,
    labor: 0,
    equipment: 0,
    total: 0,
  };

  // Process each section
  sections.forEach((section) => {
    // Section header
    const sectionHeaderRow = worksheet.getRow(rowIndex++);
    sectionHeaderRow.getCell(1).value = section.section_name.toUpperCase();
    styleSectionHeader(sectionHeaderRow);
    worksheet.mergeCells(rowIndex - 1, 1, rowIndex - 1, 11);

    // Section line items
    const sectionItems = lineItems.filter(
      (item) => item.section_id === section.id && !item.is_deleted
    );

    let sectionTotal = {
      material: 0,
      labor: 0,
      equipment: 0,
      total: 0,
    };

    sectionItems.forEach((item) => {
      const dataRow = worksheet.getRow(rowIndex++);
      dataRow.values = [
        item.description,
        item.sku || "",
        item.quantity,
        item.unit,
        item.material_unit_cost,
        item.labor_unit_cost,
        item.equipment_unit_cost,
        item.material_extended,
        item.labor_extended,
        item.equipment_extended,
        item.line_total,
      ];

      // Format currency columns
      [5, 6, 7, 8, 9, 10, 11].forEach((colNum) => {
        dataRow.getCell(colNum).numFmt = "$#,##0.00";
      });

      // Format quantity
      dataRow.getCell(3).numFmt = "0.00";

      // Borders
      dataRow.eachCell((cell, colNum) => {
        if (colNum <= 11) {
          cell.border = {
            left: { style: "thin" },
            right: { style: "thin" },
            bottom: { style: "hair" },
          };
        }
      });

      // Update section totals
      sectionTotal.material += item.material_extended || 0;
      sectionTotal.labor += item.labor_extended || 0;
      sectionTotal.equipment += item.equipment_extended || 0;
      sectionTotal.total += item.line_total || 0;
    });

    // Section subtotal
    if (sectionItems.length > 0) {
      const subtotalRow = worksheet.getRow(rowIndex++);
      subtotalRow.values = [
        `${section.section_name} Subtotal`,
        "",
        "",
        "",
        "",
        "",
        "",
        sectionTotal.material,
        sectionTotal.labor,
        sectionTotal.equipment,
        sectionTotal.total,
      ];
      styleTotalRow(subtotalRow);

      // Format currency
      [8, 9, 10, 11].forEach((colNum) => {
        subtotalRow.getCell(colNum).numFmt = "$#,##0.00";
      });

      // Borders
      subtotalRow.eachCell((cell, colNum) => {
        if (colNum <= 11) {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" },
            bottom: { style: "thin" },
          };
        }
      });

      // Update grand totals
      grandTotal.material += sectionTotal.material;
      grandTotal.labor += sectionTotal.labor;
      grandTotal.equipment += sectionTotal.equipment;
      grandTotal.total += sectionTotal.total;
    }

    rowIndex++; // Blank row between sections
  });

  // Grand Total
  const grandTotalRow = worksheet.getRow(rowIndex++);
  grandTotalRow.values = [
    "GRAND TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    grandTotal.material,
    grandTotal.labor,
    grandTotal.equipment,
    grandTotal.total,
  ];
  styleTotalRow(grandTotalRow, true);

  // Format currency
  [8, 9, 10, 11].forEach((colNum) => {
    grandTotalRow.getCell(colNum).numFmt = "$#,##0.00";
  });

  // Borders
  grandTotalRow.eachCell((cell, colNum) => {
    if (colNum <= 11) {
      cell.border = {
        top: { style: "double" },
        left: { style: "thin" },
        right: { style: "thin" },
        bottom: { style: "double" },
      };
    }
  });

  // Download
  const filename = generateFilename(projectInfo.clientName, "Estimate");
  await downloadExcel(workbook, filename);
}

/**
 * Export Vendor Takeoff (no pricing, for supplier quotes)
 */
export async function exportVendorTakeoff(
  takeoff: Takeoff,
  sections: TakeoffSection[],
  lineItems: LineItemWithState[],
  projectInfo: ProjectInfo
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Vendor Takeoff");

  // Set column widths
  worksheet.columns = [
    { key: "description", width: 45 },
    { key: "sku", width: 15 },
    { key: "quantity", width: 10 },
    { key: "unit", width: 8 },
    { key: "vendorQuote", width: 15 },
  ];

  let rowIndex = 1;

  // Title and Project Info
  const titleRow = worksheet.getRow(rowIndex++);
  titleRow.getCell(1).value = `VENDOR TAKEOFF - ${projectInfo.projectName}`;
  titleRow.font = { bold: true, size: 16 };
  titleRow.height = 25;

  const clientRow = worksheet.getRow(rowIndex++);
  clientRow.getCell(1).value = `Client: ${projectInfo.clientName}`;
  clientRow.font = { size: 11 };

  const addressRow = worksheet.getRow(rowIndex++);
  addressRow.getCell(1).value = `Address: ${projectInfo.address}`;
  addressRow.font = { size: 11 };

  const dateRow = worksheet.getRow(rowIndex++);
  dateRow.getCell(1).value = `Date: ${new Date().toLocaleDateString("en-US")}`;
  dateRow.font = { size: 11 };

  const instructionRow = worksheet.getRow(rowIndex++);
  instructionRow.getCell(1).value =
    "Please provide your quote in the 'Vendor Quote' column";
  instructionRow.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };

  rowIndex++; // Blank row

  // Column Headers
  const headerRow = worksheet.getRow(rowIndex++);
  headerRow.values = ["Description", "SKU", "QTY", "Unit", "Vendor Quote"];
  styleHeader(headerRow);

  // Add borders to header
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Process each section
  sections.forEach((section) => {
    // Section line items - filter to materials only (exclude labor/overhead)
    const sectionItems = lineItems.filter(
      (item) => item.section_id === section.id && !item.is_deleted
    );
    const { materials } = separateItemsByType(sectionItems);

    // Skip section if no material items
    if (materials.length === 0) return;

    // Section header
    const sectionHeaderRow = worksheet.getRow(rowIndex++);
    sectionHeaderRow.getCell(1).value = section.section_name.toUpperCase();
    styleSectionHeader(sectionHeaderRow);
    worksheet.mergeCells(rowIndex - 1, 1, rowIndex - 1, 5);

    materials.forEach((item) => {
      const dataRow = worksheet.getRow(rowIndex++);
      dataRow.values = [
        item.description,
        item.sku || "",
        item.quantity,
        item.unit,
        "", // Empty vendor quote column
      ];

      // Format quantity
      dataRow.getCell(3).numFmt = "0.00";

      // Vendor quote column - currency format
      dataRow.getCell(5).numFmt = "$#,##0.00";
      dataRow.getCell(5).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFEF9C3" }, // Light yellow highlight
      };

      // Borders
      dataRow.eachCell((cell, colNum) => {
        if (colNum <= 5) {
          cell.border = {
            left: { style: "thin" },
            right: { style: "thin" },
            bottom: { style: "hair" },
          };
        }
      });
    });

    rowIndex++; // Blank row between sections
  });

  // Footer note
  rowIndex++;
  const footerRow = worksheet.getRow(rowIndex++);
  footerRow.getCell(1).value =
    "Thank you for your quote. Please return this completed spreadsheet.";
  footerRow.font = { italic: true, size: 10 };

  // Download
  const filename = generateFilename(projectInfo.clientName, "Vendor_Takeoff");
  await downloadExcel(workbook, filename);
}
