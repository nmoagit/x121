/**
 * Metadata completeness summary section (PRD-108).
 *
 * Shows a summary of metadata completeness for a avatar,
 * using template-driven required field tracking from the API.
 *
 * Display format: N/M+O
 *   N = mandatory fields completed
 *   M = total mandatory fields
 *   O = optional fields completed
 */

import { Button, Tooltip } from "@/components";

import { useAvatarMetadata } from "../avatars/hooks/use-avatar-detail";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface MetadataSummarySectionProps {
  /** Avatar ID for constructing the metadata editor link. */
  avatarId: number;
  /** Number of source images. */
  sourceImageCount: number;
  /** Called when the user clicks the "Edit Metadata" link. */
  onEditClick?: (avatarId: number) => void;
}

/** Check whether a metadata field value counts as "filled". */
function isFilled(value: unknown): boolean {
  return value != null && value !== "" && value !== false;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MetadataSummarySection({
  avatarId,
  sourceImageCount,
  onEditClick,
}: MetadataSummarySectionProps) {
  const { data: metadataResponse } = useAvatarMetadata(avatarId);

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

  const tooltipContent = (
    <span className={`flex flex-col gap-0.5 text-left whitespace-normal max-w-[200px] ${TYPO_DATA}`}>
      <span><strong>{filledRequired}</strong> = mandatory fields completed</span>
      <span><strong>{totalRequired}</strong> = total mandatory fields</span>
      <span><strong>{filledOptional}</strong> = optional fields completed</span>
    </span>
  );

  return (
    <div data-testid="metadata-summary-section" className={`flex flex-col gap-2 ${TYPO_DATA}`}>
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-text-muted)] uppercase tracking-wide">completeness:</span>
        <span data-testid="metadata-completeness-badge" className={`font-semibold text-sm ${pct >= 100 ? "text-[var(--color-data-green)]" : "text-[var(--color-data-cyan)]"}`}>
          {pct}%
        </span>
        <span className="text-[var(--color-text-muted)] opacity-30">|</span>
        <Tooltip content={tooltipContent} side="bottom">
          <span data-testid="metadata-completeness-detail" className="cursor-help text-[var(--color-text-muted)]">
            {filledRequired}/{totalRequired}+{filledOptional}
          </span>
        </Tooltip>
        <span className="text-[var(--color-text-muted)] opacity-30">|</span>
        <span data-testid="source-image-count" className="text-[var(--color-text-muted)]">
          {sourceImageCount} source {sourceImageCount === 1 ? "image" : "images"}
        </span>
      </div>

      {onEditClick && (
        <div>
          <Button data-testid="edit-metadata-btn" variant="ghost" size="xs" onClick={() => onEditClick(avatarId)}>
            Edit Metadata
          </Button>
        </div>
      )}
    </div>
  );
}
