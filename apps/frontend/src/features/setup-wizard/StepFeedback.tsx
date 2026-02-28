/**
 * Reusable feedback message for setup wizard step results (PRD-105).
 *
 * Displays a success or error banner with the result message.
 */

import type { StepValidationResult } from "./types";

interface StepFeedbackProps {
  result: StepValidationResult | undefined;
  testId?: string;
}

export function StepFeedback({ result, testId = "step-feedback" }: StepFeedbackProps) {
  if (!result) return null;

  return (
    <div
      data-testid={testId}
      className={`rounded-[var(--radius-md)] px-3 py-2 text-sm ${
        result.success
          ? "bg-[var(--color-action-success)]/10 text-[var(--color-action-success)]"
          : "bg-[var(--color-action-danger)]/10 text-[var(--color-action-danger)]"
      }`}
    >
      {result.message}
    </div>
  );
}
