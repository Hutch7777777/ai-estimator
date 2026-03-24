/**
 * Azure Schedule Mapper v2
 *
 * Maps Azure Document Intelligence table output to the existing
 * ScheduleOCRData format used by PlanIntelligence.tsx.
 *
 * v2 fixes:
 * - Multi-row nested header scanning (WIDTH/HEIGHT under "OVERALL WINDOW DIMENSIONS")
 * - Section header filtering (MAIN LEVEL, UPPER LEVEL, etc.)
 * - Proper column index mapping using all header rows
 */

import type {
  ScheduleWindow,
  ScheduleDoor,
  ScheduleSkylight,
  ScheduleGarage,
  ScheduleOCRData,
} from '@/lib/types/extraction';

import type {
  AzureTable,
  AzureLayoutResult,
} from '@/lib/azure-doc-intel';

import {
  tableToGrid,
} from '@/lib/azure-doc-intel';

// ============================================================
// Table Classification
// ============================================================

type ScheduleType = 'window' | 'door' | 'skylight' | 'garage' | 'unknown';

function classifyTable(table: AzureTable): ScheduleType {
  // Gather ALL text from header cells (any row marked as columnHeader)
  const allHeaderText = table.cells
    .filter((c) => c.kind === 'columnHeader' || c.rowIndex <= 4)
    .map((c) => c.content.toUpperCase())
    .join(' ');

  // Check for schedule keywords in priority order
  if (allHeaderText.includes('SKYLIGHT SCHEDULE')) return 'skylight';
  if (allHeaderText.includes('GARAGE') && allHeaderText.includes('SCHEDULE')) return 'garage';

  // "WINDOW SCHEDULE" takes priority
  if (allHeaderText.includes('WINDOW SCHEDULE')) return 'window';

  // "DOOR SCHEDULE" — but NOT if it also says "WINDOW"
  if (allHeaderText.includes('DOOR SCHEDULE') || allHeaderText.includes('DOOR PANELS')) return 'door';

  // Fallback: check for window-specific columns
  if (allHeaderText.includes('SILL HEIGHT') || allHeaderText.includes('HEAD HEIGHT')) return 'window';
  if (allHeaderText.includes('PANEL TYPE') || allHeaderText.includes('SWING')) return 'door';

  return 'unknown';
}

// ============================================================
// Multi-Row Column Mapping
// ============================================================

interface ColumnIndices {
  mark: number;
  width: number;
  height: number;
  type: number;
  description: number;
  quantity: number;
  notes: number;
  area: number;
  size: number;
  uValue: number;
  sillHeight: number;
  headHeight: number;
  numPanels: number;
}

const EMPTY_MAP: ColumnIndices = {
  mark: -1, width: -1, height: -1, type: -1, description: -1,
  quantity: -1, notes: -1, area: -1, size: -1, uValue: -1,
  sillHeight: -1, headHeight: -1, numPanels: -1,
};

/**
 * Build column mapping by scanning ALL header rows.
 * Azure tables have nested headers where sub-columns appear in later rows.
 * e.g., row 1: "OVERALL WINDOW DIMENSIONS" spanning cols 3-4
 *        row 2: "WIDTH" at col 3, "HEIGHT" at col 4
 *
 * We need WIDTH at col 3 and HEIGHT at col 4, regardless of which row they're in.
 */
function buildColumnMap(table: AzureTable): ColumnIndices {
  const map = { ...EMPTY_MAP };

  // Find all header cells (marked as columnHeader by Azure)
  const headerCells = table.cells.filter((c) => c.kind === 'columnHeader');

  // Determine how many header rows there are
  let maxHeaderRow = 0;
  if (headerCells.length > 0) {
    maxHeaderRow = Math.max(...headerCells.map((c) => c.rowIndex + (c.rowSpan ?? 1) - 1));
  }

  // Also check rows 0-4 even if not tagged as headers (some Azure results don't tag properly)
  const scanUpToRow = Math.max(maxHeaderRow, 4);

  // Collect all cells in header rows
  const allHeaderCells = table.cells.filter((c) => c.rowIndex <= scanUpToRow);

  // Map each cell's content to its column index
  for (const cell of allHeaderCells) {
    const text = cell.content.toUpperCase().trim();
    if (!text) continue;

    const col = cell.columnIndex;

    // Skip table-title cells that span the whole row (like "WINDOW SCHEDULE")
    if ((cell.columnSpan ?? 1) > 3) continue;

    // Mark / Number / Door Number
    if (/^(MARK|NUMBER|DOOR\s*NUMBER|TAG|ID|NO\.?|#|MK)$/.test(text)) {
      if (map.mark === -1) map.mark = col;
    }

    // Width — but NOT "PANEL 1" width sub-headers
    if (/^WIDTH$/.test(text) && map.width === -1) {
      map.width = col;
    }

    // Height — but NOT "PANEL 2" height sub-headers
    if (/^HEIGHT$/.test(text) && map.height === -1) {
      map.height = col;
    }

    // Type
    if (/^TYPE$/.test(text)) {
      map.type = col;
    }

    // Description
    if (/^(DESCRIPTION|DESC|STYLE|OPERATION)$/.test(text)) {
      map.description = col;
    }

    // Quantity
    if (/^(QTY|QUANTITY|COUNT)$/.test(text)) {
      map.quantity = col;
    }

    // Notes / Comments / Remarks
    if (/^(NOTES?|REMARKS?|COMMENTS?)$/.test(text)) {
      if (map.notes === -1) map.notes = col;
    }

    // Area
    if (/^AREA/.test(text) && !text.includes('DOOR')) {
      map.area = col;
    }

    // U-Value
    if (/^U-?VALUE$/.test(text)) {
      map.uValue = col;
    }

    // Sill Height
    if (/SILL/.test(text)) {
      map.sillHeight = col;
    }

    // Head Height
    if (/HEAD\s*HEIGHT/.test(text)) {
      map.headHeight = col;
    }

    // Number of panels (for doors)
    if (/NUM.*PNL|#.*PNL|OF\s*PNL/.test(text)) {
      map.numPanels = col;
    }

    // Combined size / Rough Opening
    if (/^(SIZE|ROUGH\s*OPENING|R\.?O\.?)$/.test(text)) {
      map.size = col;
    }
  }

  // Default mark to column 0 if not found
  if (map.mark === -1) map.mark = 0;

  return map;
}

/**
 * Determine the first data row (after all header rows).
 */
function getFirstDataRow(table: AzureTable): number {
  const headerCells = table.cells.filter((c) => c.kind === 'columnHeader');
  if (headerCells.length === 0) return 1;

  // First data row = max(header row + rowSpan) across all header cells
  let maxEnd = 0;
  for (const cell of headerCells) {
    const end = cell.rowIndex + (cell.rowSpan ?? 1);
    if (end > maxEnd) maxEnd = end;
  }
  return maxEnd;
}

// ============================================================
// Section Header Detection
// ============================================================

const SECTION_HEADERS = [
  'MAIN LEVEL', 'UPPER LEVEL', 'LOWER LEVEL', 'BASEMENT',
  'FIRST FLOOR', 'SECOND FLOOR', 'THIRD FLOOR',
  'GROUND FLOOR', 'GARAGE LEVEL', 'ATTIC',
  'LEVEL 1', 'LEVEL 2', 'LEVEL 3',
  'FLOOR 1', 'FLOOR 2', 'FLOOR 3',
];

function isSectionHeader(value: string): boolean {
  const upper = value.toUpperCase().trim();
  return SECTION_HEADERS.some((h) => upper === h || upper.startsWith(h + ' '));
}

function isTotalRow(row: string[]): boolean {
  return row.some((cell) => /^(TOTAL|SUBTOTAL|SUM|WINDOW TOTAL|DOOR TOTAL)/i.test(cell.trim()));
}

// ============================================================
// Size Helpers
// ============================================================

function isValidDimension(value: string): boolean {
  if (!value) return false;
  // Must contain a digit and look like a measurement (has ', ", -, or digits)
  return /\d/.test(value) && /['"\-0-9]/.test(value);
}

function formatSize(width: string, height: string): string {
  const w = width.trim();
  const h = height.trim();
  if (!w && !h) return '';
  if (isValidDimension(w) && isValidDimension(h)) {
    return `${w} x ${h}`;
  }
  if (w && h) return `${w} x ${h}`;
  return w || h;
}

// ============================================================
// Window Schedule Processing
// ============================================================

function processWindowSchedule(table: AzureTable): ScheduleWindow[] {
  const colMap = buildColumnMap(table);
  const grid = tableToGrid(table);
  const firstDataRow = getFirstDataRow(table);
  const windows: ScheduleWindow[] = [];

  console.log(`[Azure Mapper] Window schedule: firstDataRow=${firstDataRow}, cols: mark=${colMap.mark}, width=${colMap.width}, height=${colMap.height}, type=${colMap.type}, desc=${colMap.description}, notes=${colMap.notes}`);

  for (let r = firstDataRow; r < table.rowCount; r++) {
    const row = grid[r];
    if (!row) continue;

    const mark = (row[colMap.mark] || '').trim();

    // Skip empty, section headers, and total rows
    if (!mark) continue;
    if (isSectionHeader(mark)) continue;
    if (isTotalRow(row)) continue;

    // Size from width + height columns
    let size = '';
    if (colMap.size >= 0 && row[colMap.size]) {
      size = row[colMap.size].trim();
    } else if (colMap.width >= 0 && colMap.height >= 0) {
      size = formatSize(row[colMap.width] || '', row[colMap.height] || '');
    }

    // Type — prefer description over type code
    let type = '';
    if (colMap.description >= 0) {
      type = row[colMap.description] || '';
    }
    if (!type && colMap.type >= 0) {
      type = row[colMap.type] || '';
    }

    // Quantity
    const qtyStr = colMap.quantity >= 0 ? row[colMap.quantity] : '';
    const quantity = parseInt(qtyStr) || 1;

    // Notes
    const notes = colMap.notes >= 0 ? (row[colMap.notes] || '').trim() : '';

    windows.push({
      mark,
      size,
      quantity,
      type: type.trim().toLowerCase(),
      notes: notes || undefined,
    });
  }

  return windows;
}

// ============================================================
// Door Schedule Processing
// ============================================================

function processDoorSchedule(table: AzureTable): ScheduleDoor[] {
  const colMap = buildColumnMap(table);
  const grid = tableToGrid(table);
  const firstDataRow = getFirstDataRow(table);
  const doors: ScheduleDoor[] = [];

  console.log(`[Azure Mapper] Door schedule: firstDataRow=${firstDataRow}, cols: mark=${colMap.mark}, width=${colMap.width}, height=${colMap.height}, notes=${colMap.notes}`);

  for (let r = firstDataRow; r < table.rowCount; r++) {
    const row = grid[r];
    if (!row) continue;

    const mark = (row[colMap.mark] || '').trim();

    if (!mark) continue;
    if (isSectionHeader(mark)) continue;
    if (isTotalRow(row)) continue;

    // Size
    let size = '';
    if (colMap.size >= 0 && row[colMap.size]) {
      size = row[colMap.size].trim();
    } else if (colMap.width >= 0 && colMap.height >= 0) {
      size = formatSize(row[colMap.width] || '', row[colMap.height] || '');
    }

    // Validate door size
    if (size && !isValidDimension(size.split(' x ')[0]) && !isValidDimension(size.split(' x ')[1])) {
      size = '';
    }

    // Type
    let type = '';
    if (colMap.description >= 0) {
      type = row[colMap.description] || '';
    }
    if (!type && colMap.type >= 0) {
      type = row[colMap.type] || '';
    }

    const qtyStr = colMap.quantity >= 0 ? row[colMap.quantity] : '';
    const quantity = parseInt(qtyStr) || 1;

    const notes = colMap.notes >= 0 ? (row[colMap.notes] || '').trim() : '';

    doors.push({
      mark,
      size,
      quantity,
      type: type.trim().toLowerCase(),
      notes: notes || undefined,
    });
  }

  return doors;
}

// ============================================================
// Main Mapper
// ============================================================

export function mapAzureResultToScheduleData(
  layoutResult: AzureLayoutResult
): ScheduleOCRData {
  const windows: ScheduleWindow[] = [];
  const doors: ScheduleDoor[] = [];
  const skylights: ScheduleSkylight[] = [];
  const garages: ScheduleGarage[] = [];

  const tables = layoutResult.tables || [];

  if (tables.length === 0) {
    return buildEmptyResult('No tables detected on this page');
  }

  for (const table of tables) {
    // Skip very small tables (< 3 data rows) — likely not schedules
    if (table.rowCount < 4) continue;

    const scheduleType = classifyTable(table);

    console.log(`[Azure Mapper] Table: ${table.rowCount}x${table.columnCount}, classified as: ${scheduleType}`);

    switch (scheduleType) {
      case 'window':
        windows.push(...processWindowSchedule(table));
        break;
      case 'door':
        doors.push(...processDoorSchedule(table));
        break;
      case 'skylight':
        skylights.push(...processWindowSchedule(table) as ScheduleSkylight[]);
        break;
      case 'garage':
        garages.push(...processDoorSchedule(table) as ScheduleGarage[]);
        break;
      case 'unknown':
        // Skip unknown tables
        break;
    }
  }

  const isSchedulePage = windows.length > 0 || doors.length > 0 || skylights.length > 0 || garages.length > 0;
  const totalItems = windows.length + doors.length + skylights.length + garages.length;

  return {
    windows,
    doors,
    skylights,
    garages,
    totals: {
      windows: windows.length,
      doors: doors.length,
      skylights: skylights.length,
      garages: garages.length,
    },
    confidence: isSchedulePage ? 0.92 : 0.3,
    extraction_notes: `Azure Document Intelligence extracted ${totalItems} items from ${tables.length} table(s)`,
    is_schedule_page: isSchedulePage,
    extracted_at: new Date().toISOString(),
    model_used: 'azure-document-intelligence-layout-v4.0',
    tokens_used: 0,
  };
}

function buildEmptyResult(note: string): ScheduleOCRData {
  return {
    windows: [],
    doors: [],
    skylights: [],
    garages: [],
    totals: { windows: 0, doors: 0, skylights: 0, garages: 0 },
    confidence: 0.1,
    extraction_notes: note,
    is_schedule_page: false,
    extracted_at: new Date().toISOString(),
    model_used: 'azure-document-intelligence-layout-v4.0',
    tokens_used: 0,
  };
}
