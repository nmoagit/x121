/**
 * Staleness Indicator (PRD-13).
 *
 * Visual indicator showing whether metadata is up-to-date or stale.
 * Displays a coloured dot, status text, and the generation timestamp.
 * When stale, shows an inline "Regenerate" button.
 */

import { Button } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface StalenessIndicatorProps {
  /** Whether the metadata is out of date relative to its source entity. */
  isStale: boolean;
  /** ISO 8601 timestamp of when the metadata was last generated. */
  generatedAt: string;
  /** ISO 8601 timestamp of the source entity's latest update. */
  sourceUpdatedAt: string;
  /** Called when the user clicks "Regenerate". */
  onRegenerate?: () => void;
  /** Whether a regeneration is currently in progress. */
  regenerating?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StalenessIndicator({
  isStale,
  generatedAt,
  sourceUpdatedAt: _sourceUpdatedAt,
  onRegenerate,
  regenerating = false,
}: StalenessIndicatorProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Status dot */}
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          isStale
            ? "bg-[var(--color-status-error)]"
            : "bg-[var(--color-status-success)]"
        }`}
        aria-hidden="true"
      />

      {/* Status label */}
      <span className="text-sm text-[var(--color-text-secondary)]">
        {isStale ? "Out of date" : "Up to date"}
      </span>

      {/* Timestamp */}
      <span className="text-xs text-[var(--color-text-muted)]">
        Generated: {new Date(generatedAt).toLocaleString()}
      </span>

      {/* Regenerate button (only shown when stale) */}
      {isStale && onRegenerate && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRegenerate}
          disabled={regenerating}
        >
          {regenerating ? "Regenerating..." : "Regenerate"}
        </Button>
      )}
    </div>
  );
}
