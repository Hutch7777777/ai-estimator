"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Stepper, Step } from "@/components/ui/stepper";
import { useAutoSave } from "@/lib/hooks/useAutoSave";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Layers,
  Settings,
  Upload,
  CheckSquare,
  Save,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import confetti from "canvas-confetti";

// Import step components
import { ProjectInfoStep } from "@/components/project-form/ProjectInfoStep";
import { TradeSelectionStep } from "@/components/project-form/TradeSelectionStep";
import { ProductConfigStep } from "@/components/project-form/ProductConfigStep";
import { HoverUploadStep } from "@/components/project-form/HoverUploadStep";
import { ReviewSubmitStep } from "@/components/project-form/ReviewSubmitStep";

// Types for form data
export interface ProjectFormData {
  // Step 1: Project Info
  projectName: string;
  customerName: string;
  address: string;

  // Step 2: Trade Selection
  selectedTrades: string[];

  // Step 3: Product Configuration
  configurations: Record<string, any>;

  // Step 4: PDF Upload
  pdfFile: File | null;
  pdfUrl: string;

  // Step 5: Review & Submit
  notes: string;
  markupPercent: number; // Markup percentage (default 15%)
}

const TOTAL_STEPS = 5;

const STEP_TITLES = [
  "Project Information",
  "Select Trades",
  "Configure Products",
  "Upload HOVER PDF",
  "Review & Submit",
];

const STEPS: Step[] = [
  { id: 1, title: "Project Info", description: "Basic details", icon: FileText },
  { id: 2, title: "Trades", description: "Select trades", icon: Layers },
  { id: 3, title: "Products", description: "Configure", icon: Settings },
  { id: 4, title: "Upload", description: "HOVER PDF", icon: Upload },
  { id: 5, title: "Review", description: "Submit", icon: CheckSquare },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: "",
    customerName: "",
    address: "",
    selectedTrades: [],
    configurations: {},
    pdfFile: null,
    pdfUrl: "",
    notes: "",
    markupPercent: 15, // Default 15% markup
  });

  // Validation state for each step
  const [stepValidation, setStepValidation] = useState<Record<number, boolean>>({
    1: false,
    2: false,
    3: false, // Product configuration - required fields must be filled
    4: false,
    5: true, // Review is always valid
  });

  // Auto-save integration
  const {
    lastSavedText,
    hasDraft,
    clearDraft,
    loadData,
  } = useAutoSave({
    key: "project-form-draft",
    data: formData,
    interval: 30000, // 30 seconds
    enabled: true,
    onRestore: (restoredData) => {
      setFormData(restoredData);
    },
  });

  // Calculate progress percentage
  const progressPercentage = (currentStep / TOTAL_STEPS) * 100;

  // Update form data
  const updateFormData = (data: Partial<ProjectFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  // Update step validation
  const updateStepValidation = (step: number, isValid: boolean) => {
    setStepValidation((prev) => ({ ...prev, [step]: isValid }));
  };

  // Navigation handlers
  const handleNext = () => {
    // Check if current step is valid before proceeding
    if (!stepValidation[currentStep]) {
      toast.error("Please complete all required fields", {
        description: "Fill in all required information before continuing",
      });
      return;
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleStepClick = (step: number) => {
    // Allow navigation back or to current step
    if (step <= currentStep) {
      setCurrentStep(step);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Confetti celebration
  const triggerConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;
    const colors = ['#00cc6a', '#00b35e', '#dcfce7', '#94a3b8'];

    (function frame() {
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      });
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };

  // Submit project to Supabase
  const handleSubmit = async () => {
    setIsSubmitting(true);
    const supabase = createClient();

    try {
      // Step 1: Upload PDF to Supabase Storage if exists
      let pdfUrl = "";
      if (formData.pdfFile) {
        const fileName = `${Date.now()}_${formData.pdfFile.name}`;
        const filePath = `hover-pdfs/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("hover-pdfs")
          .upload(filePath, formData.pdfFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from("hover-pdfs")
          .getPublicUrl(uploadData.path);

        pdfUrl = publicUrl;
      }

      // Step 2: Insert project into database
      // @ts-ignore - Supabase generated types issue
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          name: formData.projectName,
          client_name: formData.customerName,
          address: formData.address,
          selected_trades: formData.selectedTrades,
          hover_pdf_url: pdfUrl || null,
          status: "pending",
          notes: formData.notes || null,
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Step 3: Insert configurations for each trade
      if (formData.selectedTrades.length > 0 && project) {
        const configInserts = formData.selectedTrades.map((trade) => ({
          project_id: project.id,
          trade,
          configuration_data: formData.configurations[trade] || {},
        }));

        // @ts-ignore - Supabase generated types issue
        const { error: configError } = await supabase
          .from("project_configurations")
          .insert(configInserts);

        if (configError) throw configError;
      }

      // Success!
      clearDraft();
      triggerConfetti();

      toast.success("Project created successfully!", {
        description: `${formData.projectName} has been saved`,
      });

      // Redirect to project dashboard after short delay
      setTimeout(() => {
        router.push("/project?tab=past");
      }, 2000);

    } catch (error) {
      console.error("Error submitting project:", error);
      toast.error("Failed to create project", {
        description: "Please try again or contact support",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render current step component
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <ProjectInfoStep
            data={formData}
            onUpdate={updateFormData}
            onValidationChange={(isValid) => updateStepValidation(1, isValid)}
          />
        );
      case 2:
        return (
          <TradeSelectionStep
            data={formData}
            onUpdate={updateFormData}
            onValidationChange={(isValid) => updateStepValidation(2, isValid)}
          />
        );
      case 3:
        return (
          <ProductConfigStep
            data={formData}
            onUpdate={updateFormData}
            onValidationChange={(isValid) => updateStepValidation(3, isValid)}
          />
        );
      case 4:
        return <HoverUploadStep data={formData} onUpdate={updateFormData} />;
      case 5:
        return <ReviewSubmitStep data={formData} onUpdate={updateFormData} />;
      default:
        return null;
    }
  };

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

        {/* Visual Stepper - Desktop */}
        <Card className="mb-8 shadow-soft rounded-xl hidden md:block">
          <CardHeader>
            <Stepper
              steps={STEPS}
              currentStep={currentStep}
              orientation="horizontal"
              onStepClick={handleStepClick}
              allowStepNavigation={true}
            />
            {lastSavedText && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Save className="h-3 w-3" />
                <span>Draft saved {lastSavedText}</span>
              </div>
            )}
          </CardHeader>
        </Card>

        {/* Progress Section - Mobile */}
        <Card className="mb-8 shadow-soft rounded-xl md:hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-heading">
                  Step {currentStep} of {TOTAL_STEPS}
                </CardTitle>
                <CardDescription className="mt-1">
                  {STEP_TITLES[currentStep - 1]}
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-[#00cc6a]">
                  {Math.round(progressPercentage)}%
                </p>
                <p className="text-xs text-muted-foreground">Complete</p>
              </div>
            </div>
            <Progress value={progressPercentage} className="mt-4" />
            {lastSavedText && (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Save className="h-3 w-3" />
                <span>Saved {lastSavedText}</span>
              </div>
            )}
          </CardHeader>
        </Card>

        {/* Step Content */}
        <div className="mb-8">
          {renderStep()}
        </div>

        {/* Navigation Buttons */}
        <Card>
          <CardContent className="pt-6">
            <Separator className="mb-6" />
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
                className="w-full sm:w-auto"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex flex-col gap-2 text-center text-xs text-muted-foreground sm:flex-1">
                <p>Step {currentStep} of {TOTAL_STEPS}</p>
              </div>
              {currentStep < TOTAL_STEPS ? (
                <Button
                  onClick={handleNext}
                  disabled={!stepValidation[currentStep]}
                  className="w-full sm:w-auto"
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Project...
                    </>
                  ) : (
                    "Submit Project"
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
