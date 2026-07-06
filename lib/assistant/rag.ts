import { embedQuery, generateAssistantAnswer } from "@/lib/assistant/engine";
import { createClient } from "@/lib/supabase/server";
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
}

export interface CreateChatAnswerInput extends ScopedAssistantInput {
  threadId?: string | null;
  messages: AssistantChatMessage[];
}

export async function uploadKnowledgeDocument(
  input: UploadKnowledgeDocumentInput
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
  input: ExtractDocumentTextInput
): Promise<string> {
  // TODO: Extract text by MIME type. PDF, DOCX, XLSX, and TXT should be handled here.
  void input;
  return "";
}

export function chunkDocumentText(input: ChunkDocumentTextInput): DocumentChunkDraft[] {
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
  input: EmbedDocumentChunksInput
): Promise<void> {
  // TODO: Generate embeddings, then update document_chunks.embedding in Supabase.
  void input;
}

export async function retrieveRelevantChunks(
  input: RetrieveRelevantChunksInput
): Promise<RetrievedChunk[]> {
  // Retrieval needs a real query embedding; without OPENAI_API_KEY there is
  // nothing meaningful to match against embedded chunks, so return none
  // (the answer engine then responds in mock mode).
  if (!input.query.trim()) return [];
  const embedding = await embedQuery(input.query);
  if (!embedding) return [];

  const supabase = await createClient();
  type MatchRow = {
    id: string;
    document_id: string;
    content: string;
    metadata: Record<string, unknown> | null;
    similarity: number;
  };
  // The handwritten Database type has no Functions map; contain the cast
  // here with a real signature (codebase precedent).
  const call = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: MatchRow[] | null; error: { message: string } | null }>;
  const { data, error } = await call("match_document_chunks", {
    query_embedding: JSON.stringify(embedding),
    match_organization_id: input.organizationId,
    match_project_id: input.projectId ?? null,
    match_count: input.matchCount ?? 8,
  });
  if (error) {
    console.error("assistant: match_document_chunks failed:", error.message);
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // The match function returns no titles; resolve them in one query.
  const documentIds = [...new Set(rows.map((row) => row.document_id))];
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title")
    .in("id", documentIds);
  const documentRows = (documents ?? []) as Array<{ id: string; title: string }>;
  const titles = new Map(documentRows.map((doc) => [doc.id, doc.title]));

  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    title: titles.get(row.document_id) ?? "Document",
    content: row.content,
    metadata: row.metadata ?? {},
    score: row.similarity,
  }));
}

export async function createChatAnswer(
  input: CreateChatAnswerInput
): Promise<AssistantAnswer> {
  const lastUserMessage =
    [...input.messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.content.trim() ?? "";

  const chunks = await retrieveRelevantChunks({
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    userId: input.userId,
    query: lastUserMessage,
    matchCount: 8,
  });

  const history = input.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(0, -1)
    .slice(-12);

  return generateAssistantAnswer({ question: lastUserMessage, history, chunks });
}
