/**
 * Resume from checkpoint dialog (PRD-28).
 *
 * Shows which checkpoint will be used, allows optional parameter
 * modification, and requires confirmation before resuming.
 */

import { useState } from "react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/primitives";
import { Stack } from "@/components/layout";

import type { Checkpoint } from "./types";
import { formatBytes } from "./types";
import { useResumeFromCheckpoint } from "./hooks/use-checkpoints";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface ResumeDialogProps {
  /** The job ID to resume. */
  jobId: number;
  /** The checkpoint that will be used for resume (latest). */
  checkpoint: Checkpoint;
  /** Callback to close the dialog. */
  onClose: () => void;
  /** Callback after successful resume (receives new job ID). */
  onSuccess?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ResumeDialog({
  jobId,
  checkpoint,
  onClose,
  onSuccess,
}: ResumeDialogProps) {
  const [modifiedParamsJson, setModifiedParamsJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const resumeMutation = useResumeFromCheckpoint();

  const handleResume = () => {
    let modifiedParams: Record<string, unknown> | undefined;

    if (modifiedParamsJson.trim()) {
      try {
        modifiedParams = JSON.parse(modifiedParamsJson);
        setParseError(null);
      } catch {
        setParseError("Invalid JSON. Please check the format.");
        return;
      }
    }

    resumeMutation.mutate(
      {
        jobId,
        input: { modified_params: modifiedParams },
      },
      {
        onSuccess: () => {
          onSuccess?.();
          onClose();
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        "flex items-center justify-center",
        "bg-black/50",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Resume from checkpoint"
    >
      <div
        className={cn(
          "bg-[var(--color-surface-primary)]",
          "border border-[var(--color-border-default)]",
          "rounded-[var(--radius-lg)]",
          "shadow-xl",
          "w-full max-w-lg",
          "p-6",
        )}
      >
        {/* Header */}
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
          Resume from Checkpoint
        </h2>

        {/* Checkpoint info */}
        <div
          className={cn(
            "bg-[var(--color-surface-secondary)]",
            "border border-[var(--color-border-default)]",
            "rounded-[var(--radius-md)]",
            "px-4 py-3 mb-4",
          )}
        >
          <Stack direction="vertical" gap={1}>
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Resuming from: {checkpoint.stage_name}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              Stage {checkpoint.stage_index + 1}
              {checkpoint.size_bytes != null && (
                <> &middot; {formatBytes(checkpoint.size_bytes)}</>
              )}
              {" "}&middot; Created {new Date(checkpoint.created_at).toLocaleString()}
            </span>
          </Stack>
        </div>

        {/* Parameter modification (optional) */}
        <div className="mb-4">
          <label
            htmlFor="modified-params"
            className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
          >
            Modified parameters (optional JSON)
          </label>
          <textarea
            id="modified-params"
            className={cn(
              "w-full h-24",
              "bg-[var(--color-surface-secondary)]",
              "border border-[var(--color-border-default)]",
              "rounded-[var(--radius-md)]",
              "px-3 py-2 text-sm",
              "text-[var(--color-text-primary)]",
              "placeholder:text-[var(--color-text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]",
              "font-mono",
            )}
            placeholder={'{ "resolution": "720p", "seed": 42 }'}
            value={modifiedParamsJson}
            onChange={(e) => {
              setModifiedParamsJson(e.target.value);
              setParseError(null);
            }}
          />
          {parseError && (
            <span className="text-xs text-[var(--color-status-error)] mt-1">
              {parseError}
            </span>
          )}
          <span className="text-xs text-[var(--color-text-muted)] mt-1 block">
            Leave empty to resume with original parameters. Provide a JSON object to override specific parameters.
          </span>
        </div>

        {/* Mutation error */}
        {resumeMutation.isError && (
          <div className="mb-4 text-sm text-[var(--color-status-error)]">
            Failed to resume job. Please try again.
          </div>
        )}

        {/* Actions */}
        <Stack direction="horizontal" gap={2} justify="end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleResume}
            disabled={resumeMutation.isPending}
          >
            {resumeMutation.isPending ? "Resuming..." : "Resume Pipeline"}
          </Button>
        </Stack>
      </div>
    </div>
  );
}
