"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart3, Pencil, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectForm } from "@/components/project-form/ProjectForm";
import { ProjectsTable } from "@/components/projects/ProjectsTable";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { ExtractionsTable } from "@/components/dashboard/ExtractionsTable";
import { CADMarkupStep } from "@/components/cad-markup";
import { UserMenu } from "@/components/layout/UserMenu";

// Note: Auth and organization checks are handled by the parent layout.tsx
// This page only renders when user is authenticated and has an organization

const VALID_TABS = ["overview", "new", "cad", "extractions", "past"];

function ProjectDashboardContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("overview");

  // Honor ?tab= deep links (e.g. /project?tab=new) — both on initial load
  // and when an in-page <Link> changes only the query string.
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && VALID_TABS.includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Simple tab change handler - no forced remount needed
  const handleTabChange = (value: string) => {
    setActiveTab(value);
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
          <TabsList className="grid w-full max-w-4xl grid-cols-5 h-12">
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
            <TabsTrigger value="extractions" className="text-base">
              <Layers className="mr-2 h-4 w-4" />
              Extractions
            </TabsTrigger>
            <TabsTrigger value="past" className="text-base">
              Past Projects
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <DashboardOverview />
          </TabsContent>

          <TabsContent value="new" className="space-y-6">
            <ProjectForm />
          </TabsContent>

          <TabsContent value="cad" className="space-y-6">
            <CADMarkupStep />
          </TabsContent>

          <TabsContent value="extractions" className="space-y-6">
            <ExtractionsTable />
          </TabsContent>

          <TabsContent value="past" className="space-y-6">
            <ProjectsTable />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function ProjectDashboard() {
  return (
    <Suspense fallback={null}>
      <ProjectDashboardContent />
    </Suspense>
  );
}
