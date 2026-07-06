import { z } from "zod";
import type {
  AssistantAnswer,
  AssistantChatMessage,
  AssistantConfidence,
  RetrievedChunk,
} from "@/lib/assistant/types";

/**
 * The grounded answer engine behind createChatAnswer. Server-side only
 * (called from the /api/assistant/chat route handler).
 *
 * With OPENAI_API_KEY set it calls OpenAI (chat completions, JSON mode);
 * without it, a deterministic mock produces schema-valid answers from the
 * retrieved chunks so the feature is exercisable end to end.
 *
 * Structural guarantees regardless of what the model says:
 *   - citations can only reference chunks that were actually retrieved
 *   - reported confidence is capped by retrieval quality
 *   - proposals are bounds-checked; a bad proposal degrades to null
 *   - malformed model output degrades to a plain answer, never an error
 */

const PROPOSAL_TRIGGER = /estimate|cost|price|bid|quote|proposal/i;
const SNIPPET_CHARS = 240;

const proposalSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(4000).default(""),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.number().positive().finite().max(1_000_000),
        unit: z.string().min(1).max(32),
        unitCostCents: z.number().int().min(0).max(1_000_000_000),
      })
    )
    .min(1)
    .max(100),
});

const answerSchema = z.object({
  answer: z.string().min(1),
  citedSources: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
  confidence: z.enum(["low", "medium", "high"]).default("low"),
  proposal: z.unknown().nullish(),
});

export function buildAssistantPrompt(input: {
  question: string;
  history: AssistantChatMessage[];
  chunks: RetrievedChunk[];
}): { system: string; user: string } {
  const system = [
    "You are an estimating assistant for a construction contractor.",
    "Answer ONLY from the excerpts in the CONTEXT block. If the context is insufficient, say so plainly and add what is missing to unresolvedQuestions.",
    'Cite every factual claim using the bracketed source keys, e.g. [S1], and list the keys you used in "citedSources".',
    'When the user asks for an estimate, cost, price, bid, quote, or proposal, include a draft in "proposal"; otherwise set proposal to null.',
    "All money amounts must be integer cents in unitCostCents. Do not include computed totals.",
    "Respond with a single JSON object and no prose outside it, using exactly this shape:",
    '{ "answer": string, "citedSources": string[], "assumptions": string[], "exclusions": string[], "unresolvedQuestions": string[], "confidence": "low" | "medium" | "high", "proposal": null | { "title": string, "summary": string, "lineItems": [{ "description": string, "quantity": number, "unit": string, "unitCostCents": number }] } }',
  ].join("\n");

  const contextBlock =
    input.chunks.length === 0
      ? "(no relevant excerpts were found)"
      : input.chunks
          .map(
            (chunk, index) =>
              `[S${index + 1}] Document: "${chunk.title.replace(/["\n\r]+/g, "'")}"\n${chunk.content}`
          )
          .join("\n\n");

  const historyBlock =
    input.history.length === 0
      ? "(no earlier messages)"
      : input.history
          .map((message) => `${message.role}: ${message.content}`)
          .join("\n");

  const user = [
    "CONTEXT:",
    contextBlock,
    "",
    "CONVERSATION:",
    historyBlock,
    "",
    `QUESTION: ${input.question}`,
  ].join("\n");

  return { system, user };
}

async function completeWithOpenAi(
  apiKey: string,
  prompt: { system: string; user: string }
): Promise<{ text: string; model: string }> {
  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });
  if (!response.ok) {
    console.error(
      `assistant: OpenAI chat completion failed with status ${response.status}`
    );
    throw new Error("The language model request failed. Please try again.");
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("The language model returned an empty response.");
  }
  return { text, model };
}

/** Deterministic stand-in used when OPENAI_API_KEY is not configured. */
function completeWithMock(prompt: { user: string }): { text: string; model: string } {
  const sources = [...prompt.user.matchAll(/\[S(\d+)\] Document: "([^"]+)"/g)].map(
    (match) => ({ key: `S${match[1]}`, title: match[2] })
  );
  const question = /QUESTION:\s*([^\n]+)/.exec(prompt.user)?.[1]?.trim() ?? "";
  const wantsProposal = PROPOSAL_TRIGGER.test(question);

  if (sources.length === 0) {
    return {
      model: "assistant-mock (set OPENAI_API_KEY for grounded answers)",
      text: JSON.stringify({
        answer: `I could not find relevant company documents to ground an answer to: "${question}". Once knowledge documents are uploaded and embedded, answers will cite them.`,
        citedSources: [],
        assumptions: [],
        exclusions: [],
        unresolvedQuestions: [
          "No embedded knowledge documents matched this question.",
        ],
        confidence: "low",
        proposal: wantsProposal
          ? {
              title: `Draft proposal: ${question.slice(0, 80)}`,
              summary:
                "Placeholder line items — replace quantities and costs in the proposal editor.",
              lineItems: [
                { description: "Labor", quantity: 8, unit: "hr", unitCostCents: 8500 },
                { description: "Materials allowance", quantity: 1, unit: "ls", unitCostCents: 50000 },
              ],
            }
          : null,
      }),
    };
  }

  const cited = sources.slice(0, 3);
  return {
    model: "assistant-mock (set OPENAI_API_KEY for grounded answers)",
    text: JSON.stringify({
      answer:
        `Based on ${cited.map((source) => `"${source.title}" [${source.key}]`).join(", ")}, ` +
        `here is what your documents support for: "${question}"` +
        (wantsProposal
          ? " A draft proposal assembled from those figures is attached."
          : ""),
      citedSources: cited.map((source) => source.key),
      assumptions: ["Pricing reflects the cited documents without adjustment."],
      exclusions: ["Anything not covered by the cited documents."],
      unresolvedQuestions: wantsProposal
        ? ["Confirm measured quantities before sending."]
        : [],
      confidence: "medium",
      proposal: wantsProposal
        ? {
            title: `Draft proposal: ${question.slice(0, 80)}`,
            summary: "Preliminary figures from cited documents; verify in the editor.",
            lineItems: [
              { description: "Scope per cited documents", quantity: 1, unit: "ls", unitCostCents: 250000 },
              { description: "Labor", quantity: 16, unit: "hr", unitCostCents: 8500 },
            ],
          }
        : null,
    }),
  };
}

function retrievalConfidence(chunks: RetrievedChunk[]): AssistantConfidence {
  if (chunks.length === 0) return "low";
  const mean =
    chunks.reduce((sum, chunk) => sum + (chunk.score ?? 0), 0) / chunks.length;
  if (chunks.length >= 3 && mean >= 0.75) return "high";
  if (mean >= 0.55) return "medium";
  return "low";
}

const CONFIDENCE_ORDER: Record<AssistantConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export async function generateAssistantAnswer(input: {
  question: string;
  history: AssistantChatMessage[];
  chunks: RetrievedChunk[];
}): Promise<AssistantAnswer> {
  const prompt = buildAssistantPrompt(input);
  const apiKey = process.env.OPENAI_API_KEY;
  const { text, model } = apiKey
    ? await completeWithOpenAi(apiKey, prompt)
    : completeWithMock(prompt);

  // Defensive parse: model output must never crash the request.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let parsed: z.infer<typeof answerSchema> | null = null;
  if (start !== -1 && end > start) {
    try {
      const result = answerSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
      if (result.success) parsed = result.data;
    } catch {
      parsed = null;
    }
  }
  if (!parsed) {
    return {
      content: text.trim() || "The assistant did not return a usable answer.",
      citations: [],
      model,
      assumptions: [],
      exclusions: [],
      unresolvedQuestions: [
        "The assistant response could not be fully structured; verify details manually.",
      ],
      confidence: "low",
      proposal: null,
    };
  }

  // Citations restricted to actually-retrieved chunks (unknown keys dropped).
  const citations = parsed.citedSources.flatMap((key) => {
    const match = /^S(\d+)$/.exec(key.trim());
    const chunk = match ? input.chunks[Number(match[1]) - 1] : undefined;
    return chunk
      ? [
          {
            documentId: chunk.documentId,
            chunkId: chunk.id,
            title: chunk.title,
            excerpt:
              chunk.content.length > SNIPPET_CHARS
                ? `${chunk.content.slice(0, SNIPPET_CHARS)}…`
                : chunk.content,
            score: chunk.score,
          },
        ]
      : [];
  });

  const cap = retrievalConfidence(input.chunks);
  const confidence: AssistantConfidence =
    CONFIDENCE_ORDER[parsed.confidence] <= CONFIDENCE_ORDER[cap]
      ? parsed.confidence
      : cap;

  const proposalParse = proposalSchema.safeParse(parsed.proposal ?? null);
  return {
    content: parsed.answer,
    citations,
    model,
    assumptions: parsed.assumptions,
    exclusions: parsed.exclusions,
    unresolvedQuestions: parsed.unresolvedQuestions,
    confidence,
    proposal: proposalParse.success ? proposalParse.data : null,
  };
}

/** Embeds a query for retrieval; null when OPENAI_API_KEY is not set. */
export async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: text,
    }),
  });
  if (!response.ok) {
    console.error(`assistant: OpenAI embedding failed with status ${response.status}`);
    return null;
  }
  const json = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  return json.data?.[0]?.embedding ?? null;
}
