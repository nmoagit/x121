/**
 * Override preview dialog showing side-by-side diff before applying a preset (PRD-27).
 */

import { Button } from "@/components";
import { cn } from "@/lib/cn";
import { formatValue } from "@/lib/format";

import type { OverrideDiff } from "./types";

interface OverridePreviewDialogProps {
  /** The list of field-level diffs to display. */
  diffs: OverrideDiff[];
  /** Preset name for the dialog title. */
  presetName: string;
  /** Called when the user confirms applying the preset. */
  onConfirm: () => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

export function OverridePreviewDialog({
  diffs,
  presetName,
  onConfirm,
  onCancel,
}: OverridePreviewDialogProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-6",
        "bg-[var(--color-surface-primary)]",
        "border border-[var(--color-border-default)]",
        "shadow-lg max-w-lg w-full",
      )}
      data-testid="override-preview-dialog"
    >
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">
        Apply &ldquo;{presetName}&rdquo;
      </h3>

      {diffs.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          No changes would be applied.
        </p>
      ) : (
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {diffs.map((diff) => (
            <div
              key={diff.field}
              className={cn(
                "rounded-[var(--radius-md)] p-3",
                "bg-[var(--color-surface-secondary)]",
                "border border-[var(--color-border-default)]",
              )}
              data-testid={`diff-field-${diff.field}`}
            >
              <p className="text-xs font-medium text-[var(--color-text-primary)] mb-1">
                {diff.field}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[var(--color-text-muted)]">Current:</span>
                  <span
                    className="ml-1 text-[var(--color-text-primary)]"
                    data-testid="current-value"
                  >
                    {formatValue(diff.current_value)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)]">New:</span>
                  <span
                    className="ml-1 font-medium text-[var(--color-action-primary)]"
                    data-testid="preset-value"
                  >
                    {formatValue(diff.preset_value)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} data-testid="cancel-button">
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onConfirm} data-testid="confirm-button">
          Apply
        </Button>
      </div>
    </div>
  );
}
