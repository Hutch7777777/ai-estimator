import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

export interface AssistantPdfInput {
  title: string;
  subtitle?: string;
  content: string;
}

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  mono: PDFFont;
}

interface PdfContext {
  doc: PDFDocument;
  page: PDFPage;
  fonts: PdfFonts;
  y: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const MARGIN_TOP = 58;
const MARGIN_BOTTOM = 58;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const EF_BLUE = rgb(0, 0.302, 0.514);
const EF_BLUE_DARK = rgb(0, 0.243, 0.408);
const BODY = rgb(0.122, 0.161, 0.216);
const MUTED = rgb(0.392, 0.455, 0.545);
const BORDER = rgb(0.835, 0.89, 0.929);

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function isMarkdownDivider(line: string): boolean {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function isMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|")
  );
}

function breakLongWord(
  word: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const chunks: string[] = [];
  let chunk = "";

  for (const char of word) {
    const candidate = `${chunk}${char}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !chunk) {
      chunk = candidate;
    } else {
      chunks.push(chunk);
      chunk = char;
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];

  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
      line = "";
    }

    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      const chunks = breakLongWord(word, font, size, maxWidth);
      lines.push(...chunks.slice(0, -1));
      line = chunks.at(-1) ?? "";
    } else {
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function addPage(context: PdfContext): void {
  context.page = context.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  context.y = PAGE_HEIGHT - MARGIN_TOP;
}

function ensureSpace(context: PdfContext, height: number): void {
  if (context.y - height < MARGIN_BOTTOM) {
    addPage(context);
  }
}

function drawWrapped(
  context: PdfContext,
  text: string,
  options: {
    font: PDFFont;
    size: number;
    color?: RGB;
    indent?: number;
    lineHeight?: number;
    after?: number;
  },
): void {
  const indent = options.indent ?? 0;
  const lineHeight = options.lineHeight ?? options.size * 1.35;
  const lines = wrapText(
    text,
    options.font,
    options.size,
    CONTENT_WIDTH - indent,
  );

  for (const line of lines) {
    ensureSpace(context, lineHeight);
    context.page.drawText(line, {
      x: MARGIN_X + indent,
      y: context.y,
      size: options.size,
      font: options.font,
      color: options.color ?? BODY,
    });
    context.y -= lineHeight;
  }

  context.y -= options.after ?? 0;
}

function drawRule(context: PdfContext, after = 14): void {
  ensureSpace(context, 12);
  context.page.drawLine({
    start: { x: MARGIN_X, y: context.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: context.y },
    thickness: 0.75,
    color: BORDER,
  });
  context.y -= after;
}

function drawContentLine(context: PdfContext, rawLine: string): void {
  const line = rawLine.trim();

  if (!line) {
    context.y -= 7;
    return;
  }

  if (/^---+$/.test(line)) {
    drawRule(context, 12);
    return;
  }

  if (isMarkdownDivider(line)) return;

  if (line.startsWith("### ")) {
    drawWrapped(context, stripInlineMarkdown(line.slice(4)), {
      font: context.fonts.bold,
      size: 11.5,
      color: EF_BLUE_DARK,
      lineHeight: 16,
      after: 3,
    });
    return;
  }

  if (line.startsWith("## ")) {
    drawWrapped(context, stripInlineMarkdown(line.slice(3)), {
      font: context.fonts.bold,
      size: 13,
      color: EF_BLUE,
      lineHeight: 18,
      after: 4,
    });
    return;
  }

  if (line.startsWith("# ")) {
    drawWrapped(context, stripInlineMarkdown(line.slice(2)), {
      font: context.fonts.bold,
      size: 15,
      color: EF_BLUE,
      lineHeight: 20,
      after: 5,
    });
    return;
  }

  if (isMarkdownTableLine(line)) {
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => stripInlineMarkdown(cell))
      .join("  |  ");
    drawWrapped(context, cells, {
      font: context.fonts.mono,
      size: 8.8,
      color: BODY,
      lineHeight: 12,
      after: 1,
    });
    return;
  }

  if (/^[-*]\s+/.test(line)) {
    drawWrapped(
      context,
      `- ${stripInlineMarkdown(line.replace(/^[-*]\s+/, ""))}`,
      {
        font: context.fonts.regular,
        size: 10.25,
        color: BODY,
        indent: 16,
        lineHeight: 14,
        after: 1,
      },
    );
    return;
  }

  if (/^\d+\.\s+/.test(line)) {
    drawWrapped(context, stripInlineMarkdown(line), {
      font: context.fonts.regular,
      size: 10.25,
      color: BODY,
      indent: 16,
      lineHeight: 14,
      after: 1,
    });
    return;
  }

  drawWrapped(context, stripInlineMarkdown(line), {
    font: context.fonts.regular,
    size: 10.5,
    color: BODY,
    lineHeight: 14.5,
    after: 2,
  });
}

function drawFooter(doc: PDFDocument, fonts: PdfFonts): void {
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: MARGIN_X, y: 38 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 38 },
      thickness: 0.5,
      color: BORDER,
    });
    page.drawText(
      `Exterior Finishes AI - Page ${index + 1} of ${pages.length}`,
      {
        x: MARGIN_X,
        y: 24,
        size: 8,
        font: fonts.regular,
        color: MUTED,
      },
    );
  });
}

export async function createAssistantPdf(
  input: AssistantPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: PdfFonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const context: PdfContext = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    fonts,
    y: PAGE_HEIGHT - MARGIN_TOP,
  };

  drawWrapped(context, stripInlineMarkdown(input.title), {
    font: fonts.bold,
    size: 18,
    color: EF_BLUE,
    lineHeight: 23,
    after: 4,
  });

  if (input.subtitle) {
    drawWrapped(context, stripInlineMarkdown(input.subtitle), {
      font: fonts.italic,
      size: 10.5,
      color: MUTED,
      lineHeight: 14,
      after: 8,
    });
  }

  drawRule(context, 16);

  const lines = input.content.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    drawContentLine(context, line);
  }

  drawFooter(doc, fonts);
  return doc.save();
}
