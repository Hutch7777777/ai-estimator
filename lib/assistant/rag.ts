import Anthropic from "@anthropic-ai/sdk";
import type { ApiAccessContext } from "@/lib/api/access";
import {
  formatDocumentReferencesForPrompt,
  loadRelevantDocumentReferences,
} from "@/lib/assistant/document-references";
import {
  formatAssistantKnowledgeForPrompt,
  getDefaultAssistantKnowledge,
  loadAssistantKnowledge,
} from "@/lib/assistant/knowledge";
import {
  formatMaterialDocumentsForPrompt,
  loadRelevantMaterialDocuments,
} from "@/lib/assistant/material-documents";
import { loadProjectContext } from "@/lib/assistant/project-context";
import type {
  AssistantAnswer,
  AssistantChatMessage,
  DocumentChunkDraft,
  KnowledgeDocument,
  RetrievedChunk,
} from "@/lib/assistant/types";

interface ScopedAssistantInput {
  organizationId: string;
  projectId?: string | null;
  userId?: string;
}

export interface UploadKnowledgeDocumentInput extends ScopedAssistantInput {
  file: File;
  collectionId?: string | null;
}

export interface ExtractDocumentTextInput extends ScopedAssistantInput {
  documentId: string;
  storagePath?: string | null;
  mimeType?: string | null;
}

export interface ChunkDocumentTextInput extends ScopedAssistantInput {
  documentId: string;
  text: string;
  chunkSize?: number;
  overlap?: number;
}

export interface EmbedDocumentChunksInput extends ScopedAssistantInput {
  documentId: string;
  chunks: DocumentChunkDraft[];
}

export interface RetrieveRelevantChunksInput extends ScopedAssistantInput {
  query: string;
  matchCount?: number;
  accessContext?: ApiAccessContext;
}

export interface CreateChatAnswerInput extends ScopedAssistantInput {
  threadId?: string | null;
  messages: AssistantChatMessage[];
  accessContext?: ApiAccessContext;
}

function isAnthropicModelNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not_found_error/i.test(message) && /model:/i.test(message);
}

export async function uploadKnowledgeDocument(
  input: UploadKnowledgeDocumentInput,
): Promise<KnowledgeDocument> {
  // TODO: Upload the file to Supabase Storage, then insert a documents row.
  return {
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    title: input.file.name,
    fileName: input.file.name,
    status: "uploaded",
    createdAt: new Date().toISOString(),
  };
}

export async function extractDocumentText(
  input: ExtractDocumentTextInput,
): Promise<string> {
  // TODO: Extract text by MIME type. PDF, DOCX, XLSX, and TXT should be handled here.
  void input;
  return "";
}

export function chunkDocumentText(
  input: ChunkDocumentTextInput,
): DocumentChunkDraft[] {
  const chunkSize = input.chunkSize ?? 1200;
  const overlap = input.overlap ?? 150;
  const normalizedText = input.text.replace(/\s+/g, " ").trim();

  if (!normalizedText) return [];

  const chunks: DocumentChunkDraft[] = [];
  let cursor = 0;

  while (cursor < normalizedText.length) {
    const end = Math.min(cursor + chunkSize, normalizedText.length);
    const content = normalizedText.slice(cursor, end).trim();

    if (content) {
      chunks.push({
        chunkIndex: chunks.length,
        content,
        tokenCount: Math.ceil(content.length / 4),
        metadata: {
          documentId: input.documentId,
          projectId: input.projectId ?? null,
        },
      });
    }

    if (end === normalizedText.length) break;
    cursor = Math.max(0, end - overlap);
  }

  return chunks;
}

export async function embedDocumentChunks(
  input: EmbedDocumentChunksInput,
): Promise<void> {
  // TODO: Generate embeddings, then update document_chunks.embedding in Supabase.
  void input;
}

type DbRecord = Record<string, unknown>;

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
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenizeRetrievalQuery(value: string): string[] {
  const stopWords = new Set([
    "about",
    "after",
    "also",
    "and",
    "are",
    "can",
    "does",
    "for",
    "from",
    "has",
    "have",
    "how",
    "into",
    "our",
    "that",
    "the",
    "this",
    "through",
    "what",
    "when",
    "where",
    "with",
    "would",
    "you",
  ]);

  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9_\s-]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !stopWords.has(token)),
    ),
  );
}

function escapePostgrestLikeToken(value: string): string {
  return value.replace(/[%*,()]/g, "");
}

function joinedDocument(row: DbRecord): DbRecord | null {
  const value = row.documents;
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function metadataSearchText(...records: Array<DbRecord | null>): string {
  return records
    .filter(Boolean)
    .map((record) => JSON.stringify(record))
    .join(" ")
    .toLowerCase();
}

function scoreRetrievedChunk(input: {
  query: string;
  tokens: string[];
  title: string;
  content: string;
  metadata: DbRecord;
  documentMetadata: DbRecord;
}): number {
  const content = input.content.toLowerCase();
  const title = input.title.toLowerCase();
  const metadata = metadataSearchText(input.metadata, input.documentMetadata);
  const phrase = normalizeSearchText(input.query);
  let score = 0;

  if (phrase.length > 10 && content.includes(phrase)) score += 14;
  if (phrase.length > 10 && metadata.includes(phrase)) score += 10;

  for (const token of input.tokens) {
    if (title.includes(token)) score += 7;
    if (metadata.includes(token)) score += 5;
    if (content.includes(token)) score += 2;
  }

  const manufacturer = asString(input.documentMetadata.manufacturer);
  if (manufacturer && input.query.toLowerCase().includes(manufacturer.toLowerCase())) {
    score += 12;
  }

  const productFamily = asString(input.documentMetadata.product_family);
  if (productFamily) {
    for (const token of tokenizeRetrievalQuery(productFamily)) {
      if (input.query.toLowerCase().includes(token)) score += 4;
    }
  }

  return score;
}

function normalizeRetrievedChunk(
  row: DbRecord,
  query: string,
  queryTokens: string[],
): RetrievedChunk | null {
  const id = asString(row.id);
  const documentId = asString(row.document_id);
  const content = asString(row.content);
  const metadata = asRecord(row.metadata) ?? {};
  const document = joinedDocument(row);
  const documentMetadata = asRecord(document?.metadata) ?? {};
  const documentStatus = asString(document?.status);
  const title =
    asString(document?.title) ??
    asString(documentMetadata.document_title) ??
    "Knowledge document";

  if (!id || !documentId || !content) return null;
  if (documentStatus && documentStatus !== "ready") return null;

  const score = scoreRetrievedChunk({
    query,
    tokens: queryTokens,
    title,
    content,
    metadata,
    documentMetadata,
  });

  if (score < 2) return null;

  return {
    id,
    documentId,
    title,
    content,
    metadata: {
      ...documentMetadata,
      ...metadata,
    },
    score,
  };
}

export async function retrieveRelevantChunks(
  input: RetrieveRelevantChunksInput,
): Promise<RetrievedChunk[]> {
  if (!input.accessContext || !input.query.trim()) return [];

  const matchCount = input.matchCount ?? 8;
  const queryTokens = tokenizeRetrievalQuery(input.query);
  if (!queryTokens.length) return [];

  const preferredTokens = queryTokens.slice(0, 10);
  const supabase = input.accessContext.supabase;
  const selectedColumns =
    "id, document_id, content, metadata, project_id, chunk_index, documents(title, source_url, metadata, status)";

  let query = supabase
    .from("document_chunks")
    .select(selectedColumns)
    .eq("organization_id", input.organizationId)
    .limit(250);

  if (input.projectId) {
    query = query.or(`project_id.is.null,project_id.eq.${input.projectId}`);
  } else {
    query = query.is("project_id", null);
  }

  const contentFilters = preferredTokens
    .map((token) => `content.ilike.%${escapePostgrestLikeToken(token)}%`)
    .join(",");

  if (contentFilters) {
    query = query.or(contentFilters);
  }

  const result = await query;
  let rows = asRecords(result.data);

  if (result.error) {
    console.warn(
      "[assistant/rag] Chunk retrieval failed; trying unfiltered fallback",
      result.error.message,
    );

    let fallbackQuery = supabase
      .from("document_chunks")
      .select(selectedColumns)
      .eq("organization_id", input.organizationId)
      .limit(250);

    if (input.projectId) {
      fallbackQuery = fallbackQuery.or(
        `project_id.is.null,project_id.eq.${input.projectId}`,
      );
    } else {
      fallbackQuery = fallbackQuery.is("project_id", null);
    }

    const fallback = await fallbackQuery;
    if (fallback.error) {
      console.warn("[assistant/rag] Chunk fallback failed", fallback.error.message);
      return [];
    }
    rows = asRecords(fallback.data);
  }

  return rows
    .map((row) => normalizeRetrievedChunk(row, input.query, queryTokens))
    .filter((chunk): chunk is RetrievedChunk => Boolean(chunk))
    .sort((a, b) => b.score - a.score)
    .slice(0, matchCount);
}

export async function createChatAnswer(
  input: CreateChatAnswerInput,
): Promise<AssistantAnswer> {
  const lastUserMessage = [...input.messages]
    .reverse()
    .find((message) => message.role === "user")
    ?.content.trim();

  const projectContext =
    input.projectId && input.accessContext
      ? await loadProjectContext(
          input.accessContext,
          input.organizationId,
          input.projectId,
        )
      : null;
  const assistantKnowledge = input.accessContext
    ? await loadAssistantKnowledge(
        input.accessContext,
        input.organizationId,
        input.projectId ?? null,
      )
    : getDefaultAssistantKnowledge();
  const assistantKnowledgeBlock =
    formatAssistantKnowledgeForPrompt(assistantKnowledge);

  const chunks = await retrieveRelevantChunks({
    accessContext: input.accessContext,
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    userId: input.userId,
    query: lastUserMessage ?? "",
    matchCount: 8,
  });
  const documentReferences = await loadRelevantDocumentReferences({
    accessContext: input.accessContext,
    query: lastUserMessage ?? "",
    matchCount: 4,
  });
  const documentReferenceBlock =
    formatDocumentReferencesForPrompt(documentReferences);
  const materialDocumentQuery = [lastUserMessage, projectContext?.contextText]
    .filter(Boolean)
    .join("\n\n");
  const materialDocuments = await loadRelevantMaterialDocuments({
    accessContext: input.accessContext,
    query: materialDocumentQuery,
    matchCount: 6,
  });
  const materialDocumentBlock =
    formatMaterialDocumentsForPrompt(materialDocuments);

  const baseCitations = [
    ...(projectContext?.citations ?? []),
    ...chunks.map((chunk) => ({
      documentId: chunk.documentId,
      chunkId: chunk.id,
      title: chunk.title,
      excerpt: chunk.content.slice(0, 240),
      score: chunk.score,
    })),
    ...documentReferences.map((reference) => ({
      documentId: reference.docKey,
      title: reference.title,
      excerpt: `${reference.docType} / ${reference.subtype}. Tags: ${reference.tags.join(", ")}`,
    })),
    ...materialDocuments.map((reference) => ({
      documentId: reference.docKey,
      title: reference.documentTitle,
      excerpt: `${reference.manufacturer} / ${reference.productFamily}. Source: ${reference.sourceUrl}`,
    })),
  ];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const modelCandidates = Array.from(
    new Set(
      [
        process.env.ANTHROPIC_ASSISTANT_MODEL,
        "claude-sonnet-4-5-20250929",
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-20241022",
      ].filter(Boolean),
    ),
  ) as string[];

  if (apiKey) {
    const anthropic = new Anthropic({ apiKey });
    const conversation = input.messages
      .filter(
        (message) => message.role === "user" || message.role === "assistant",
      )
      .slice(-8)
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      }));

    const contextBlock = projectContext
      ? projectContext.contextText
      : "No project selected. Answer using general estimating knowledge and ask the user to select a project when project-specific data is needed.";

    const retrievalBlock = chunks.length
      ? chunks
          .map(
            (chunk, index) =>
              `SOURCE ${index + 1}: ${chunk.title}\n${chunk.content}`,
          )
          .join("\n\n")
      : "No uploaded knowledge chunks retrieved yet.";

    const system = [
      "You are Exterior Finishes AI, the internal assistant for Exterior Finishes.",
      "Exterior Finishes is a siding and exterior renovation company serving Western Washington.",
      "Be practical, direct, and estimator-focused.",
      "Use provided project context as the source of truth.",
      "Use approved company rules and task templates when drafting repetitive business documents.",
      "Use retrieved redacted document references for structure, phrasing patterns, section order, exclusions, and pricing-table style.",
      "Use manufacturer material documentation when answering product, Division 7, installation, proposal, RFI, scope, warranty-risk, and submittal questions.",
      "Do not invent manufacturer requirements. If documentation is missing or product-specific details are unclear, ask for the exact manufacturer document, spec section, or product data sheet.",
      "When manufacturer documentation affects estimating, call out scope impacts such as WRB/flashing, fasteners, clearances, substrate prep, trim/accessory systems, touch-up, finish, warranty risk, and exclusions.",
      "For proposals, contracts, change orders, RFIs, and client emails, follow the closest approved template.",
      "If data is missing, say what is missing and what to check next.",
      "When the user asks you to create a document, still provide a usable draft document body with placeholders such as [PRICE TBD] or [CLIENT NAME TBD] for missing noncritical fields.",
      "For document requests, put any Missing Information section before the draft, then include a clearly labeled Draft section.",
      "Do not invent quantities, prices, or project facts.",
      "Do not invent legal terms. For contract/service agreement requests, fill known fields and flag missing approved clauses.",
      "When useful, separate your answer into Findings, Risks, and Next Actions.",
    ].join("\n");
    const messages = [
      {
        role: "user",
        content: [
          "Use this project and retrieval context to answer the conversation.",
          "",
          assistantKnowledgeBlock,
          "",
          contextBlock,
          "",
          "RETRIEVED KNOWLEDGE",
          retrievalBlock,
          "",
          "DOCUMENT REFERENCES",
          documentReferenceBlock,
          "",
          "MANUFACTURER MATERIAL DOCUMENTATION",
          materialDocumentBlock,
          "",
          "CONVERSATION",
          ...conversation.map(
            (message) => `${message.role.toUpperCase()}: ${message.content}`,
          ),
        ].join("\n"),
      },
    ] as Anthropic.Messages.MessageParam[];

    let message: Anthropic.Messages.Message | null = null;
    let model = modelCandidates[0];
    let lastModelError: unknown = null;

    for (const candidate of modelCandidates) {
      try {
        message = await anthropic.messages.create({
          model: candidate,
          max_tokens: 1800,
          system,
          messages,
        });
        model = candidate;
        break;
      } catch (error) {
        lastModelError = error;
        if (!isAnthropicModelNotFound(error)) throw error;
      }
    }

    if (!message) {
      throw lastModelError instanceof Error
        ? lastModelError
        : new Error("No supported Anthropic model was available.");
    }

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return {
      model,
      content:
        text || "I could not produce a response from the available context.",
      citations: baseCitations,
    };
  }

  if (projectContext) {
    return {
      model: "assistant-project-context-stub",
      content: [
        "I loaded the selected project context successfully, but `ANTHROPIC_API_KEY` is not configured for chat responses.",
        `Assistant task knowledge loaded from ${assistantKnowledge.source}.`,
        `Document references matched: ${documentReferences.length}.`,
        `Material documentation matched: ${materialDocuments.length}.`,
        "Here is the project context I can use once the model key is available:",
        projectContext.contextText,
      ].join("\n\n"),
      citations: baseCitations,
    };
  }

  if (chunks.length > 0) {
    return {
      model: "assistant-rag-stub",
      content: [
        "I found relevant knowledge for this question, but the LLM answer generator is not connected yet.",
        `Assistant task knowledge loaded from ${assistantKnowledge.source}.`,
        `Document references matched: ${documentReferences.length}.`,
        `Material documentation matched: ${materialDocuments.length}.`,
        "The next step is to send retrieved chunks and chat history to the selected model.",
      ].join("\n\n"),
      citations: baseCitations,
    };
  }

  return {
    model: "assistant-rag-stub",
    content: [
      "I am ready to help with estimates, scopes, product questions, proposal language, and project notes.",
      `Assistant task knowledge loaded from ${assistantKnowledge.source}.`,
      `Document references matched: ${documentReferences.length}.`,
      `Material documentation matched: ${materialDocuments.length}.`,
      "Knowledge retrieval and the external model call are stubbed right now, so this response is not using uploaded documents yet.",
      lastUserMessage
        ? `Your question: ${lastUserMessage}`
        : "Start by asking a project or estimating question.",
    ].join("\n\n"),
    citations: baseCitations,
  };
}
