import materialSeed from "@/docs/assistant-knowledge/material-docs/material_documentation_seed.json";
import type { ApiAccessContext } from "@/lib/api/access";

type DbRecord = Record<string, unknown>;

interface MaterialSeedFile {
  references?: unknown[];
}

export interface AssistantMaterialDocument {
  docKey: string;
  manufacturer: string;
  productFamily: string;
  documentTitle: string;
  documentType: string;
  sourceUrl: string;
  division: string;
  trades: string[];
  categories: string[];
  productKeywords: string[];
  applicability: string;
  riskFlags: string[];
  estimatingGuidance: string[];
  sourceNotes: string[];
  priority: number;
}

export interface LoadMaterialDocumentsInput {
  accessContext?: ApiAccessContext;
  query: string;
  matchCount?: number;
}

function asRecord(value: unknown): DbRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DbRecord)
    : null;
}

function asRecords(value: unknown): DbRecord[] {
  return Array.isArray(value)
    ? (value.map(asRecord).filter(Boolean) as DbRecord[])
    : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeMaterialDocument(
  record: DbRecord,
): AssistantMaterialDocument | null {
  const docKey = asString(record.doc_key);
  const manufacturer = asString(record.manufacturer);
  const productFamily = asString(record.product_family);
  const documentTitle = asString(record.document_title);
  const documentType = asString(record.document_type);
  const sourceUrl = asString(record.source_url);

  if (
    !docKey ||
    !manufacturer ||
    !productFamily ||
    !documentTitle ||
    !documentType ||
    !sourceUrl
  ) {
    return null;
  }

  return {
    docKey,
    manufacturer,
    productFamily,
    documentTitle,
    documentType,
    sourceUrl,
    division: asString(record.division) ?? "07",
    trades: asStringArray(record.trades),
    categories: asStringArray(record.categories),
    productKeywords: asStringArray(record.product_keywords),
    applicability: asString(record.applicability) ?? "",
    riskFlags: asStringArray(record.risk_flags),
    estimatingGuidance: asStringArray(record.estimating_guidance),
    sourceNotes: asStringArray(record.source_notes),
    priority: asNumber(record.priority) ?? 50,
  };
}

const localMaterialDocuments: AssistantMaterialDocument[] = asRecords(
  (materialSeed as MaterialSeedFile).references,
)
  .map(normalizeMaterialDocument)
  .filter(Boolean) as AssistantMaterialDocument[];

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function hasPhrase(haystack: string, phrase: string): boolean {
  return haystack.includes(phrase.toLowerCase());
}

function scoreMaterialDocument(
  reference: AssistantMaterialDocument,
  query: string,
): number {
  const normalizedQuery = query.toLowerCase();
  const queryTokens = new Set(tokenize(query));
  const searchable = [
    reference.docKey,
    reference.manufacturer,
    reference.productFamily,
    reference.documentTitle,
    reference.documentType,
    reference.division,
    reference.trades.join(" "),
    reference.categories.join(" "),
    reference.productKeywords.join(" "),
    reference.applicability,
    reference.riskFlags.join(" "),
    reference.estimatingGuidance.join(" "),
  ].join(" ");
  const referenceTokens = new Set(tokenize(searchable));

  let score = Math.min(5, reference.priority / 20);

  if (hasPhrase(normalizedQuery, reference.manufacturer)) score += 36;
  for (const keyword of reference.productKeywords) {
    if (keyword.length > 2 && hasPhrase(normalizedQuery, keyword)) score += 22;
  }
  for (const category of reference.categories) {
    if (
      category.length > 2 &&
      hasPhrase(normalizedQuery, category.replace(/_/g, " "))
    )
      score += 10;
  }
  for (const trade of reference.trades) {
    if (trade.length > 2 && hasPhrase(normalizedQuery, trade)) score += 8;
  }

  for (const token of queryTokens) {
    if (referenceTokens.has(token)) score += 2;
  }

  if (
    /\b(install|installation|clearance|fastener|flashing|warranty|spec|manufacturer|documentation|submittal|material|division\s*7|division\s*07|rfi|proposal|scope|risk)\b/i.test(
      query,
    )
  ) {
    score += 8;
  }

  return score;
}

function rankMaterialDocuments(
  references: AssistantMaterialDocument[],
  query: string,
  matchCount: number,
): AssistantMaterialDocument[] {
  return [...references]
    .map((reference) => ({
      reference,
      score: scoreMaterialDocument(reference, query),
    }))
    .filter(({ score }) => score >= 12)
    .sort((a, b) => b.score - a.score)
    .slice(0, matchCount)
    .map(({ reference }) => reference);
}

export async function loadRelevantMaterialDocuments(
  input: LoadMaterialDocumentsInput,
): Promise<AssistantMaterialDocument[]> {
  const matchCount = input.matchCount ?? 6;

  if (input.accessContext) {
    try {
      const result = await input.accessContext.supabase
        .from("ai_material_documentation")
        .select(
          "doc_key, manufacturer, product_family, document_title, document_type, source_url, division, trades, categories, product_keywords, applicability, risk_flags, estimating_guidance, source_notes, priority",
        )
        .eq("active", true)
        .order("priority", { ascending: false })
        .limit(80);

      if (!result.error) {
        const databaseReferences = asRecords(result.data)
          .map(normalizeMaterialDocument)
          .filter(Boolean) as AssistantMaterialDocument[];

        if (databaseReferences.length) {
          return rankMaterialDocuments(
            databaseReferences,
            input.query,
            matchCount,
          );
        }
      } else {
        const message = result.error.message ?? "";
        const missingTable =
          /ai_material_documentation|schema cache|does not exist/i.test(
            message,
          );
        if (!missingTable) {
          console.warn(
            "[assistant/material-documents] Falling back to local material docs",
            message,
          );
        }
      }
    } catch (error) {
      console.warn(
        "[assistant/material-documents] Falling back to local material docs",
        error,
      );
    }
  }

  return rankMaterialDocuments(localMaterialDocuments, input.query, matchCount);
}

function bulletList(items: string[]): string {
  return items.length
    ? items.map((item) => `- ${item}`).join("\n")
    : "- None provided.";
}

export function formatMaterialDocumentsForPrompt(
  references: AssistantMaterialDocument[],
): string {
  if (!references.length) {
    return "No manufacturer material documentation matched this request.";
  }

  return references
    .map((reference, index) =>
      [
        `MATERIAL DOC ${index + 1}: ${reference.documentTitle}`,
        `Key: ${reference.docKey}`,
        `Manufacturer: ${reference.manufacturer}`,
        `Product family: ${reference.productFamily}`,
        `Document type: ${reference.documentType}`,
        `Division/trades/categories: Division ${reference.division}; ${reference.trades.join(", ") || "none"}; ${reference.categories.join(", ") || "none"}`,
        `Source URL: ${reference.sourceUrl}`,
        `Applicability: ${reference.applicability || "Use when product/material terms match."}`,
        "Estimator guidance:",
        bulletList(reference.estimatingGuidance),
        "Risk flags:",
        bulletList(reference.riskFlags),
        "Source notes:",
        bulletList(reference.sourceNotes),
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}
