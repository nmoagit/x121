/**
 * Review player component for the segment approval workflow (PRD-35).
 *
 * Displays a video player for the current segment with approve/reject/flag
 * action buttons. Provides visual feedback (color flash) on each action.
 */

import { useCallback, useState } from "react";

import {
  DECISION_APPROVED,
  DECISION_FLAGGED,
  DECISION_REJECTED,
  decisionLabel,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ReviewPlayerProps {
  /** The ID of the segment being reviewed. */
  segmentId: number;
  /** Current segment version for the approval record. */
  segmentVersion: number;
  /** Called when the user approves the segment. */
  onApprove: () => void;
  /** Called when the user rejects the segment (opens rejection dialog). */
  onReject: () => void;
  /** Called when the user flags the segment for discussion. */
  onFlag: () => void;
  /** Whether actions are disabled (e.g. during auto-advance). */
  disabled?: boolean;
}

/* --------------------------------------------------------------------------
   Flash feedback animation state
   -------------------------------------------------------------------------- */

type FlashState = "approved" | "rejected" | "flagged" | null;

const FLASH_DURATION_MS = 300;

function flashClass(flash: FlashState): string {
  switch (flash) {
    case "approved":
      return "ring-4 ring-green-500/50";
    case "rejected":
      return "ring-4 ring-red-500/50";
    case "flagged":
      return "ring-4 ring-yellow-500/50";
    default:
      return "";
  }
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReviewPlayer({
  segmentId,
  segmentVersion,
  onApprove,
  onReject,
  onFlag,
  disabled = false,
}: ReviewPlayerProps) {
  const [flash, setFlash] = useState<FlashState>(null);

  const triggerFlash = useCallback((state: FlashState) => {
    setFlash(state);
    setTimeout(() => setFlash(null), FLASH_DURATION_MS);
  }, []);

  const handleApprove = useCallback(() => {
    if (disabled) return;
    triggerFlash("approved");
    onApprove();
  }, [disabled, onApprove, triggerFlash]);

  const handleReject = useCallback(() => {
    if (disabled) return;
    triggerFlash("rejected");
    onReject();
  }, [disabled, onReject, triggerFlash]);

  const handleFlag = useCallback(() => {
    if (disabled) return;
    triggerFlash("flagged");
    onFlag();
  }, [disabled, onFlag, triggerFlash]);

  return (
    <div
      className={`flex flex-col gap-4 rounded-lg bg-[var(--color-surface-secondary)] p-4 transition-all ${flashClass(flash)}`}
      data-testid="review-player"
    >
      {/* Video placeholder area */}
      <div className="flex aspect-video items-center justify-center rounded bg-black text-sm text-[var(--color-text-muted)]">
        Segment #{segmentId} (v{segmentVersion})
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleApprove}
          disabled={disabled}
          className="rounded-md bg-green-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          aria-label={`Approve segment ${segmentId}`}
        >
          {decisionLabel(DECISION_APPROVED)}
        </button>

        <button
          type="button"
          onClick={handleReject}
          disabled={disabled}
          className="rounded-md bg-red-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          aria-label={`Reject segment ${segmentId}`}
        >
          {decisionLabel(DECISION_REJECTED)}
        </button>

        <button
          type="button"
          onClick={handleFlag}
          disabled={disabled}
          className="rounded-md bg-yellow-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-yellow-700 disabled:opacity-50"
          aria-label={`Flag segment ${segmentId}`}
        >
          {decisionLabel(DECISION_FLAGGED)}
        </button>
      </div>

      {/* Keyboard shortcut hints */}
      <div className="flex items-center justify-center gap-4 text-xs text-[var(--color-text-muted)]">
        <span>Enter = Approve</span>
        <span>Backspace = Reject</span>
        <span>F = Flag</span>
      </div>
    </div>
  );
}
