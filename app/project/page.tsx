"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectForm } from "@/components/project-form/ProjectForm";
import { ProjectsTable } from "@/components/projects/ProjectsTable";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { CADMarkupStep } from "@/components/cad-markup";
import { UserMenu } from "@/components/layout/UserMenu";

export default function ProjectDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [cadMarkupKey, setCadMarkupKey] = useState(0);

  // When switching to CAD tab, increment key to force remount
  const handleTabChange = (value: string) => {
    if (value === "cad") {
      setCadMarkupKey((prev) => prev + 1);
    }
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
          <TabsList className="grid w-full max-w-3xl grid-cols-4 h-12">
            <TabsTrigger value="overview" className="text-base">
              <BarChart3 className="mr-2 h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="new" className="text-base">
              New Project
            </TabsTrigger>
            <TabsTrigger
              value="cad"
              className="text-base"
              onClick={() => {
                // Reset when clicking CAD tab while already on it
                if (activeTab === "cad") {
                  setCadMarkupKey((prev) => prev + 1);
                }
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              PDF Markups
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
            {(() => { console.log('[ProjectDashboard] Rendering CAD tab content'); return null; })()}
            <CADMarkupStep key={cadMarkupKey} />
          </TabsContent>

          <TabsContent value="past" className="space-y-6">
            <ProjectsTable />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
