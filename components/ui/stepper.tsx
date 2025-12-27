"use client";

import { cn } from "@/lib/utils";
import { Check, LucideIcon } from "lucide-react";

export interface Step {
  id: number;
  title: string;
  description?: string;
  icon?: LucideIcon;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  orientation?: "horizontal" | "vertical";
  className?: string;
  onStepClick?: (step: number) => void;
  allowStepNavigation?: boolean;
}

export function Stepper({
  steps,
  currentStep,
  orientation = "horizontal",
  className,
  onStepClick,
  allowStepNavigation = false,
}: StepperProps) {
  const isStepComplete = (stepId: number) => stepId < currentStep;
  const isStepCurrent = (stepId: number) => stepId === currentStep;
  const isStepClickable = (stepId: number) => {
    return allowStepNavigation && stepId <= currentStep && onStepClick;
  };

  if (orientation === "vertical") {
    return (
      <nav aria-label="Progress" className={cn("space-y-4", className)}>
        {steps.map((step, index) => {
          const complete = isStepComplete(step.id);
          const current = isStepCurrent(step.id);
          const clickable = isStepClickable(step.id);

          return (
            <div key={step.id} className="relative">
              {/* Connecting line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "absolute left-5 top-10 h-full w-0.5 -translate-x-1/2",
                    complete ? "bg-[#00cc6a]" : "bg-[#e2e8f0]"
                  )}
                  aria-hidden="true"
                />
              )}

              {/* Step content */}
              <div
                className={cn(
                  "relative flex items-start gap-4",
                  clickable && "cursor-pointer group"
                )}
                onClick={() => clickable && onStepClick?.(step.id)}
              >
                {/* Step indicator */}
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    complete &&
                      "border-[#00cc6a] bg-[#00cc6a] text-white",
                    current &&
                      "border-[#00cc6a] bg-white text-[#00cc6a] shadow-sm ring-4 ring-[#00cc6a]/10",
                    !complete &&
                      !current &&
                      "border-[#e2e8f0] bg-white text-[#94a3b8]",
                    clickable && "group-hover:border-[#00cc6a]/70"
                  )}
                >
                  {complete ? (
                    <Check className="h-5 w-5" aria-hidden="true" />
                  ) : step.icon ? (
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <span className="text-sm font-medium">{step.id}</span>
                  )}
                </div>

                {/* Step text */}
                <div className="min-w-0 flex-1 pt-1.5">
                  <p
                    className={cn(
                      "text-sm font-medium transition-colors",
                      current && "text-[#00cc6a]",
                      complete && "text-[#0f172a]",
                      !complete && !current && "text-[#94a3b8]"
                    )}
                  >
                    {step.title}
                  </p>
                  {step.description && (
                    <p className="mt-0.5 text-xs text-[#94a3b8]">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    );
  }

  // Horizontal orientation
  return (
    <nav aria-label="Progress" className={className}>
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const complete = isStepComplete(step.id);
          const current = isStepCurrent(step.id);
          const clickable = isStepClickable(step.id);

          return (
            <li
              key={step.id}
              className={cn(
                "relative",
                index < steps.length - 1 && "flex-1 pr-8 sm:pr-20"
              )}
            >
              {/* Connecting line */}
              {index < steps.length - 1 && (
                <div
                  className="absolute left-0 top-5 hidden h-0.5 w-full sm:block"
                  aria-hidden="true"
                >
                  <div
                    className={cn(
                      "h-full w-full transition-all",
                      complete ? "bg-[#00cc6a]" : "bg-[#e2e8f0]"
                    )}
                  />
                </div>
              )}

              {/* Step content */}
              <div
                className={cn(
                  "group relative flex flex-col items-center",
                  clickable && "cursor-pointer"
                )}
                onClick={() => clickable && onStepClick?.(step.id)}
              >
                {/* Step indicator */}
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    complete &&
                      "border-[#00cc6a] bg-[#00cc6a] text-white",
                    current &&
                      "border-[#00cc6a] bg-white text-[#00cc6a] shadow-sm ring-4 ring-[#00cc6a]/10",
                    !complete &&
                      !current &&
                      "border-[#e2e8f0] bg-white text-[#94a3b8]",
                    clickable && "group-hover:border-[#00cc6a]/70"
                  )}
                >
                  {complete ? (
                    <Check className="h-5 w-5" aria-hidden="true" />
                  ) : step.icon ? (
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <span className="text-sm font-medium">{step.id}</span>
                  )}
                </div>

                {/* Step text */}
                <div className="mt-2 text-center">
                  <p
                    className={cn(
                      "text-xs font-medium transition-colors sm:text-sm",
                      current && "text-[#00cc6a]",
                      complete && "text-[#0f172a]",
                      !complete && !current && "text-[#94a3b8]"
                    )}
                  >
                    {step.title}
                  </p>
                  {step.description && (
                    <p className="mt-0.5 hidden text-xs text-[#94a3b8] sm:block">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
