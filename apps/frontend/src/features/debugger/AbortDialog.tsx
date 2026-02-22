/**
 * Abort confirmation dialog for job debugger (PRD-34).
 *
 * Shows a confirmation dialog before aborting a job, with an
 * optional reason textarea (max 2000 characters).
 */

import { useState } from "react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/primitives";
import { Stack } from "@/components/layout";

import { DEBUGGER_CARD_CLASSES, DEBUGGER_TEXTAREA_BASE } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const MAX_REASON_LENGTH = 2000;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface AbortDialogProps {
  /** Callback when the user confirms the abort. */
  onConfirm: (reason?: string) => void;
  /** Callback to close/cancel the dialog. */
  onCancel: () => void;
  /** Whether the abort mutation is in progress. */
  isAborting: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AbortDialog({
  onConfirm,
  onCancel,
  isAborting,
}: AbortDialogProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    onConfirm(reason.trim() || undefined);
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
      aria-label="Abort job confirmation"
    >
      <div
        className={cn(
          ...DEBUGGER_CARD_CLASSES,
          "shadow-xl",
          "w-full max-w-md",
          "p-6",
        )}
      >
        {/* Header */}
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
          Abort Job
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Are you sure you want to abort this job? This action cannot be undone.
        </p>

        {/* Reason textarea */}
        <label
          htmlFor="abort-reason"
          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
        >
          Reason (optional)
        </label>
        <textarea
          id="abort-reason"
          className={cn(
            ...DEBUGGER_TEXTAREA_BASE,
            "h-20",
            "resize-none",
          )}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_REASON_LENGTH}
          placeholder="Why are you aborting this job?"
        />
        <p className="text-xs text-[var(--color-text-muted)] mt-1 text-right">
          {reason.length}/{MAX_REASON_LENGTH}
        </p>

        {/* Actions */}
        <Stack direction="horizontal" gap={2} justify="end" className="mt-4">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            disabled={isAborting}
          >
            {isAborting ? "Aborting..." : "Confirm Abort"}
          </Button>
        </Stack>
      </div>
    </div>
  );
}
