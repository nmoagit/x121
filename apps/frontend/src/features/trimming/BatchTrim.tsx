/**
 * Batch trim form for applying uniform trims to multiple segments (PRD-78).
 *
 * Provides a form to set in/out frame values for batch application across
 * multiple selected segments. Includes a confirmation step and progress
 * indication.
 */

import { useState } from "react";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface BatchTrimProps {
  /** IDs of segments to trim. */
  segmentIds: number[];
  /** Callback fired when the batch operation completes. */
  onComplete: () => void;
  /** Whether the mutation is currently in progress. */
  isLoading?: boolean;
  /** Callback to submit the batch trim. */
  onSubmit?: (segmentIds: number[], inFrame: number, outFrame: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BatchTrim({
  segmentIds,
  onComplete,
  isLoading = false,
  onSubmit,
}: BatchTrimProps) {
  const [inFrame, setInFrame] = useState(0);
  const [outFrame, setOutFrame] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);

  const isValid = outFrame > inFrame && inFrame >= 0;

  const handleApply = () => {
    if (!isValid) return;
    setIsConfirming(true);
  };

  const handleConfirm = () => {
    onSubmit?.(segmentIds, inFrame, outFrame);
    setIsConfirming(false);
    onComplete();
  };

  const handleCancel = () => {
    setIsConfirming(false);
  };

  return (
    <div
      data-testid="batch-trim-form"
      className="space-y-4 rounded border border-[var(--color-border-subtle)] p-4"
    >
      <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
        Batch Trim
      </h4>

      <div
        data-testid="segment-count"
        className="text-sm text-[var(--color-text-secondary)]"
      >
        {segmentIds.length} segment{segmentIds.length !== 1 ? "s" : ""} selected
      </div>

      {/* Frame inputs */}
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--color-text-secondary)]">In Frame</span>
          <input
            data-testid="batch-in-frame"
            type="number"
            min={0}
            value={inFrame}
            onChange={(e) => setInFrame(Number(e.target.value))}
            className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--color-text-secondary)]">Out Frame</span>
          <input
            data-testid="batch-out-frame"
            type="number"
            min={1}
            value={outFrame}
            onChange={(e) => setOutFrame(Number(e.target.value))}
            className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {/* Confirmation step */}
      {isConfirming ? (
        <div
          data-testid="confirm-step"
          className="space-y-3 rounded bg-amber-500/10 p-3"
        >
          <p className="text-sm text-amber-600">
            This will apply frames {inFrame}-{outFrame} trim to{" "}
            {segmentIds.length} segment{segmentIds.length !== 1 ? "s" : ""}.
            This action cannot be undone in batch.
          </p>
          <div className="flex gap-2">
            <button
              data-testid="confirm-apply"
              type="button"
              disabled={isLoading}
              onClick={handleConfirm}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? "Applying..." : "Confirm"}
            </button>
            <button
              data-testid="confirm-cancel"
              type="button"
              onClick={handleCancel}
              className="rounded px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          data-testid="batch-apply"
          type="button"
          disabled={!isValid || isLoading || segmentIds.length === 0}
          onClick={handleApply}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Apply to {segmentIds.length} Segment
          {segmentIds.length !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
