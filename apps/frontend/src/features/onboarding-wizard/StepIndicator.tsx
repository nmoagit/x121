/**
 * Step progress indicator for the onboarding wizard (PRD-67).
 *
 * Shows a horizontal bar of numbered steps with visual states:
 * completed (check), current (highlighted), and upcoming (dimmed).
 */

import { Badge } from "@/components";

import { STEP_LABELS, TOTAL_STEPS } from "./types";
import type { OnboardingStepNumber } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface StepIndicatorProps {
  /** The current step (1-based). */
  currentStep: number;
  /** Callback when a step indicator is clicked (for navigation). */
  onStepClick?: (step: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <div data-testid="step-indicator" className="flex items-center gap-1">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const stepNum = (i + 1) as OnboardingStepNumber;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        const label = STEP_LABELS[stepNum];

        return (
          <div key={stepNum} className="flex items-center">
            {/* Step circle + label */}
            <button
              type="button"
              data-testid={`step-${stepNum}`}
              disabled={!onStepClick}
              onClick={() => onStepClick?.(stepNum)}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
                isCurrent
                  ? "bg-[var(--color-action-primary)] text-white font-semibold"
                  : isCompleted
                    ? "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]"
                    : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]"
              }`}
            >
              <span
                data-testid={`step-number-${stepNum}`}
                className="flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold"
              >
                {isCompleted ? "\u2713" : stepNum}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>

            {/* Connector line between steps */}
            {stepNum < TOTAL_STEPS && (
              <div
                data-testid={`connector-${stepNum}`}
                className={`mx-0.5 h-0.5 w-4 ${
                  isCompleted
                    ? "bg-[var(--color-action-primary)]"
                    : "bg-[var(--color-border-subtle)]"
                }`}
              />
            )}
          </div>
        );
      })}

      {/* Current step badge */}
      <div className="ml-2">
        <Badge variant="info" size="sm">
          Step {currentStep} of {TOTAL_STEPS}
        </Badge>
      </div>
    </div>
  );
}
