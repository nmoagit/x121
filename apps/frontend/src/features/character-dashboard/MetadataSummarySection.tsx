/**
 * Metadata completeness summary section (PRD-108).
 *
 * Shows a summary of metadata completeness for a character,
 * using template-driven required field tracking from the API.
 *
 * Display format: N/M+O
 *   N = mandatory fields completed
 *   M = total mandatory fields
 *   O = optional fields completed
 */

import { Badge, Button, Tooltip } from "@/components";

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

/** Check whether a metadata field value counts as "filled". */
function isFilled(value: unknown): boolean {
  return value != null && value !== "" && value !== false;
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

  const filledRequired = completeness?.filled ?? 0;
  const totalRequired = completeness?.total_required ?? 0;
  const pct = completeness ? Math.round(completeness.percentage) : 0;

  // Count optional fields filled from the fields array
  const fields = (metadataResponse as Record<string, unknown> | undefined)?.fields as
    | Array<{ name: string; value: unknown; is_required: boolean }>
    | undefined;

  const filledOptional = fields
    ? fields.filter((f) => !f.is_required && isFilled(f.value)).length
    : 0;

  const variant = completenessVariant(pct);

  const tooltipContent = (
    <span className="flex flex-col gap-0.5 text-left whitespace-normal max-w-[200px]">
      <span><strong>{filledRequired}</strong> = mandatory fields completed</span>
      <span><strong>{totalRequired}</strong> = total mandatory fields</span>
      <span><strong>{filledOptional}</strong> = optional fields completed</span>
    </span>
  );

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
        <Tooltip content={tooltipContent} side="bottom">
          <span
            data-testid="metadata-completeness-detail"
            className="cursor-help text-xs text-[var(--color-text-secondary)] underline decoration-dotted underline-offset-2"
          >
            {filledRequired}/{totalRequired}+{filledOptional}
          </span>
        </Tooltip>
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
