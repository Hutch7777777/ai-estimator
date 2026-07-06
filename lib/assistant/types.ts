export type AssistantScope = "global" | "project";

export type AssistantMessageRole = "system" | "user" | "assistant" | "tool";

export type KnowledgeDocumentStatus =
  | "uploaded"
  | "extracting"
  | "chunking"
  | "embedding"
  | "ready"
  | "error";

export interface AssistantChatMessage {
  id?: string;
  role: AssistantMessageRole;
  content: string;
  createdAt?: string;
}

export interface AssistantCitation {
  documentId?: string;
  chunkId?: string;
  title: string;
  excerpt: string;
  score?: number;
}

export interface AssistantAnswer {
  content: string;
  citations: AssistantCitation[];
  model: string;
}

export interface KnowledgeDocument {
  id: string;
  organizationId: string;
  projectId: string | null;
  title: string;
  fileName: string | null;
  status: KnowledgeDocumentStatus;
  createdAt: string;
}

export interface DocumentChunkDraft {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface AssistantProjectOption {
  id: string;
  name: string;
  clientName: string | null;
  address: string | null;
  status: string | null;
  selectedTrades: string[];
  createdAt: string | null;
}
