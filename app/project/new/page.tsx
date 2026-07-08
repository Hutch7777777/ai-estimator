"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProjectForm } from "@/components/project-form/ProjectForm";

export default function NewProjectPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground font-heading">
            Create New Project
          </h1>
          <p className="mt-2 text-muted-foreground">
            Follow the steps below to create your construction estimate
          </p>
        </div>

        <ProjectForm />
      </div>
    </div>
  );
}
