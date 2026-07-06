import { NextResponse } from "next/server";
import { requireApiAuth, requireProjectAccess } from "@/lib/api/access";
import { createAssistantDocx } from "@/lib/assistant/docx";
import { createAssistantPdf } from "@/lib/assistant/pdf";
import { createAssistantRtf } from "@/lib/assistant/rtf";

interface DocumentRequestBody {
  organizationId?: string;
  projectId?: string | null;
  title?: string;
  subtitle?: string;
  content?: string;
  format?: string;
}

type DocumentExportFormat = "docx" | "pdf" | "rtf";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function sanitizeFilename(value: string): string {
  const normalized = value
    .replace(/[^a-z0-9\s._-]/gi, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
    .replace(/^_+|_+$/g, "");

  return normalized || "Exterior_Finishes_AI_Document";
}

function normalizeFormat(value: string | undefined): DocumentExportFormat {
  if (value === "rtf") return "rtf";
  return value === "pdf" ? "pdf" : "docx";
}

function getContentType(format: DocumentExportFormat): string {
  if (format === "pdf") return "application/pdf";
  if (format === "rtf") return "application/rtf";
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  let body: DocumentRequestBody;
  try {
    body = (await request.json()) as DocumentRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.organizationId || !isUuid(body.organizationId)) {
    return NextResponse.json(
      { error: "organizationId must be a UUID" },
      { status: 400 },
    );
  }

  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  if (content.length > 120_000) {
    return NextResponse.json(
      { error: "content is too large to export" },
      { status: 413 },
    );
  }

  if (body.projectId) {
    const projectAccess = await requireProjectAccess(body.projectId, auth.ctx);
    if (!projectAccess.ok) return projectAccess.response;

    if (
      projectAccess.data.organization_id &&
      projectAccess.data.organization_id !== body.organizationId
    ) {
      return NextResponse.json(
        { error: "Project does not belong to organization" },
        { status: 400 },
      );
    }
  } else if (!auth.ctx.devBypass) {
    const membership = await auth.ctx.supabase
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", body.organizationId)
      .eq("user_id", auth.ctx.user?.id)
      .maybeSingle();

    if (membership.error || !membership.data) {
      return NextResponse.json(
        { error: "Organization access denied" },
        { status: 403 },
      );
    }
  }

  const title = body.title?.trim() || "Exterior Finishes AI Document";
  const documentInput = {
    title,
    subtitle: body.subtitle?.trim() || "Generated draft for review",
    content,
  };
  const format = normalizeFormat(body.format);
  const documentBytes =
    format === "pdf"
      ? await createAssistantPdf(documentInput)
      : format === "rtf"
        ? createAssistantRtf(documentInput)
        : await createAssistantDocx(documentInput);
  const filename = `${sanitizeFilename(title)}.${format}`;

  return new Response(toArrayBuffer(documentBytes), {
    headers: {
      "Content-Type": getContentType(format),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
