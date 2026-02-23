/**
 * Step 3: Variant Review — grid review with bulk approve (PRD-67).
 *
 * Displays generated variants in a grid alongside source images.
 * Users can approve, reject, or mark variants for external editing.
 */

import { Badge, Button } from "@/components";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface VariantReviewEntry {
  character_id: number;
  approved: boolean;
}

interface StepVariantReviewProps {
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

export function StepVariantReview({
  stepData,
  characterIds,
  onUpdateStepData,
}: StepVariantReviewProps) {
  const reviewedVariants = (
    stepData.reviewed_variants as VariantReviewEntry[] | undefined
  ) ?? [];

  const approvedCount = reviewedVariants.filter((v) => v.approved).length;
  const allReviewed = reviewedVariants.length === characterIds.length;

  function handleApproveAll() {
    const entries: VariantReviewEntry[] = characterIds.map((id) => ({
      character_id: id,
      approved: true,
    }));
    onUpdateStepData({
      ...stepData,
      reviewed_variants: entries,
    });
  }

  function handleToggleApproval(characterId: number) {
    const existing = reviewedVariants.find(
      (v) => v.character_id === characterId,
    );
    let updated: VariantReviewEntry[];
    if (existing) {
      updated = reviewedVariants.map((v) =>
        v.character_id === characterId
          ? { ...v, approved: !v.approved }
          : v,
      );
    } else {
      updated = [
        ...reviewedVariants,
        { character_id: characterId, approved: true },
      ];
    }
    onUpdateStepData({
      ...stepData,
      reviewed_variants: updated,
    });
  }

  function getApprovalStatus(
    characterId: number,
  ): "approved" | "rejected" | "unreviewed" {
    const entry = reviewedVariants.find(
      (v) => v.character_id === characterId,
    );
    if (!entry) return "unreviewed";
    return entry.approved ? "approved" : "rejected";
  }

  return (
    <div data-testid="step-variant-review" className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Variant Review
      </h3>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Review generated variants. Approve good ones or reject those that need
        re-generation.
      </p>

      {/* Bulk approve button */}
      <div className="flex items-center gap-2">
        <Button
          data-testid="bulk-approve-btn"
          variant="primary"
          size="sm"
          onClick={handleApproveAll}
        >
          Approve All
        </Button>
        <span className="text-sm text-[var(--color-text-muted)]">
          {approvedCount} / {characterIds.length} approved
        </span>
      </div>

      {/* Variant review grid */}
      <div
        data-testid="variant-grid"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      >
        {characterIds.map((charId) => {
          const status = getApprovalStatus(charId);
          return (
            <div
              key={charId}
              data-testid={`variant-card-${charId}`}
              className={`cursor-pointer rounded border p-3 text-center transition-colors ${
                status === "approved"
                  ? "border-[var(--color-action-success)] bg-[var(--color-surface-secondary)]"
                  : status === "rejected"
                    ? "border-[var(--color-action-danger)] bg-[var(--color-surface-secondary)]"
                    : "border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]"
              }`}
              onClick={() => handleToggleApproval(charId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleToggleApproval(charId);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="mb-2 h-16 w-full rounded bg-[var(--color-surface-tertiary)]" />
              <p className="text-xs text-[var(--color-text-primary)]">
                Character {charId}
              </p>
              <Badge
                variant={
                  status === "approved"
                    ? "success"
                    : status === "rejected"
                      ? "danger"
                      : "default"
                }
                size="sm"
              >
                {status}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* Status */}
      <div data-testid="review-status">
        {allReviewed ? (
          <Badge variant="success" size="sm">
            All variants reviewed
          </Badge>
        ) : (
          <Badge variant="default" size="sm">
            Review all variants to continue
          </Badge>
        )}
      </div>
    </div>
  );
}
