/**
 * Single cell in the comparison gallery (PRD-68).
 *
 * Shows video/thumbnail, character name, QA score badge, approval
 * status badge, and hover-reveal quick-action buttons.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { Check, X, AlertTriangle, Video } from "@/tokens/icons";

import type { ComparisonCell } from "./types";
import { APPROVAL_BADGE_VARIANT, QA_THRESHOLD_GOOD, QA_THRESHOLD_FAIR } from "./types";

const BORDER_BY_STATUS: Record<string, string> = {
  approved: "border-[var(--color-action-success)]",
  rejected: "border-[var(--color-action-danger)]",
  flagged: "border-[var(--color-action-warning)]",
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function qaVariant(score: number | null): "success" | "warning" | "danger" | "default" {
  if (score === null) return "default";
  if (score >= QA_THRESHOLD_GOOD) return "success";
  if (score >= QA_THRESHOLD_FAIR) return "warning";
  return "danger";
}

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface GalleryCellProps {
  cell: ComparisonCell;
  /** Label to show at top - defaults to character_name. */
  primaryLabel?: string;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  isMuted?: boolean;
  onMuteToggle?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onFlag?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GalleryCell({
  cell,
  primaryLabel,
  videoRef,
  isMuted = true,
  onApprove,
  onReject,
  onFlag,
}: GalleryCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const label = primaryLabel ?? cell.character_name;
  const borderClass = cell.approval_status
    ? BORDER_BY_STATUS[cell.approval_status]
    : "border-[var(--color-border-default)]";

  return (
    <div
      data-testid="gallery-cell"
      className={cn(
        "relative flex flex-col rounded-[var(--radius-lg)] border-2 overflow-hidden",
        "bg-[var(--color-surface-secondary)] transition-colors",
        borderClass,
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Video / placeholder area */}
      <div className="relative aspect-video bg-black flex items-center justify-center">
        {cell.segment_id && cell.stream_url ? (
          <video
            ref={videoRef}
            src={cell.stream_url}
            muted={isMuted}
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-[var(--spacing-2)] text-[var(--color-text-muted)]">
            <Video size={32} />
            <span className="text-sm">No video</span>
          </div>
        )}

        {/* Hover overlay with quick actions */}
        {isHovered && cell.segment_id && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-[var(--spacing-2)]">
            <button
              type="button"
              onClick={onApprove}
              className="p-2 rounded-full bg-[var(--color-action-success)] text-white hover:opacity-80 transition-opacity"
              title="Approve"
            >
              <Check size={16} />
            </button>
            <button
              type="button"
              onClick={onReject}
              className="p-2 rounded-full bg-[var(--color-action-danger)] text-white hover:opacity-80 transition-opacity"
              title="Reject"
            >
              <X size={16} />
            </button>
            <button
              type="button"
              onClick={onFlag}
              className="p-2 rounded-full bg-[var(--color-action-warning)] text-white hover:opacity-80 transition-opacity"
              title="Flag"
            >
              <AlertTriangle size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-2)]">
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {label}
        </span>

        <div className="flex items-center gap-[var(--spacing-1)] shrink-0">
          {cell.qa_score !== null && (
            <Badge variant={qaVariant(cell.qa_score)} size="sm">
              {(cell.qa_score * 100).toFixed(0)}%
            </Badge>
          )}

          {cell.approval_status && (
            <Badge
              variant={APPROVAL_BADGE_VARIANT[cell.approval_status] ?? "default"}
              size="sm"
            >
              {cell.approval_status}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
