/**
 * Intermediate preview display for job debugger (PRD-34).
 *
 * Shows a grid of intermediate preview entries from the JSONB array,
 * each labeled with step number and timestamp.
 */

import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

import type { PreviewEntry } from "./types";
import { DEBUGGER_CARD_CLASSES } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface LatentPreviewProps {
  /** Array of intermediate preview entries. */
  previews: PreviewEntry[];
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function LatentPreview({ previews }: LatentPreviewProps) {
  if (previews.length === 0) {
    return (
      <div
        className={cn(...DEBUGGER_CARD_CLASSES, "text-center")}
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          No intermediate previews available
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(...DEBUGGER_CARD_CLASSES)}
    >
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
        Intermediate Preview
      </h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {previews.map((entry, index) => (
          <div
            key={index}
            className={cn(
              "bg-[var(--color-surface-secondary)]",
              "border border-[var(--color-border-default)]",
              "rounded-[var(--radius-md)]",
              "overflow-hidden",
            )}
          >
            {/* Preview thumbnail */}
            <div className="aspect-square bg-[var(--color-surface-tertiary)] flex items-center justify-center">
              {entry.url ? (
                <img
                  src={entry.url}
                  alt={`Preview step ${entry.step}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-[var(--color-text-muted)]">
                  Step {entry.step}
                </span>
              )}
            </div>

            {/* Metadata */}
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium text-[var(--color-text-primary)]">
                Step {entry.step}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {formatDateTime(entry.timestamp)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
