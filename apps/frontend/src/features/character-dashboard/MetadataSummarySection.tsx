/**
 * Metadata completeness summary section (PRD-108).
 *
 * Shows a summary of metadata completeness for a character and
 * provides a link to the metadata editor.
 */

import { Badge, Button } from "@/components";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface MetadataSummarySectionProps {
  /** Character ID for constructing the metadata editor link. */
  characterId: number;
  /** Current settings object to derive completeness from. */
  settings: Record<string, unknown>;
  /** Number of source images. */
  sourceImageCount: number;
  /** Called when the user clicks the "Edit Metadata" link. */
  onEditClick?: (characterId: number) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const REQUIRED_METADATA_KEYS = [
  "a2c4_model",
  "elevenlabs_voice",
  "avatar_json",
  "lora_model",
  "comfyui_workflow",
];

function computeCompleteness(settings: Record<string, unknown>): {
  filled: number;
  total: number;
  pct: number;
} {
  const total = REQUIRED_METADATA_KEYS.length;
  const filled = REQUIRED_METADATA_KEYS.filter(
    (key) => settings[key] != null && settings[key] !== "",
  ).length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return { filled, total, pct };
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MetadataSummarySection({
  characterId,
  settings,
  sourceImageCount,
  onEditClick,
}: MetadataSummarySectionProps) {
  const { filled, total, pct } = computeCompleteness(settings);

  const variant =
    pct === 100 ? "success" : pct >= 50 ? "warning" : "danger";

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
          {filled} of {total} settings filled
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
