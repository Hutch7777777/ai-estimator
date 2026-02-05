// =============================================================================
// Document Generators for Plan Reader
// Generates Excel spreadsheets, Word documents, and other deliverables
// =============================================================================

import ExcelJS from 'exceljs';

// =============================================================================
// Types
// =============================================================================

export interface TakeoffItem {
  item_code: string;
  description: string;
  manufacturer?: string;
  series?: string;
  size?: string;
  quantity: number;
  unit: string;
  frame_material?: string;
  glass_type?: string;
  notes?: string;
}

export interface RFIItem {
  item_number: number;
  description: string;
  reference_page: string;
  priority: 'High' | 'Medium' | 'Low';
}

export interface ScheduleRow {
  [key: string]: string | number;
}

export interface ScheduleData {
  schedule_name: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface ChecklistItem {
  category: string;
  item: string;
  completed: boolean;
}

// =============================================================================
// Excel Takeoff Generator
// =============================================================================

/**
 * Generate a professional Material Takeoff Excel spreadsheet
 */
export async function generateTakeoffSpreadsheet(
  items: TakeoffItem[],
  projectName: string,
  subject: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Exterior Finishes LLC';
  workbook.created = new Date();

  const sheetName = `${subject.charAt(0).toUpperCase() + subject.slice(1)} Takeoff`;
  const sheet = workbook.addWorksheet(sheetName.substring(0, 31)); // Excel limit

  // Company Header
  sheet.mergeCells('A1:G1');
  const headerCell = sheet.getCell('A1');
  headerCell.value = 'EXTERIOR FINISHES LLC';
  headerCell.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
  headerCell.alignment = { horizontal: 'center' };

  // Title
  sheet.mergeCells('A2:G2');
  const titleCell = sheet.getCell('A2');
  titleCell.value = `${projectName} - ${sheetName}`;
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'center' };

  // Date
  sheet.getCell('A3').value = `Generated: ${new Date().toLocaleDateString()}`;
  sheet.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF666666' } };

  // Column headers
  const headers = ['Item Code', 'Description', 'Manufacturer', 'Size', 'Qty', 'Unit', 'Notes'];
  const headerRow = sheet.getRow(5);
  headers.forEach((header, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' }, // Dark blue
    };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 22;

  // Data rows
  items.forEach((item, index) => {
    const row = sheet.getRow(6 + index);
    row.getCell(1).value = item.item_code;
    row.getCell(2).value = item.description;
    row.getCell(3).value = item.manufacturer || '';
    row.getCell(4).value = item.size || '';
    row.getCell(5).value = item.quantity;
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).value = item.unit;
    row.getCell(6).alignment = { horizontal: 'center' };

    // Build comprehensive notes including series, frame material, glass type
    const noteParts: string[] = [];
    if (item.series) noteParts.push(item.series);
    if (item.frame_material) noteParts.push(item.frame_material);
    if (item.glass_type) noteParts.push(item.glass_type);
    if (item.notes) noteParts.push(item.notes);
    row.getCell(7).value = noteParts.join(', ');

    // Alternating row colors
    const bgColor = index % 2 === 0 ? 'FFF5F5F5' : 'FFFFFFFF';
    for (let col = 1; col <= 7; col++) {
      const cell = row.getCell(col);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
    }
  });

  // Totals row
  const totalRowNum = 6 + items.length + 1;
  const totalRow = sheet.getRow(totalRowNum);
  totalRow.getCell(4).value = 'TOTAL:';
  totalRow.getCell(4).font = { bold: true };
  totalRow.getCell(4).alignment = { horizontal: 'right' };
  totalRow.getCell(5).value = items.reduce((sum, item) => sum + item.quantity, 0);
  totalRow.getCell(5).font = { bold: true };
  totalRow.getCell(5).alignment = { horizontal: 'center' };
  totalRow.getCell(5).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFE066' }, // Yellow highlight
  };

  // Column widths
  sheet.getColumn(1).width = 12;  // Item Code
  sheet.getColumn(2).width = 40;  // Description
  sheet.getColumn(3).width = 22;  // Manufacturer (widened from 20)
  sheet.getColumn(4).width = 18;  // Size
  sheet.getColumn(5).width = 8;   // Qty
  sheet.getColumn(6).width = 8;   // Unit
  sheet.getColumn(7).width = 50;  // Notes

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// =============================================================================
// Excel Schedule Export
// =============================================================================

/**
 * Export a schedule (window, door, etc.) to Excel
 */
export async function generateScheduleSpreadsheet(
  data: ScheduleData,
  projectName: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Exterior Finishes LLC';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(data.schedule_name.substring(0, 31));

  // Title
  sheet.mergeCells(1, 1, 1, data.columns.length);
  const titleCell = sheet.getCell('A1');
  titleCell.value = `${projectName} - ${data.schedule_name}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  // Date
  sheet.getCell('A2').value = `Exported: ${new Date().toLocaleDateString()}`;
  sheet.getCell('A2').font = { italic: true, size: 10 };

  // Headers
  const headerRow = sheet.getRow(4);
  data.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // Data rows
  data.rows.forEach((rowData, index) => {
    const row = sheet.getRow(5 + index);
    rowData.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
      if (index % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' },
        };
      }
    });
  });

  // Auto-fit columns
  data.columns.forEach((_, i) => {
    sheet.getColumn(i + 1).width = 15;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// =============================================================================
// Text Document Generators (Markdown format)
// =============================================================================

/**
 * Generate RFI Document as formatted text/markdown
 */
export function generateRFIDocument(
  items: RFIItem[],
  projectName: string,
  projectAddress: string = ''
): string {
  const today = new Date().toLocaleDateString();

  const rfiItems = items
    .map(
      (item, i) => `
### ${i + 1}. ${item.description}

**Reference:** ${item.reference_page}
**Priority:** ${item.priority}

**Question:**
[Specific question about this item to be completed by user]

**Suggested Resolution:**
[If applicable]

---`
    )
    .join('\n');

  return `# REQUEST FOR INFORMATION (RFI)

**Project:** ${projectName}
**Address:** ${projectAddress || '[Project Address]'}
**Date:** ${today}
**RFI #:** [To be assigned]

---

## Items Requiring Clarification

${rfiItems}

## Response Required By: [Date]

**Submitted By:**
Exterior Finishes LLC

---

**Response:**

_______________________________________
Architect/Engineer Signature & Date
`;
}

/**
 * Generate Scope of Work document
 */
export function generateScopeOfWork(
  materials: string[],
  quantities: Record<string, number | string>,
  projectName: string,
  trade: string
): string {
  const today = new Date().toLocaleDateString();

  const materialsList = materials.map((m) => `- ${m}`).join('\n');
  const quantitiesTable = Object.entries(quantities)
    .map(([item, qty]) => `| ${item} | ${qty} |`)
    .join('\n');

  return `# SCOPE OF WORK

**Project:** ${projectName}
**Trade:** ${trade}
**Date:** ${today}

---

## 1. GENERAL SCOPE

This Scope of Work covers all ${trade.toLowerCase()} work as indicated on the construction documents.

## 2. MATERIALS

The following materials shall be provided and installed:

${materialsList}

## 3. QUANTITIES

| Item | Quantity |
|------|----------|
${quantitiesTable}

## 4. INCLUSIONS

- All materials as specified above
- All necessary fasteners, accessories, and sealants
- Labor for complete installation per manufacturer specifications
- Protection of adjacent surfaces during installation
- Cleanup of work area upon completion

## 5. EXCLUSIONS

- Building permits (by others unless specified)
- Structural modifications or repairs
- Work not shown on construction documents
- Painting or finishing (unless specified)

## 6. WARRANTY

All work shall be warranted per manufacturer warranty requirements and for a minimum period of one (1) year from date of substantial completion for workmanship.

---

**Exterior Finishes LLC**
[Contact Information]
`;
}

/**
 * Generate Installation Checklist
 */
export function generateInstallationChecklist(
  items: ChecklistItem[],
  projectName: string,
  trade: string
): string {
  const today = new Date().toLocaleDateString();

  // Group items by category
  const grouped = items.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, ChecklistItem[]>
  );

  const sections = Object.entries(grouped)
    .map(
      ([category, categoryItems]) => `
### ${category}

${categoryItems.map((item) => `- [ ] ${item.item}`).join('\n')}
`
    )
    .join('\n');

  return `# INSTALLATION CHECKLIST

**Project:** ${projectName}
**Trade:** ${trade}
**Date:** ${today}

---

## Pre-Installation
- [ ] Review all plans and specifications
- [ ] Verify materials delivered match specifications
- [ ] Check site conditions and readiness
- [ ] Coordinate with other trades as needed

${sections}

## Post-Installation
- [ ] Final inspection completed
- [ ] Touch-ups and corrections completed
- [ ] Site cleaned and debris removed
- [ ] Photos taken for documentation
- [ ] Warranty documentation provided to owner

---

**Inspector:** _______________________

**Date Completed:** _______________________
`;
}

/**
 * Generate Project Summary
 */
export function generateProjectSummary(
  projectName: string,
  address: string,
  materials: Record<string, string>,
  quantities: Record<string, number | string>,
  notes: string[]
): string {
  const today = new Date().toLocaleDateString();

  const materialsSection = Object.entries(materials)
    .map(([category, material]) => `- **${category}:** ${material}`)
    .join('\n');

  const quantitiesSection = Object.entries(quantities)
    .map(([item, qty]) => `- **${item}:** ${qty}`)
    .join('\n');

  const notesSection = notes.map((note) => `- ${note}`).join('\n');

  return `# PROJECT SUMMARY

**Project:** ${projectName}
**Address:** ${address || '[Project Address]'}
**Date:** ${today}
**Prepared By:** Exterior Finishes LLC

---

## Material Specifications

${materialsSection}

## Quantities

${quantitiesSection}

## Notes & Special Conditions

${notesSection || '- No special notes'}

---

*This summary was generated from plan analysis. Please verify all quantities and specifications before ordering materials.*
`;
}

// =============================================================================
// File Download Helper
// =============================================================================

/**
 * Trigger a file download in the browser
 */
export function downloadFile(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  filename: string,
  mimeType: string
): void {
  // Create blob from buffer - cast needed for TypeScript compatibility
  // All input types (Buffer, ArrayBuffer, Uint8Array) work with Blob at runtime
  const blob = new Blob([buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download a text document (markdown, etc.)
 */
export function downloadTextDocument(
  content: string,
  filename: string,
  mimeType: string = 'text/plain'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
