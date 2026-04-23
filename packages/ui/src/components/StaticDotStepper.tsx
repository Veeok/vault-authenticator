import * as React from "react";

type StaticDotStepperProps = {
  currentStep: number;
  totalSteps: number;
  className?: string;
  ariaLabel?: string;
};

export function StaticDotStepper({ currentStep, totalSteps, className, ariaLabel }: StaticDotStepperProps) {
  if (totalSteps < 1) {
    return null;
  }

  const clampedCurrentStep = Math.min(Math.max(currentStep, 1), totalSteps);
  const rootClassName = className ? `auth-dot-stepper ${className}` : "auth-dot-stepper";

  return (
    <div className={rootClassName} aria-label={ariaLabel ?? `Step ${clampedCurrentStep} of ${totalSteps}`}>
      <span className="auth-dot-stepper-label">
        Step {clampedCurrentStep} of {totalSteps}
      </span>
      <span className="auth-dot-stepper-dots" aria-hidden="true">
        {Array.from({ length: totalSteps }, (_, index) => {
          const dotStep = index + 1;
          const state = dotStep < clampedCurrentStep ? "complete" : dotStep === clampedCurrentStep ? "current" : "upcoming";

          return (
            <span
              key={index}
              data-state={state}
              className={`auth-dot-stepper-dot${state === "upcoming" ? "" : " is-filled"}`}
              style={{ ["--dot-index" as string]: index } as React.CSSProperties}
            />
          );
        })}
      </span>
    </div>
  );
}
