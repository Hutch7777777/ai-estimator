import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api/access";
import type { AssistantProjectOption } from "@/lib/assistant/types";

type DbRecord = Record<string, unknown>;

function asRecord(value: unknown): DbRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRecord) : null;
}

function asRecords(value: unknown): DbRecord[] {
  if (!Array.isArray(value)) return [];
  const records: DbRecord[] = [];
  value.forEach((item) => {
    const record = asRecord(item);
    if (record) records.push(record);
  });
  return records;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  if (!isUuid(organizationId)) {
    return NextResponse.json({ error: "organizationId must be a UUID" }, { status: 400 });
  }

  if (!auth.ctx.devBypass) {
    const membership = await auth.ctx.supabase
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", auth.ctx.user?.id)
      .maybeSingle();

    if (membership.error || !membership.data) {
      return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
    }
  }

  const result = await auth.ctx.supabase
    .from("projects")
    .select("id, name, client_name, address, status, selected_trades, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const projects: AssistantProjectOption[] = asRecords(result.data).map((project) => ({
    id: asString(project.id) ?? "",
    name: asString(project.name) ?? "Untitled project",
    clientName: asString(project.client_name),
    address: asString(project.address),
    status: asString(project.status),
    selectedTrades: asStringArray(project.selected_trades),
    createdAt: asString(project.created_at),
  })).filter((project) => project.id);

  return NextResponse.json({ projects });
}
