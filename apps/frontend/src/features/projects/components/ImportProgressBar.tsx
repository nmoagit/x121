/**
 * Compact progress bar shown during character import operations.
 *
 * Displays the current phase, progress fraction, and error count.
 */

import { Badge, Spinner } from "@/components/primitives";

import type { ImportProgress } from "../hooks/use-character-import";

const PHASE_LABELS: Record<ImportProgress["phase"], string> = {
  creating: "Creating characters",
  "uploading-images": "Uploading images",
  "uploading-metadata": "Uploading metadata",
  "importing-videos": "Importing videos",
  done: "Complete",
};

interface ImportProgressBarProps {
  progress: ImportProgress;
}

export function ImportProgressBar({ progress }: ImportProgressBarProps) {
  const { phase, current, total, errors } = progress;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const isDone = phase === "done";

  return (
    <div className="flex items-center gap-[var(--spacing-3)] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-[var(--spacing-3)] py-[var(--spacing-2)]">
      {!isDone && <Spinner size="sm" />}
      <span className="text-sm font-medium text-[var(--color-text-primary)]">
        {PHASE_LABELS[phase]}
      </span>
      {total > 0 && (
        <>
          <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden min-w-[80px] max-w-[200px]">
            <div
              className="h-full rounded-full bg-[var(--color-action-primary)] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
            {current}/{total}
          </span>
        </>
      )}
      {errors.length > 0 && (
        <Badge variant="danger" size="sm">
          {errors.length} {errors.length === 1 ? "error" : "errors"}
        </Badge>
      )}
    </div>
  );
}
