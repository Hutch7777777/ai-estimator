"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

// Import step components
import { ProjectInfoStep } from "@/components/project-form/ProjectInfoStep";
import { TradeSelectionStep } from "@/components/project-form/TradeSelectionStep";
import { ProductConfigStep } from "@/components/project-form/ProductConfigStep";
import { PDFUploadStep } from "@/components/project-form/PDFUploadStep";
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
}

const TOTAL_STEPS = 5;

const STEP_TITLES = [
  "Project Information",
  "Select Trades",
  "Configure Products",
  "Upload HOVER PDF",
  "Review & Submit",
];

export default function NewProjectPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: "",
    customerName: "",
    address: "",
    selectedTrades: [],
    configurations: {},
    pdfFile: null,
    pdfUrl: "",
    notes: "",
  });

  // Calculate progress percentage
  const progressPercentage = (currentStep / TOTAL_STEPS) * 100;

  // Update form data
  const updateFormData = (data: Partial<ProjectFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  // Navigation handlers
  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Render current step component
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <ProjectInfoStep data={formData} onUpdate={updateFormData} />;
      case 2:
        return <TradeSelectionStep data={formData} onUpdate={updateFormData} />;
      case 3:
        return <ProductConfigStep data={formData} onUpdate={updateFormData} />;
      case 4:
        return <PDFUploadStep data={formData} onUpdate={updateFormData} />;
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
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
            Create New Project
          </h1>
          <p className="mt-2 text-muted-foreground">
            Follow the steps below to create your construction estimate
          </p>
        </div>

        {/* Progress Section */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">
                  Step {currentStep} of {TOTAL_STEPS}
                </CardTitle>
                <CardDescription className="mt-1">
                  {STEP_TITLES[currentStep - 1]}
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">
                  {Math.round(progressPercentage)}%
                </p>
                <p className="text-xs text-muted-foreground">Complete</p>
              </div>
            </div>
            <Progress value={progressPercentage} className="mt-4" />
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
                  className="w-full sm:w-auto"
                >
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    // TODO: Submit form
                    console.log("Submitting form:", formData);
                  }}
                  className="w-full sm:w-auto"
                >
                  Submit Project
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
