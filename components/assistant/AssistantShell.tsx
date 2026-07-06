"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Send,
  Settings2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UserMenu } from "@/components/layout/UserMenu";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { assistantProposalToEstimateContent } from "@/lib/estimates/convert";
import { createEstimate } from "@/lib/supabase/estimates";
import type {
  AssistantAnswer,
  AssistantChatMessage,
  AssistantProposal,
} from "@/lib/assistant/types";

type LocalMessage = AssistantChatMessage & {
  id: string;
  citations?: AssistantAnswer["citations"];
  model?: string;
  proposal?: AssistantProposal | null;
  assumptions?: string[];
  exclusions?: string[];
};

const starterPrompts = [
  "Draft a siding scope for a James Hardie project",
  "Summarize the estimate risks I should check",
  "Create proposal language for a change order",
];

const templateCards = [
  {
    name: "Scope Review",
    description: "Check an estimate for missing siding, trim, and accessory scope.",
  },
  {
    name: "Proposal Draft",
    description: "Turn project facts into client-ready proposal language.",
  },
  {
    name: "Product QA",
    description: "Compare product selections against company standards.",
  },
];

export function AssistantShell() {
  const { organization, canEdit } = useOrganization();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "What estimate, scope, product, or proposal question should we work through?",
      createdAt: new Date().toISOString(),
      citations: [],
      model: "local",
    },
  ]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const latestCitations = useMemo(
    () => [...messages].reverse().find((message) => message.citations?.length)?.citations ?? [],
    [messages]
  );

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const content = input.trim();

    if (!content || !organization || isSending) return;

    const userMessage: LocalMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: organization.id,
          projectId: null,
          messages: nextMessages.map(({ role, content, createdAt }) => ({
            role,
            content,
            createdAt,
          })),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Assistant request failed");
      }

      const answer = payload as AssistantAnswer;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer.content,
          citations: answer.citations,
          model: answer.model,
          proposal: answer.proposal ?? null,
          assumptions: answer.assumptions ?? [],
          exclusions: answer.exclusions ?? [],
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Assistant chat error:", error);
      toast.error("Assistant request failed", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setInput(content);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleConvertToProposal = async (message: LocalMessage) => {
    if (!organization || !message.proposal || convertingId) return;
    setConvertingId(message.id);
    try {
      const detail = await createEstimate(
        organization.id,
        assistantProposalToEstimateContent({
          proposal: message.proposal,
          assumptions: message.assumptions ?? [],
          exclusions: message.exclusions ?? [],
          projectId: null,
        })
      );
      toast.success("Proposal created", {
        description: "Set pricing and line items, then generate a document.",
      });
      router.push(`/proposals/${detail.estimate.id}`);
    } catch (error) {
      toast.error("Could not create proposal", {
        description: error instanceof Error ? error.message : undefined,
      });
      setConvertingId(null);
    }
  };

  const handleStarterPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const handleNewChat = () => {
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "What estimate, scope, product, or proposal question should we work through?",
        createdAt: new Date().toISOString(),
        citations: [],
        model: "local",
      },
    ]);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a]">
      <div className="mx-auto flex min-h-screen max-w-[1920px] flex-col px-3 py-4 sm:px-5 lg:px-6">
        <header className="mb-5 flex flex-col gap-4 border-b border-[#e2e8f0] pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/project"
              className="inline-flex items-center text-sm text-[#64748b] transition-colors hover:text-[#0f172a]"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#dcfce7] text-[#00b35e]">
                <Bot className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-3xl font-bold tracking-tight font-heading">AI Assistant</h1>
                <p className="truncate text-sm text-[#64748b]">{organization?.name ?? "Company workspace"}</p>
              </div>
            </div>
          </div>
          <UserMenu />
        </header>

        <Tabs defaultValue="chat" className="min-h-0 flex-1">
          <TabsList className="grid h-auto w-full max-w-3xl grid-cols-2 gap-1 p-1 sm:grid-cols-4">
            <TabsTrigger value="chat" className="h-10">
              <MessageSquare className="h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="h-10">
              <BookOpen className="h-4 w-4" />
              Knowledge
            </TabsTrigger>
            <TabsTrigger value="rules" className="h-10">
              <Save className="h-4 w-4" />
              Rules
            </TabsTrigger>
            <TabsTrigger value="templates" className="h-10">
              <Settings2 className="h-4 w-4" />
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-5 min-h-0">
            <div className="grid min-h-[calc(100vh-190px)] gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
              <aside className="hidden border-r border-[#e2e8f0] pr-4 lg:block">
                <Button className="mb-4 w-full" type="button" onClick={handleNewChat}>
                  <Plus className="h-4 w-4" />
                  New Chat
                </Button>
                <div className="space-y-2">
                  <button className="w-full rounded-md border border-[#e2e8f0] bg-white px-3 py-3 text-left text-sm shadow-sm">
                    <span className="block font-medium text-[#0f172a]">Company assistant</span>
                    <span className="mt-1 block truncate text-xs text-[#64748b]">Global knowledge</span>
                  </button>
                </div>
              </aside>

              <main className="flex min-h-[620px] flex-col overflow-hidden rounded-md border border-[#e2e8f0] bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-3">
                  <div>
                    <p className="font-medium">Global chat</p>
                    <p className="text-xs text-[#64748b]">Company knowledge scope</p>
                  </div>
                  <Badge variant="outline">MVP</Badge>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                    >
                      <div
                        className={
                          message.role === "user"
                            ? "max-w-[82%] rounded-md bg-[#00cc6a] px-4 py-3 text-sm leading-6 text-white"
                            : "max-w-[86%] rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-sm leading-6 text-[#0f172a]"
                        }
                      >
                        <div className="whitespace-pre-wrap">{message.content}</div>
                        {message.role === "assistant" && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button size="icon-sm" variant="ghost" type="button" aria-label="Helpful">
                              <ThumbsUp className="h-4 w-4" />
                            </Button>
                            <Button size="icon-sm" variant="ghost" type="button" aria-label="Not helpful">
                              <ThumbsDown className="h-4 w-4" />
                            </Button>
                            {message.proposal && canEdit && (
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                disabled={convertingId !== null}
                                onClick={() => void handleConvertToProposal(message)}
                              >
                                {convertingId === message.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <FileSpreadsheet className="h-4 w-4" />
                                )}
                                Convert to proposal
                              </Button>
                            )}
                            {message.model && (
                              <span className="text-xs text-[#94a3b8]">{message.model}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {messages.length === 1 && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {starterPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => handleStarterPrompt(prompt)}
                          className="rounded-md border border-[#e2e8f0] bg-white p-3 text-left text-sm text-[#334155] shadow-sm transition-colors hover:bg-[#f8fafc]"
                        >
                          <Sparkles className="mb-2 h-4 w-4 text-[#00b35e]" />
                          {prompt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="border-t border-[#e2e8f0] bg-white p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      ref={inputRef}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Ask about an estimate, scope, project, product, or proposal..."
                      className="max-h-40 min-h-12 resize-none bg-white"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleSubmit();
                        }
                      }}
                    />
                    <Button type="submit" size="icon" disabled={!input.trim() || isSending || !organization}>
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </form>
              </main>

              <aside className="rounded-md border border-[#e2e8f0] bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-medium">Sources</h2>
                  <Badge variant="secondary">{latestCitations.length}</Badge>
                </div>
                {latestCitations.length > 0 ? (
                  <div className="space-y-3">
                    {latestCitations.map((citation) => (
                      <div key={`${citation.documentId}-${citation.chunkId}`} className="rounded-md border border-[#e2e8f0] p-3">
                        <p className="text-sm font-medium">{citation.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[#64748b]">{citation.excerpt}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={FileText}
                    title="No sources"
                    description="No sources linked to this answer."
                    className="border-dashed p-6"
                  />
                )}
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="knowledge" className="mt-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <EmptyState
                icon={FolderOpen}
                title="No documents"
                description="Company references will appear here."
                action={{
                  label: "Upload",
                  onClick: () => toast.info("Document upload is not available yet."),
                }}
                className="min-h-[440px]"
              />
              <Card>
                <CardHeader>
                  <CardTitle>Collections</CardTitle>
                  <CardDescription>Company, project, rules, and templates</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {["Company Brain", "Project Brain", "Core Siding Brain"].map((name) => (
                    <div key={name} className="rounded-md border border-[#e2e8f0] px-3 py-2 text-sm">
                      {name}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    className="w-full"
                    type="button"
                    onClick={() => toast.info("Document upload is not available yet.")}
                  >
                    <Upload className="h-4 w-4" />
                    Add Document
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="rules" className="mt-5">
            <EmptyState
              icon={Save}
              title="No saved rules"
              description="Saved estimating guidance will appear here."
              action={{
                label: "New Rule",
                onClick: () => toast.info("Rule creation is not available yet."),
              }}
              className="min-h-[440px]"
            />
          </TabsContent>

          <TabsContent value="templates" className="mt-5">
            <div className="grid gap-4 md:grid-cols-3">
              {templateCards.map((template) => (
                <Card key={template.name}>
                  <CardHeader>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      className="w-full"
                      type="button"
                      onClick={() => toast.info("Template execution is not available yet.")}
                    >
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
