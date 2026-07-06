import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createChatAnswer } from "@/lib/assistant/rag";
import type { AssistantChatMessage } from "@/lib/assistant/types";

interface ChatRequestBody {
  organizationId?: string;
  projectId?: string | null;
  threadId?: string | null;
  messages?: AssistantChatMessage[];
}

interface MembershipLookupClient {
  from(table: "organization_memberships"): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{
            data: { id: string } | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages are required" }, { status: 400 });
  }

  const latestMessage = body.messages[body.messages.length - 1];
  if (!latestMessage?.content?.trim()) {
    return NextResponse.json({ error: "message content is required" }, { status: 400 });
  }

  const membershipClient = supabase as unknown as MembershipLookupClient;
  const { data: membership, error: membershipError } = await membershipClient
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", body.organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  }

  const answer = await createChatAnswer({
    organizationId: body.organizationId,
    projectId: body.projectId ?? null,
    threadId: body.threadId ?? null,
    userId: user.id,
    messages: body.messages,
  });

  return NextResponse.json(answer);
}
