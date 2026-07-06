import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import materialSeed from "../docs/assistant-knowledge/material-docs/material_documentation_seed.json";

const execFileAsync = promisify(execFile);

type DbRecord = Record<string, unknown>;

interface SeedFile {
  version?: string;
  references?: SeedReference[];
}

interface SeedReference {
  doc_key: string;
  manufacturer: string;
  product_family: string;
  document_title: string;
  document_type: string;
  source_url: string;
  division?: string;
  trades?: string[];
  categories?: string[];
  product_keywords?: string[];
  applicability?: string;
  risk_flags?: string[];
  estimating_guidance?: string[];
  source_notes?: string[];
  priority?: number;
}

interface CliOptions {
  dryRun: boolean;
  azureLayout: boolean;
  limit: number | null;
  organizationId: string | null;
}

interface SourcePayload {
  bytes: Uint8Array;
  contentType: string;
  sourceUrl: string;
}

interface ExtractedPage {
  pageNumber: number;
  text: string;
}

interface ExtractedDocument {
  method:
    | "pdftotext"
    | "html_text"
    | "azure_document_intelligence"
    | "seed_reference_fallback";
  mimeType: string;
  pages: ExtractedPage[];
  tableCount: number;
  extractionError?: string;
}

interface ChunkDraft {
  chunk_index: number;
  content: string;
  token_count: number;
  metadata: DbRecord;
}

function loadLocalEnv(): void {
  for (const fileName of [".env.local", ".env"]) {
    if (!existsSync(fileName)) continue;

    const text = readFileSync(fileName, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (process.env[key]) continue;

      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: false,
    azureLayout: false,
    limit: null,
    organizationId: null,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--azure-layout") {
      options.azureLayout = true;
      continue;
    }

    if (arg === "--limit") {
      options.limit = Number(args[index + 1] ?? "");
      index++;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
      continue;
    }

    if (arg === "--organization-id") {
      options.organizationId = args[index + 1] ?? null;
      index++;
      continue;
    }

    if (arg.startsWith("--organization-id=")) {
      options.organizationId = arg.slice("--organization-id=".length);
    }
  }

  if (options.limit !== null && (!Number.isFinite(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive number");
  }

  return options;
}

function createSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase service configuration is missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function asRecord(value: unknown): DbRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DbRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function getOrganizationId(
  supabase: SupabaseClient,
  requestedId: string | null,
): Promise<string> {
  if (requestedId) return requestedId;

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load organization: ${error.message}`);

  const id = asString(asRecord(data)?.id);
  if (!id) throw new Error("No organization found. Pass --organization-id.");
  return id;
}

async function ensureManufacturerCollection(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from("knowledge_collections")
    .select("id")
    .eq("organization_id", organizationId)
    .is("project_id", null)
    .eq("name", "Manufacturer Documentation")
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to find knowledge collection: ${selectError.message}`);
  }

  const existingId = asString(asRecord(existing)?.id);
  if (existingId) return existingId;

  const { data, error } = await supabase
    .from("knowledge_collections")
    .insert({
      organization_id: organizationId,
      project_id: null,
      name: "Manufacturer Documentation",
      description:
        "Official manufacturer installation, product, WRB, flashing, sealant, trim, siding, and roofing references for Exterior Finishes AI.",
      collection_type: "core",
      visibility: "organization",
      metadata: {
        source: "material_documentation_seed",
        seed_version: (materialSeed as SeedFile).version ?? null,
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create knowledge collection: ${error.message}`);

  const id = asString(asRecord(data)?.id);
  if (!id) throw new Error("Knowledge collection insert returned no id");
  return id;
}

async function upsertMaterialReferenceRows(
  supabase: SupabaseClient,
  references: SeedReference[],
): Promise<void> {
  const rows = references.map((reference) => ({
    doc_key: reference.doc_key,
    manufacturer: reference.manufacturer,
    product_family: reference.product_family,
    document_title: reference.document_title,
    document_type: reference.document_type,
    source_url: reference.source_url,
    division: reference.division ?? "07",
    trades: reference.trades ?? [],
    categories: reference.categories ?? [],
    product_keywords: reference.product_keywords ?? [],
    applicability: reference.applicability ?? "",
    risk_flags: reference.risk_flags ?? [],
    estimating_guidance: reference.estimating_guidance ?? [],
    source_notes: reference.source_notes ?? [],
    priority: reference.priority ?? 50,
    active: true,
    metadata: {
      source: "material_documentation_seed",
      seed_version: (materialSeed as SeedFile).version ?? null,
    },
  }));

  const { error } = await supabase
    .from("ai_material_documentation")
    .upsert(rows, { onConflict: "doc_key" });

  if (error) {
    throw new Error(`Failed to upsert ai_material_documentation: ${error.message}`);
  }
}

async function fetchSource(sourceUrl: string): Promise<SourcePayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "application/pdf,text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`Download failed (${response.status}) ${response.statusText}`);
    }

    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "",
      sourceUrl: response.url || sourceUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isPdfSource(reference: SeedReference, payload: SourcePayload): boolean {
  return (
    payload.contentType.toLowerCase().includes("pdf") ||
    reference.source_url.toLowerCase().includes(".pdf") ||
    payload.sourceUrl.toLowerCase().includes(".pdf")
  );
}

async function extractPdfWithPdftotext(
  reference: SeedReference,
  payload: SourcePayload,
): Promise<ExtractedDocument> {
  const tempDir = await mkdtemp(join(tmpdir(), "efai-material-doc-"));
  const pdfPath = join(tempDir, `${reference.doc_key}.pdf`);

  try {
    await writeFile(pdfPath, payload.bytes);
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-layout", "-enc", "UTF-8", pdfPath, "-"],
      { maxBuffer: 80 * 1024 * 1024 },
    );

    const pages = stdout
      .split("\f")
      .map((text, index) => ({
        pageNumber: index + 1,
        text: cleanExtractedText(text),
      }))
      .filter((page) => page.text.length > 0);

    return {
      method: "pdftotext",
      mimeType: "application/pdf",
      pages,
      tableCount: pages.filter((page) => hasTableLikeText(page.text)).length,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function extractPdfWithAzureLayout(sourceUrl: string): Promise<ExtractedDocument> {
  const { analyzeLayout, tableToGrid } = await import("../lib/azure-doc-intel");
  const result = await analyzeLayout({ url: sourceUrl });
  const tableBlocks = result.tables.map((table, tableIndex) => {
    const grid = tableToGrid(table);
    const rows = grid.map((row) => row.join(" | ")).join("\n");
    return [`Table ${tableIndex + 1}`, rows].join("\n");
  });
  const content = cleanExtractedText(
    [result.content, tableBlocks.join("\n\n")].filter(Boolean).join("\n\n"),
  );

  return {
    method: "azure_document_intelligence",
    mimeType: "application/pdf",
    pages: content ? [{ pageNumber: 1, text: content }] : [],
    tableCount: result.tables.length,
  };
}

function extractHtmlText(payload: SourcePayload): ExtractedDocument {
  const html = Buffer.from(payload.bytes).toString("utf8");
  const text = decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
  const cleaned = cleanExtractedText(text);

  return {
    method: "html_text",
    mimeType: payload.contentType || "text/html",
    pages: cleaned ? [{ pageNumber: 1, text: cleaned }] : [],
    tableCount: hasTableLikeText(cleaned) ? 1 : 0,
  };
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value
    .replace(/&([a-z]+);/gi, (_, entity: string) => named[entity.toLowerCase()] ?? " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function cleanExtractedText(value: string): string {
  return value
    .replace(/\r/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n")
    .map((line) => line.replace(/[ \u00a0]+$/g, "").replace(/^[ \u00a0]+$/g, ""))
    .join("\n")
    .replace(/[ \u00a0]{3,}/g, "  ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function extractReference(
  reference: SeedReference,
  options: CliOptions,
): Promise<ExtractedDocument> {
  const payload = await fetchSource(reference.source_url);

  if (isPdfSource(reference, payload)) {
    if (options.azureLayout) {
      try {
        return await extractPdfWithAzureLayout(reference.source_url);
      } catch (error) {
        console.warn(
          `  Azure layout failed for ${reference.doc_key}; falling back to pdftotext: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const localExtraction = await extractPdfWithPdftotext(reference, payload);

    if (
      localExtraction.pages.length === 0 &&
      process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT &&
      process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
    ) {
      try {
        return await extractPdfWithAzureLayout(reference.source_url);
      } catch (error) {
        console.warn(
          `  Azure layout fallback failed for ${reference.doc_key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return localExtraction;
  }

  return extractHtmlText(payload);
}

function buildSeedReferenceFallback(
  reference: SeedReference,
  error: unknown,
): ExtractedDocument {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const text = [
    `${reference.document_title}`,
    `Manufacturer: ${reference.manufacturer}`,
    `Product family: ${reference.product_family}`,
    `Document type: ${reference.document_type}`,
    `Source URL: ${reference.source_url}`,
    "",
    "Reference-only fallback:",
    "The source document could not be downloaded or text-extracted during ingestion. Use this chunk only as a pointer to the official source and ask for the source document when exact requirements are needed.",
    `Extraction issue: ${errorMessage}`,
    "",
    `Applicability: ${reference.applicability ?? "Use when matching product/material terms apply."}`,
    "",
    "Estimator guidance:",
    ...(reference.estimating_guidance ?? []).map((item) => `- ${item}`),
    "",
    "Risk flags:",
    ...(reference.risk_flags ?? []).map((item) => `- ${item}`),
    "",
    "Source notes:",
    ...(reference.source_notes ?? []).map((item) => `- ${item}`),
  ].join("\n");

  return {
    method: "seed_reference_fallback",
    mimeType: "text/plain",
    pages: [{ pageNumber: 1, text: cleanExtractedText(text) }],
    tableCount: 0,
    extractionError: errorMessage,
  };
}

function hasTableLikeText(value: string): boolean {
  const tableishLines = value
    .split("\n")
    .filter((line) => /\S+\s{2,}\S+/.test(line) || line.includes(" | "));

  return tableishLines.length >= 3;
}

function sourceFileName(reference: SeedReference, mimeType: string): string {
  try {
    const pathName = new URL(reference.source_url).pathname;
    const name = basename(pathName);
    if (name && name.includes(".")) return name;
  } catch {
    // Fall through to doc key.
  }

  return `${reference.doc_key}${mimeType.includes("pdf") ? ".pdf" : ".html"}`;
}

function buildDocumentMetadata(
  reference: SeedReference,
  extraction: ExtractedDocument,
): DbRecord {
  return {
    doc_key: reference.doc_key,
    manufacturer: reference.manufacturer,
    product_family: reference.product_family,
    document_title: reference.document_title,
    document_type: reference.document_type,
    source_url: reference.source_url,
    division: reference.division ?? "07",
    trades: reference.trades ?? [],
    categories: reference.categories ?? [],
    product_keywords: reference.product_keywords ?? [],
    extraction_method: extraction.method,
    extracted_page_count: extraction.pages.length,
    extracted_table_count: extraction.tableCount,
    extraction_error: extraction.extractionError ?? null,
    source: "material_documentation_seed",
    seed_version: (materialSeed as SeedFile).version ?? null,
  };
}

function splitTextForChunks(text: string, maxChars: number, overlap: number): string[] {
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const hardEnd = Math.min(cursor + maxChars, text.length);
    let end = hardEnd;

    if (hardEnd < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", hardEnd);
      const lineBreak = text.lastIndexOf("\n", hardEnd);
      const sentenceBreak = text.lastIndexOf(". ", hardEnd);
      const lowerBound = cursor + Math.floor(maxChars * 0.55);
      const candidate = [paragraphBreak, lineBreak, sentenceBreak].find(
        (breakpoint) => breakpoint > lowerBound,
      );
      if (candidate) end = candidate + 1;
    }

    const chunk = text.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= text.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
  }

  return chunks;
}

function buildChunks(reference: SeedReference, extraction: ExtractedDocument): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  const baseMetadata = buildDocumentMetadata(reference, extraction);
  const keywordText = [
    `Manufacturer: ${reference.manufacturer}`,
    `Product family: ${reference.product_family}`,
    `Document type: ${reference.document_type}`,
    `Trades: ${(reference.trades ?? []).join(", ")}`,
    `Categories: ${(reference.categories ?? []).join(", ")}`,
    `Keywords: ${(reference.product_keywords ?? []).join(", ")}`,
    `Source: ${reference.source_url}`,
  ].join("\n");

  for (const page of extraction.pages) {
    const pageHeader = [
      reference.document_title,
      keywordText,
      `Page: ${page.pageNumber}`,
      "",
    ].join("\n");
    const maxChars = Math.max(900, 2400 - pageHeader.length);
    const pageChunks = splitTextForChunks(page.text, maxChars, 220);

    for (const pageChunk of pageChunks) {
      const content = `${pageHeader}${pageChunk}`.trim();
      chunks.push({
        chunk_index: chunks.length,
        content,
        token_count: Math.ceil(content.length / 4),
        metadata: {
          ...baseMetadata,
          page_number: page.pageNumber,
          has_table_like_text: hasTableLikeText(pageChunk),
        },
      });
    }
  }

  return chunks;
}

function checksumText(extraction: ExtractedDocument): string {
  return createHash("sha256")
    .update(extraction.pages.map((page) => page.text).join("\n\n"))
    .digest("hex");
}

async function ensureDocumentRow(input: {
  supabase: SupabaseClient;
  organizationId: string;
  collectionId: string;
  reference: SeedReference;
  extraction: ExtractedDocument;
}): Promise<string> {
  const { supabase, organizationId, collectionId, reference, extraction } = input;
  const { data: existing, error: selectError } = await supabase
    .from("documents")
    .select("id")
    .eq("organization_id", organizationId)
    .is("project_id", null)
    .eq("source_url", reference.source_url)
    .limit(1)
    .maybeSingle();

  if (selectError) throw new Error(`Failed to find document row: ${selectError.message}`);

  const existingId = asString(asRecord(existing)?.id);
  const payload = {
    organization_id: organizationId,
    project_id: null,
    collection_id: collectionId,
    title: reference.document_title,
    file_name: sourceFileName(reference, extraction.mimeType),
    file_type: "manufacturer_reference",
    mime_type: extraction.mimeType,
    source_url: reference.source_url,
    status: "chunking",
    metadata: buildDocumentMetadata(reference, extraction),
    error_message: null,
  };

  if (existingId) {
    const { error } = await supabase.from("documents").update(payload).eq("id", existingId);
    if (error) throw new Error(`Failed to update document row: ${error.message}`);
    return existingId;
  }

  const { data, error } = await supabase
    .from("documents")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create document row: ${error.message}`);

  const id = asString(asRecord(data)?.id);
  if (!id) throw new Error("Document insert returned no id");
  return id;
}

async function replaceDocumentChunks(input: {
  supabase: SupabaseClient;
  organizationId: string;
  collectionId: string;
  documentId: string;
  chunks: ChunkDraft[];
}): Promise<void> {
  const { supabase, organizationId, collectionId, documentId, chunks } = input;
  const { error: deleteError } = await supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", documentId);

  if (deleteError) throw new Error(`Failed to clear old chunks: ${deleteError.message}`);

  for (let index = 0; index < chunks.length; index += 100) {
    const batch = chunks.slice(index, index + 100).map((chunk) => ({
      organization_id: organizationId,
      project_id: null,
      document_id: documentId,
      collection_id: collectionId,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      token_count: chunk.token_count,
      metadata: chunk.metadata,
    }));

    const { error } = await supabase.from("document_chunks").insert(batch);
    if (error) throw new Error(`Failed to insert chunks: ${error.message}`);
  }
}

async function markDocumentReady(input: {
  supabase: SupabaseClient;
  documentId: string;
  chunkCount: number;
  checksum: string;
  metadata: DbRecord;
}): Promise<void> {
  const { error } = await input.supabase
    .from("documents")
    .update({
      status: "ready",
      chunk_count: input.chunkCount,
      extracted_text_checksum: input.checksum,
      metadata: input.metadata,
      error_message: null,
    })
    .eq("id", input.documentId);

  if (error) throw new Error(`Failed to mark document ready: ${error.message}`);
}

async function markDocumentError(
  supabase: SupabaseClient,
  documentId: string | null,
  error: unknown,
): Promise<void> {
  if (!documentId) return;

  const message = error instanceof Error ? error.message : String(error);
  await supabase
    .from("documents")
    .update({
      status: "error",
      error_message: message.slice(0, 1000),
    })
    .eq("id", documentId);
}

async function ingestReference(input: {
  supabase: SupabaseClient;
  organizationId: string;
  collectionId: string;
  reference: SeedReference;
  options: CliOptions;
}): Promise<{ chunks: number; method: string; pages: number }> {
  const { supabase, organizationId, collectionId, reference, options } = input;
  let extraction: ExtractedDocument;

  try {
    extraction = await extractReference(reference, options);
  } catch (error) {
    extraction = buildSeedReferenceFallback(reference, error);
  }

  let chunks = buildChunks(reference, extraction);

  if (!chunks.length) {
    extraction = buildSeedReferenceFallback(
      reference,
      new Error("No text chunks were extracted"),
    );
    chunks = buildChunks(reference, extraction);
  }

  if (options.dryRun) {
    return {
      chunks: chunks.length,
      method: extraction.method,
      pages: extraction.pages.length,
    };
  }

  const documentId = await ensureDocumentRow({
    supabase,
    organizationId,
    collectionId,
    reference,
    extraction,
  });

  try {
    await replaceDocumentChunks({
      supabase,
      organizationId,
      collectionId,
      documentId,
      chunks,
    });
    await markDocumentReady({
      supabase,
      documentId,
      chunkCount: chunks.length,
      checksum: checksumText(extraction),
      metadata: buildDocumentMetadata(reference, extraction),
    });
  } catch (error) {
    await markDocumentError(supabase, documentId, error);
    throw error;
  }

  return {
    chunks: chunks.length,
    method: extraction.method,
    pages: extraction.pages.length,
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseArgs();
  const supabase = createSupabase();
  const references = ((materialSeed as SeedFile).references ?? []).slice(
    0,
    options.limit ?? undefined,
  );
  const organizationId = await getOrganizationId(supabase, options.organizationId);

  if (!references.length) {
    throw new Error("No material documentation references found");
  }

  const collectionId = options.dryRun
    ? "dry-run"
    : await ensureManufacturerCollection(supabase, organizationId);

  if (!options.dryRun) {
    await upsertMaterialReferenceRows(supabase, references);
  }

  console.log(
    `${options.dryRun ? "Dry run" : "Ingesting"} ${references.length} material document references for organization ${organizationId}`,
  );

  let successCount = 0;
  let failureCount = 0;

  for (const [index, reference] of references.entries()) {
    process.stdout.write(
      `[${index + 1}/${references.length}] ${reference.manufacturer} - ${reference.document_title} ... `,
    );

    try {
      const result = await ingestReference({
        supabase,
        organizationId,
        collectionId,
        reference,
        options,
      });
      successCount++;
      console.log(`${result.chunks} chunks, ${result.pages} page(s), ${result.method}`);
    } catch (error) {
      failureCount++;
      console.log(`failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Done. ${successCount} succeeded, ${failureCount} failed.`);

  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
