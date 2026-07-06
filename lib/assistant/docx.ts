import JSZip from "jszip";

export interface AssistantDocxInput {
  title: string;
  subtitle?: string;
  content: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function textRun(
  text: string,
  options: { bold?: boolean; italic?: boolean } = {},
): string {
  const runProperties = [
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
  ].join("");

  return [
    "<w:r>",
    runProperties ? `<w:rPr>${runProperties}</w:rPr>` : "",
    `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`,
    "</w:r>",
  ].join("");
}

function runsFromInlineMarkdown(value: string): string {
  const runs: string[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) {
      runs.push(textRun(value.slice(cursor, match.index)));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      runs.push(textRun(token.slice(2, -2), { bold: true }));
    } else if (token.startsWith("*")) {
      runs.push(textRun(token.slice(1, -1), { italic: true }));
    } else {
      runs.push(textRun(token.slice(1, -1)));
    }

    cursor = match.index + token.length;
  }

  if (cursor < value.length) {
    runs.push(textRun(value.slice(cursor)));
  }

  return runs.join("");
}

function paragraph(
  text: string,
  options: {
    style?: "Title" | "Subtitle" | "Heading1" | "Heading2" | "ListParagraph";
    bullet?: boolean;
    numbered?: boolean;
  } = {},
): string {
  const style = options.style ? `<w:pStyle w:val="${options.style}"/>` : "";
  const numbering = options.bullet
    ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    : options.numbered
      ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'
      : "";
  const paragraphProperties =
    style || numbering ? `<w:pPr>${style}${numbering}</w:pPr>` : "";

  return `<w:p>${paragraphProperties}${runsFromInlineMarkdown(text)}</w:p>`;
}

function table(rows: string[][]): string {
  const rowXml = rows
    .map((row) => {
      const cells = row
        .map((cell) =>
          [
            "<w:tc>",
            '<w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>',
            paragraph(cell.trim()),
            "</w:tc>",
          ].join(""),
        )
        .join("");

      return `<w:tr>${cells}</w:tr>`;
    })
    .join("");

  return [
    "<w:tbl>",
    "<w:tblPr>",
    '<w:tblW w:w="0" w:type="auto"/>',
    '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D5E3ED"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D5E3ED"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D5E3ED"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D5E3ED"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D5E3ED"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D5E3ED"/></w:tblBorders>',
    "</w:tblPr>",
    rowXml,
    "</w:tbl>",
  ].join("");
}

function isMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|")
  );
}

function isMarkdownDivider(line: string): boolean {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function parseMarkdownTable(
  lines: string[],
  startIndex: number,
): { xml: string; nextIndex: number } | null {
  const rows: string[][] = [];
  let cursor = startIndex;

  while (cursor < lines.length && isMarkdownTableLine(lines[cursor])) {
    if (!isMarkdownDivider(lines[cursor])) {
      rows.push(
        lines[cursor]
          .trim()
          .slice(1, -1)
          .split("|")
          .map((cell) => cell.trim()),
      );
    }
    cursor += 1;
  }

  if (rows.length < 2) return null;
  return {
    xml: table(rows),
    nextIndex: cursor,
  };
}

function contentToDocumentXml(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const rawLine = lines[cursor];
    const line = rawLine.trim();

    if (!line) {
      blocks.push(paragraph(""));
      cursor += 1;
      continue;
    }

    if (isMarkdownTableLine(line)) {
      const parsedTable = parseMarkdownTable(lines, cursor);
      if (parsedTable) {
        blocks.push(parsedTable.xml);
        cursor = parsedTable.nextIndex;
        continue;
      }
    }

    if (line.startsWith("## ")) {
      blocks.push(paragraph(line.slice(3).trim(), { style: "Heading1" }));
    } else if (line.startsWith("# ")) {
      blocks.push(paragraph(line.slice(2).trim(), { style: "Heading1" }));
    } else if (line.startsWith("### ")) {
      blocks.push(paragraph(line.slice(4).trim(), { style: "Heading2" }));
    } else if (/^[-*]\s+/.test(line)) {
      blocks.push(
        paragraph(line.replace(/^[-*]\s+/, ""), {
          style: "ListParagraph",
          bullet: true,
        }),
      );
    } else if (/^\d+\.\s+/.test(line)) {
      blocks.push(
        paragraph(line.replace(/^\d+\.\s+/, ""), {
          style: "ListParagraph",
          numbered: true,
        }),
      );
    } else if (/^---+$/.test(line)) {
      blocks.push(paragraph(""));
    } else {
      blocks.push(paragraph(line));
    }

    cursor += 1;
  }

  return blocks.join("");
}

function documentXml(input: AssistantDocxInput): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    "<w:body>",
    paragraph(input.title, { style: "Title" }),
    input.subtitle ? paragraph(input.subtitle, { style: "Subtitle" }) : "",
    paragraph(""),
    contentToDocumentXml(input.content),
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>',
    "</w:body>",
    "</w:document>",
  ].join("");
}

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const relationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const documentRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="1F2937"/></w:rPr><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="004D83"/></w:rPr><w:pPr><w:spacing w:after="180"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:rPr><w:sz w:val="20"/><w:color w:val="64748B"/></w:rPr><w:pPr><w:spacing w:after="180"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="004D83"/></w:rPr><w:pPr><w:spacing w:before="260" w:after="120"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="003E68"/></w:rPr><w:pPr><w:spacing w:before="180" w:after="100"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:style>
</w:styles>`;

const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
  <w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`;

function coreXml(title: string): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>Exterior Finishes AI</dc:creator>
  <cp:lastModifiedBy>Exterior Finishes AI</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Exterior Finishes AI</Application>
</Properties>`;

export async function createAssistantDocx(
  input: AssistantDocxInput,
): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file("[Content_Types].xml", contentTypesXml);
  zip.folder("_rels")?.file(".rels", relationshipsXml);
  zip.folder("docProps")?.file("core.xml", coreXml(input.title));
  zip.folder("docProps")?.file("app.xml", appXml);
  zip.folder("word")?.file("document.xml", documentXml(input));
  zip.folder("word")?.file("styles.xml", stylesXml);
  zip.folder("word")?.file("numbering.xml", numberingXml);
  zip
    .folder("word")
    ?.folder("_rels")
    ?.file("document.xml.rels", documentRelationshipsXml);

  return zip.generateAsync({ type: "uint8array" });
}
