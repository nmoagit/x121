/**
 * SimilarityAlert -- modal dialog for duplicate character detection (PRD-79).
 *
 * Shows a side-by-side comparison of the uploaded character versus the
 * matched character, displays the similarity percentage, and provides
 * resolution actions: Link to Existing, Create as New, Cancel.
 */

import { useCallback } from "react";

import { Badge, Button } from "@/components/primitives";
import { Modal } from "@/components/composite";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SimilarityAlertProps {
  open: boolean;
  onClose: () => void;
  /** Name of the character being uploaded. */
  sourceName: string;
  /** Name of the matched existing character. */
  matchedName: string;
  /** Similarity percentage (0-100). */
  similarityScore: number;
  /** Called when the user chooses "Link to Existing" (merge). */
  onLinkExisting: () => void;
  /** Called when the user chooses "Create as New". */
  onCreateNew: () => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function similarityVariant(
  score: number,
): "success" | "warning" | "danger" | "default" {
  if (score >= 95) return "danger";
  if (score >= 85) return "warning";
  return "default";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SimilarityAlert({
  open,
  onClose,
  sourceName,
  matchedName,
  similarityScore,
  onLinkExisting,
  onCreateNew,
}: SimilarityAlertProps) {
  const handleLink = useCallback(() => {
    onLinkExisting();
    onClose();
  }, [onLinkExisting, onClose]);

  const handleCreateNew = useCallback(() => {
    onCreateNew();
    onClose();
  }, [onCreateNew, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Duplicate Detected" size="lg">
      <div className="flex flex-col gap-4" data-testid="similarity-alert">
        {/* Similarity score */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-[var(--color-text-secondary)]">
            Similarity:
          </span>
          <Badge variant={similarityVariant(similarityScore)}>
            {similarityScore.toFixed(1)}%
          </Badge>
        </div>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-2 gap-4">
          <div
            className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-4"
            data-testid="source-character"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
              Uploaded
            </p>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {sourceName}
            </p>
          </div>

          <div
            className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-4"
            data-testid="matched-character"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
              Existing Match
            </p>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {matchedName}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} data-testid="cancel-btn">
            Cancel
          </Button>
          <Button onClick={handleCreateNew} data-testid="create-new-btn">
            Create as New
          </Button>
          <Button onClick={handleLink} data-testid="link-existing-btn">
            Link to Existing
          </Button>
        </div>
      </div>
    </Modal>
  );
}
