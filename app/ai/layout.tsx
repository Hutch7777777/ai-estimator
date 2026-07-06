import type { Metadata } from "next";
import { AppAuthGuard } from "@/components/layout/AppAuthGuard";

export const metadata: Metadata = {
  title: "Exterior Finishes AI",
};

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return <AppAuthGuard>{children}</AppAuthGuard>;
}
