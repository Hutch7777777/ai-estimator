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

export type AssistantConfidence = "low" | "medium" | "high";

/** A draft estimate suggested by the assistant (money in integer cents). */
export interface AssistantProposal {
  title: string;
  summary: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitCostCents: number;
  }>;
}

export interface AssistantAnswer {
  content: string;
  citations: AssistantCitation[];
  model: string;
  /** Present when the answer engine ran (grounded or mock). */
  assumptions?: string[];
  exclusions?: string[];
  unresolvedQuestions?: string[];
  confidence?: AssistantConfidence;
  /** Set when the question asked for costs/pricing; convertible to a proposal. */
  proposal?: AssistantProposal | null;
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
