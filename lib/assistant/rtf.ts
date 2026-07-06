export interface AssistantRtfInput {
  title: string;
  subtitle?: string;
  content: string;
}

interface ParagraphOptions {
  after?: number;
  before?: number;
  bold?: boolean;
  color?: number;
  font?: number;
  indent?: number;
  italic?: boolean;
  lineHeight?: number;
  size?: number;
}

function escapeRtf(value: string): string {
  let escaped = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const code = char.charCodeAt(0);

    if (char === "\\") {
      escaped += "\\\\";
    } else if (char === "{") {
      escaped += "\\{";
    } else if (char === "}") {
      escaped += "\\}";
    } else if (code <= 0x7f) {
      escaped += char;
    } else {
      const signedCode = code > 32767 ? code - 65536 : code;
      escaped += `\\u${signedCode}?`;
    }
  }

  return escaped;
}

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

function paragraph(text: string, options: ParagraphOptions = {}): string {
  const controls = [
    "\\pard",
    `\\f${options.font ?? 0}`,
    `\\fs${options.size ?? 22}`,
    `\\cf${options.color ?? 2}`,
    `\\sl${options.lineHeight ?? 276}`,
    "\\slmult1",
    `\\sb${options.before ?? 0}`,
    `\\sa${options.after ?? 120}`,
  ];

  if (options.indent) controls.push(`\\li${options.indent}`);
  if (options.bold) controls.push("\\b");
  if (options.italic) controls.push("\\i");

  const reset = `${options.bold ? "\\b0" : ""}${options.italic ? "\\i0" : ""}`;
  return `${controls.join(" ")} ${escapeRtf(text)}${reset}\\par\n`;
}

function contentLineToRtf(rawLine: string): string {
  const line = rawLine.trim();

  if (!line) {
    return paragraph("", { after: 80 });
  }

  if (/^---+$/.test(line)) {
    return paragraph(
      "____________________________________________________________",
      {
        color: 4,
        size: 18,
        after: 120,
      },
    );
  }

  if (isMarkdownDivider(line)) return "";

  if (line.startsWith("### ")) {
    return paragraph(stripInlineMarkdown(line.slice(4)), {
      bold: true,
      color: 1,
      size: 24,
      before: 160,
      after: 80,
    });
  }

  if (line.startsWith("## ")) {
    return paragraph(stripInlineMarkdown(line.slice(3)), {
      bold: true,
      color: 1,
      size: 27,
      before: 220,
      after: 90,
    });
  }

  if (line.startsWith("# ")) {
    return paragraph(stripInlineMarkdown(line.slice(2)), {
      bold: true,
      color: 1,
      size: 31,
      before: 260,
      after: 120,
    });
  }

  if (isMarkdownTableLine(line)) {
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => stripInlineMarkdown(cell))
      .join("  |  ");
    return paragraph(cells, {
      font: 1,
      size: 18,
      after: 60,
      lineHeight: 230,
    });
  }

  if (/^[-*]\s+/.test(line)) {
    return paragraph(`- ${stripInlineMarkdown(line.replace(/^[-*]\s+/, ""))}`, {
      indent: 360,
      after: 60,
    });
  }

  if (/^\d+\.\s+/.test(line)) {
    return paragraph(stripInlineMarkdown(line), {
      indent: 360,
      after: 60,
    });
  }

  return paragraph(stripInlineMarkdown(line));
}

export function createAssistantRtf(input: AssistantRtfInput): Uint8Array {
  const body = input.content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(contentLineToRtf)
    .join("");

  const rtf = [
    "{\\rtf1\\ansi\\deff0",
    "{\\fonttbl{\\f0 Helvetica;}{\\f1 Courier New;}}",
    "{\\colortbl;\\red0\\green77\\blue131;\\red31\\green41\\blue55;\\red100\\green116\\blue139;\\red213\\green227\\blue237;}",
    "\\paperw12240\\paperh15840\\margl1080\\margr1080\\margt1080\\margb1080",
    paragraph(stripInlineMarkdown(input.title), {
      bold: true,
      color: 1,
      size: 36,
      after: 100,
    }),
    input.subtitle
      ? paragraph(stripInlineMarkdown(input.subtitle), {
          color: 3,
          italic: true,
          size: 21,
          after: 220,
        })
      : "",
    body,
    paragraph("Exterior Finishes AI", {
      color: 3,
      size: 18,
      before: 260,
      after: 0,
    }),
    "}",
  ].join("\n");

  return new TextEncoder().encode(rtf);
}
