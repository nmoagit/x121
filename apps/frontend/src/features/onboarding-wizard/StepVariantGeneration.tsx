/**
 * Step 2: Variant Generation — batch trigger (PRD-67).
 *
 * Displays a list of characters from step 1 and provides a one-click
 * button to trigger variant generation for all characters.
 */

import { Badge, Button } from "@/components";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface StepVariantGenerationProps {
  /** Current step data from the session. */
  stepData: Record<string, unknown>;
  /** Character IDs from the session. */
  characterIds: number[];
  /** Callback to update step data. */
  onUpdateStepData: (data: Record<string, unknown>) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StepVariantGeneration({
  stepData,
  characterIds,
  onUpdateStepData,
}: StepVariantGenerationProps) {
  const variantJobs = (stepData.variant_jobs as number[] | undefined) ?? [];
  const isGenerated = variantJobs.length > 0;

  function handleGenerate() {
    // Simulate triggering variant generation for all characters.
    // In a real implementation, this would call the variant generation API
    // and populate with actual job IDs.
    const jobIds = characterIds.map((_, i) => i + 1);
    onUpdateStepData({
      ...stepData,
      variant_jobs: jobIds,
    });
  }

  return (
    <div data-testid="step-variant-generation" className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Variant Generation
      </h3>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Generate variants for all {characterIds.length} characters in one click.
        Workers will process them in parallel.
      </p>

      {/* Character count */}
      <div
        data-testid="character-count"
        className="rounded bg-[var(--color-surface-secondary)] p-3"
      >
        <span className="text-sm text-[var(--color-text-primary)]">
          {characterIds.length} character(s) ready for variant generation
        </span>
      </div>

      {/* Generate button */}
      {!isGenerated && (
        <Button
          data-testid="generate-btn"
          variant="primary"
          onClick={handleGenerate}
          disabled={characterIds.length === 0}
        >
          Generate All Variants
        </Button>
      )}

      {/* Status */}
      <div data-testid="generation-status">
        {isGenerated ? (
          <Badge variant="success" size="sm">
            {variantJobs.length} variant job(s) queued
          </Badge>
        ) : (
          <Badge variant="default" size="sm">
            Click generate to start variant generation
          </Badge>
        )}
      </div>
    </div>
  );
}
