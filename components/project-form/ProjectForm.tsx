"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { ProjectInfoStep } from "@/components/project-form/ProjectInfoStep";
import { TradeSelectionStep } from "@/components/project-form/TradeSelectionStep";
import { ProductConfigStep } from "@/components/project-form/ProductConfigStep";
import { HoverUploadStep } from "@/components/project-form/HoverUploadStep";
import { ReviewSubmitStep } from "@/components/project-form/ReviewSubmitStep";
import { ProjectFormData } from "@/app/project/new/page";

const TOTAL_STEPS = 5;

const STEP_TITLES = [
  "Project Information",
  "Select Trades",
  "Configure Products",
  "Upload HOVER PDF",
  "Review & Submit",
];

export function ProjectForm() {
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
    markupPercent: 15, // Default 15% markup
  });

  const progressPercentage = (currentStep / TOTAL_STEPS) * 100;

  const updateFormData = (data: Partial<ProjectFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

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

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <ProjectInfoStep data={formData} onUpdate={updateFormData} />;
      case 2:
        return <TradeSelectionStep data={formData} onUpdate={updateFormData} />;
      case 3:
        return <ProductConfigStep data={formData} onUpdate={updateFormData} />;
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
      {/* Enhanced Progress Section */}
      <Card className="border-2 shadow-lg bg-gradient-to-br from-card to-card/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                Step {currentStep} of {TOTAL_STEPS}
                {currentStep > 1 && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
              </CardTitle>
              <CardDescription className="mt-1 text-base">
                {STEP_TITLES[currentStep - 1]}
              </CardDescription>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                {Math.round(progressPercentage)}%
              </p>
              <p className="text-xs text-muted-foreground">Complete</p>
            </div>
          </div>
          <Progress value={progressPercentage} className="mt-6 h-3" />

          {/* Step indicators */}
          <div className="mt-6 flex justify-between">
            {STEP_TITLES.map((title, index) => (
              <div key={index} className="flex flex-col items-center gap-2">
                <div
                  className={`
                    h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium
                    transition-all duration-300
                    ${
                      index + 1 < currentStep
                        ? "bg-green-500 text-white"
                        : index + 1 === currentStep
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-white border-2 border-slate-300 text-slate-500"
                    }
                  `}
                >
                  {index + 1 < currentStep ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                </div>
                <p className="text-xs text-center text-muted-foreground hidden sm:block max-w-[80px]">
                  {title}
                </p>
              </div>
            ))}
          </div>
        </CardHeader>
      </Card>

      {/* Step Content */}
      <div className="transition-all duration-300 animate-in fade-in-50">
        {renderStep()}
      </div>

      {/* Navigation Buttons */}
      <Card className="border-2 shadow-md">
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
                variant="default"
                className="w-full sm:w-auto"
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  console.log("Submitting form:", formData);
                }}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700 active:bg-green-800 text-white shadow-sm"
              >
                Submit Project
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
