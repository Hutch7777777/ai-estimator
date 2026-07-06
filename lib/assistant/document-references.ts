import referenceSeed from "@/docs/assistant-knowledge/reference-pack/ai_document_references_seed.json";
import type { ApiAccessContext } from "@/lib/api/access";

type DocumentType = "proposal" | "contract" | "change_order" | "template" | "other";
type DbRecord = Record<string, unknown>;

interface ReferenceSeedFile {
  examples?: unknown[];
}

export interface AssistantDocumentReference {
  docKey: string;
  docType: DocumentType;
  subtype: string;
  title: string;
  templateQuality: string;
  projectType?: string | null;
  tags: string[];
  fullText: string;
  sections: Record<string, unknown>;
  pricing: Record<string, unknown>;
  generationNotes: string[];
}

export interface LoadDocumentReferencesInput {
  accessContext?: ApiAccessContext;
  query: string;
  matchCount?: number;
}

function asRecord(value: unknown): DbRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRecord) : null;
}

function asRecords(value: unknown): DbRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter(Boolean) as DbRecord[] : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecordValue(value: unknown): Record<string, unknown> {
  return asRecord(value) ?? {};
}

function normalizeReference(record: DbRecord): AssistantDocumentReference | null {
  const docKey = asString(record.doc_key);
  const docType = asString(record.doc_type);
  const subtype = asString(record.subtype);
  const title = asString(record.title);
  const fullText = asString(record.full_text);

  if (!docKey || !docType || !subtype || !title || !fullText) return null;

  return {
    docKey,
    docType: docType as DocumentType,
    subtype,
    title,
    templateQuality: asString(record.template_quality) ?? "reference",
    projectType: asString(record.project_type),
    tags: asStringArray(record.tags),
    fullText,
    sections: asRecordValue(record.sections),
    pricing: asRecordValue(record.pricing),
    generationNotes: asStringArray(record.generation_notes),
  };
}

const localReferences: AssistantDocumentReference[] = asRecords((referenceSeed as ReferenceSeedFile).examples)
  .map(normalizeReference)
  .filter(Boolean) as AssistantDocumentReference[];

function inferDocTypes(query: string): DocumentType[] {
  const text = query.toLowerCase();
  const types: DocumentType[] = [];

  if (/\b(change\s*order|co-|co\b|added scope|rot repair|discovered damage|t&m|time and material)\b/.test(text)) {
    types.push("change_order");
  }
  if (/\b(contract|service agreement|agreement|signatures?|legal terms?)\b/.test(text)) {
    types.push("contract");
  }
  if (/\b(proposal|quote|bid|total sell|alternate|option|scope language)\b/.test(text)) {
    types.push("proposal");
  }

  return types.length ? types : ["proposal", "change_order", "contract"];
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function scoreReference(reference: AssistantDocumentReference, query: string, preferredTypes: DocumentType[]): number {
  const queryTokens = new Set(tokenize(query));
  const searchable = [
    reference.docKey,
    reference.docType,
    reference.subtype,
    reference.title,
    reference.projectType ?? "",
    reference.tags.join(" "),
    reference.generationNotes.join(" "),
  ].join(" ");
  const referenceTokens = new Set(tokenize(searchable));

  let score = preferredTypes.includes(reference.docType) ? 30 : 0;
  if (reference.templateQuality === "final_reference") score += 8;

  for (const token of queryTokens) {
    if (referenceTokens.has(token)) score += 3;
    if (reference.subtype.toLowerCase().includes(token)) score += 2;
    if (reference.docKey.toLowerCase().includes(token)) score += 2;
  }

  return score;
}

function rankReferences(
  references: AssistantDocumentReference[],
  query: string,
  matchCount: number
): AssistantDocumentReference[] {
  const preferredTypes = inferDocTypes(query);

  return [...references]
    .map((reference) => ({
      reference,
      score: scoreReference(reference, query, preferredTypes),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, matchCount)
    .map(({ reference }) => reference);
}

export async function loadRelevantDocumentReferences(
  input: LoadDocumentReferencesInput
): Promise<AssistantDocumentReference[]> {
  const matchCount = input.matchCount ?? 4;
  const preferredTypes = inferDocTypes(input.query);

  if (input.accessContext) {
    try {
      const result = await input.accessContext.supabase
        .from("ai_document_references")
        .select("doc_key, doc_type, subtype, title, template_quality, project_type, tags, full_text, sections, pricing, generation_notes")
        .in("doc_type", preferredTypes)
        .order("template_quality", { ascending: true })
        .limit(20);

      if (!result.error) {
        const databaseReferences = asRecords(result.data).map(normalizeReference).filter(Boolean) as AssistantDocumentReference[];
        if (databaseReferences.length) {
          return rankReferences(databaseReferences, input.query, matchCount);
        }
      } else {
        console.warn("[assistant/document-references] Falling back to local references", result.error.message);
      }
    } catch (error) {
      console.warn("[assistant/document-references] Falling back to local references", error);
    }
  }

  return rankReferences(localReferences, input.query, matchCount);
}

function truncateMiddle(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const headLength = Math.floor(maxLength * 0.72);
  const tailLength = Math.max(0, maxLength - headLength - 36);
  return `${text.slice(0, headLength).trim()}\n\n[...reference shortened...]\n\n${text.slice(-tailLength).trim()}`;
}

export function formatDocumentReferencesForPrompt(references: AssistantDocumentReference[]): string {
  if (!references.length) return "No document reference examples matched this request.";

  return references
    .map((reference, index) => {
      const notes = reference.generationNotes.length
        ? reference.generationNotes.map((note) => `- ${note}`).join("\n")
        : "- No generation notes provided.";

      return [
        `REFERENCE ${index + 1}: ${reference.title}`,
        `Key: ${reference.docKey}`,
        `Type: ${reference.docType} / ${reference.subtype}`,
        `Quality: ${reference.templateQuality}`,
        `Tags: ${reference.tags.join(", ") || "none"}`,
        `Sections: ${JSON.stringify(reference.sections)}`,
        `Pricing pattern: ${JSON.stringify(reference.pricing)}`,
        "Generation notes:",
        notes,
        "Reference text:",
        truncateMiddle(reference.fullText, 2600),
      ].join("\n");
    })
    .join("\n\n---\n\n");
}
