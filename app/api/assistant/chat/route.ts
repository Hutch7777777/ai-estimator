import { NextResponse } from "next/server";
import { requireApiAuth, requireProjectAccess } from "@/lib/api/access";
import { createChatAnswer } from "@/lib/assistant/rag";
import type { AssistantChatMessage } from "@/lib/assistant/types";

interface ChatRequestBody {
  organizationId?: string;
  projectId?: string | null;
  threadId?: string | null;
  messages?: AssistantChatMessage[];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  if (!isUuid(body.organizationId)) {
    return NextResponse.json({ error: "organizationId must be a UUID" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages are required" }, { status: 400 });
  }

  const latestMessage = body.messages[body.messages.length - 1];
  if (!latestMessage?.content?.trim()) {
    return NextResponse.json({ error: "message content is required" }, { status: 400 });
  }

  if (body.projectId) {
    const projectAccess = await requireProjectAccess(body.projectId, auth.ctx);
    if (!projectAccess.ok) return projectAccess.response;

    if (projectAccess.data.organization_id && projectAccess.data.organization_id !== body.organizationId) {
      return NextResponse.json({ error: "Project does not belong to organization" }, { status: 400 });
    }
  } else if (!auth.ctx.devBypass) {
    const membership = await auth.ctx.supabase
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", body.organizationId)
      .eq("user_id", auth.ctx.user?.id)
      .maybeSingle();

    if (membership.error || !membership.data) {
      return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
    }
  }

  try {
    const answer = await createChatAnswer({
      organizationId: body.organizationId,
      projectId: body.projectId ?? null,
      threadId: body.threadId ?? null,
      userId: auth.ctx.user?.id,
      messages: body.messages,
      accessContext: auth.ctx,
    });

    return NextResponse.json(answer);
  } catch (error) {
    console.error("[assistant/chat] request failed", error);
    return NextResponse.json(
      {
        error: "Assistant request failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
