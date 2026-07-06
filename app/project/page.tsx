"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Bot, FileSpreadsheet, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectsTable } from "@/components/projects/ProjectsTable";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { CADMarkupStep } from "@/components/cad-markup";
import { UserMenu } from "@/components/layout/UserMenu";

// Note: Auth and organization checks are handled by the parent layout.tsx
// This page only renders when user is authenticated and has an organization

function getInitialTab() {
  if (typeof window === "undefined") return "overview";

  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  return requestedTab === "cad" || requestedTab === "past" ? requestedTab : "overview";
}

// Tabs that navigate to another route rather than swap in-page content.
const NAV_TABS: Record<string, string> = {
  new: "/project/new",
  assistant: "/assistant",
  proposals: "/proposals",
};

export default function ProjectDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");

    if (requestedTab === "new") {
      router.replace("/project/new");
    }
  }, [router]);

  const handleTabChange = (value: string) => {
    if (NAV_TABS[value]) {
      router.push(NAV_TABS[value]);
      return;
    }

    setActiveTab(value);

    const params = new URLSearchParams(window.location.search);
    if (value === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }

    const query = params.toString();
    router.replace(query ? `/project?${query}` : "/project", { scroll: false });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="mx-auto px-2 py-4 sm:px-4 lg:px-6 max-w-[1920px]">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground bg-clip-text font-heading">
                Project Dashboard
              </h1>
              <p className="mt-2 text-muted-foreground">
                Create new estimates or manage existing projects
              </p>
            </div>
            <UserMenu />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid h-12 w-full max-w-6xl grid-cols-6">
            <TabsTrigger value="overview" className="text-base">
              <BarChart3 className="mr-2 h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="new" className="text-base">
              New Project
            </TabsTrigger>
            <TabsTrigger value="cad" className="text-base">
              <Pencil className="mr-2 h-4 w-4" />
              PDF Markups
            </TabsTrigger>
            <TabsTrigger value="assistant" className="text-base">
              <Bot className="mr-2 h-4 w-4" />
              AI Assistant
            </TabsTrigger>
            <TabsTrigger value="proposals" className="text-base">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Proposals
            </TabsTrigger>
            <TabsTrigger value="past" className="text-base">
              Past Projects
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <DashboardOverview />
          </TabsContent>

          <TabsContent value="cad" className="space-y-6">
            <CADMarkupStep />
          </TabsContent>

          <TabsContent value="past" className="space-y-6">
            <ProjectsTable />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
