/**
 * Horizontal progress indicator for the setup wizard (PRD-105).
 *
 * Shows each step as a dot/circle with visual state:
 * - Green check: completed
 * - Blue dot: current
 * - Gray dot: future/pending
 *
 * Step name labels appear below each dot.
 */

import { cn } from "@/lib/cn";
import { Check } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { STEP_LABELS, STEP_ORDER, TOTAL_STEPS } from "./types";
import type { StepStatus } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface StepProgressProps {
  /** Status of each step from the API. */
  steps: StepStatus[];
  /** Zero-based index of the current step. */
  currentIndex: number;
  /** Callback when a step dot is clicked. */
  onStepClick?: (index: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StepProgress({ steps, currentIndex, onStepClick }: StepProgressProps) {
  return (
    <div data-testid="step-progress" className="flex items-start justify-between w-full">
      {STEP_ORDER.map((stepName, index) => {
        const status = steps.find((s) => s.name === stepName);
        const isCompleted = status?.completed ?? false;
        const isCurrent = index === currentIndex;
        const hasError = !!status?.error_message;

        return (
          <div key={stepName} className="flex items-start flex-1">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                data-testid={`step-dot-${stepName}`}
                onClick={() => onStepClick?.(index)}
                disabled={!onStepClick}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full",
                  "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
                  isCompleted && "bg-[var(--color-action-success)] text-white",
                  isCurrent && !isCompleted && "bg-[var(--color-action-primary)] text-white",
                  hasError && !isCompleted && "bg-[var(--color-action-danger)] text-white",
                  !isCompleted &&
                    !isCurrent &&
                    !hasError &&
                    "bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)]",
                )}
              >
                {isCompleted ? (
                  <Check size={iconSizes.sm} aria-hidden="true" />
                ) : (
                  <span className="text-xs font-bold">{index + 1}</span>
                )}
              </button>

              <span
                className={cn(
                  "text-xs text-center max-w-[72px]",
                  isCurrent
                    ? "font-semibold text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)]",
                )}
              >
                {STEP_LABELS[stepName]}
              </span>
            </div>

            {/* Connector line */}
            {index < TOTAL_STEPS - 1 && (
              <div className="flex-1 flex items-center pt-4 px-1">
                <div
                  data-testid={`connector-${index}`}
                  className={cn(
                    "h-0.5 w-full",
                    isCompleted
                      ? "bg-[var(--color-action-success)]"
                      : "bg-[var(--color-border-default)]",
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
