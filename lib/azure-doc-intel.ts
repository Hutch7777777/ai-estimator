/**
 * Azure Document Intelligence Client
 *
 * Uses the prebuilt-layout model to extract structured table data
 * from construction schedule pages (window/door schedules).
 *
 * API: v4.0 (2024-11-30 GA)
 * Docs: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout
 */

// ============================================================
// Types
// ============================================================

export interface AzureTableCell {
  rowIndex: number;
  columnIndex: number;
  content: string;
  kind?: 'columnHeader' | 'rowHeader' | 'stubHead' | 'content';
  rowSpan?: number;
  columnSpan?: number;
}

export interface AzureTable {
  rowCount: number;
  columnCount: number;
  cells: AzureTableCell[];
  caption?: { content: string };
}

export interface AzureLayoutResult {
  tables: AzureTable[];
  content: string; // Full page text (markdown in v4.0)
  pages: Array<{
    pageNumber: number;
    width: number;
    height: number;
    unit: string;
  }>;
}

export interface AzureAnalyzeResponse {
  status: 'notStarted' | 'running' | 'succeeded' | 'failed';
  analyzeResult?: AzureLayoutResult;
  error?: { code: string; message: string };
}

// ============================================================
// Client
// ============================================================

const ENDPOINT = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
const API_KEY = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
const API_VERSION = '2024-11-30';
const MODEL_ID = 'prebuilt-layout';

/**
 * Analyze a document image using Azure Document Intelligence Layout model.
 * Accepts either a public URL or a base64-encoded image.
 *
 * This is an async (polling) API:
 *   1. POST to start analysis → returns Operation-Location header
 *   2. GET to poll for results until status = 'succeeded'
 */
export async function analyzeLayout(
  input: { url: string } | { base64: string; mediaType: string }
): Promise<AzureLayoutResult> {
  if (!ENDPOINT || !API_KEY) {
    throw new Error(
      'Azure Document Intelligence not configured. ' +
      'Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY env vars.'
    );
  }

  const analyzeUrl = `${ENDPOINT.replace(/\/$/, '')}/documentintelligence/documentModels/${MODEL_ID}:analyze?api-version=${API_VERSION}`;

  // Build request body
  const body = 'url' in input
    ? { urlSource: input.url }
    : { base64Source: input.base64 };

  // Step 1: Start analysis
  const startResponse = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    throw new Error(`Azure DI analyze failed (${startResponse.status}): ${errorText}`);
  }

  const operationLocation = startResponse.headers.get('Operation-Location');
  if (!operationLocation) {
    throw new Error('Azure DI: No Operation-Location header in response');
  }

  // Step 2: Poll for results
  const result = await pollForResult(operationLocation);

  if (!result.analyzeResult) {
    throw new Error('Azure DI: Analysis succeeded but no analyzeResult returned');
  }

  return result.analyzeResult;
}

/**
 * Poll the operation URL until analysis completes.
 * Azure recommends minimum 1 second between polls.
 */
async function pollForResult(
  operationUrl: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<AzureAnalyzeResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(intervalMs);

    const response = await fetch(operationUrl, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': API_KEY!,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure DI poll failed (${response.status}): ${errorText}`);
    }

    const data: AzureAnalyzeResponse = await response.json();

    if (data.status === 'succeeded') {
      return data;
    }

    if (data.status === 'failed') {
      throw new Error(`Azure DI analysis failed: ${JSON.stringify(data.error)}`);
    }

    // status is 'running' or 'notStarted' — keep polling
  }

  throw new Error(`Azure DI: Timed out after ${maxAttempts} polling attempts`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Table Helpers
// ============================================================

/**
 * Convert an AzureTable into a 2D string array (rows × columns).
 * Handles merged cells by filling spanned positions.
 */
export function tableToGrid(table: AzureTable): string[][] {
  const grid: string[][] = Array.from({ length: table.rowCount }, () =>
    Array(table.columnCount).fill('')
  );

  for (const cell of table.cells) {
    const rowSpan = cell.rowSpan ?? 1;
    const colSpan = cell.columnSpan ?? 1;

    for (let r = cell.rowIndex; r < cell.rowIndex + rowSpan; r++) {
      for (let c = cell.columnIndex; c < cell.columnIndex + colSpan; c++) {
        if (r < table.rowCount && c < table.columnCount) {
          grid[r][c] = cell.content.trim();
        }
      }
    }
  }

  return grid;
}

/**
 * Extract header rows from table cells.
 * Returns the column headers as a flat string array.
 */
export function getColumnHeaders(table: AzureTable): string[] {
  const headerCells = table.cells.filter((c) => c.kind === 'columnHeader');

  if (headerCells.length === 0) {
    // Fallback: use the first row as headers
    return table.cells
      .filter((c) => c.rowIndex === 0)
      .sort((a, b) => a.columnIndex - b.columnIndex)
      .map((c) => c.content.trim());
  }

  // Find the last header row index
  const maxHeaderRow = Math.max(...headerCells.map((c) => c.rowIndex));

  // Return headers from the last header row (most specific)
  return headerCells
    .filter((c) => c.rowIndex === maxHeaderRow)
    .sort((a, b) => a.columnIndex - b.columnIndex)
    .map((c) => c.content.trim());
}

/**
 * Get data rows (non-header) from a table as objects keyed by column header.
 */
export function getDataRows(table: AzureTable): Record<string, string>[] {
  const headerCells = table.cells.filter((c) => c.kind === 'columnHeader');
  const firstDataRow = headerCells.length > 0
    ? Math.max(...headerCells.map((c) => c.rowIndex + (c.rowSpan ?? 1)))
    : 1;

  const headers = getColumnHeaders(table);
  const grid = tableToGrid(table);
  const rows: Record<string, string>[] = [];

  for (let r = firstDataRow; r < table.rowCount; r++) {
    const row: Record<string, string> = {};
    let hasContent = false;

    for (let c = 0; c < table.columnCount; c++) {
      const header = headers[c] || `col_${c}`;
      const value = grid[r][c] || '';
      row[header] = value;
      if (value) hasContent = true;
    }

    // Skip empty rows and total/summary rows
    if (hasContent) {
      rows.push(row);
    }
  }

  return rows;
}
