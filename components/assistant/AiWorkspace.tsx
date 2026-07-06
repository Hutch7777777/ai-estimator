"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Briefcase,
  CheckCircle2,
  FileDown,
  FileText,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Send,
  Settings2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultAssistantTaskTemplates,
  type AssistantTaskTemplateSeed,
} from "@/lib/assistant/default-knowledge";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { cn } from "@/lib/utils";
import type {
  AssistantAnswer,
  AssistantChatMessage,
  AssistantProjectOption,
} from "@/lib/assistant/types";

type LocalMessage = AssistantChatMessage & {
  id: string;
  citations?: AssistantAnswer["citations"];
  model?: string;
};

type DocumentExportFormat = "docx" | "pdf" | "rtf";

interface LocalThread {
  id: string;
  title: string;
  projectId: string;
  updatedAt: string;
}

const GLOBAL_PROJECT_ID = "global";
const INITIAL_THREAD_ID = "thread-start";
const AI_BRAND_NAME = "Exterior Finishes AI";
const AI_BRAND_COMPANY = "Exterior Finishes";
const AI_LOGO_WHITE_URL =
  "https://www.extfinishes.com/Userfiles/template/logo-white.svg";

const initialWelcomeMessage: LocalMessage = {
  id: "welcome-start",
  role: "assistant",
  content: "What estimate, scope, product, or proposal should we work through?",
  createdAt: "",
  citations: [],
  model: AI_BRAND_NAME,
};

const primaryTaskKeys = [
  "proposal_single_client_reside",
  "change_order_fixed_price",
  "contract_service_agreement",
  "rfi_list",
];

const primaryTasks = primaryTaskKeys
  .map((key) =>
    defaultAssistantTaskTemplates.find(
      (template) => template.templateKey === key,
    ),
  )
  .filter(Boolean) as AssistantTaskTemplateSeed[];

function createWelcomeMessage(): LocalMessage {
  return {
    ...initialWelcomeMessage,
    id: crypto.randomUUID(),
  };
}

function createThread(projectId: string): LocalThread {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    projectId,
    updatedAt: new Date().toISOString(),
  };
}

function createThreadTitle(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 42
    ? `${normalized.slice(0, 42)}...`
    : normalized || "New chat";
}

function formatProjectLabel(project: AssistantProjectOption): string {
  return [project.name, project.address].filter(Boolean).join(" - ");
}

function getTradeLabel(project: AssistantProjectOption | null): string {
  if (!project?.selectedTrades.length) return "No trades selected";
  return project.selectedTrades.join(", ");
}

function isDocumentDraftMessage(message: LocalMessage): boolean {
  if (message.role !== "assistant" || message.content.length < 500)
    return false;

  const content = message.content.toLowerCase();
  const markers = [
    "proposal",
    "change order",
    "service agreement",
    "contract",
    "scope of work",
    "payment terms",
    "missing information",
    "recommended next actions",
  ];
  const markerCount = markers.filter((marker) =>
    content.includes(marker),
  ).length;

  return (
    markerCount >= 2 ||
    /^#{1,3}\s+(proposal|change order|service agreement|contract|missing information)/im.test(
      message.content,
    )
  );
}

function getDocumentDraftLabel(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes("service agreement") || lower.includes("contract"))
    return "Agreement draft";
  if (lower.includes("proposal")) return "Proposal draft";
  if (lower.includes("change order")) return "Change order draft";
  if (lower.includes("rfi")) return "RFI draft";
  return "Document draft";
}

export function AiWorkspace() {
  const { organization } = useOrganization();
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [exportingDocumentKey, setExportingDocumentKey] = useState<
    string | null
  >(null);
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [projects, setProjects] = useState<AssistantProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(GLOBAL_PROJECT_ID);
  const [threads, setThreads] = useState<LocalThread[]>([
    {
      id: INITIAL_THREAD_ID,
      title: "New chat",
      projectId: GLOBAL_PROJECT_ID,
      updatedAt: "",
    },
  ]);
  const [activeThreadId, setActiveThreadId] = useState(INITIAL_THREAD_ID);
  const [threadMessages, setThreadMessages] = useState<
    Record<string, LocalMessage[]>
  >({
    [INITIAL_THREAD_ID]: [initialWelcomeMessage],
  });
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeMessages = useMemo(
    () => threadMessages[activeThreadId] ?? [initialWelcomeMessage],
    [activeThreadId, threadMessages],
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const latestCitations = useMemo(
    () =>
      [...activeMessages].reverse().find((message) => message.citations?.length)
        ?.citations ?? [],
    [activeMessages],
  );
  const hasConversation = !(
    activeMessages.length === 1 && activeMessages[0]?.role === "assistant"
  );

  useEffect(() => {
    if (!organization?.id) {
      setProjects([]);
      setSelectedProjectId(GLOBAL_PROJECT_ID);
      return;
    }

    let isMounted = true;

    async function loadProjects() {
      try {
        setProjectsLoading(true);
        const response = await fetch(
          `/api/assistant/projects?organizationId=${organization?.id}`,
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load projects");
        }

        if (isMounted) {
          setProjects(Array.isArray(payload.projects) ? payload.projects : []);
        }
      } catch (error) {
        console.error("AI workspace project load error:", error);
        if (isMounted) {
          toast.error("Could not load projects");
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

  const updateThread = (threadId: string, changes: Partial<LocalThread>) => {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === threadId ? { ...thread, ...changes } : thread,
      ),
    );
  };

  const setMessagesForThread = (
    threadId: string,
    updater: (messages: LocalMessage[]) => LocalMessage[],
  ) => {
    setThreadMessages((current) => ({
      ...current,
      [threadId]: updater(current[threadId] ?? [createWelcomeMessage()]),
    }));
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    updateThread(activeThreadId, {
      projectId,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleNewChat = () => {
    const thread = createThread(selectedProjectId);
    setThreads((current) => [thread, ...current]);
    setThreadMessages((current) => ({
      ...current,
      [thread.id]: [createWelcomeMessage()],
    }));
    setActiveThreadId(thread.id);
    setInput("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleThreadSelect = (thread: LocalThread) => {
    setActiveThreadId(thread.id);
    setSelectedProjectId(thread.projectId);
    setInput("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const content = input.trim();

    if (!content || !organization || isSending) return;

    const requestThreadId = activeThreadId;
    const conversationMessages =
      activeMessages.length === 1 && activeMessages[0]?.role === "assistant"
        ? []
        : activeMessages;
    const userMessage: LocalMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...conversationMessages, userMessage];

    setMessagesForThread(requestThreadId, () => nextMessages);
    setThreads((current) =>
      current.map((thread) =>
        thread.id === requestThreadId
          ? {
              ...thread,
              title:
                thread.title === "New chat"
                  ? createThreadTitle(content)
                  : thread.title,
              projectId: selectedProjectId,
              updatedAt: new Date().toISOString(),
            }
          : thread,
      ),
    );
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: organization.id,
          projectId:
            selectedProjectId === GLOBAL_PROJECT_ID ? null : selectedProjectId,
          messages: nextMessages.map(({ role, content, createdAt }) => ({
            role,
            content,
            createdAt,
          })),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.details || payload?.error || "Assistant request failed",
        );
      }

      const answer = payload as AssistantAnswer;
      setMessagesForThread(requestThreadId, (current) => [
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
      updateThread(requestThreadId, { updatedAt: new Date().toISOString() });
    } catch (error) {
      console.error("AI workspace chat error:", error);
      toast.error("Assistant request failed", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
      setMessagesForThread(requestThreadId, (current) =>
        current.filter((message) => message.id !== userMessage.id),
      );
      setInput(content);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleTaskPrompt = (task: AssistantTaskTemplateSeed) => {
    setInput(task.userPrompt);
    inputRef.current?.focus();
  };

  const toggleDocumentText = (messageId: string) => {
    setExpandedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleDownloadDocument = async (
    message: LocalMessage,
    format: DocumentExportFormat,
  ) => {
    if (!organization || exportingDocumentKey) return;

    const activeThread = threads.find((thread) => thread.id === activeThreadId);
    const title =
      activeThread?.title && activeThread.title !== "New chat"
        ? activeThread.title
        : `${selectedProject?.name ?? AI_BRAND_NAME} Draft`;
    const exportKey = `${message.id}:${format}`;

    try {
      setExportingDocumentKey(exportKey);
      const response = await fetch("/api/assistant/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: organization.id,
          projectId:
            selectedProjectId === GLOBAL_PROJECT_ID ? null : selectedProjectId,
          title,
          subtitle: selectedProject
            ? `${selectedProject.name} | ${selectedProject.address ?? "Address TBD"}`
            : "Company assistant",
          content: message.content,
          format,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Document export failed");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const filename =
        disposition?.match(/filename="([^"]+)"/)?.[1] ??
        `Exterior_Finishes_AI_Document.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded`, {
        description: filename,
      });
    } catch (error) {
      console.error("AI workspace document export error:", error);
      toast.error("Document export failed", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setExportingDocumentKey(null);
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-[#003E68] text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.08)]">
      <div className="flex h-20 items-center px-5">
        <span
          role="img"
          aria-label={AI_BRAND_COMPANY}
          className="block h-[58px] w-[150px] bg-contain bg-left bg-no-repeat"
          style={{ backgroundImage: `url(${AI_LOGO_WHITE_URL})` }}
        />
      </div>

      <div className="px-3 pb-4">
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-full justify-start border border-white/20 bg-white/10 text-white shadow-sm hover:border-white/30 hover:bg-white/15"
          onClick={handleNewChat}
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-xs font-medium text-white/55">Chats</p>
          <MessageSquare className="h-4 w-4 text-white/30" />
        </div>
        <div className="space-y-1">
          {threads.map((thread) => {
            const threadProject = projects.find(
              (project) => project.id === thread.projectId,
            );
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => handleThreadSelect(thread)}
                className={cn(
                  "w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                  thread.id === activeThreadId
                    ? "bg-white/[0.16] text-white shadow-sm"
                    : "text-white/75 hover:bg-white/10",
                )}
              >
                <span className="block truncate">{thread.title}</span>
                <span className="mt-0.5 block truncate text-xs text-white/40">
                  {threadProject?.name ?? "Company"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const settingsPanel = (
    <div className="flex h-full flex-col bg-background">
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle>Settings</SheetTitle>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Context</h2>
          </div>
          <Select
            value={selectedProjectId}
            onValueChange={handleProjectChange}
            disabled={projectsLoading}
          >
            <SelectTrigger className="h-11 bg-background">
              <SelectValue
                placeholder={
                  projectsLoading ? "Loading projects..." : "Company assistant"
                }
              />
            </SelectTrigger>
            <SelectContent align="start" className="max-h-80">
              <SelectItem value={GLOBAL_PROJECT_ID}>
                Company assistant
              </SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm leading-6 text-muted-foreground">
            {selectedProject
              ? formatProjectLabel(selectedProject)
              : "Company chats use Exterior Finishes context and general estimating guidance."}
          </p>
        </section>

        {selectedProject && (
          <section className="space-y-3">
            <h2 className="font-medium">Project Facts</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Client</p>
                <p className="truncate font-medium">
                  {selectedProject.clientName ?? "n/a"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="truncate font-medium">
                  {selectedProject.status ?? "n/a"}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="truncate font-medium">
                  {selectedProject.address ?? "n/a"}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Trades</p>
                <p className="truncate font-medium">
                  {getTradeLabel(selectedProject)}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Sources</h2>
            <Badge variant="secondary" className="ml-auto">
              {latestCitations.length}
            </Badge>
          </div>
          {latestCitations.length > 0 ? (
            <div className="space-y-2">
              {latestCitations.map((citation, index) => (
                <div
                  key={`${citation.documentId ?? "source"}-${citation.chunkId ?? index}`}
                  className="rounded-md border p-3"
                >
                  <p className="text-sm font-medium">{citation.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {citation.excerpt}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sources appear after a grounded answer.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#004D83]" />
            <h2 className="font-medium">Document Tasks</h2>
          </div>
          <div className="space-y-2">
            {defaultAssistantTaskTemplates.map((task) => (
              <button
                key={task.templateKey}
                type="button"
                onClick={() => handleTaskPrompt(task)}
                className="w-full rounded-md border border-[#D5E3ED] px-3 py-2 text-left text-sm transition-colors hover:border-[#004D83] hover:bg-[#E6F1F8]"
              >
                <span className="block font-medium">{task.name}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {task.description}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <aside className="hidden w-[260px] shrink-0 md:block">{sidebar}</aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between bg-background px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="md:hidden"
                  aria-label="Open chats"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="w-[310px] border-0 p-0"
              >
                {sidebar}
              </SheetContent>
            </Sheet>
            <Button
              variant="ghost"
              size="icon-sm"
              asChild
              aria-label="Back to dashboard"
              className="hidden sm:inline-flex"
            >
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-medium">
                  {AI_BRAND_NAME}
                </h1>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {selectedProject ? selectedProject.name : "Company assistant"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open settings"
                  className="text-[#004D83] hover:bg-[#E6F1F8] hover:text-[#004D83]"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[390px] p-0 sm:max-w-[390px]"
              >
                {settingsPanel}
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-6 sm:px-6">
              {!hasConversation ? (
                <div className="flex min-h-full flex-col items-center pb-20 pt-[18vh] text-center sm:pt-[20vh]">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[#E6F1F8] text-[#004D83]">
                    <Bot className="h-6 w-6" />
                  </div>
                  <h2 className="text-2xl font-medium tracking-normal sm:text-3xl">
                    How can I help?
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                    Start a proposal, change order, contract draft, RFI list, or
                    project review.
                  </p>
                  <div className="mt-7 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                    {primaryTasks.map((task) => (
                      <button
                        key={task.templateKey}
                        type="button"
                        onClick={() => handleTaskPrompt(task)}
                        className="rounded-md border border-[#D5E3ED] bg-white px-4 py-3 text-left text-sm shadow-sm transition-colors hover:border-[#004D83] hover:bg-[#E6F1F8]"
                      >
                        <span className="block font-medium">{task.name}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {task.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-7">
                  {activeMessages.map((message) => {
                    const isDocumentDraft = isDocumentDraftMessage(message);
                    const isExpanded = expandedDocumentIds.has(message.id);
                    const docxExportKey = `${message.id}:docx`;
                    const pdfExportKey = `${message.id}:pdf`;
                    const rtfExportKey = `${message.id}:rtf`;

                    return (
                      <div
                        key={message.id}
                        className={
                          message.role === "user"
                            ? "flex justify-end"
                            : "flex justify-start"
                        }
                      >
                        <div
                          className={cn(
                            "max-w-[86%] text-sm leading-6",
                            message.role === "user"
                              ? "rounded-2xl bg-[#E6F1F8] px-4 py-2.5 text-foreground"
                              : "text-foreground",
                          )}
                        >
                          {message.role === "assistant" && (
                            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Bot className="h-3.5 w-3.5" />
                              <span>{message.model ?? AI_BRAND_NAME}</span>
                              {message.citations?.length ? (
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-[#004D83]" />
                                  sourced
                                </span>
                              ) : null}
                            </div>
                          )}
                          {isDocumentDraft ? (
                            <div className="rounded-xl border border-[#D5E3ED] bg-white p-4 shadow-sm">
                              <div className="flex gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E6F1F8] text-[#004D83]">
                                  <FileText className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-foreground">
                                    {getDocumentDraftLabel(message.content)}{" "}
                                    ready
                                  </p>
                                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                    Export the draft without showing the full
                                    text in chat.
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="border-[#D5E3ED] text-[#004D83] hover:bg-[#E6F1F8] hover:text-[#004D83]"
                                  onClick={() =>
                                    void handleDownloadDocument(message, "pdf")
                                  }
                                  disabled={Boolean(exportingDocumentKey)}
                                >
                                  {exportingDocumentKey === pdfExportKey ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <FileText className="h-3.5 w-3.5" />
                                  )}
                                  PDF
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="border-[#D5E3ED] text-[#004D83] hover:bg-[#E6F1F8] hover:text-[#004D83]"
                                  onClick={() =>
                                    void handleDownloadDocument(message, "rtf")
                                  }
                                  disabled={Boolean(exportingDocumentKey)}
                                >
                                  {exportingDocumentKey === rtfExportKey ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <FileDown className="h-3.5 w-3.5" />
                                  )}
                                  RTF
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="border-[#D5E3ED] text-[#004D83] hover:bg-[#E6F1F8] hover:text-[#004D83]"
                                  onClick={() =>
                                    void handleDownloadDocument(message, "docx")
                                  }
                                  disabled={Boolean(exportingDocumentKey)}
                                >
                                  {exportingDocumentKey === docxExportKey ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <FileDown className="h-3.5 w-3.5" />
                                  )}
                                  Word
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:bg-[#E6F1F8] hover:text-[#004D83]"
                                  onClick={() => toggleDocumentText(message.id)}
                                >
                                  {isExpanded ? "Hide text" : "Show text"}
                                </Button>
                              </div>

                              {isExpanded && (
                                <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-md border border-[#D5E3ED] bg-[#F8FBFD] p-3 text-sm leading-6 text-foreground">
                                  <div className="whitespace-pre-wrap">
                                    {message.content}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap">
                              {message.content}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {isSending && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking
                    </div>
                  )}
                </div>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="shrink-0 bg-background px-4 pb-5 sm:px-6"
            >
              <div className="rounded-2xl border border-[#D5E3ED] bg-background p-2 shadow-[0_12px_40px_rgba(0,77,131,0.08)]">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={`Message ${AI_BRAND_NAME}`}
                  className="max-h-40 min-h-14 resize-none border-0 bg-transparent px-3 py-3 shadow-none focus-visible:ring-0"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSubmit();
                    }
                  }}
                />
                <div className="flex items-center justify-between px-2 pb-1">
                  <span className="truncate rounded-full bg-[#E6F1F8] px-2.5 py-1 text-xs font-medium text-[#004D83]">
                    {selectedProject
                      ? selectedProject.name
                      : "Company assistant"}
                  </span>
                  <Button
                    type="submit"
                    size="icon-sm"
                    className="bg-[#004D83] text-white hover:bg-[#003E68] focus-visible:ring-[#004D83]/30"
                    disabled={!input.trim() || isSending || !organization}
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {AI_BRAND_NAME} can make mistakes. Check quantities, exclusions,
                and pricing before sending.
              </p>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
