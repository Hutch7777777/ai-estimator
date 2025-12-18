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
// MAIN EXPORT FUNCTION
// ============================================================================
export async function exportProfessionalEstimate(
  takeoff: Takeoff,
  sections: Section[],
  lineItemsBySection: Record<string, LineItem[]>,
  projectInfo: ProjectInfo
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Exterior Finishes Estimator';
  workbook.created = new Date();

  // Create Summary sheet
  createSummarySheet(workbook, sections, lineItemsBySection, projectInfo);

  // Create individual trade sheets
  sections.forEach(section => {
    const items = lineItemsBySection[section.id] || [];
    if (items.length > 0) {
      createTradeSheet(workbook, section, items, projectInfo);
    }
  });

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
