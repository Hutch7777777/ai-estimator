"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Bot,
  BookOpen,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useOrganization } from "@/lib/hooks/useOrganization";
import type { AssistantAnswer, AssistantChatMessage, AssistantProjectOption } from "@/lib/assistant/types";

type LocalMessage = AssistantChatMessage & {
  id: string;
  citations?: AssistantAnswer["citations"];
  model?: string;
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
  const { organization } = useOrganization();
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [projects, setProjects] = useState<AssistantProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("global");
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

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    if (!organization?.id) {
      setProjects([]);
      setSelectedProjectId("global");
      return;
    }

    let isMounted = true;

    async function loadProjects() {
      try {
        setProjectsLoading(true);
        const response = await fetch(`/api/assistant/projects?organizationId=${organization?.id}`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load projects");
        }

        if (isMounted) {
          setProjects(Array.isArray(payload.projects) ? payload.projects : []);
        }
      } catch (error) {
        console.error("Assistant project load error:", error);
        if (isMounted) {
          toast.error("Could not load projects for the assistant");
        }
      } finally {
        if (isMounted) {
          setProjectsLoading(false);
        }
      }
    }

    void loadProjects();

    return () => {
      isMounted = false;
    };
  }, [organization?.id]);

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
          projectId: selectedProjectId === "global" ? null : selectedProjectId,
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
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[1600px] flex-col px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-brand/10 text-brand">
            <Bot className="h-6 w-6" />
          </div>
          <h1 className="text-title font-heading">AI Assistant</h1>
          <p className="text-muted-foreground">{organization?.name ?? "Company workspace"}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-[280px]">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId} disabled={projectsLoading}>
              <SelectTrigger className="h-10 w-full bg-background">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder={projectsLoading ? "Loading projects..." : "Global assistant"} />
              </SelectTrigger>
              <SelectContent align="end" className="max-h-80">
                <SelectItem value="global">Global assistant</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
      </div>

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
          <div className="grid min-h-[calc(100vh-230px)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <main className="flex min-h-[620px] flex-col overflow-hidden rounded-md border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <p className="font-medium">{selectedProject ? "Project chat" : "Global chat"}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedProject
                      ? `${selectedProject.name}${selectedProject.address ? ` | ${selectedProject.address}` : ""}`
                      : "Company knowledge scope"}
                  </p>
                </div>
                <Badge variant={selectedProject ? "success" : "outline"}>
                  {selectedProject ? "Project context" : "Global"}
                </Badge>
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
                          ? "max-w-[82%] rounded-md bg-brand px-4 py-3 text-sm leading-6 text-white"
                          : "max-w-[86%] rounded-md border bg-muted/40 px-4 py-3 text-sm leading-6 text-foreground"
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
                          {message.model && (
                            <span className="text-xs text-muted-foreground">{message.model}</span>
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
                        className="rounded-md border bg-background p-3 text-left text-sm text-foreground shadow-sm transition-colors hover:bg-muted"
                      >
                        <Sparkles className="mb-2 h-4 w-4 text-brand" />
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="border-t bg-card p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask about an estimate, scope, project, product, or proposal..."
                    className="max-h-40 min-h-12 resize-none bg-background"
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

            <aside className="rounded-md border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-medium">Sources</h2>
                <Badge variant="secondary">{latestCitations.length}</Badge>
              </div>
              {latestCitations.length > 0 ? (
                <div className="space-y-3">
                  {latestCitations.map((citation) => (
                    <div key={`${citation.documentId}-${citation.chunkId}`} className="rounded-md border p-3">
                      <p className="text-sm font-medium">{citation.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{citation.excerpt}</p>
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
                  <div key={name} className="rounded-md border px-3 py-2 text-sm">
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
  );
}
