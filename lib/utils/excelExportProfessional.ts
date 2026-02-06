/**
 * ============================================================================
 * PROFESSIONAL MULTI-TRADE EXCEL GENERATOR - Frontend Version
 * ============================================================================
 * Adapted from n8n workflow for use in Next.js frontend
 * Generates professional, formatted Excel takeoffs matching Mike Skjei standards
 *
 * Usage:
 *   import { exportProfessionalEstimate } from '@/lib/utils/excelExportProfessional';
 *   await exportProfessionalEstimate(takeoffData, sections, lineItems, projectInfo);
 * ============================================================================
 */

import ExcelJS from 'exceljs';
import { separateItemsByType } from './itemHelpers';
import type {
  LaborSection,
  LaborLineItem,
  OverheadSection,
  OverheadLineItem,
  ProjectTotals,
} from '@/lib/types/extraction';

// ============================================================================
// TYPES
// ============================================================================
interface ProjectInfo {
  customerName: string;
  jobAddress: string;
  projectId?: string;
}

interface LineItem {
  id: string;
  section_id: string;
  item_number?: number;
  item_type?: 'material' | 'labor' | 'overhead';  // NEW: Item type field
  description: string;
  quantity: number;
  unit: string;
  material_unit_cost: number;
  labor_unit_cost: number;
  equipment_unit_cost: number;
  sku?: string;
  notes?: string;
  calculation_source?: string;
  formula_used?: string;
  presentation_group?: string;
  category?: string;
}

interface Section {
  id: string;
  takeoff_id: string;
  section_name: string;
  display_order: number;
  section_total?: number;
  notes?: string;
}

interface Takeoff {
  id: string;
  project_id: string;
  takeoff_name: string;
  total_material_cost: number;
  total_labor_cost: number;
  total_equipment_cost: number;
  subtotal?: number;
  markup_percent: number;
  markup_amount?: number;
  final_price?: number;
}

/**
 * V2 Export Options - includes Mike Skjei methodology data
 */
interface V2ExportOptions {
  labor?: LaborSection;
  overhead?: OverheadSection;
  projectTotals?: ProjectTotals;
  metadata?: {
    calculationMethod?: string;
    markupRate?: number;
    crewSize?: number;
    estimatedWeeks?: number;
  };
}

// ============================================================================
// COLOR SCHEME (Professional Standards - matches n8n output)
// ============================================================================
const COLORS = {
  HEADER_BG: 'FF4472C4',
  HEADER_TEXT: 'FFFFFFFF',
  CATEGORY_BG: 'FFD9E1F2',
  CATEGORY_TEXT: 'FF000000',
  LABOR_HEADER_BG: 'FF4472C4',
  LABOR_HEADER_TEXT: 'FFFFFFFF',
  OVERHEAD_HEADER_BG: 'FF7030A0',
  OVERHEAD_HEADER_TEXT: 'FFFFFFFF',
  SUBTOTAL_BG: 'FFE7E6E6',
  LABOR_SUMMARY_BG: 'FFD9D9D9',
  OVERHEAD_SUMMARY_BG: 'FFE4DFEC',
  PROJECT_SUBTOTAL_BG: 'FFFFFF00',
  GRAND_TOTAL_BG: 'FF92D050',
  GRAND_TOTAL_TEXT: 'FFFFFFFF',
  ATTENTION_BG: 'FFFFFF00',
  WARNING_TEXT: 'FFFF0000',
  ALT_ROW_BG: 'FFF2F2F2',
  // V2 Mike Skjei methodology colors
  V2_LABOR_HEADER_BG: 'FF70AD47',      // Green
  V2_LABOR_HEADER_TEXT: 'FFFFFFFF',
  V2_LABOR_ROW_BG: 'FFE2EFDA',          // Light green
  V2_OVERHEAD_HEADER_BG: 'FFFFC000',    // Orange
  V2_OVERHEAD_HEADER_TEXT: 'FFFFFFFF',
  V2_OVERHEAD_ROW_BG: 'FFFFF2CC',       // Light orange
  V2_MATERIAL_HEADER_BG: 'FF4472C4',    // Blue
  V2_MATERIAL_ROW_BG: 'FFD9E1F2',       // Light blue
  V2_TOTALS_BG: 'FFF3F3F3',             // Light gray
  V2_INSURANCE_BG: 'FFFFEB9C',          // Yellow tint
};

// ============================================================================
// PRESENTATION GROUP CONFIGURATION
// ============================================================================
const PRESENTATION_GROUPS: Record<string, { title: string; color: string; order: number }> = {
  // Siding groups
  'siding': { title: 'SIDING & UNDERLAYMENT', color: 'E8F5E9', order: 1 },
  'trim': { title: 'TRIM & CORNERS', color: 'E3F2FD', order: 2 },
  'flashing': { title: 'FLASHING & WEATHERPROOFING', color: 'FFF3E0', order: 3 },
  'fasteners': { title: 'FASTENERS & ACCESSORIES', color: 'F3E5F5', order: 4 },

  // Roofing groups
  'shingles': { title: 'SHINGLES', color: 'FFCDD2', order: 1 },
  'underlayment': { title: 'UNDERLAYMENT', color: 'F8BBD9', order: 2 },
  'ventilation': { title: 'VENTILATION', color: 'E1BEE7', order: 3 },
  'roofing': { title: 'ROOFING MATERIALS', color: 'FFCDD2', order: 1 },

  // Gutter groups
  'gutters': { title: 'GUTTERS', color: 'B3E5FC', order: 1 },
  'downspouts': { title: 'DOWNSPOUTS', color: 'B2DFDB', order: 2 },
  'accessories': { title: 'GUTTER ACCESSORIES', color: 'C8E6C9', order: 3 },
  'gutter_guards': { title: 'GUTTER GUARDS', color: 'FFE0B2', order: 4 },

  // Window groups
  'window_unit': { title: 'WINDOW UNITS', color: 'BBDEFB', order: 1 },
  'window_trim': { title: 'WINDOW TRIM', color: 'C5CAE9', order: 2 },
  'flashing_tape': { title: 'FLASHING & WATERPROOFING', color: 'FFF3E0', order: 3 },
  'windows': { title: 'WINDOWS', color: 'BBDEFB', order: 1 },

  // Labor groups
  'installation': { title: 'INSTALLATION', color: 'BBDEFB', order: 1 },
  'labor': { title: 'INSTALLATION LABOR', color: 'BBDEFB', order: 1 },

  // Default
  'other': { title: 'OTHER MATERIALS', color: 'E0E0E0', order: 99 },
  'materials': { title: 'MATERIALS', color: 'E8F5E9', order: 1 },
};

// ============================================================================
// SIZE EXTRACTION
// ============================================================================
const SIZE_MAP: Record<string, string> = {
  'hardieplank 7.25': '7.25"',
  'hardieplank 8.25': '8.25"',
  'colorplus 7.25': '7.25"',
  'colorplus 8.25': '8.25"',
  'lap siding': '8.25"',
  'hardietrim 1x4': '1x4',
  'hardietrim 1x6': '1x6',
  'outside corner': '3.5"',
  'inside corner': '3.5"',
  '5" k-style': '5"',
  '6" k-style': '6"',
  'downspout 2x3': '2"x3"',
  'downspout 3x4': '3"x4"',
  'timberline': '33.3 sqft',
  'duration': '32.8 sqft',
};

function extractSize(description: string): string {
  const desc = description.toLowerCase();

  // Check SIZE_MAP
  for (const [pattern, size] of Object.entries(SIZE_MAP)) {
    if (desc.includes(pattern)) {
      return size;
    }
  }

  // Regex patterns
  const inchMatch = desc.match(/(\d+(?:\.\d+)?)\s*["″'']/);
  if (inchMatch) return `${inchMatch[1]}"`;

  const lumberMatch = desc.match(/\b(\d+)\s*x\s*(\d+)\b/i);
  if (lumberMatch) return `${lumberMatch[1]}x${lumberMatch[2]}`;

  const ftMatch = desc.match(/(\d+)\s*(?:ft|'|foot|feet)\b/i);
  if (ftMatch) return `${ftMatch[1]} ft`;

  return '';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function safeNum(value: number | null | undefined): number {
  if (value === undefined || value === null || isNaN(value)) return 0;
  return Number(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Calculate labor total (includes L&I insurance 12.65%)
 * Parse from formula_used or calculate
 */
function getLaborTotal(item: LineItem): number {
  // Method 1: Parse from formula_used (most accurate)
  if (item.formula_used && typeof item.formula_used === 'string') {
    const match = item.formula_used.match(/=\s*\$([0-9,]+\.?\d*)\s*$/);
    if (match) {
      const total = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(total)) {
        return total;
      }
    }
  }

  // Method 2: Calculate with L&I markup
  const quantity = safeNum(item.quantity);
  const laborRate = safeNum(item.labor_unit_cost);
  const baseLabor = quantity * laborRate;
  return baseLabor * 1.1265; // 12.65% L&I insurance
}

// ============================================================================
// STYLING FUNCTIONS
// ============================================================================
function styleHeader(cell: ExcelJS.Cell, text: string, bgColor = COLORS.HEADER_BG, textColor = COLORS.HEADER_TEXT) {
  cell.value = text;
  cell.font = { bold: true, size: 11, color: { argb: textColor } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' }
  };
}

function styleGroupHeader(cell: ExcelJS.Cell, text: string, bgColor: string) {
  cell.value = text;
  cell.font = { bold: true, size: 12, color: { argb: 'FF000000' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
  cell.border = {
    top: { style: 'medium' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' }
  };
}

function styleSubtotal(cell: ExcelJS.Cell, formula?: string, value?: number) {
  if (formula) {
    cell.value = { formula };
  } else if (value !== undefined) {
    cell.value = value;
  }
  cell.font = { bold: true, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };
  cell.border = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' }
  };
}

function styleGrandTotal(cell: ExcelJS.Cell, formula?: string, value?: number) {
  if (formula) {
    cell.value = { formula };
  } else if (value !== undefined) {
    cell.value = value;
  }
  cell.font = { bold: true, size: 12, color: { argb: COLORS.GRAND_TOTAL_TEXT } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GRAND_TOTAL_BG } };
  cell.border = {
    top: { style: 'double' }, left: { style: 'medium' },
    bottom: { style: 'double' }, right: { style: 'medium' }
  };
}

function styleDataCell(cell: ExcelJS.Cell, isAltRow = false) {
  cell.border = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' }
  };
  if (isAltRow) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ALT_ROW_BG } };
  }
}

// ============================================================================
// V2 LABOR SECTION (Mike Skjei Methodology)
// ============================================================================
/**
 * Add V2 Installation Labor section to worksheet
 * Shows labor items calculated by squares (SQ = 100 SF)
 */
function addV2LaborSection(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  labor: LaborSection | undefined,
  projectTotals: ProjectTotals | undefined
): number {
  if (!labor && !projectTotals) return startRow;

  let row = startRow;

  // Section header - green background
  const headerRow = worksheet.getRow(row);
  worksheet.mergeCells(`A${row}:G${row}`);
  headerRow.getCell(1).value = 'INSTALLATION LABOR (Mike Skjei Methodology)';
  headerRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.V2_LABOR_HEADER_BG },
  };
  headerRow.getCell(1).font = { bold: true, color: { argb: COLORS.V2_LABOR_HEADER_TEXT }, size: 12 };
  headerRow.getCell(1).alignment = { horizontal: 'center' };
  headerRow.getCell(1).border = {
    top: { style: 'medium' }, left: { style: 'medium' },
    bottom: { style: 'thin' }, right: { style: 'medium' }
  };
  row++;

  // Column headers
  const headers = ['#', 'Description', 'Qty (SQ)', 'Unit', 'Rate ($/SQ)', 'Extended', 'Notes'];
  const colHeaderRow = worksheet.getRow(row);
  headers.forEach((header, idx) => {
    const cell = colHeaderRow.getCell(idx + 1);
    cell.value = header;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.V2_LABOR_ROW_BG } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.alignment = { horizontal: idx >= 2 && idx <= 5 ? 'right' : 'left' };
  });
  row++;

  // Labor items
  if (labor?.installation_items && labor.installation_items.length > 0) {
    labor.installation_items.forEach((item, idx) => {
      const itemRow = worksheet.getRow(row);
      const isAltRow = idx % 2 === 1;

      itemRow.getCell(1).value = idx + 1;
      styleDataCell(itemRow.getCell(1), isAltRow);

      itemRow.getCell(2).value = item.description || item.rate_name;
      styleDataCell(itemRow.getCell(2), isAltRow);

      itemRow.getCell(3).value = item.quantity;
      itemRow.getCell(3).numFmt = '#,##0.00';
      itemRow.getCell(3).alignment = { horizontal: 'right' };
      styleDataCell(itemRow.getCell(3), isAltRow);

      itemRow.getCell(4).value = item.unit; // 'SQ'
      itemRow.getCell(4).alignment = { horizontal: 'center' };
      styleDataCell(itemRow.getCell(4), isAltRow);

      itemRow.getCell(5).value = item.unit_cost;
      itemRow.getCell(5).numFmt = '"$"#,##0.00';
      itemRow.getCell(5).alignment = { horizontal: 'right' };
      styleDataCell(itemRow.getCell(5), isAltRow);

      itemRow.getCell(6).value = item.total_cost;
      itemRow.getCell(6).numFmt = '"$"#,##0.00';
      itemRow.getCell(6).alignment = { horizontal: 'right' };
      styleDataCell(itemRow.getCell(6), isAltRow);

      itemRow.getCell(7).value = item.notes || '';
      styleDataCell(itemRow.getCell(7), isAltRow);

      row++;
    });
  } else if (projectTotals) {
    // Fallback: show subtotal from project_totals
    const itemRow = worksheet.getRow(row);
    itemRow.getCell(2).value = 'Installation Labor (calculated by squares)';
    styleDataCell(itemRow.getCell(2));
    itemRow.getCell(6).value = projectTotals.installation_labor_subtotal;
    itemRow.getCell(6).numFmt = '"$"#,##0.00';
    itemRow.getCell(6).alignment = { horizontal: 'right' };
    styleDataCell(itemRow.getCell(6));
    row++;
  }

  // Subtotal row
  const subtotalRow = worksheet.getRow(row);
  subtotalRow.getCell(5).value = 'Installation Subtotal:';
  subtotalRow.getCell(5).font = { bold: true };
  subtotalRow.getCell(5).alignment = { horizontal: 'right' };
  subtotalRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };
  subtotalRow.getCell(6).value = labor?.installation_subtotal || projectTotals?.installation_labor_subtotal || 0;
  subtotalRow.getCell(6).numFmt = '"$"#,##0.00';
  subtotalRow.getCell(6).font = { bold: true };
  subtotalRow.getCell(6).alignment = { horizontal: 'right' };
  subtotalRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };
  row++;

  return row;
}

// ============================================================================
// V2 OVERHEAD SECTION (Mike Skjei Methodology)
// ============================================================================
/**
 * Add V2 Overhead & Burden section to worksheet
 * Shows overhead items like labor burden, equipment, setup costs
 */
function addV2OverheadSection(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  overhead: OverheadSection | undefined,
  projectTotals: ProjectTotals | undefined
): number {
  if (!overhead && !projectTotals) return startRow;

  let row = startRow;

  // Section header - orange background
  const headerRow = worksheet.getRow(row);
  worksheet.mergeCells(`A${row}:G${row}`);
  headerRow.getCell(1).value = 'OVERHEAD & BURDEN';
  headerRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.V2_OVERHEAD_HEADER_BG },
  };
  headerRow.getCell(1).font = { bold: true, color: { argb: COLORS.V2_OVERHEAD_HEADER_TEXT }, size: 12 };
  headerRow.getCell(1).alignment = { horizontal: 'center' };
  headerRow.getCell(1).border = {
    top: { style: 'medium' }, left: { style: 'medium' },
    bottom: { style: 'thin' }, right: { style: 'medium' }
  };
  row++;

  // Column headers
  const headers = ['#', 'Cost Item', 'Qty', 'Unit', 'Rate', 'Amount', 'Category'];
  const colHeaderRow = worksheet.getRow(row);
  headers.forEach((header, idx) => {
    const cell = colHeaderRow.getCell(idx + 1);
    cell.value = header;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.V2_OVERHEAD_ROW_BG } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.alignment = { horizontal: idx >= 2 && idx <= 5 ? 'right' : 'left' };
  });
  row++;

  // Overhead items
  if (overhead?.items && overhead.items.length > 0) {
    overhead.items.forEach((item, idx) => {
      const itemRow = worksheet.getRow(row);
      const isAltRow = idx % 2 === 1;

      itemRow.getCell(1).value = idx + 1;
      styleDataCell(itemRow.getCell(1), isAltRow);

      itemRow.getCell(2).value = item.cost_name;
      styleDataCell(itemRow.getCell(2), isAltRow);

      itemRow.getCell(3).value = item.quantity ?? '';
      itemRow.getCell(3).alignment = { horizontal: 'right' };
      styleDataCell(itemRow.getCell(3), isAltRow);

      itemRow.getCell(4).value = item.unit ?? '';
      itemRow.getCell(4).alignment = { horizontal: 'center' };
      styleDataCell(itemRow.getCell(4), isAltRow);

      if (item.rate !== undefined && item.rate !== null) {
        itemRow.getCell(5).value = item.rate;
        itemRow.getCell(5).numFmt = item.calculation_type === 'percentage' ? '0.00%' : '"$"#,##0.00';
      } else {
        itemRow.getCell(5).value = '';
      }
      itemRow.getCell(5).alignment = { horizontal: 'right' };
      styleDataCell(itemRow.getCell(5), isAltRow);

      itemRow.getCell(6).value = item.amount;
      itemRow.getCell(6).numFmt = '"$"#,##0.00';
      itemRow.getCell(6).alignment = { horizontal: 'right' };
      styleDataCell(itemRow.getCell(6), isAltRow);

      itemRow.getCell(7).value = item.category || '';
      styleDataCell(itemRow.getCell(7), isAltRow);

      row++;
    });
  } else if (projectTotals) {
    // Fallback: show subtotal from project_totals
    const itemRow = worksheet.getRow(row);
    itemRow.getCell(2).value = 'Project Overhead (consolidated)';
    styleDataCell(itemRow.getCell(2));
    itemRow.getCell(6).value = projectTotals.overhead_subtotal;
    itemRow.getCell(6).numFmt = '"$"#,##0.00';
    itemRow.getCell(6).alignment = { horizontal: 'right' };
    styleDataCell(itemRow.getCell(6));
    row++;
  }

  // Subtotal row
  const subtotalRow = worksheet.getRow(row);
  subtotalRow.getCell(5).value = 'Overhead Subtotal:';
  subtotalRow.getCell(5).font = { bold: true };
  subtotalRow.getCell(5).alignment = { horizontal: 'right' };
  subtotalRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.OVERHEAD_SUMMARY_BG } };
  subtotalRow.getCell(6).value = overhead?.subtotal || projectTotals?.overhead_subtotal || 0;
  subtotalRow.getCell(6).numFmt = '"$"#,##0.00';
  subtotalRow.getCell(6).font = { bold: true };
  subtotalRow.getCell(6).alignment = { horizontal: 'right' };
  subtotalRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.OVERHEAD_SUMMARY_BG } };
  row++;

  return row;
}

// ============================================================================
// V2 PROJECT TOTALS SECTION (Mike Skjei Methodology)
// ============================================================================
/**
 * Add V2 Project Totals section with full breakdown
 * Material Cost → Markup → Material Total
 * Labor Cost → Overhead → Markup → Labor Total
 * Subtotal → Insurance → Grand Total
 */
function addV2TotalsSection(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  projectTotals: ProjectTotals
): number {
  let row = startRow;

  // Section header
  const headerRow = worksheet.getRow(row);
  worksheet.mergeCells(`A${row}:G${row}`);
  headerRow.getCell(1).value = 'PROJECT TOTALS (Mike Skjei Methodology)';
  headerRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.HEADER_BG },
  };
  headerRow.getCell(1).font = { bold: true, color: { argb: COLORS.HEADER_TEXT }, size: 12 };
  headerRow.getCell(1).alignment = { horizontal: 'center' };
  headerRow.getCell(1).border = {
    top: { style: 'medium' }, left: { style: 'medium' },
    bottom: { style: 'thin' }, right: { style: 'medium' }
  };
  row++;

  // Materials breakdown
  row = addTotalsRow(worksheet, row, 'Material Cost', projectTotals.material_cost, COLORS.V2_MATERIAL_ROW_BG);
  row = addTotalsRow(worksheet, row, `Material Markup (${(projectTotals.material_markup_rate * 100).toFixed(0)}%)`, projectTotals.material_markup_amount, COLORS.V2_MATERIAL_ROW_BG);
  row = addTotalsRow(worksheet, row, 'MATERIAL TOTAL', projectTotals.material_total, COLORS.V2_MATERIAL_ROW_BG, true);

  row++; // Blank row

  // Labor breakdown
  row = addTotalsRow(worksheet, row, 'Installation Labor', projectTotals.installation_labor_subtotal, COLORS.V2_LABOR_ROW_BG);
  row = addTotalsRow(worksheet, row, 'Overhead', projectTotals.overhead_subtotal, COLORS.V2_OVERHEAD_ROW_BG);
  row = addTotalsRow(worksheet, row, 'Labor Subtotal (Before Markup)', projectTotals.labor_cost_before_markup, COLORS.V2_TOTALS_BG);
  row = addTotalsRow(worksheet, row, `Labor Markup (${(projectTotals.labor_markup_rate * 100).toFixed(0)}%)`, projectTotals.labor_markup_amount, COLORS.V2_TOTALS_BG);
  row = addTotalsRow(worksheet, row, 'LABOR TOTAL', projectTotals.labor_total, COLORS.V2_LABOR_ROW_BG, true);

  row++; // Blank row

  // Final totals
  row = addTotalsRow(worksheet, row, 'Subtotal (Materials + Labor)', projectTotals.subtotal, COLORS.SUBTOTAL_BG, true);

  if (projectTotals.project_insurance > 0) {
    row = addTotalsRow(worksheet, row, 'Project Insurance ($24.38 per $1,000)', projectTotals.project_insurance, COLORS.V2_INSURANCE_BG);
  }

  // Grand Total
  const grandTotalRow = worksheet.getRow(row);
  grandTotalRow.getCell(5).value = 'GRAND TOTAL';
  grandTotalRow.getCell(5).font = { bold: true, size: 12 };
  grandTotalRow.getCell(5).alignment = { horizontal: 'right' };
  styleGrandTotal(grandTotalRow.getCell(5));
  grandTotalRow.getCell(6).value = projectTotals.grand_total;
  grandTotalRow.getCell(6).numFmt = '"$"#,##0.00';
  styleGrandTotal(grandTotalRow.getCell(6), undefined, projectTotals.grand_total);
  row++;

  return row;
}

/**
 * Helper to add a single totals row
 */
function addTotalsRow(
  worksheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: number,
  bgColor: string,
  isBold = false
): number {
  const rowObj = worksheet.getRow(row);

  rowObj.getCell(5).value = label;
  rowObj.getCell(5).font = { bold: isBold, size: isBold ? 11 : 10 };
  rowObj.getCell(5).alignment = { horizontal: 'right' };
  rowObj.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  rowObj.getCell(5).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  rowObj.getCell(6).value = value;
  rowObj.getCell(6).numFmt = '"$"#,##0.00';
  rowObj.getCell(6).font = { bold: isBold, size: isBold ? 11 : 10 };
  rowObj.getCell(6).alignment = { horizontal: 'right' };
  rowObj.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  rowObj.getCell(6).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  return row + 1;
}

// ============================================================================
// CREATE SUMMARY SHEET
// ============================================================================
function createSummarySheet(
  workbook: ExcelJS.Workbook,
  sections: Section[],
  lineItemsBySection: Record<string, LineItem[]>,
  projectInfo: ProjectInfo
) {
  const sheet = workbook.addWorksheet('Summary', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }]
  });

  let row = 1;

  // Customer Header
  const customerCell = sheet.getCell(`A${row}`);
  customerCell.value = projectInfo.customerName;
  customerCell.font = { bold: true, size: 18 };
  sheet.mergeCells(`A${row}:F${row}`);
  row++;

  const addressCell = sheet.getCell(`A${row}`);
  addressCell.value = projectInfo.jobAddress;
  addressCell.font = { size: 12 };
  sheet.mergeCells(`A${row}:F${row}`);
  row++;

  const dateCell = sheet.getCell(`A${row}`);
  dateCell.value = `Date: ${new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })}`;
  dateCell.font = { size: 10, color: { argb: COLORS.WARNING_TEXT }, bold: true };
  sheet.mergeCells(`A${row}:F${row}`);
  row += 2;

  // Trade Summary Table Headers
  styleHeader(sheet.getCell(`A${row}`), 'Trade');
  styleHeader(sheet.getCell(`B${row}`), 'Material Cost');
  styleHeader(sheet.getCell(`C${row}`), 'Labor Cost');
  styleHeader(sheet.getCell(`D${row}`), 'Equipment');
  styleHeader(sheet.getCell(`E${row}`), 'Subtotal');
  styleHeader(sheet.getCell(`F${row}`), 'Items');

  sheet.getColumn('A').width = 20;
  sheet.getColumn('B').width = 15;
  sheet.getColumn('C').width = 15;
  sheet.getColumn('D').width = 15;
  sheet.getColumn('E').width = 15;
  sheet.getColumn('F').width = 10;

  row++;
  const dataStartRow = row;

  // Trade rows
  sections.forEach((section, idx) => {
    const tradeRow = row + idx;
    const isAltRow = idx % 2 === 1;
    const items = lineItemsBySection[section.id] || [];

    // BUG FIX #7: Separate items by type and calculate with L&I for labor
    const { materials, labor, overhead } = separateItemsByType(items);

    // Calculate totals for this section
    const materialTotal = materials.reduce((sum, item) => sum + (safeNum(item.quantity) * safeNum(item.material_unit_cost)), 0);

    // BUG FIX #9: Labor has TWO sources:
    // 1. Per-item labor on materials (quantity × labor_unit_cost)
    const materialLabor = materials.reduce((sum, item) =>
      sum + (safeNum(item.quantity) * safeNum(item.labor_unit_cost)), 0);

    // 2. Installation labor items (with L&I insurance included)
    const installationLabor = labor.reduce((sum, item) => sum + getLaborTotal(item), 0);

    const laborTotal = materialLabor + installationLabor; // BOTH components!

    const equipmentTotal = overhead.reduce((sum, item) => sum + safeNum(item.equipment_unit_cost), 0);

    const tradeCell = sheet.getCell(`A${tradeRow}`);
    tradeCell.value = section.section_name;
    styleDataCell(tradeCell, isAltRow);
    tradeCell.font = { bold: true };

    const matCell = sheet.getCell(`B${tradeRow}`);
    matCell.value = materialTotal;
    matCell.numFmt = '$#,##0.00';
    styleDataCell(matCell, isAltRow);

    const laborCell = sheet.getCell(`C${tradeRow}`);
    laborCell.value = laborTotal;
    laborCell.numFmt = '$#,##0.00';
    styleDataCell(laborCell, isAltRow);

    const equipCell = sheet.getCell(`D${tradeRow}`);
    equipCell.value = equipmentTotal;
    equipCell.numFmt = '$#,##0.00';
    styleDataCell(equipCell, isAltRow);

    const subtotalCell = sheet.getCell(`E${tradeRow}`);
    subtotalCell.value = { formula: `B${tradeRow}+C${tradeRow}+D${tradeRow}` };
    subtotalCell.numFmt = '$#,##0.00';
    styleDataCell(subtotalCell, isAltRow);
    subtotalCell.font = { bold: true };

    const itemsCell = sheet.getCell(`F${tradeRow}`);
    itemsCell.value = items.length;
    styleDataCell(itemsCell, isAltRow);
    itemsCell.alignment = { horizontal: 'center' };
  });

  row += sections.length;

  // Trade Subtotal (before overhead)
  const tradeSubtotalRow = row;
  const tradeSubtotalLabel = sheet.getCell(`A${tradeSubtotalRow}`);
  tradeSubtotalLabel.value = 'Trade Subtotal';
  tradeSubtotalLabel.font = { bold: true, size: 11 };
  tradeSubtotalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };
  tradeSubtotalLabel.alignment = { horizontal: 'right' };

  const tradeSubtotalMatCell = sheet.getCell(`B${tradeSubtotalRow}`);
  tradeSubtotalMatCell.value = { formula: `SUM(B${dataStartRow}:B${row - 1})` };
  tradeSubtotalMatCell.numFmt = '$#,##0.00';
  tradeSubtotalMatCell.font = { bold: true };
  tradeSubtotalMatCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };

  const tradeSubtotalLaborCell = sheet.getCell(`C${tradeSubtotalRow}`);
  tradeSubtotalLaborCell.value = { formula: `SUM(C${dataStartRow}:C${row - 1})` };
  tradeSubtotalLaborCell.numFmt = '$#,##0.00';
  tradeSubtotalLaborCell.font = { bold: true };
  tradeSubtotalLaborCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };

  const tradeSubtotalEquipCell = sheet.getCell(`D${tradeSubtotalRow}`);
  tradeSubtotalEquipCell.value = { formula: `SUM(D${dataStartRow}:D${row - 1})` };
  tradeSubtotalEquipCell.numFmt = '$#,##0.00';
  tradeSubtotalEquipCell.font = { bold: true };
  tradeSubtotalEquipCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };

  const tradeSubtotalTotalCell = sheet.getCell(`E${tradeSubtotalRow}`);
  tradeSubtotalTotalCell.value = { formula: `SUM(E${dataStartRow}:E${row - 1})` };
  tradeSubtotalTotalCell.numFmt = '$#,##0.00';
  tradeSubtotalTotalCell.font = { bold: true };
  tradeSubtotalTotalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };

  row += 3;

  // ============================================================================
  // BUG FIX #6: PROJECT OVERHEAD (Consolidated)
  // ============================================================================
  // Consolidate overhead items across all trades
  const allOverheadItems: Array<LineItem & { tradeName: string }> = [];

  sections.forEach(section => {
    const items = lineItemsBySection[section.id] || [];
    const { overhead } = separateItemsByType(items);

    overhead.forEach(item => {
      allOverheadItems.push({
        ...item,
        tradeName: section.section_name
      });
    });
  });

  // Track overhead subtotal row for grand total calculation
  let overheadSubtotalRow: number | null = null;

  if (allOverheadItems.length > 0) {
    // Consolidate by description
    const consolidatedOverhead: Record<string, {
      description: string;
      totalAmount: number;
      appliesTo: string[];
    }> = {};

    allOverheadItems.forEach(item => {
      const key = item.description.toLowerCase().trim();

      if (!consolidatedOverhead[key]) {
        consolidatedOverhead[key] = {
          description: item.description,
          totalAmount: 0,
          appliesTo: []
        };
      }

      consolidatedOverhead[key].totalAmount += safeNum(item.equipment_unit_cost);

      if (!consolidatedOverhead[key].appliesTo.includes(item.tradeName)) {
        consolidatedOverhead[key].appliesTo.push(item.tradeName);
      }
    });

    // Add consolidated overhead section
    const overheadHeaderCell = sheet.getCell(`A${row}`);
    overheadHeaderCell.value = 'PROJECT OVERHEAD (Consolidated)';
    overheadHeaderCell.font = { bold: true, size: 12, color: { argb: COLORS.OVERHEAD_HEADER_TEXT } };
    overheadHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.OVERHEAD_HEADER_BG } };
    overheadHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.mergeCells(`A${row}:F${row}`);
    row++;

    // Column headers for overhead section
    styleHeader(sheet.getCell(`A${row}`), 'Description');
    styleHeader(sheet.getCell(`E${row}`), 'Total');
    styleHeader(sheet.getCell(`F${row}`), 'Applies To');
    row++;

    const overheadStartRow = row;

    // Overhead items
    Object.values(consolidatedOverhead).forEach((item, idx) => {
      const isAltRow = idx % 2 === 1;

      const descCell = sheet.getCell(`A${row}`);
      descCell.value = item.description;
      styleDataCell(descCell, isAltRow);
      sheet.mergeCells(`A${row}:D${row}`);

      const amountCell = sheet.getCell(`E${row}`);
      amountCell.value = item.totalAmount;
      amountCell.numFmt = '$#,##0.00';
      styleDataCell(amountCell, isAltRow);

      const appliesCell = sheet.getCell(`F${row}`);
      appliesCell.value = item.appliesTo.join(', ');
      styleDataCell(appliesCell, isAltRow);
      appliesCell.alignment = { wrapText: true };

      row++;
    });

    // Overhead Subtotal
    overheadSubtotalRow = row;
    const overheadSubtotalLabel = sheet.getCell(`A${overheadSubtotalRow}`);
    overheadSubtotalLabel.value = 'Overhead Subtotal';
    overheadSubtotalLabel.font = { bold: true, size: 11 };
    overheadSubtotalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.OVERHEAD_SUMMARY_BG } };
    overheadSubtotalLabel.alignment = { horizontal: 'right' };
    sheet.mergeCells(`A${overheadSubtotalRow}:D${overheadSubtotalRow}`);

    const overheadSubtotalCell = sheet.getCell(`E${overheadSubtotalRow}`);
    overheadSubtotalCell.value = { formula: `SUM(E${overheadStartRow}:E${row - 1})` };
    overheadSubtotalCell.numFmt = '$#,##0.00';
    overheadSubtotalCell.font = { bold: true };
    overheadSubtotalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.OVERHEAD_SUMMARY_BG } };

    row += 2;
  }

  // BUG FIX #8: Grand Total = Trade Subtotal + Overhead Subtotal
  const grandRow = row;
  const grandLabelCell = sheet.getCell(`A${grandRow}`);
  grandLabelCell.value = 'PROJECT GRAND TOTAL';
  styleGrandTotal(grandLabelCell);
  grandLabelCell.alignment = { horizontal: 'right' };
  sheet.mergeCells(`A${grandRow}:D${grandRow}`);

  const grandTotalCell = sheet.getCell(`E${grandRow}`);
  // If we have overhead, sum Trade Subtotal + Overhead Subtotal
  // Otherwise, just use Trade Subtotal
  if (overheadSubtotalRow) {
    grandTotalCell.value = { formula: `E${tradeSubtotalRow}+E${overheadSubtotalRow}` };
  } else {
    grandTotalCell.value = { formula: `E${tradeSubtotalRow}` };
  }
  grandTotalCell.numFmt = '$#,##0.00';
  styleGrandTotal(grandTotalCell);

  // Notes Section
  row = grandRow + 3;

  sheet.getCell(`A${row}`).value = 'Notes:';
  sheet.getCell(`A${row}`).font = { bold: true, size: 11 };

  row++;
  sheet.getCell(`A${row}`).value = '• All prices include materials and labor';
  sheet.getCell(`A${row}`).font = { size: 10 };

  row++;
  sheet.getCell(`A${row}`).value = '• Labor costs include 12.65% L&I insurance';
  sheet.getCell(`A${row}`).font = { size: 10 };

  row++;
  sheet.getCell(`A${row}`).value = '• Pricing valid for 90 days from estimate date';
  sheet.getCell(`A${row}`).font = { size: 10, color: { argb: COLORS.WARNING_TEXT } };

  return sheet;
}

// ============================================================================
// CREATE TRADE SHEET
// ============================================================================
function createTradeSheet(
  workbook: ExcelJS.Workbook,
  section: Section,
  items: LineItem[],
  projectInfo: ProjectInfo
) {
  const tradeName = section.section_name;
  const sheet = workbook.addWorksheet(tradeName, {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 6 }]
  });

  let row = 1;

  // Customer Header
  const customerCell = sheet.getCell(`A${row}`);
  customerCell.value = projectInfo.customerName;
  customerCell.font = { bold: true, size: 16 };
  sheet.mergeCells(`A${row}:H${row}`);
  row++;

  const addressCell = sheet.getCell(`A${row}`);
  addressCell.value = projectInfo.jobAddress;
  addressCell.font = { size: 11 };
  sheet.mergeCells(`A${row}:H${row}`);
  row++;

  const tradeHeaderCell = sheet.getCell(`A${row}`);
  tradeHeaderCell.value = `${tradeName} Takeoff`;
  tradeHeaderCell.font = { bold: true, size: 14, color: { argb: COLORS.WARNING_TEXT } };
  sheet.mergeCells(`A${row}:H${row}`);
  row += 2;

  // Column Headers
  const headerRow = row;
  styleHeader(sheet.getCell(`A${headerRow}`), 'Description');
  styleHeader(sheet.getCell(`B${headerRow}`), 'Size');
  styleHeader(sheet.getCell(`C${headerRow}`), 'QTY');
  styleHeader(sheet.getCell(`D${headerRow}`), 'U/M');
  styleHeader(sheet.getCell(`E${headerRow}`), 'Mat $/Unit');
  styleHeader(sheet.getCell(`F${headerRow}`), 'Labor $/Unit');
  styleHeader(sheet.getCell(`G${headerRow}`), 'Unit Price');
  styleHeader(sheet.getCell(`H${headerRow}`), 'Total');
  styleHeader(sheet.getCell(`I${headerRow}`), 'Notes');

  sheet.getColumn('A').width = 40;
  sheet.getColumn('B').width = 12;
  sheet.getColumn('C').width = 10;
  sheet.getColumn('D').width = 8;
  sheet.getColumn('E').width = 12;
  sheet.getColumn('F').width = 12;
  sheet.getColumn('G').width = 12;
  sheet.getColumn('H').width = 14;
  sheet.getColumn('I').width = 30;

  row++;

  // ============================================================================
  // BUG FIX: Separate items by type FIRST (Materials → Labor → Overhead)
  // ============================================================================
  const { materials, labor, overhead } = separateItemsByType(items);

  const allSubtotalRows: number[] = [];
  const dataStartRow = row;

  // ============================================================================
  // SECTION 1: MATERIALS (grouped by presentation_group)
  // ============================================================================
  if (materials.length > 0) {
    const groupedMaterials: Record<string, LineItem[]> = {};

    materials.forEach(item => {
      const group = item.presentation_group || item.category || 'materials';
      if (!groupedMaterials[group]) {
        groupedMaterials[group] = [];
      }
      groupedMaterials[group].push(item);
    });

    // Sort groups by order
    const sortedGroups = Object.keys(groupedMaterials).sort((a, b) => {
      const orderA = PRESENTATION_GROUPS[a]?.order || 99;
      const orderB = PRESENTATION_GROUPS[b]?.order || 99;
      return orderA - orderB;
    });

    sortedGroups.forEach(groupKey => {
      const groupItems = groupedMaterials[groupKey];
      const config = PRESENTATION_GROUPS[groupKey] || PRESENTATION_GROUPS['other'];

      // Group Header
      const groupHeaderCell = sheet.getCell(`A${row}`);
      styleGroupHeader(groupHeaderCell, config.title, config.color);
      sheet.mergeCells(`A${row}:I${row}`);
      row++;

      const groupStartRow = row;

      // Material item rows
      groupItems.forEach((item, idx) => {
        const itemRow = row;
        const isAltRow = idx % 2 === 1;

        // Description
        const descCell = sheet.getCell(`A${itemRow}`);
        descCell.value = item.description || 'Unknown Item';
        styleDataCell(descCell, isAltRow);

        // Size
        const sizeCell = sheet.getCell(`B${itemRow}`);
        sizeCell.value = extractSize(item.description);
        styleDataCell(sizeCell, isAltRow);

        // Quantity
        const qtyCell = sheet.getCell(`C${itemRow}`);
        qtyCell.value = safeNum(item.quantity);
        qtyCell.numFmt = Number.isInteger(item.quantity) ? '#,##0' : '#,##0.00';
        styleDataCell(qtyCell, isAltRow);
        qtyCell.alignment = { horizontal: 'right' };

        // Unit
        const unitCell = sheet.getCell(`D${itemRow}`);
        unitCell.value = item.unit || 'ea';
        styleDataCell(unitCell, isAltRow);
        unitCell.alignment = { horizontal: 'center' };

        // Material $/Unit
        const matPriceCell = sheet.getCell(`E${itemRow}`);
        matPriceCell.value = safeNum(item.material_unit_cost);
        matPriceCell.numFmt = '$#,##0.00';
        styleDataCell(matPriceCell, isAltRow);

        // Labor $/Unit
        const laborPriceCell = sheet.getCell(`F${itemRow}`);
        laborPriceCell.value = safeNum(item.labor_unit_cost);
        laborPriceCell.numFmt = '$#,##0.00';
        styleDataCell(laborPriceCell, isAltRow);

        // Unit Price (combined)
        const unitPriceCell = sheet.getCell(`G${itemRow}`);
        unitPriceCell.value = { formula: `E${itemRow}+F${itemRow}` };
        unitPriceCell.numFmt = '$#,##0.00';
        styleDataCell(unitPriceCell, isAltRow);

        // Total
        const totalCell = sheet.getCell(`H${itemRow}`);
        totalCell.value = { formula: `C${itemRow}*G${itemRow}` };
        totalCell.numFmt = '$#,##0.00';
        styleDataCell(totalCell, isAltRow);

        // Notes
        const notesCell = sheet.getCell(`I${itemRow}`);
        notesCell.value = item.notes || '';
        styleDataCell(notesCell, isAltRow);
        notesCell.alignment = { wrapText: true };

        row++;
      });

      // Group Subtotal
      const subtotalRow = row;
      const subtotalLabelCell = sheet.getCell(`A${subtotalRow}`);
      subtotalLabelCell.value = `${config.title} Subtotal`;
      styleSubtotal(subtotalLabelCell);
      subtotalLabelCell.alignment = { horizontal: 'right' };
      sheet.mergeCells(`A${subtotalRow}:G${subtotalRow}`);

      const subtotalCell = sheet.getCell(`H${subtotalRow}`);
      styleSubtotal(subtotalCell, `SUM(H${groupStartRow}:H${row - 1})`);
      subtotalCell.numFmt = '$#,##0.00';

      allSubtotalRows.push(subtotalRow);
      row += 2;
    });

    // BUG FIX #4: Add MATERIALS TOTAL row
    const materialsTotalRow = row;
    const materialsTotalLabel = sheet.getCell(`A${materialsTotalRow}`);
    materialsTotalLabel.value = 'MATERIALS TOTAL';
    materialsTotalLabel.font = { bold: true, size: 11 };
    materialsTotalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };
    materialsTotalLabel.alignment = { horizontal: 'right' };
    sheet.mergeCells(`A${materialsTotalRow}:G${materialsTotalRow}`);

    const materialsTotalCell = sheet.getCell(`H${materialsTotalRow}`);
    const materialSubtotals = allSubtotalRows.map(r => `H${r}`).join('+');
    materialsTotalCell.value = { formula: materialSubtotals };
    materialsTotalCell.numFmt = '$#,##0.00';
    materialsTotalCell.font = { bold: true, size: 11 };
    materialsTotalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };

    row += 3;
  }

  // ============================================================================
  // SECTION 2: LABOR (all together, with L&I insurance)
  // ============================================================================
  if (labor.length > 0) {
    // Labor section header
    const laborHeaderCell = sheet.getCell(`A${row}`);
    styleGroupHeader(laborHeaderCell, 'INSTALLATION LABOR', 'BBDEFB'); // Light blue
    sheet.mergeCells(`A${row}:I${row}`);
    row++;

    const laborStartRow = row;

    // Labor item rows
    labor.forEach((item, idx) => {
      const itemRow = row;
      const isAltRow = idx % 2 === 1;

      // Description
      const descCell = sheet.getCell(`A${itemRow}`);
      descCell.value = item.description || 'Unknown Item';
      styleDataCell(descCell, isAltRow);

      // Size (empty for labor)
      const sizeCell = sheet.getCell(`B${itemRow}`);
      sizeCell.value = '';
      styleDataCell(sizeCell, isAltRow);

      // Quantity
      const qtyCell = sheet.getCell(`C${itemRow}`);
      qtyCell.value = safeNum(item.quantity);
      qtyCell.numFmt = Number.isInteger(item.quantity) ? '#,##0' : '#,##0.00';
      styleDataCell(qtyCell, isAltRow);
      qtyCell.alignment = { horizontal: 'right' };

      // Unit
      const unitCell = sheet.getCell(`D${itemRow}`);
      unitCell.value = item.unit || 'ea';
      styleDataCell(unitCell, isAltRow);
      unitCell.alignment = { horizontal: 'center' };

      // Rate (labor_unit_cost)
      const rateCell = sheet.getCell(`E${itemRow}`);
      rateCell.value = safeNum(item.labor_unit_cost);
      rateCell.numFmt = '$#,##0.00';
      styleDataCell(rateCell, isAltRow);

      // Empty columns F & G
      styleDataCell(sheet.getCell(`F${itemRow}`), isAltRow);
      styleDataCell(sheet.getCell(`G${itemRow}`), isAltRow);

      // BUG FIX #2: Total with L&I insurance
      const totalCell = sheet.getCell(`H${itemRow}`);
      totalCell.value = getLaborTotal(item);
      totalCell.numFmt = '$#,##0.00';
      styleDataCell(totalCell, isAltRow);

      // Notes
      const notesCell = sheet.getCell(`I${itemRow}`);
      notesCell.value = item.notes || '';
      styleDataCell(notesCell, isAltRow);
      notesCell.alignment = { wrapText: true };

      row++;
    });

    // Labor Subtotal
    const laborSubtotalRow = row;
    const laborSubtotalLabel = sheet.getCell(`A${laborSubtotalRow}`);
    laborSubtotalLabel.value = 'LABOR SUBTOTAL';
    styleSubtotal(laborSubtotalLabel);
    laborSubtotalLabel.alignment = { horizontal: 'right' };
    sheet.mergeCells(`A${laborSubtotalRow}:G${laborSubtotalRow}`);

    const laborSubtotalCell = sheet.getCell(`H${laborSubtotalRow}`);
    styleSubtotal(laborSubtotalCell, `SUM(H${laborStartRow}:H${row - 1})`);
    laborSubtotalCell.numFmt = '$#,##0.00';

    allSubtotalRows.push(laborSubtotalRow);
    row += 3;
  }

  // ============================================================================
  // SECTION 3: OVERHEAD (equipment_unit_cost)
  // ============================================================================
  if (overhead.length > 0) {
    // BUG FIX #5: Change "OTHER MATERIALS" to "OVERHEAD COSTS"
    const overheadHeaderCell = sheet.getCell(`A${row}`);
    styleGroupHeader(overheadHeaderCell, 'OVERHEAD COSTS', 'E4DFEC'); // Light purple
    sheet.mergeCells(`A${row}:I${row}`);
    row++;

    const overheadStartRow = row;

    // Overhead item rows
    overhead.forEach((item, idx) => {
      const itemRow = row;
      const isAltRow = idx % 2 === 1;

      // Description
      const descCell = sheet.getCell(`A${itemRow}`);
      descCell.value = item.description || 'Unknown Item';
      styleDataCell(descCell, isAltRow);

      // Size (empty for overhead)
      const sizeCell = sheet.getCell(`B${itemRow}`);
      sizeCell.value = '';
      styleDataCell(sizeCell, isAltRow);

      // Quantity
      const qtyCell = sheet.getCell(`C${itemRow}`);
      qtyCell.value = safeNum(item.quantity);
      qtyCell.numFmt = Number.isInteger(item.quantity) ? '#,##0' : '#,##0.00';
      styleDataCell(qtyCell, isAltRow);
      qtyCell.alignment = { horizontal: 'right' };

      // Unit
      const unitCell = sheet.getCell(`D${itemRow}`);
      unitCell.value = item.unit || 'ea';
      styleDataCell(unitCell, isAltRow);
      unitCell.alignment = { horizontal: 'center' };

      // Empty columns E, F, G (no rates for overhead)
      styleDataCell(sheet.getCell(`E${itemRow}`), isAltRow);
      styleDataCell(sheet.getCell(`F${itemRow}`), isAltRow);
      styleDataCell(sheet.getCell(`G${itemRow}`), isAltRow);

      // BUG FIX #1: Total from equipment_unit_cost
      const totalCell = sheet.getCell(`H${itemRow}`);
      totalCell.value = safeNum(item.equipment_unit_cost);
      totalCell.numFmt = '$#,##0.00';
      styleDataCell(totalCell, isAltRow);

      // Notes (or formula_used)
      const notesCell = sheet.getCell(`I${itemRow}`);
      notesCell.value = item.notes || item.formula_used || '';
      styleDataCell(notesCell, isAltRow);
      notesCell.alignment = { wrapText: true };

      row++;
    });

    // Overhead Subtotal
    const overheadSubtotalRow = row;
    const overheadSubtotalLabel = sheet.getCell(`A${overheadSubtotalRow}`);
    overheadSubtotalLabel.value = 'OVERHEAD SUBTOTAL';
    styleSubtotal(overheadSubtotalLabel);
    overheadSubtotalLabel.alignment = { horizontal: 'right' };
    sheet.mergeCells(`A${overheadSubtotalRow}:G${overheadSubtotalRow}`);

    const overheadSubtotalCell = sheet.getCell(`H${overheadSubtotalRow}`);
    styleSubtotal(overheadSubtotalCell, `SUM(H${overheadStartRow}:H${row - 1})`);
    overheadSubtotalCell.numFmt = '$#,##0.00';

    allSubtotalRows.push(overheadSubtotalRow);
    row += 3;
  }

  // ============================================================================
  // GRAND TOTAL (Materials + Labor + Overhead)
  // ============================================================================
  const grandRow = row;
  const grandLabelCell = sheet.getCell(`A${grandRow}`);
  grandLabelCell.value = `${tradeName.toUpperCase()} GRAND TOTAL`;
  styleGrandTotal(grandLabelCell);
  grandLabelCell.alignment = { horizontal: 'right' };
  sheet.mergeCells(`A${grandRow}:G${grandRow}`);

  const grandCell = sheet.getCell(`H${grandRow}`);
  const grandFormula = allSubtotalRows.length > 0
    ? allSubtotalRows.map(r => `H${r}`).join('+')
    : '0';
  grandCell.value = { formula: grandFormula };
  grandCell.numFmt = '$#,##0.00';
  styleGrandTotal(grandCell);

  return sheet;
}

// ============================================================================
// V2 ESTIMATE SHEET (Mike Skjei Methodology - All-in-One)
// ============================================================================
/**
 * Creates a comprehensive V2 estimate sheet with:
 * - Project header
 * - Materials section (grouped by trade/category)
 * - Installation Labor section
 * - Overhead & Burden section
 * - Project Totals with markup breakdown
 */
function createV2EstimateSheet(
  workbook: ExcelJS.Workbook,
  sections: Section[],
  lineItemsBySection: Record<string, LineItem[]>,
  projectInfo: ProjectInfo,
  v2Options: V2ExportOptions
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Professional Estimate', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 6 }]
  });

  let row = 1;

  // ============================================================================
  // PROJECT HEADER
  // ============================================================================
  const customerCell = sheet.getCell(`A${row}`);
  customerCell.value = projectInfo.customerName;
  customerCell.font = { bold: true, size: 18 };
  sheet.mergeCells(`A${row}:G${row}`);
  row++;

  const addressCell = sheet.getCell(`A${row}`);
  addressCell.value = projectInfo.jobAddress;
  addressCell.font = { size: 12 };
  sheet.mergeCells(`A${row}:G${row}`);
  row++;

  const dateCell = sheet.getCell(`A${row}`);
  dateCell.value = `Estimate Date: ${new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })}`;
  dateCell.font = { size: 10, italic: true };
  sheet.mergeCells(`A${row}:G${row}`);
  row++;

  // Methodology note
  if (v2Options.metadata?.calculationMethod) {
    const methodCell = sheet.getCell(`A${row}`);
    methodCell.value = `Pricing Method: ${v2Options.metadata.calculationMethod}`;
    methodCell.font = { size: 9, italic: true, color: { argb: 'FF666666' } };
    sheet.mergeCells(`A${row}:G${row}`);
    row++;
  }

  row++; // Blank row

  // Set column widths
  sheet.getColumn('A').width = 8;   // #
  sheet.getColumn('B').width = 40;  // Description
  sheet.getColumn('C').width = 12;  // Qty
  sheet.getColumn('D').width = 10;  // Unit
  sheet.getColumn('E').width = 14;  // Rate
  sheet.getColumn('F').width = 14;  // Extended
  sheet.getColumn('G').width = 25;  // Notes

  // ============================================================================
  // MATERIALS SECTION (Blue)
  // ============================================================================
  const materialsHeaderRow = sheet.getRow(row);
  sheet.mergeCells(`A${row}:G${row}`);
  materialsHeaderRow.getCell(1).value = 'MATERIALS';
  materialsHeaderRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.V2_MATERIAL_HEADER_BG },
  };
  materialsHeaderRow.getCell(1).font = { bold: true, color: { argb: COLORS.HEADER_TEXT }, size: 12 };
  materialsHeaderRow.getCell(1).alignment = { horizontal: 'center' };
  materialsHeaderRow.getCell(1).border = {
    top: { style: 'medium' }, left: { style: 'medium' },
    bottom: { style: 'thin' }, right: { style: 'medium' }
  };
  row++;

  // Materials column headers
  const matHeaders = ['#', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Extended', 'Notes'];
  const matHeaderRow = sheet.getRow(row);
  matHeaders.forEach((header, idx) => {
    const cell = matHeaderRow.getCell(idx + 1);
    cell.value = header;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.V2_MATERIAL_ROW_BG } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.alignment = { horizontal: idx >= 2 && idx <= 5 ? 'right' : 'left' };
  });
  row++;

  // Collect all material items across sections
  let materialItemNum = 0;
  let materialTotal = 0;

  sections.forEach(section => {
    const items = lineItemsBySection[section.id] || [];
    const { materials } = separateItemsByType(items);

    if (materials.length > 0) {
      // Section sub-header
      const sectionHeaderRow = sheet.getRow(row);
      sheet.mergeCells(`A${row}:G${row}`);
      sectionHeaderRow.getCell(1).value = section.section_name;
      sectionHeaderRow.getCell(1).font = { bold: true, size: 10, italic: true };
      sectionHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      sectionHeaderRow.getCell(1).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
      row++;

      materials.forEach((item, idx) => {
        materialItemNum++;
        const itemRow = sheet.getRow(row);
        const isAltRow = idx % 2 === 1;

        itemRow.getCell(1).value = materialItemNum;
        styleDataCell(itemRow.getCell(1), isAltRow);

        itemRow.getCell(2).value = item.description;
        styleDataCell(itemRow.getCell(2), isAltRow);

        itemRow.getCell(3).value = item.quantity;
        itemRow.getCell(3).numFmt = '#,##0.00';
        itemRow.getCell(3).alignment = { horizontal: 'right' };
        styleDataCell(itemRow.getCell(3), isAltRow);

        itemRow.getCell(4).value = item.unit;
        itemRow.getCell(4).alignment = { horizontal: 'center' };
        styleDataCell(itemRow.getCell(4), isAltRow);

        itemRow.getCell(5).value = item.material_unit_cost;
        itemRow.getCell(5).numFmt = '"$"#,##0.00';
        itemRow.getCell(5).alignment = { horizontal: 'right' };
        styleDataCell(itemRow.getCell(5), isAltRow);

        const extended = safeNum(item.quantity) * safeNum(item.material_unit_cost);
        materialTotal += extended;
        itemRow.getCell(6).value = extended;
        itemRow.getCell(6).numFmt = '"$"#,##0.00';
        itemRow.getCell(6).alignment = { horizontal: 'right' };
        styleDataCell(itemRow.getCell(6), isAltRow);

        itemRow.getCell(7).value = item.notes || '';
        styleDataCell(itemRow.getCell(7), isAltRow);

        row++;
      });
    }
  });

  // Materials subtotal
  const matSubtotalRow = sheet.getRow(row);
  matSubtotalRow.getCell(5).value = 'Material Cost:';
  matSubtotalRow.getCell(5).font = { bold: true };
  matSubtotalRow.getCell(5).alignment = { horizontal: 'right' };
  matSubtotalRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };
  matSubtotalRow.getCell(6).value = v2Options.projectTotals?.material_cost || materialTotal;
  matSubtotalRow.getCell(6).numFmt = '"$"#,##0.00';
  matSubtotalRow.getCell(6).font = { bold: true };
  matSubtotalRow.getCell(6).alignment = { horizontal: 'right' };
  matSubtotalRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };
  row += 2;

  // ============================================================================
  // INSTALLATION LABOR SECTION (Green)
  // ============================================================================
  row = addV2LaborSection(sheet, row, v2Options.labor, v2Options.projectTotals);
  row++; // Blank row

  // ============================================================================
  // OVERHEAD & BURDEN SECTION (Orange)
  // ============================================================================
  row = addV2OverheadSection(sheet, row, v2Options.overhead, v2Options.projectTotals);
  row++; // Blank row

  // ============================================================================
  // PROJECT TOTALS SECTION
  // ============================================================================
  if (v2Options.projectTotals) {
    row = addV2TotalsSection(sheet, row, v2Options.projectTotals);
  }

  // ============================================================================
  // NOTES SECTION
  // ============================================================================
  row += 2;
  sheet.getCell(`A${row}`).value = 'Notes:';
  sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
  row++;

  sheet.getCell(`A${row}`).value = '• All prices include materials and labor with applicable markups';
  sheet.getCell(`A${row}`).font = { size: 10 };
  row++;

  sheet.getCell(`A${row}`).value = '• Labor costs calculated using Mike Skjei methodology (squares-based)';
  sheet.getCell(`A${row}`).font = { size: 10 };
  row++;

  if (v2Options.projectTotals?.project_insurance && v2Options.projectTotals.project_insurance > 0) {
    sheet.getCell(`A${row}`).value = '• Project insurance included at $24.38 per $1,000';
    sheet.getCell(`A${row}`).font = { size: 10 };
    row++;
  }

  sheet.getCell(`A${row}`).value = '• Pricing valid for 90 days from estimate date';
  sheet.getCell(`A${row}`).font = { size: 10, color: { argb: COLORS.WARNING_TEXT } };

  return sheet;
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================
export async function exportProfessionalEstimate(
  takeoff: Takeoff,
  sections: Section[],
  lineItemsBySection: Record<string, LineItem[]>,
  projectInfo: ProjectInfo,
  v2Options?: V2ExportOptions
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties = { fullCalcOnLoad: true };
  workbook.creator = 'Exterior Finishes Estimator';
  workbook.created = new Date();

  // Check if we have V2 data (Mike Skjei methodology)
  const hasV2Data = v2Options?.projectTotals !== undefined;

  if (hasV2Data && v2Options?.projectTotals) {
    // V2 Export: Create comprehensive worksheet with all sections
    createV2EstimateSheet(workbook, sections, lineItemsBySection, projectInfo, v2Options);
  } else {
    // Legacy Export: Original multi-sheet format
    // Create Summary sheet
    createSummarySheet(workbook, sections, lineItemsBySection, projectInfo);

    // Create individual trade sheets
    sections.forEach(section => {
      const items = lineItemsBySection[section.id] || [];
      if (items.length > 0) {
        createTradeSheet(workbook, section, items, projectInfo);
      }
    });
  }

  // Generate buffer and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  // Create filename
  const sanitizedName = projectInfo.customerName.replace(/[^a-z0-9]/gi, '_');
  const date = new Date().toISOString().split('T')[0];
  const fileName = `${sanitizedName}_Estimate_${date}.xlsx`;

  // Trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// VENDOR TAKEOFF EXPORT (No pricing)
// ============================================================================
export async function exportVendorTakeoff(
  sections: Section[],
  lineItemsBySection: Record<string, LineItem[]>,
  projectInfo: ProjectInfo
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties = { fullCalcOnLoad: true };
  workbook.creator = 'Exterior Finishes Estimator';
  workbook.created = new Date();

  sections.forEach(section => {
    const items = lineItemsBySection[section.id] || [];

    // Filter to only material items (exclude labor and overhead for vendor)
    const { materials } = separateItemsByType(items);
    if (materials.length === 0) return;

    const sheet = workbook.addWorksheet(section.section_name);
    let row = 1;

    // Header
    sheet.getCell(`A${row}`).value = `VENDOR TAKEOFF - ${section.section_name}`;
    sheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    sheet.mergeCells(`A${row}:F${row}`);
    row++;

    sheet.getCell(`A${row}`).value = `Project: ${projectInfo.customerName}`;
    row++;
    sheet.getCell(`A${row}`).value = `Address: ${projectInfo.jobAddress}`;
    row++;
    sheet.getCell(`A${row}`).value = `Date: ${new Date().toLocaleDateString()}`;
    row += 2;

    // Instructions
    sheet.getCell(`A${row}`).value = 'Please provide pricing for the following materials:';
    sheet.getCell(`A${row}`).font = { italic: true };
    row += 2;

    // Column Headers
    styleHeader(sheet.getCell(`A${row}`), 'Description');
    styleHeader(sheet.getCell(`B${row}`), 'SKU');
    styleHeader(sheet.getCell(`C${row}`), 'QTY');
    styleHeader(sheet.getCell(`D${row}`), 'Unit');
    styleHeader(sheet.getCell(`E${row}`), 'Your Quote');

    sheet.getColumn('A').width = 40;
    sheet.getColumn('B').width = 20;
    sheet.getColumn('C').width = 10;
    sheet.getColumn('D').width = 10;
    sheet.getColumn('E').width = 15;

    // Yellow highlight for quote column
    sheet.getCell(`E${row}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' }
    };
    row++;

    // Items (materials only)
    materials.forEach((item, idx) => {
      const isAltRow = idx % 2 === 1;

      const descCell = sheet.getCell(`A${row}`);
      descCell.value = item.description;
      styleDataCell(descCell, isAltRow);

      const skuCell = sheet.getCell(`B${row}`);
      skuCell.value = item.sku || '';
      styleDataCell(skuCell, isAltRow);

      const qtyCell = sheet.getCell(`C${row}`);
      qtyCell.value = safeNum(item.quantity);
      qtyCell.numFmt = '#,##0.00';
      styleDataCell(qtyCell, isAltRow);

      const unitCell = sheet.getCell(`D${row}`);
      unitCell.value = item.unit || 'ea';
      styleDataCell(unitCell, isAltRow);

      // Empty quote cell with yellow highlight
      const quoteCell = sheet.getCell(`E${row}`);
      quoteCell.value = '';
      styleDataCell(quoteCell, isAltRow);
      quoteCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFFCC' }
      };

      row++;
    });
  });

  // Generate buffer and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const sanitizedName = projectInfo.customerName.replace(/[^a-z0-9]/gi, '_');
  const date = new Date().toISOString().split('T')[0];
  const fileName = `${sanitizedName}_Vendor_Takeoff_${date}.xlsx`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
