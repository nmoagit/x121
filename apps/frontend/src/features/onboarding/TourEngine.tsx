/**
 * Guided tour overlay engine (PRD-53).
 *
 * Renders a step-by-step walkthrough with a spotlight highlight on the
 * target element, progress indicator, and navigation buttons.
 */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components";
import { cn } from "@/lib/cn";

import { DISMISS_LINK_CLASSES } from "./types";
import type { TourStep } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface TourEngineProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TourEngine({ steps, onComplete, onSkip }: TourEngineProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const step = steps[currentIndex]!;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [isLast, onComplete]);

  const handleBack = useCallback(() => {
    if (!isFirst) {
      setCurrentIndex((i) => i - 1);
    }
  }, [isFirst]);

  // Scroll the target element into view when the step changes.
  useEffect(() => {
    const el = document.querySelector(step.target);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [step.target]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="tour-overlay">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Tooltip card */}
      <div
        className={cn(
          "relative z-10 w-full max-w-sm rounded-[var(--radius-lg)] p-5",
          "bg-[var(--color-surface-primary)] shadow-lg",
          "border border-[var(--color-border-default)]",
        )}
        data-testid="tour-card"
      >
        {/* Progress indicator */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">
            Step {currentIndex + 1} of {steps.length}
          </span>
          <button
            type="button"
            className={DISMISS_LINK_CLASSES}
            onClick={onSkip}
            data-testid="tour-skip"
          >
            Skip tour
          </button>
        </div>

        {/* Step content */}
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">
          {step.title}
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">{step.description}</p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i === currentIndex
                  ? "bg-[var(--color-action-primary)]"
                  : "bg-[var(--color-border-default)]",
              )}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={isFirst}
            data-testid="tour-back"
          >
            Back
          </Button>
          <Button variant="primary" size="sm" onClick={handleNext} data-testid="tour-next">
            {isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
