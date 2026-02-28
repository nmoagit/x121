/**
 * Keyboard-driven rapid review interface (PRD-92).
 *
 * Minimal UI that presents one segment at a time with keyboard shortcuts
 * for approve (1), reject (2), flag (3), and skip (space). Auto-advances
 * to the next segment after each action.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";

import { useBatchApprove, useBatchReject } from "./hooks/use-batch-review";
import { ReviewProgressBar } from "./ReviewProgressBar";
import { QUICK_REVIEW_KEYS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface QuickReviewModeProps {
  projectId: number;
  segmentIds: number[];
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QuickReviewMode({ projectId, segmentIds }: QuickReviewModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const batchApprove = useBatchApprove();
  const batchReject = useBatchReject();

  const currentSegmentId = segmentIds[currentIndex] ?? null;
  const isComplete = currentIndex >= segmentIds.length;

  /* -- Session timer ---------------------------------------------------- */

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedMs((prev) => prev + 1000);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* -- Advance to next segment ------------------------------------------ */

  const advance = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
  }, []);

  /* -- Actions ---------------------------------------------------------- */

  const handleApprove = useCallback(() => {
    if (currentSegmentId == null) return;
    batchApprove.mutate({ segment_ids: [currentSegmentId] }, { onSuccess: advance });
  }, [currentSegmentId, batchApprove, advance]);

  const handleReject = useCallback(() => {
    if (currentSegmentId == null) return;
    batchReject.mutate({ segment_ids: [currentSegmentId] }, { onSuccess: advance });
  }, [currentSegmentId, batchReject, advance]);

  const handleFlag = useCallback(() => {
    // Flag uses reject with a "flagged" reason
    if (currentSegmentId == null) return;
    batchReject.mutate(
      { segment_ids: [currentSegmentId], reason: "flagged" },
      { onSuccess: advance },
    );
  }, [currentSegmentId, batchReject, advance]);

  const handleSkip = useCallback(() => {
    advance();
  }, [advance]);

  /* -- Keyboard listener ------------------------------------------------ */

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isComplete) return;

      switch (e.key) {
        case QUICK_REVIEW_KEYS.approve:
          e.preventDefault();
          handleApprove();
          break;
        case QUICK_REVIEW_KEYS.reject:
          e.preventDefault();
          handleReject();
          break;
        case QUICK_REVIEW_KEYS.flag:
          e.preventDefault();
          handleFlag();
          break;
        case QUICK_REVIEW_KEYS.skip:
          e.preventDefault();
          handleSkip();
          break;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isComplete, handleApprove, handleReject, handleFlag, handleSkip]);

  /* -- Render ----------------------------------------------------------- */

  if (segmentIds.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] py-4">
        No segments to review.
      </div>
    );
  }

  return (
    <div data-testid="quick-review-mode" className="flex flex-col gap-4">
      {/* Progress */}
      <ReviewProgressBar projectId={projectId} />

      {/* Session timer */}
      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
        <span>
          Segment {Math.min(currentIndex + 1, segmentIds.length)} of {segmentIds.length}
        </span>
        <span>Elapsed: {formatDuration(elapsedMs)}</span>
      </div>

      {/* Current segment */}
      {isComplete ? (
        <div className="rounded-[var(--radius-md)] bg-[var(--color-action-success)]/10 px-4 py-6 text-center">
          <p className="text-sm font-medium text-[var(--color-action-success)]">
            Review complete
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {segmentIds.length} segments reviewed in {formatDuration(elapsedMs)}
          </p>
        </div>
      ) : (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-6 text-center">
          <p className="text-lg font-semibold text-[var(--color-text-primary)]">
            Segment #{currentSegmentId}
          </p>
        </div>
      )}

      {/* Action buttons with shortcut hints */}
      {!isComplete && (
        <div className="flex items-center justify-center gap-3">
          <ActionButton
            label="Approve"
            shortcut="1"
            onClick={handleApprove}
            variant="success"
            disabled={batchApprove.isPending || batchReject.isPending}
          />
          <ActionButton
            label="Reject"
            shortcut="2"
            onClick={handleReject}
            variant="danger"
            disabled={batchApprove.isPending || batchReject.isPending}
          />
          <ActionButton
            label="Flag"
            shortcut="3"
            onClick={handleFlag}
            variant="warning"
            disabled={batchApprove.isPending || batchReject.isPending}
          />
          <ActionButton
            label="Skip"
            shortcut="Space"
            onClick={handleSkip}
            variant="muted"
            disabled={false}
          />
        </div>
      )}

      {/* Keyboard hint */}
      {!isComplete && (
        <p className="text-center text-xs text-[var(--color-text-muted)]">
          1 = Approve | 2 = Reject | 3 = Flag | Space = Skip
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Internal sub-component
   -------------------------------------------------------------------------- */

type ActionVariant = "success" | "danger" | "warning" | "muted";

const VARIANT_CLASSES: Record<ActionVariant, string> = {
  success:
    "bg-[var(--color-action-success)]/15 text-[var(--color-action-success)] hover:bg-[var(--color-action-success)]/25",
  danger:
    "bg-[var(--color-action-danger)]/15 text-[var(--color-action-danger)] hover:bg-[var(--color-action-danger)]/25",
  warning:
    "bg-[var(--color-action-warning)]/15 text-[var(--color-action-warning)] hover:bg-[var(--color-action-warning)]/25",
  muted:
    "bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-secondary)]",
};

function ActionButton({
  label,
  shortcut,
  onClick,
  variant,
  disabled,
}: {
  label: string;
  shortcut: string;
  onClick: () => void;
  variant: ActionVariant;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1 rounded-[var(--radius-md)] px-6 py-3",
        "text-sm font-medium transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANT_CLASSES[variant],
      )}
    >
      <span>{label}</span>
      <kbd className="text-xs opacity-70">{shortcut}</kbd>
    </button>
  );
}
