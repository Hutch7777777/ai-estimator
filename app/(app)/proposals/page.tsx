"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProposalsPanel } from "@/components/proposals/ProposalsPanel";
import { UserMenu } from "@/components/layout/UserMenu";

export default function ProposalsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="mx-auto max-w-[1400px] px-2 py-4 sm:px-4 lg:px-6">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/project"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
          <UserMenu />
        </div>
        <ProposalsPanel />
      </div>
    </div>
  );
}
