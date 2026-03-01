/**
 * Metadata completeness summary section (PRD-108).
 *
 * Shows a summary of metadata completeness for a character,
 * using template-driven required field tracking from the API.
 */

import { Badge, Button } from "@/components";

import { useCharacterMetadata } from "../characters/hooks/use-character-detail";
import { completenessVariant } from "../characters/types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface MetadataSummarySectionProps {
  /** Character ID for constructing the metadata editor link. */
  characterId: number;
  /** Number of source images. */
  sourceImageCount: number;
  /** Called when the user clicks the "Edit Metadata" link. */
  onEditClick?: (characterId: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MetadataSummarySection({
  characterId,
  sourceImageCount,
  onEditClick,
}: MetadataSummarySectionProps) {
  const { data: metadataResponse } = useCharacterMetadata(characterId);

  // Use completeness from the API response (template-driven)
  const completeness = (metadataResponse as Record<string, unknown> | undefined)?.completeness as
    | { total_required: number; filled: number; percentage: number }
    | undefined;

  const filled = completeness?.filled ?? 0;
  const total = completeness?.total_required ?? 0;
  const pct = completeness ? Math.round(completeness.percentage) : 0;

  const variant = completenessVariant(pct);

  return (
    <div data-testid="metadata-summary-section" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Metadata Completeness
      </h3>

      <div className="flex items-center gap-3">
        <span data-testid="metadata-completeness-badge">
          <Badge variant={variant} size="sm">
            {pct}%
          </Badge>
        </span>
        <span
          data-testid="metadata-completeness-detail"
          className="text-xs text-[var(--color-text-secondary)]"
        >
          {filled} of {total} required fields filled
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span
          data-testid="source-image-count"
          className="text-xs text-[var(--color-text-secondary)]"
        >
          {sourceImageCount} source {sourceImageCount === 1 ? "image" : "images"}
        </span>
      </div>

      {onEditClick && (
        <div>
          <Button
            data-testid="edit-metadata-btn"
            variant="ghost"
            size="sm"
            onClick={() => onEditClick(characterId)}
          >
            Edit Metadata
          </Button>
        </div>
      )}
    </div>
  );
}
