import type { Metadata } from "next";
import { AssistantShell } from "@/components/assistant/AssistantShell";

export const metadata: Metadata = {
  title: "AI Assistant",
};

export default function AssistantPage() {
  return <AssistantShell />;
}
