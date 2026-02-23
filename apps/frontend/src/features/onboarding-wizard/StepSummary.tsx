/**
 * Step 6: Summary — review and submit (PRD-67).
 *
 * Displays a summary of all wizard choices: character count, scene types,
 * metadata status, and provides a submit button to complete the wizard.
 */

import { Badge, Button } from "@/components";

import { STEP_LABELS } from "./types";
import type { OnboardingStepNumber } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface StepSummaryProps {
  /** Current step data from the session. */
  stepData: Record<string, unknown>;
  /** Character IDs from the session. */
  characterIds: number[];
  /** Whether the complete mutation is in progress. */
  isSubmitting?: boolean;
  /** Callback to complete the session. */
  onComplete: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StepSummary({
  stepData,
  characterIds,
  isSubmitting = false,
  onComplete,
}: StepSummaryProps) {
  const sceneTypes = (stepData.scene_types as number[] | undefined) ?? [];
  const metadata =
    (stepData.metadata as Array<{ character_id: number }> | undefined) ?? [];
  const reviewedVariants =
    (stepData.reviewed_variants as Array<{ approved: boolean }> | undefined) ??
    [];

  const approvedVariants = reviewedVariants.filter((v) => v.approved).length;
  const totalCells = characterIds.length * sceneTypes.length;

  return (
    <div data-testid="step-summary" className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Summary
      </h3>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Review your onboarding configuration before submitting.
      </p>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Characters */}
        <div
          data-testid="summary-characters"
          className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
        >
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            {STEP_LABELS[1 as OnboardingStepNumber]}
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">
            {characterIds.length}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            characters uploaded
          </p>
        </div>

        {/* Variants */}
        <div
          data-testid="summary-variants"
          className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
        >
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            {STEP_LABELS[3 as OnboardingStepNumber]}
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">
            {approvedVariants}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            variants approved
          </p>
        </div>

        {/* Metadata */}
        <div
          data-testid="summary-metadata"
          className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
        >
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            {STEP_LABELS[4 as OnboardingStepNumber]}
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">
            {metadata.length}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            metadata entries
          </p>
        </div>

        {/* Scene types */}
        <div
          data-testid="summary-scene-types"
          className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
        >
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            {STEP_LABELS[5 as OnboardingStepNumber]}
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">
            {sceneTypes.length}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            scene types selected
          </p>
        </div>
      </div>

      {/* Total cells estimate */}
      <div
        data-testid="summary-total"
        className="rounded border border-[var(--color-action-primary)] bg-[var(--color-surface-secondary)] p-3"
      >
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          Total generation cells: {totalCells} ({characterIds.length} characters
          x {sceneTypes.length} scene types)
        </p>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button
          data-testid="submit-btn"
          variant="primary"
          disabled={isSubmitting || characterIds.length === 0}
          onClick={onComplete}
        >
          {isSubmitting ? "Submitting..." : "Complete Onboarding"}
        </Button>
        <Badge variant="info" size="sm">
          This will finalize the wizard
        </Badge>
      </div>
    </div>
  );
}
