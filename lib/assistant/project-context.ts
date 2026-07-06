import type { ApiAccessContext } from "@/lib/api/access";
import type { AssistantCitation } from "@/lib/assistant/types";

type DbRecord = Record<string, unknown>;

export interface ProjectContextSnapshot {
  organizationId: string;
  projectId: string;
  project: DbRecord | null;
  configurations: DbRecord[];
  extractionJobs: DbRecord[];
  extractionTotals: DbRecord | null;
  latestTakeoff: DbRecord | null;
  takeoffSections: DbRecord[];
  lineItems: DbRecord[];
  generatedAt: string;
}

export interface ProjectContextResult {
  snapshot: ProjectContextSnapshot;
  contextText: string;
  citations: AssistantCitation[];
}

function asRecord(value: unknown): DbRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRecord) : null;
}

function asRecords(value: unknown): DbRecord[] {
  return Array.isArray(value) ? value.filter(Boolean).map((item) => asRecord(item)).filter(Boolean) as DbRecord[] : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return typeof numberValue === "number" && Number.isFinite(numberValue) ? numberValue : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function money(value: unknown): string {
  const amount = asNumber(value);
  if (amount === null) return "n/a";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function compactJson(value: unknown, maxLength = 900): string {
  const text = JSON.stringify(value ?? null, null, 2);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function firstNumber(record: DbRecord | null, keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(record?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function sortByNumber(records: DbRecord[], keys: string[]): DbRecord[] {
  return [...records].sort((a, b) => {
    const aValue = firstNumber(a, keys) ?? Number.MAX_SAFE_INTEGER;
    const bValue = firstNumber(b, keys) ?? Number.MAX_SAFE_INTEGER;
    return aValue - bValue;
  });
}

function getNestedRecord(record: DbRecord | null, key: string): DbRecord | null {
  return record ? asRecord(record[key]) : null;
}

function getNestedRecords(record: DbRecord | null, key: string): DbRecord[] {
  const value = record?.[key];
  return Array.isArray(value) ? asRecords(value) : [];
}

function summarizeNotesSpecs(job: DbRecord | null): string[] {
  const notesSpecs = getNestedRecord(job, "notes_specs_data");
  if (!notesSpecs) return [];

  const notes = getNestedRecords(notesSpecs, "notes");
  const summary = asString(notesSpecs.summary);
  const critical = notes.filter((note) => note.importance === "critical").length;

  return [
    summary ? `Notes/specs summary: ${summary}` : null,
    `Notes/specs count: ${notes.length}${critical ? ` (${critical} critical)` : ""}`,
  ].filter(Boolean) as string[];
}

function summarizeRfi(job: DbRecord | null): string[] {
  const rfiData = getNestedRecord(job, "rfi_list_data");
  if (!rfiData) return [];

  const items = getNestedRecords(rfiData, "items");
  const unresolved = items.filter((item) => item.status !== "resolved").length;

  return [
    `RFI items: ${items.length}${unresolved ? ` (${unresolved} unresolved)` : ""}`,
  ];
}

export function buildProjectContextText(snapshot: ProjectContextSnapshot): string {
  const project = snapshot.project;
  const latestJob = snapshot.extractionJobs[0] ?? null;
  const latestTakeoff = snapshot.latestTakeoff;
  const trades = asStringArray(project?.selected_trades).join(", ") || "n/a";

  const lineItems = sortByNumber(snapshot.lineItems, ["sort_order", "item_number"]).slice(0, 25).map((item) => {
    const description = asString(item.description) ?? "Line item";
    const quantity = asNumber(item.quantity);
    const unit = asString(item.unit) ?? "";
    return `- ${description}: ${quantity ?? "n/a"} ${unit} | total ${money(item.line_total)}${asString(item.formula_used) ? ` | ${asString(item.formula_used)}` : ""}`;
  });

  return [
    "PROJECT CONTEXT",
    `Project: ${asString(project?.name) ?? "Unknown"}`,
    `Client: ${asString(project?.client_name) ?? "n/a"}`,
    `Address: ${asString(project?.address) ?? "n/a"}`,
    `Status: ${asString(project?.status) ?? "n/a"}`,
    `Trades: ${trades}`,
    `Markup: ${asNumber(project?.markup_percent) ?? "n/a"}%`,
    "",
    "CONFIGURATIONS",
    snapshot.configurations.length
      ? snapshot.configurations.map((config) => `- ${asString(config.trade) ?? "trade"}: ${compactJson(config.configuration_data, 650)}`).join("\n")
      : "No project configurations found.",
    "",
    "LATEST EXTRACTION",
    latestJob
      ? [
          `Job: ${asString(latestJob.id)}`,
          `Status: ${asString(latestJob.status) ?? "n/a"}`,
          `Pages: ${asNumber(latestJob.total_pages) ?? "n/a"}`,
          `Elevations: ${asNumber(latestJob.elevation_count) ?? "n/a"}`,
          ...summarizeNotesSpecs(latestJob),
          ...summarizeRfi(latestJob),
        ].join("\n")
      : "No extraction jobs found.",
    "",
    "EXTRACTION TOTALS",
    snapshot.extractionTotals ? compactJson(snapshot.extractionTotals, 1100) : "No extraction totals found.",
    "",
    "LATEST TAKEOFF",
    latestTakeoff
      ? [
          `Takeoff: ${asString(latestTakeoff.id)}`,
          `Name: ${asString(latestTakeoff.takeoff_name) ?? "n/a"}`,
          `Status: ${asString(latestTakeoff.status) ?? "n/a"}`,
          `Material: ${money(firstNumber(latestTakeoff, ["total_material", "total_material_cost"]))}`,
          `Labor: ${money(firstNumber(latestTakeoff, ["total_labor", "total_labor_cost"]))}`,
          `Equipment/overhead: ${money(firstNumber(latestTakeoff, ["total_equipment", "total_equipment_cost", "total_overhead_cost"]))}`,
          `Subtotal: ${money(firstNumber(latestTakeoff, ["subtotal"]))}`,
          `Grand total: ${money(firstNumber(latestTakeoff, ["grand_total", "final_price"]))}`,
          `Notes: ${asString(latestTakeoff.notes) ?? "n/a"}`,
        ].join("\n")
      : "No takeoff found.",
    "",
    "TAKEOFF SECTIONS",
    snapshot.takeoffSections.length
      ? sortByNumber(snapshot.takeoffSections, ["sort_order", "display_order"]).map((section) => `- ${asString(section.display_name) ?? asString(section.section_name) ?? asString(section.name) ?? "Section"}: ${money(section.section_total)}`).join("\n")
      : "No takeoff sections found.",
    "",
    "LINE ITEMS",
    lineItems.length ? lineItems.join("\n") : "No line items found.",
  ].join("\n");
}

export function buildProjectCitations(snapshot: ProjectContextSnapshot): AssistantCitation[] {
  const project = snapshot.project;
  const latestJob = snapshot.extractionJobs[0] ?? null;
  const latestTakeoff = snapshot.latestTakeoff;

  return [
    project
      ? {
          title: `Project: ${asString(project.name) ?? snapshot.projectId}`,
          excerpt: `${asString(project.client_name) ?? "Client n/a"} | ${asString(project.address) ?? "Address n/a"} | ${asString(project.status) ?? "Status n/a"}`,
          documentId: snapshot.projectId,
        }
      : null,
    latestJob
      ? {
          title: "Latest extraction job",
          excerpt: `Status ${asString(latestJob.status) ?? "n/a"}, ${asNumber(latestJob.total_pages) ?? "n/a"} pages, ${asNumber(latestJob.elevation_count) ?? "n/a"} elevations.`,
          documentId: asString(latestJob.id) ?? undefined,
        }
      : null,
    latestTakeoff
      ? {
          title: "Latest takeoff",
          excerpt: `Grand total ${money(firstNumber(latestTakeoff, ["grand_total", "final_price"]))} across ${snapshot.takeoffSections.length} sections and ${snapshot.lineItems.length} visible line items.`,
          documentId: asString(latestTakeoff.id) ?? undefined,
        }
      : null,
  ].filter(Boolean) as AssistantCitation[];
}

export async function loadProjectContext(
  ctx: ApiAccessContext,
  organizationId: string,
  projectId: string
): Promise<ProjectContextResult> {
  const projectResult = await ctx.supabase
    .from("projects")
    .select("id, organization_id, name, client_name, address, city, state, zip_code, selected_trades, status, markup_percent, hover_pdf_url, created_at, updated_at")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (projectResult.error) {
    throw new Error(`Failed to load project: ${projectResult.error.message}`);
  }

  const project = asRecord(projectResult.data);
  if (!project) {
    throw new Error("Project not found or not accessible.");
  }

  const [configResult, takeoffResult, jobResult] = await Promise.all([
    ctx.supabase
      .from("project_configurations")
      .select("trade, configuration_data, updated_at")
      .eq("project_id", projectId),
    ctx.supabase
      .from("takeoffs")
      .select("*")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(1),
    ctx.supabase
      .from("extraction_jobs")
      .select("id, project_id, project_name, status, total_pages, elevation_count, created_at, completed_at, default_scale_ratio, plan_dpi, notes_specs_data, rfi_list_data")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (configResult.error) throw new Error(`Failed to load project configurations: ${configResult.error.message}`);
  if (takeoffResult.error) throw new Error(`Failed to load takeoffs: ${takeoffResult.error.message}`);
  if (jobResult.error) throw new Error(`Failed to load extraction jobs: ${jobResult.error.message}`);

  const takeoffs = asRecords(takeoffResult.data);
  const latestTakeoff = takeoffs[0] ?? null;
  const latestTakeoffId = asString(latestTakeoff?.id);
  const extractionJobs = asRecords(jobResult.data);
  const latestJobId = asString(extractionJobs[0]?.id);

  const [sectionsResult, lineItemsResult, totalsResult] = await Promise.all([
    latestTakeoffId
      ? ctx.supabase
          .from("takeoff_sections")
          .select("*")
          .eq("takeoff_id", latestTakeoffId)
      : Promise.resolve({ data: [], error: null }),
    latestTakeoffId
      ? ctx.supabase
          .from("takeoff_line_items")
          .select("*")
          .eq("takeoff_id", latestTakeoffId)
          .order("item_number", { ascending: true })
          .limit(80)
      : Promise.resolve({ data: [], error: null }),
    latestJobId
      ? ctx.supabase
          .from("extraction_job_totals")
          .select("*")
          .eq("job_id", latestJobId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (sectionsResult.error) throw new Error(`Failed to load takeoff sections: ${sectionsResult.error.message}`);
  if (lineItemsResult.error) throw new Error(`Failed to load line items: ${lineItemsResult.error.message}`);
  if (totalsResult.error) throw new Error(`Failed to load extraction totals: ${totalsResult.error.message}`);

  const snapshot: ProjectContextSnapshot = {
    organizationId,
    projectId,
    project,
    configurations: asRecords(configResult.data),
    extractionJobs,
    extractionTotals: asRecord(totalsResult.data),
    latestTakeoff,
    takeoffSections: sortByNumber(asRecords(sectionsResult.data), ["sort_order", "display_order"]),
    lineItems: sortByNumber(asRecords(lineItemsResult.data), ["sort_order", "item_number"]).filter((item) => item.is_deleted !== true),
    generatedAt: new Date().toISOString(),
  };

  return {
    snapshot,
    contextText: buildProjectContextText(snapshot),
    citations: buildProjectCitations(snapshot),
  };
}
