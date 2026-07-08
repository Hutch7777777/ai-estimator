"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Stepper, Step } from "@/components/ui/stepper";
import { useAutoSave } from "@/lib/hooks/useAutoSave";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { submitProject } from "@/lib/project-submission";
import { ProjectFormData } from "@/lib/types/project-form";
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
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import confetti from "canvas-confetti";

import { ProjectInfoStep } from "@/components/project-form/ProjectInfoStep";
import { TradeSelectionStep } from "@/components/project-form/TradeSelectionStep";
import { ProductConfigStep } from "@/components/project-form/ProductConfigStep";
import { HoverUploadStep } from "@/components/project-form/HoverUploadStep";
import { ReviewSubmitStep } from "@/components/project-form/ReviewSubmitStep";

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

export function ProjectForm() {
  const router = useRouter();
  const { organization } = useOrganization();
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
    projectId: null,
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
  const { lastSavedText, clearDraft } = useAutoSave({
    key: "project-form-draft",
    data: formData,
    interval: 30000, // 30 seconds
    enabled: true,
    onRestore: (restoredData) => {
      setFormData(restoredData);
    },
  });

  const progressPercentage = (currentStep / TOTAL_STEPS) * 100;

  const updateFormData = (data: Partial<ProjectFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  const updateStepValidation = (step: number, isValid: boolean) => {
    setStepValidation((prev) => ({ ...prev, [step]: isValid }));
  };

  const handleNext = () => {
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

  const triggerConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;
    const colors = ["#00cc6a", "#00b35e", "#dcfce7", "#94a3b8"];

    (function frame() {
      confetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0 }, colors });
      confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1 }, colors });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  };

  const finishAndRedirect = () => {
    clearDraft();
    triggerConfetti();
    setTimeout(() => {
      router.push("/project?tab=past");
    }, 2000);
  };

  const handleSubmit = async () => {
    // The estimate was already generated from the Upload step —
    // nothing left to save, just wrap up.
    if (formData.projectId) {
      toast.success("Project already created!", {
        description: `${formData.projectName} has been saved`,
      });
      finishAndRedirect();
      return;
    }

    if (!organization?.id) {
      toast.error("No organization selected", {
        description: "Please select an organization before creating a project",
      });
      return;
    }

    if (!formData.pdfFile && !formData.pdfUrl) {
      toast.error("HOVER PDF required", {
        description: "Go back to the Upload step and add your HOVER PDF",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitProject(formData, organization.id, {
        onUploadStart: () => toast.loading("Uploading HOVER PDF...", { id: "submit-progress" }),
        onUploaded: (pdfUrl) => updateFormData({ pdfUrl }),
        onProjectSaved: (projectId) => updateFormData({ projectId }),
        onProcessingStart: () =>
          toast.loading("AI is analyzing your project...", {
            id: "submit-progress",
            description: "This usually takes 2-3 minutes",
          }),
      });

      updateFormData({ projectId: result.projectId, pdfUrl: result.pdfUrl });
      toast.success("Your estimate is ready!", {
        id: "submit-progress",
        description: "Check your Downloads folder for the Excel file",
      });
      finishAndRedirect();
    } catch (error) {
      console.error("Error submitting project:", error);
      toast.error("Failed to create project", {
        id: "submit-progress",
        description: error instanceof Error ? error.message : "Please try again or contact support",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
    <div className="space-y-8">
      {/* Visual Stepper - Desktop */}
      <Card className="shadow-soft rounded-xl hidden md:block">
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
      <Card className="shadow-soft rounded-xl md:hidden">
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
      <div className="transition-all duration-300 animate-in fade-in-50">
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
  );
}
