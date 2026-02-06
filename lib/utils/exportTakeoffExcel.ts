import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// =============================================================================
// Types - Enhanced for Mike Skjei Format
// =============================================================================

export interface TakeoffLineItem {
  id?: string;
  description: string;
  size_display?: string;
  quantity: string | number;
  unit: string;
  material_unit_cost: string | number;
  labor_unit_cost?: string | number;
  material_extended: string | number;
  labor_extended: string | number;
  line_total: string | number;
  presentation_group?: string;
  category?: string;
  item_number?: number;
  item_type?: 'material' | 'labor' | 'overhead';
  sku?: string;
  notes?: string;
  formula_used?: string;
}

export interface LaborItem {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
  notes?: string;
}

export interface OverheadItem {
  id?: string;
  description: string;
  amount: number;
  notes?: string;
}

export interface TakeoffHeader {
  id?: string;
  takeoff_name?: string;
  project_name?: string;
  client_name?: string;
  address?: string;
  total_material_cost: number;
  total_labor_cost: number;
  total_overhead_cost?: number;
  subtotal: number;
  markup_percent: number;
  markup_amount?: number;
  final_price: number;
  squares?: number;
  created_at?: string;
}

export interface TakeoffData {
  takeoff: TakeoffHeader;
  line_items: TakeoffLineItem[];
  labor_items?: LaborItem[];
  overhead_items?: OverheadItem[];
}

// =============================================================================
// Constants - Mike Skjei Style Colors
// =============================================================================

const COLORS = {
  HEADER_BG: 'FF4472C4',
  HEADER_TEXT: 'FFFFFFFF',
  MATERIALS_HEADER: 'FF2E7D32',
  LABOR_HEADER: 'FF1565C0',
  OVERHEAD_HEADER: 'FF7B1FA2',
  SUBTOTAL_BG: 'FFE7E6E6',
  MARKUP_ROW_BG: 'FFDCE6F1',
  TOTAL_WITH_MARKUP_BG: 'FFB4C6E7',
  GRAND_TOTAL_BG: 'FF92D050',
  GRAND_TOTAL_TEXT: 'FFFFFFFF',
  ALT_ROW_BG: 'FFF5F5F5',
  WARNING_TEXT: 'FFFF0000',
};

const PRESENTATION_GROUPS: Record<string, { title: string; color: string; order: number }> = {
  // Section order: SIDING → TRIM & CORNERS → BELLY BAND → SOFFIT & FASCIA → FLASHING →
  // FASTENERS → CAULK → ARCHITECTURAL → GUTTERS → ROOFING → OPENINGS → OTHER → OVERHEAD

  // 1. Siding & Underlayment
  'siding': { title: 'SIDING & UNDERLAYMENT', color: 'E8F5E9', order: 1 },
  'siding & underlayment': { title: 'SIDING & UNDERLAYMENT', color: 'E8F5E9', order: 1 },

  // 2. Trim & Corners (combined)
  'trim': { title: 'TRIM & CORNERS', color: 'E3F2FD', order: 2 },
  'trim & corners': { title: 'TRIM & CORNERS', color: 'E3F2FD', order: 2 },
  'corners': { title: 'TRIM & CORNERS', color: 'E3F2FD', order: 2 },

  // 2.5. Belly Band (dedicated section for horizontal accent trim)
  'belly band': { title: 'BELLY BAND', color: 'FFF9C4', order: 2.5 },
  'belly_band': { title: 'BELLY BAND', color: 'FFF9C4', order: 2.5 },

  // 3. Soffit & Fascia
  'soffit': { title: 'SOFFIT & FASCIA', color: 'B2EBF2', order: 3 },
  'fascia': { title: 'SOFFIT & FASCIA', color: 'B2EBF2', order: 3 },
  'soffit & fascia': { title: 'SOFFIT & FASCIA', color: 'B2EBF2', order: 3 },

  // 4. Flashing & Weatherproofing (includes Tyvek, house wrap, flashing tape, penetrations)
  'flashing': { title: 'FLASHING & WEATHERPROOFING', color: 'FFECB3', order: 4 },
  'flashing & weatherproofing': { title: 'FLASHING & WEATHERPROOFING', color: 'FFECB3', order: 4 },
  'weatherproofing': { title: 'FLASHING & WEATHERPROOFING', color: 'FFECB3', order: 4 },
  'penetrations': { title: 'FLASHING & WEATHERPROOFING', color: 'FFECB3', order: 4 },

  // 5. Fasteners & Accessories
  'fasteners': { title: 'FASTENERS & ACCESSORIES', color: 'F5F5F5', order: 5 },
  'fasteners & accessories': { title: 'FASTENERS & ACCESSORIES', color: 'F5F5F5', order: 5 },
  'accessories': { title: 'FASTENERS & ACCESSORIES', color: 'F5F5F5', order: 5 },

  // 6. Caulk & Sealants
  'caulk': { title: 'CAULK & SEALANTS', color: 'FCE4EC', order: 6 },
  'caulk & sealants': { title: 'CAULK & SEALANTS', color: 'FCE4EC', order: 6 },
  'sealants': { title: 'CAULK & SEALANTS', color: 'FCE4EC', order: 6 },

  // 7. Architectural Details (corbels, brackets, shutters, posts, columns)
  'architectural': { title: 'ARCHITECTURAL DETAILS', color: 'D7CCC8', order: 7 },
  'architectural details': { title: 'ARCHITECTURAL DETAILS', color: 'D7CCC8', order: 7 },
  'corbel': { title: 'ARCHITECTURAL DETAILS', color: 'D7CCC8', order: 7 },
  'bracket': { title: 'ARCHITECTURAL DETAILS', color: 'D7CCC8', order: 7 },
  'shutter': { title: 'ARCHITECTURAL DETAILS', color: 'D7CCC8', order: 7 },
  'post': { title: 'ARCHITECTURAL DETAILS', color: 'D7CCC8', order: 7 },
  'column': { title: 'ARCHITECTURAL DETAILS', color: 'D7CCC8', order: 7 },

  // 8. Gutters & Downspouts
  'gutter': { title: 'GUTTERS & DOWNSPOUTS', color: 'C8E6C9', order: 8 },
  'gutters': { title: 'GUTTERS & DOWNSPOUTS', color: 'C8E6C9', order: 8 },
  'gutters & downspouts': { title: 'GUTTERS & DOWNSPOUTS', color: 'C8E6C9', order: 8 },
  'downspout': { title: 'GUTTERS & DOWNSPOUTS', color: 'C8E6C9', order: 8 },

  // 9. Roofing Components (for roofing trade)
  'eave': { title: 'ROOFING COMPONENTS', color: 'FFCCBC', order: 9 },
  'rake': { title: 'ROOFING COMPONENTS', color: 'FFCCBC', order: 9 },
  'ridge': { title: 'ROOFING COMPONENTS', color: 'FFCCBC', order: 9 },
  'valley': { title: 'ROOFING COMPONENTS', color: 'FFCCBC', order: 9 },
  'roofing': { title: 'ROOFING COMPONENTS', color: 'FFCCBC', order: 9 },
  'roofing components': { title: 'ROOFING COMPONENTS', color: 'FFCCBC', order: 9 },

  // 10. Window & Door Trim
  'openings': { title: 'WINDOW & DOOR TRIM', color: 'E1BEE7', order: 10 },
  'window & door trim': { title: 'WINDOW & DOOR TRIM', color: 'E1BEE7', order: 10 },

  // 11. Paint & Primer
  'paint & primer': { title: 'PAINT & PRIMER', color: 'F3E5F5', order: 11 },

  // 98. Other Materials
  'other': { title: 'OTHER MATERIALS', color: 'EEEEEE', order: 98 },
  'other materials': { title: 'OTHER MATERIALS', color: 'EEEEEE', order: 98 },

  // 99. Overhead (always last)
  'overhead': { title: 'OVERHEAD', color: 'E0E0E0', order: 99 },
};

// =============================================================================
// Helper Functions
// =============================================================================

function safeNum(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? 0 : num;
}

function getGroupConfig(group: string | undefined): { title: string; color: string; order: number } {
  const key = (group || 'other').toLowerCase();
  return PRESENTATION_GROUPS[key] || PRESENTATION_GROUPS['other'];
}

function extractSize(item: TakeoffLineItem): string {
  if (item.size_display) return item.size_display;
  const desc = (item.description || '').toLowerCase();
  const patterns: [RegExp, string][] = [
    [/hardieplank\s*(\d+\.?\d*)/i, '$1"'],
    [/(\d+\.?\d*)\s*["″'']/i, '$1"'],
    [/(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i, '$1x$2x$3'],
    [/(\d+\/\d+)\s*x\s*(\d+)/i, '$1x$2'],
    [/(\d+)\s*x\s*(\d+)/i, '$1x$2'],
  ];
  for (const [pattern, replacement] of patterns) {
    const match = desc.match(pattern);
    if (match) return match[0].replace(pattern, replacement);
  }
  return '';
}

// =============================================================================
// Styling Functions
// =============================================================================

function styleHeader(cell: ExcelJS.Cell, bgColor: string = COLORS.HEADER_BG): void {
  cell.font = { bold: true, size: 11, color: { argb: COLORS.HEADER_TEXT } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
}

function styleSectionHeader(cell: ExcelJS.Cell, bgColor: string): void {
  cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
  cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
}

function styleGroupHeader(cell: ExcelJS.Cell, bgColor: string): void {
  cell.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
  cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
}

function styleDataCell(cell: ExcelJS.Cell, isAltRow: boolean = false): void {
  cell.border = { top: { style: 'thin', color: { argb: 'FFE0E0E0' } }, left: { style: 'thin', color: { argb: 'FFE0E0E0' } }, bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } }, right: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
  if (isAltRow) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ALT_ROW_BG } };
}

function styleSubtotalRow(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUBTOTAL_BG } };
  cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
}

function styleMarkupRow(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ROW_BG } };
  cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
}

function styleTotalWithMarkup(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOTAL_WITH_MARKUP_BG } };
  cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'double' }, right: { style: 'thin' } };
}

function styleGrandTotal(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 12, color: { argb: COLORS.GRAND_TOTAL_TEXT } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GRAND_TOTAL_BG } };
  cell.border = { top: { style: 'double' }, left: { style: 'medium' }, bottom: { style: 'double' }, right: { style: 'medium' } };
}

// =============================================================================
// Main Export Function - Mike Skjei Format
// =============================================================================

export async function exportTakeoffToExcel(data: TakeoffData, filename?: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties = { fullCalcOnLoad: true };
  workbook.creator = 'Exterior Finishes AI Estimator';
  workbook.created = new Date();

  const takeoff = data.takeoff;
  const lineItems = data.line_items || [];
  const laborItems = data.labor_items || [];
  const overheadItems = data.overhead_items || [];

  const markupPercent = safeNum(takeoff.markup_percent) || 15;
  const markupDecimal = markupPercent / 100;
  const squares = safeNum(takeoff.squares) || 0;

  const materialItems = lineItems.filter(item => !item.item_type || item.item_type === 'material');

  // ==========================================================================
  // SUMMARY SHEET
  // ==========================================================================
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.getColumn('A').width = 30;
  summarySheet.getColumn('B').width = 18;
  summarySheet.getColumn('C').width = 18;
  summarySheet.getColumn('D').width = 18;

  let row = 1;

  const titleCell = summarySheet.getCell(`A${row}`);
  titleCell.value = takeoff.client_name || takeoff.project_name || takeoff.takeoff_name || 'Estimate';
  titleCell.font = { bold: true, size: 18 };
  summarySheet.mergeCells(`A${row}:D${row}`);
  row++;

  const addressCell = summarySheet.getCell(`A${row}`);
  addressCell.value = takeoff.address || '';
  addressCell.font = { size: 12 };
  summarySheet.mergeCells(`A${row}:D${row}`);
  row++;

  const dateCell = summarySheet.getCell(`A${row}`);
  dateCell.value = `Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  dateCell.font = { size: 10, italic: true };
  summarySheet.mergeCells(`A${row}:D${row}`);
  row += 2;

  styleHeader(summarySheet.getCell(`A${row}`)); summarySheet.getCell(`A${row}`).value = 'Category';
  styleHeader(summarySheet.getCell(`B${row}`)); summarySheet.getCell(`B${row}`).value = 'Before Markup';
  styleHeader(summarySheet.getCell(`C${row}`)); summarySheet.getCell(`C${row}`).value = 'Markup';
  styleHeader(summarySheet.getCell(`D${row}`)); summarySheet.getCell(`D${row}`).value = 'Total';
  row++;

  const summaryDataStartRow = row;

  // Materials Row
  summarySheet.getCell(`A${row}`).value = 'Materials'; styleDataCell(summarySheet.getCell(`A${row}`));
  summarySheet.getCell(`B${row}`).value = safeNum(takeoff.total_material_cost); summarySheet.getCell(`B${row}`).numFmt = '"$"#,##0.00'; styleDataCell(summarySheet.getCell(`B${row}`));
  summarySheet.getCell(`C${row}`).value = { formula: `B${row}*${markupDecimal}` }; summarySheet.getCell(`C${row}`).numFmt = '"$"#,##0.00'; styleDataCell(summarySheet.getCell(`C${row}`));
  summarySheet.getCell(`D${row}`).value = { formula: `B${row}+C${row}` }; summarySheet.getCell(`D${row}`).numFmt = '"$"#,##0.00'; styleDataCell(summarySheet.getCell(`D${row}`));
  row++;

  // Labor Row
  summarySheet.getCell(`A${row}`).value = 'Labor'; styleDataCell(summarySheet.getCell(`A${row}`), true);
  summarySheet.getCell(`B${row}`).value = safeNum(takeoff.total_labor_cost); summarySheet.getCell(`B${row}`).numFmt = '"$"#,##0.00'; styleDataCell(summarySheet.getCell(`B${row}`), true);
  summarySheet.getCell(`C${row}`).value = { formula: `B${row}*${markupDecimal}` }; summarySheet.getCell(`C${row}`).numFmt = '"$"#,##0.00'; styleDataCell(summarySheet.getCell(`C${row}`), true);
  summarySheet.getCell(`D${row}`).value = { formula: `B${row}+C${row}` }; summarySheet.getCell(`D${row}`).numFmt = '"$"#,##0.00'; styleDataCell(summarySheet.getCell(`D${row}`), true);
  row++;

  // Overhead Row
  summarySheet.getCell(`A${row}`).value = 'Overhead'; styleDataCell(summarySheet.getCell(`A${row}`));
  summarySheet.getCell(`B${row}`).value = safeNum(takeoff.total_overhead_cost); summarySheet.getCell(`B${row}`).numFmt = '"$"#,##0.00'; styleDataCell(summarySheet.getCell(`B${row}`));
  summarySheet.getCell(`C${row}`).value = { formula: `B${row}*${markupDecimal}` }; summarySheet.getCell(`C${row}`).numFmt = '"$"#,##0.00'; styleDataCell(summarySheet.getCell(`C${row}`));
  summarySheet.getCell(`D${row}`).value = { formula: `B${row}+C${row}` }; summarySheet.getCell(`D${row}`).numFmt = '"$"#,##0.00'; styleDataCell(summarySheet.getCell(`D${row}`));
  row++;

  // Subtotal Row
  summarySheet.getCell(`A${row}`).value = 'SUBTOTAL'; styleSubtotalRow(summarySheet.getCell(`A${row}`)); summarySheet.getCell(`A${row}`).alignment = { horizontal: 'right' };
  summarySheet.getCell(`B${row}`).value = { formula: `SUM(B${summaryDataStartRow}:B${row-1})` }; summarySheet.getCell(`B${row}`).numFmt = '"$"#,##0.00'; styleSubtotalRow(summarySheet.getCell(`B${row}`));
  summarySheet.getCell(`C${row}`).value = { formula: `SUM(C${summaryDataStartRow}:C${row-1})` }; summarySheet.getCell(`C${row}`).numFmt = '"$"#,##0.00'; styleSubtotalRow(summarySheet.getCell(`C${row}`));
  summarySheet.getCell(`D${row}`).value = { formula: `SUM(D${summaryDataStartRow}:D${row-1})` }; summarySheet.getCell(`D${row}`).numFmt = '"$"#,##0.00'; styleSubtotalRow(summarySheet.getCell(`D${row}`));
  row += 2;

  // Grand Total
  summarySheet.getCell(`A${row}`).value = 'PROJECT GRAND TOTAL'; styleGrandTotal(summarySheet.getCell(`A${row}`)); summarySheet.getCell(`A${row}`).alignment = { horizontal: 'right' };
  summarySheet.mergeCells(`A${row}:C${row}`);
  summarySheet.getCell(`D${row}`).value = { formula: `D${row-2}` }; summarySheet.getCell(`D${row}`).numFmt = '"$"#,##0.00'; styleGrandTotal(summarySheet.getCell(`D${row}`));
  const grandTotalRow = row;
  row += 2;

  if (squares > 0) {
    summarySheet.getCell(`A${row}`).value = `PRICE PER SQUARE (${squares.toFixed(2)} sq)`;
    summarySheet.getCell(`A${row}`).font = { bold: true, italic: true };
    summarySheet.mergeCells(`A${row}:C${row}`);
    summarySheet.getCell(`D${row}`).value = { formula: `D${grandTotalRow}/${squares}` };
    summarySheet.getCell(`D${row}`).numFmt = '"$"#,##0.00';
    summarySheet.getCell(`D${row}`).font = { bold: true, italic: true };
    row += 2;
  }

  row++;
  summarySheet.getCell(`A${row}`).value = 'Markup Percentage:'; summarySheet.getCell(`A${row}`).font = { bold: true };
  summarySheet.getCell(`B${row}`).value = markupPercent / 100; summarySheet.getCell(`B${row}`).numFmt = '0%';
  summarySheet.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } };
  summarySheet.getCell(`B${row}`).border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
  summarySheet.getCell(`C${row}`).value = '← Edit this cell to change markup'; summarySheet.getCell(`C${row}`).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  row += 2;

  summarySheet.getCell(`A${row}`).value = 'Notes:'; summarySheet.getCell(`A${row}`).font = { bold: true }; row++;
  ['• All prices include materials and labor', '• Labor costs include 12.65% L&I insurance + unemployment', '• Overhead includes mobilization, disposal, and project insurance', `• Markup of ${markupPercent}% applied to all costs`, '• Pricing valid for 30 days from estimate date'].forEach(note => {
    summarySheet.getCell(`A${row}`).value = note; summarySheet.getCell(`A${row}`).font = { size: 10 }; row++;
  });

  // ==========================================================================
  // TAKEOFF SHEET
  // ==========================================================================
  const takeoffSheet = workbook.addWorksheet('Takeoff', { views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }] });
  takeoffSheet.getColumn('A').width = 45;
  takeoffSheet.getColumn('B').width = 12;
  takeoffSheet.getColumn('C').width = 10;
  takeoffSheet.getColumn('D').width = 8;
  takeoffSheet.getColumn('E').width = 12;
  takeoffSheet.getColumn('F').width = 14;
  takeoffSheet.getColumn('G').width = 35;

  row = 1;
  const takeoffTitleCell = takeoffSheet.getCell(`A${row}`);
  takeoffTitleCell.value = takeoff.client_name || takeoff.project_name || 'Estimate';
  takeoffTitleCell.font = { bold: true, size: 16 };
  takeoffSheet.mergeCells(`A${row}:G${row}`);
  row++;

  takeoffSheet.getCell(`A${row}`).value = takeoff.address || '';
  takeoffSheet.getCell(`A${row}`).font = { size: 11 };
  takeoffSheet.mergeCells(`A${row}:G${row}`);
  row++;

  takeoffSheet.getCell(`A${row}`).value = `Date: ${new Date().toLocaleDateString()}`;
  takeoffSheet.getCell(`A${row}`).font = { size: 10, italic: true, color: { argb: COLORS.WARNING_TEXT } };
  takeoffSheet.mergeCells(`A${row}:G${row}`);
  row += 2;

  ['Description', 'Size', 'QTY', 'U/M', 'Price', 'Total', 'Notes'].forEach((label, idx) => {
    const cell = takeoffSheet.getCell(row, idx + 1);
    cell.value = label;
    styleHeader(cell);
  });
  row++;

  // MATERIALS SECTION
  const matSectionCell = takeoffSheet.getCell(`A${row}`);
  matSectionCell.value = 'MATERIALS';
  styleSectionHeader(matSectionCell, COLORS.MATERIALS_HEADER);
  takeoffSheet.mergeCells(`A${row}:G${row}`);
  row++;

  const groupedMaterials: Record<string, TakeoffLineItem[]> = {};
  materialItems.forEach(item => {
    const group = item.presentation_group || item.category || 'other';
    if (!groupedMaterials[group]) groupedMaterials[group] = [];
    groupedMaterials[group].push(item);
  });

  const sortedGroups = Object.keys(groupedMaterials).sort((a, b) => getGroupConfig(a).order - getGroupConfig(b).order);
  const materialSubtotalRows: number[] = [];

  sortedGroups.forEach(groupKey => {
    const groupConfig = getGroupConfig(groupKey);
    const items = groupedMaterials[groupKey];
    items.sort((a, b) => (a.item_number || 999) - (b.item_number || 999));

    const groupHeaderCell = takeoffSheet.getCell(`A${row}`);
    groupHeaderCell.value = groupConfig.title;
    styleGroupHeader(groupHeaderCell, groupConfig.color);
    takeoffSheet.mergeCells(`A${row}:G${row}`);
    row++;

    const groupStartRow = row;

    items.forEach((item, idx) => {
      const isAltRow = idx % 2 === 1;
      const descCell = takeoffSheet.getCell(`A${row}`); descCell.value = item.description; styleDataCell(descCell, isAltRow);
      const sizeCell = takeoffSheet.getCell(`B${row}`); sizeCell.value = extractSize(item); styleDataCell(sizeCell, isAltRow); sizeCell.alignment = { horizontal: 'center' };
      const qtyCell = takeoffSheet.getCell(`C${row}`); qtyCell.value = safeNum(item.quantity); qtyCell.numFmt = Number.isInteger(safeNum(item.quantity)) ? '#,##0' : '#,##0.00'; styleDataCell(qtyCell, isAltRow); qtyCell.alignment = { horizontal: 'right' };
      const unitCell = takeoffSheet.getCell(`D${row}`); unitCell.value = item.unit || 'EA'; styleDataCell(unitCell, isAltRow); unitCell.alignment = { horizontal: 'center' };
      const priceCell = takeoffSheet.getCell(`E${row}`); priceCell.value = safeNum(item.material_unit_cost); priceCell.numFmt = '"$"#,##0.00'; styleDataCell(priceCell, isAltRow);
      const totalCell = takeoffSheet.getCell(`F${row}`); totalCell.value = { formula: `C${row}*E${row}` }; totalCell.numFmt = '"$"#,##0.00'; styleDataCell(totalCell, isAltRow);
      const notesCell = takeoffSheet.getCell(`G${row}`); notesCell.value = item.notes || item.formula_used || ''; styleDataCell(notesCell, isAltRow); notesCell.alignment = { wrapText: true }; notesCell.font = { size: 9 };
      row++;
    });

    const subtotalLabelCell = takeoffSheet.getCell(`A${row}`);
    subtotalLabelCell.value = `${groupConfig.title} Subtotal`;
    styleSubtotalRow(subtotalLabelCell);
    subtotalLabelCell.alignment = { horizontal: 'right' };
    takeoffSheet.mergeCells(`A${row}:E${row}`);
    const subtotalCell = takeoffSheet.getCell(`F${row}`);
    subtotalCell.value = { formula: `SUM(F${groupStartRow}:F${row - 1})` };
    subtotalCell.numFmt = '"$"#,##0.00';
    styleSubtotalRow(subtotalCell);
    materialSubtotalRows.push(row);
    row += 2;
  });

  // Material Totals
  const matCostBeforeRow = row;
  takeoffSheet.getCell(`A${matCostBeforeRow}`).value = 'Total Material Cost before Markup'; styleSubtotalRow(takeoffSheet.getCell(`A${matCostBeforeRow}`)); takeoffSheet.getCell(`A${matCostBeforeRow}`).alignment = { horizontal: 'right' };
  takeoffSheet.mergeCells(`A${matCostBeforeRow}:E${matCostBeforeRow}`);
  const matSubFormula = materialSubtotalRows.map(r => `F${r}`).join('+');
  takeoffSheet.getCell(`F${matCostBeforeRow}`).value = { formula: matSubFormula || '0' }; takeoffSheet.getCell(`F${matCostBeforeRow}`).numFmt = '"$"#,##0.00'; styleSubtotalRow(takeoffSheet.getCell(`F${matCostBeforeRow}`));
  row++;

  const matMarkupRowNum = row;
  takeoffSheet.getCell(`A${matMarkupRowNum}`).value = 'Material Markup'; styleMarkupRow(takeoffSheet.getCell(`A${matMarkupRowNum}`)); takeoffSheet.getCell(`A${matMarkupRowNum}`).alignment = { horizontal: 'right' };
  takeoffSheet.mergeCells(`A${matMarkupRowNum}:D${matMarkupRowNum}`);
  takeoffSheet.getCell(`E${matMarkupRowNum}`).value = markupDecimal; takeoffSheet.getCell(`E${matMarkupRowNum}`).numFmt = '0%'; styleMarkupRow(takeoffSheet.getCell(`E${matMarkupRowNum}`));
  takeoffSheet.getCell(`F${matMarkupRowNum}`).value = { formula: `F${matCostBeforeRow}*E${matMarkupRowNum}` }; takeoffSheet.getCell(`F${matMarkupRowNum}`).numFmt = '"$"#,##0.00'; styleMarkupRow(takeoffSheet.getCell(`F${matMarkupRowNum}`));
  row++;

  const matTotalRowNum = row;
  takeoffSheet.getCell(`A${matTotalRowNum}`).value = 'TOTAL MATERIAL COST'; styleTotalWithMarkup(takeoffSheet.getCell(`A${matTotalRowNum}`)); takeoffSheet.getCell(`A${matTotalRowNum}`).alignment = { horizontal: 'right' };
  takeoffSheet.mergeCells(`A${matTotalRowNum}:E${matTotalRowNum}`);
  takeoffSheet.getCell(`F${matTotalRowNum}`).value = { formula: `F${matCostBeforeRow}+F${matMarkupRowNum}` }; takeoffSheet.getCell(`F${matTotalRowNum}`).numFmt = '"$"#,##0.00'; styleTotalWithMarkup(takeoffSheet.getCell(`F${matTotalRowNum}`));
  row += 2;

  // LABOR SECTION
  let laborTotalRowNum: number | null = null;
  if (laborItems.length > 0) {
    const laborSectionCell = takeoffSheet.getCell(`A${row}`);
    laborSectionCell.value = 'INSTALLATION LABOR';
    styleSectionHeader(laborSectionCell, COLORS.LABOR_HEADER);
    takeoffSheet.mergeCells(`A${row}:G${row}`);
    row++;

    const laborStartRow = row;
    laborItems.forEach((item, idx) => {
      const isAltRow = idx % 2 === 1;
      takeoffSheet.getCell(`A${row}`).value = item.description; styleDataCell(takeoffSheet.getCell(`A${row}`), isAltRow);
      styleDataCell(takeoffSheet.getCell(`B${row}`), isAltRow);
      takeoffSheet.getCell(`C${row}`).value = item.quantity; takeoffSheet.getCell(`C${row}`).numFmt = '#,##0.00'; styleDataCell(takeoffSheet.getCell(`C${row}`), isAltRow); takeoffSheet.getCell(`C${row}`).alignment = { horizontal: 'right' };
      takeoffSheet.getCell(`D${row}`).value = item.unit; styleDataCell(takeoffSheet.getCell(`D${row}`), isAltRow); takeoffSheet.getCell(`D${row}`).alignment = { horizontal: 'center' };
      takeoffSheet.getCell(`E${row}`).value = item.rate; takeoffSheet.getCell(`E${row}`).numFmt = '"$"#,##0.00'; styleDataCell(takeoffSheet.getCell(`E${row}`), isAltRow);
      takeoffSheet.getCell(`F${row}`).value = { formula: `C${row}*E${row}` }; takeoffSheet.getCell(`F${row}`).numFmt = '"$"#,##0.00'; styleDataCell(takeoffSheet.getCell(`F${row}`), isAltRow);
      takeoffSheet.getCell(`G${row}`).value = item.notes || ''; styleDataCell(takeoffSheet.getCell(`G${row}`), isAltRow); takeoffSheet.getCell(`G${row}`).font = { size: 9 };
      row++;
    });

    const laborCostBeforeRow = row;
    takeoffSheet.getCell(`A${laborCostBeforeRow}`).value = 'Total Labor Cost before Markup'; styleSubtotalRow(takeoffSheet.getCell(`A${laborCostBeforeRow}`)); takeoffSheet.getCell(`A${laborCostBeforeRow}`).alignment = { horizontal: 'right' };
    takeoffSheet.mergeCells(`A${laborCostBeforeRow}:E${laborCostBeforeRow}`);
    takeoffSheet.getCell(`F${laborCostBeforeRow}`).value = { formula: `SUM(F${laborStartRow}:F${row - 1})` }; takeoffSheet.getCell(`F${laborCostBeforeRow}`).numFmt = '"$"#,##0.00'; styleSubtotalRow(takeoffSheet.getCell(`F${laborCostBeforeRow}`));
    row++;

    const laborMarkupRowNum = row;
    takeoffSheet.getCell(`A${laborMarkupRowNum}`).value = 'Labor Markup'; styleMarkupRow(takeoffSheet.getCell(`A${laborMarkupRowNum}`)); takeoffSheet.getCell(`A${laborMarkupRowNum}`).alignment = { horizontal: 'right' };
    takeoffSheet.mergeCells(`A${laborMarkupRowNum}:D${laborMarkupRowNum}`);
    takeoffSheet.getCell(`E${laborMarkupRowNum}`).value = markupDecimal; takeoffSheet.getCell(`E${laborMarkupRowNum}`).numFmt = '0%'; styleMarkupRow(takeoffSheet.getCell(`E${laborMarkupRowNum}`));
    takeoffSheet.getCell(`F${laborMarkupRowNum}`).value = { formula: `F${laborCostBeforeRow}*E${laborMarkupRowNum}` }; takeoffSheet.getCell(`F${laborMarkupRowNum}`).numFmt = '"$"#,##0.00'; styleMarkupRow(takeoffSheet.getCell(`F${laborMarkupRowNum}`));
    row++;

    laborTotalRowNum = row;
    takeoffSheet.getCell(`A${laborTotalRowNum}`).value = 'TOTAL LABOR COST'; styleTotalWithMarkup(takeoffSheet.getCell(`A${laborTotalRowNum}`)); takeoffSheet.getCell(`A${laborTotalRowNum}`).alignment = { horizontal: 'right' };
    takeoffSheet.mergeCells(`A${laborTotalRowNum}:E${laborTotalRowNum}`);
    takeoffSheet.getCell(`F${laborTotalRowNum}`).value = { formula: `F${laborCostBeforeRow}+F${laborMarkupRowNum}` }; takeoffSheet.getCell(`F${laborTotalRowNum}`).numFmt = '"$"#,##0.00'; styleTotalWithMarkup(takeoffSheet.getCell(`F${laborTotalRowNum}`));
    row += 2;
  }

  // OVERHEAD SECTION
  let overheadTotalRowNum: number | null = null;
  if (overheadItems.length > 0) {
    const overheadSectionCell = takeoffSheet.getCell(`A${row}`);
    overheadSectionCell.value = 'OVERHEAD COSTS';
    styleSectionHeader(overheadSectionCell, COLORS.OVERHEAD_HEADER);
    takeoffSheet.mergeCells(`A${row}:G${row}`);
    row++;

    const overheadStartRow = row;
    overheadItems.forEach((item, idx) => {
      const isAltRow = idx % 2 === 1;
      takeoffSheet.getCell(`A${row}`).value = item.description; styleDataCell(takeoffSheet.getCell(`A${row}`), isAltRow);
      ['B', 'C', 'D', 'E'].forEach(col => styleDataCell(takeoffSheet.getCell(`${col}${row}`), isAltRow));
      takeoffSheet.getCell(`F${row}`).value = item.amount; takeoffSheet.getCell(`F${row}`).numFmt = '"$"#,##0.00'; styleDataCell(takeoffSheet.getCell(`F${row}`), isAltRow);
      takeoffSheet.getCell(`G${row}`).value = item.notes || ''; styleDataCell(takeoffSheet.getCell(`G${row}`), isAltRow); takeoffSheet.getCell(`G${row}`).font = { size: 9 };
      row++;
    });

    const overheadCostBeforeRow = row;
    takeoffSheet.getCell(`A${overheadCostBeforeRow}`).value = 'Total Overhead Cost before Markup'; styleSubtotalRow(takeoffSheet.getCell(`A${overheadCostBeforeRow}`)); takeoffSheet.getCell(`A${overheadCostBeforeRow}`).alignment = { horizontal: 'right' };
    takeoffSheet.mergeCells(`A${overheadCostBeforeRow}:E${overheadCostBeforeRow}`);
    takeoffSheet.getCell(`F${overheadCostBeforeRow}`).value = { formula: `SUM(F${overheadStartRow}:F${row - 1})` }; takeoffSheet.getCell(`F${overheadCostBeforeRow}`).numFmt = '"$"#,##0.00'; styleSubtotalRow(takeoffSheet.getCell(`F${overheadCostBeforeRow}`));
    row++;

    const overheadMarkupRowNum = row;
    takeoffSheet.getCell(`A${overheadMarkupRowNum}`).value = 'Overhead Markup'; styleMarkupRow(takeoffSheet.getCell(`A${overheadMarkupRowNum}`)); takeoffSheet.getCell(`A${overheadMarkupRowNum}`).alignment = { horizontal: 'right' };
    takeoffSheet.mergeCells(`A${overheadMarkupRowNum}:D${overheadMarkupRowNum}`);
    takeoffSheet.getCell(`E${overheadMarkupRowNum}`).value = markupDecimal; takeoffSheet.getCell(`E${overheadMarkupRowNum}`).numFmt = '0%'; styleMarkupRow(takeoffSheet.getCell(`E${overheadMarkupRowNum}`));
    takeoffSheet.getCell(`F${overheadMarkupRowNum}`).value = { formula: `F${overheadCostBeforeRow}*E${overheadMarkupRowNum}` }; takeoffSheet.getCell(`F${overheadMarkupRowNum}`).numFmt = '"$"#,##0.00'; styleMarkupRow(takeoffSheet.getCell(`F${overheadMarkupRowNum}`));
    row++;

    overheadTotalRowNum = row;
    takeoffSheet.getCell(`A${overheadTotalRowNum}`).value = 'TOTAL OVERHEAD COST'; styleTotalWithMarkup(takeoffSheet.getCell(`A${overheadTotalRowNum}`)); takeoffSheet.getCell(`A${overheadTotalRowNum}`).alignment = { horizontal: 'right' };
    takeoffSheet.mergeCells(`A${overheadTotalRowNum}:E${overheadTotalRowNum}`);
    takeoffSheet.getCell(`F${overheadTotalRowNum}`).value = { formula: `F${overheadCostBeforeRow}+F${overheadMarkupRowNum}` }; takeoffSheet.getCell(`F${overheadTotalRowNum}`).numFmt = '"$"#,##0.00'; styleTotalWithMarkup(takeoffSheet.getCell(`F${overheadTotalRowNum}`));
    row += 2;
  }

  // GRAND TOTAL
  const grandTotalRowNum = row;
  takeoffSheet.getCell(`A${grandTotalRowNum}`).value = 'PROJECT GRAND TOTAL'; styleGrandTotal(takeoffSheet.getCell(`A${grandTotalRowNum}`)); takeoffSheet.getCell(`A${grandTotalRowNum}`).alignment = { horizontal: 'right' };
  takeoffSheet.mergeCells(`A${grandTotalRowNum}:E${grandTotalRowNum}`);
  const grandTotalRefs = [`F${matTotalRowNum}`];
  if (laborTotalRowNum) grandTotalRefs.push(`F${laborTotalRowNum}`);
  if (overheadTotalRowNum) grandTotalRefs.push(`F${overheadTotalRowNum}`);
  takeoffSheet.getCell(`F${grandTotalRowNum}`).value = { formula: grandTotalRefs.join('+') }; takeoffSheet.getCell(`F${grandTotalRowNum}`).numFmt = '"$"#,##0.00'; styleGrandTotal(takeoffSheet.getCell(`F${grandTotalRowNum}`));
  row += 2;

  if (squares > 0) {
    takeoffSheet.getCell(`A${row}`).value = `PRICE PER SQUARE (${squares.toFixed(2)} sq)`;
    takeoffSheet.getCell(`A${row}`).font = { bold: true, size: 11, italic: true };
    takeoffSheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    takeoffSheet.getCell(`A${row}`).alignment = { horizontal: 'right' };
    takeoffSheet.getCell(`A${row}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    takeoffSheet.mergeCells(`A${row}:E${row}`);
    takeoffSheet.getCell(`F${row}`).value = { formula: `F${grandTotalRowNum}/${squares}` };
    takeoffSheet.getCell(`F${row}`).numFmt = '"$"#,##0.00';
    takeoffSheet.getCell(`F${row}`).font = { bold: true, size: 11, italic: true };
    takeoffSheet.getCell(`F${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    takeoffSheet.getCell(`F${row}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  }

  // Generate and Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const defaultFilename = `takeoff_${takeoff.client_name?.replace(/[^a-z0-9]/gi, '_') || 'estimate'}_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(blob, filename || defaultFilename);
}

// =============================================================================
// Vendor Takeoff Export - Materials only, NO pricing
// =============================================================================

export async function exportVendorTakeoff(data: TakeoffData, filename?: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties = { fullCalcOnLoad: true };
  workbook.creator = 'Exterior Finishes AI Estimator';
  workbook.created = new Date();

  const takeoff = data.takeoff;
  const lineItems = data.line_items || [];

  const materialItems = lineItems.filter(item => !item.item_type || item.item_type === 'material');

  const sheet = workbook.addWorksheet('Material Request', { views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }] });
  sheet.getColumn('A').width = 8;
  sheet.getColumn('B').width = 50;
  sheet.getColumn('C').width = 12;
  sheet.getColumn('D').width = 10;
  sheet.getColumn('E').width = 14;
  sheet.getColumn('F').width = 14;
  sheet.getColumn('G').width = 30;

  let row = 1;

  // Header
  const titleCell = sheet.getCell(`A${row}`);
  titleCell.value = 'MATERIAL REQUEST';
  titleCell.font = { bold: true, size: 18 };
  sheet.mergeCells(`A${row}:G${row}`);
  row++;

  sheet.getCell(`A${row}`).value = takeoff.client_name || takeoff.project_name || 'Project';
  sheet.getCell(`A${row}`).font = { bold: true, size: 14 };
  sheet.mergeCells(`A${row}:G${row}`);
  row++;

  sheet.getCell(`A${row}`).value = takeoff.address || '';
  sheet.getCell(`A${row}`).font = { size: 11 };
  sheet.mergeCells(`A${row}:G${row}`);
  row++;

  sheet.getCell(`A${row}`).value = `Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  sheet.getCell(`A${row}`).font = { size: 10, italic: true };
  sheet.mergeCells(`A${row}:G${row}`);
  row += 2;

  // Column headers
  const headers = ['Item #', 'Description', 'Qty', 'Unit', 'Vendor Price', 'Extended', 'Notes'];
  headers.forEach((label, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = label;
    styleHeader(cell);
  });
  row++;

  // Group materials
  const groupedMaterials: Record<string, TakeoffLineItem[]> = {};
  materialItems.forEach(item => {
    const group = item.presentation_group || item.category || 'other';
    if (!groupedMaterials[group]) groupedMaterials[group] = [];
    groupedMaterials[group].push(item);
  });

  const sortedGroups = Object.keys(groupedMaterials).sort((a, b) => getGroupConfig(a).order - getGroupConfig(b).order);
  let itemNumber = 1;

  sortedGroups.forEach(groupKey => {
    const groupConfig = getGroupConfig(groupKey);
    const items = groupedMaterials[groupKey];
    items.sort((a, b) => (a.item_number || 999) - (b.item_number || 999));

    // Group header
    const groupHeaderCell = sheet.getCell(`A${row}`);
    groupHeaderCell.value = groupConfig.title;
    styleGroupHeader(groupHeaderCell, groupConfig.color);
    sheet.mergeCells(`A${row}:G${row}`);
    row++;

    items.forEach((item, idx) => {
      const isAltRow = idx % 2 === 1;

      // Item #
      const itemNumCell = sheet.getCell(`A${row}`);
      itemNumCell.value = itemNumber++;
      styleDataCell(itemNumCell, isAltRow);
      itemNumCell.alignment = { horizontal: 'center' };

      // Description
      const descCell = sheet.getCell(`B${row}`);
      descCell.value = item.description;
      styleDataCell(descCell, isAltRow);

      // Qty
      const qtyCell = sheet.getCell(`C${row}`);
      qtyCell.value = safeNum(item.quantity);
      qtyCell.numFmt = Number.isInteger(safeNum(item.quantity)) ? '#,##0' : '#,##0.00';
      styleDataCell(qtyCell, isAltRow);
      qtyCell.alignment = { horizontal: 'right' };

      // Unit
      const unitCell = sheet.getCell(`D${row}`);
      unitCell.value = item.unit || 'EA';
      styleDataCell(unitCell, isAltRow);
      unitCell.alignment = { horizontal: 'center' };

      // Vendor Price (blank - for vendor to fill in)
      const priceCell = sheet.getCell(`E${row}`);
      priceCell.value = null;
      priceCell.numFmt = '"$"#,##0.00';
      styleDataCell(priceCell, isAltRow);
      priceCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } };

      // Extended (formula: Qty * Vendor Price)
      const extCell = sheet.getCell(`F${row}`);
      extCell.value = { formula: `C${row}*E${row}` };
      extCell.numFmt = '"$"#,##0.00';
      styleDataCell(extCell, isAltRow);

      // Notes
      const notesCell = sheet.getCell(`G${row}`);
      notesCell.value = item.notes || '';
      styleDataCell(notesCell, isAltRow);
      notesCell.alignment = { wrapText: true };
      notesCell.font = { size: 9 };

      row++;
    });

    row++; // Space between groups
  });

  // Total row
  row++;
  sheet.getCell(`A${row}`).value = 'TOTAL';
  sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
  sheet.mergeCells(`A${row}:E${row}`);
  styleSubtotalRow(sheet.getCell(`A${row}`));
  sheet.getCell(`A${row}`).alignment = { horizontal: 'right' };

  const totalCell = sheet.getCell(`F${row}`);
  totalCell.value = { formula: `SUMPRODUCT(C6:C${row-1},E6:E${row-1})` };
  totalCell.numFmt = '"$"#,##0.00';
  styleSubtotalRow(totalCell);
  row += 2;

  // Instructions
  sheet.getCell(`A${row}`).value = 'Instructions:';
  sheet.getCell(`A${row}`).font = { bold: true };
  row++;

  const instructions = [
    '1. Fill in the yellow "Vendor Price" column with your unit prices',
    '2. Extended totals will calculate automatically',
    '3. Please return this quote within 5 business days',
    '4. Questions? Contact us at the number above',
  ];
  instructions.forEach(instruction => {
    sheet.getCell(`A${row}`).value = instruction;
    sheet.getCell(`A${row}`).font = { size: 10 };
    sheet.mergeCells(`A${row}:G${row}`);
    row++;
  });

  // Generate and Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const defaultFilename = `${takeoff.client_name?.replace(/[^a-z0-9]/gi, '_') || 'project'}_material_request_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(blob, filename || defaultFilename);
}
