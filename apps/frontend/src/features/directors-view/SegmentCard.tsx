/**
 * Touch-optimized segment review card (PRD-55).
 *
 * Displays a segment thumbnail, avatar name, scene type, and status
 * badge. Swipe-enabled with visual feedback (tilt + color tint overlay).
 * All tap targets meet the 44px minimum WCAG touch target guideline.
 */

import { useCallback, useRef } from "react";

import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { Video } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useSwipeGesture } from "./hooks/use-swipe-gesture";
import { SwipeOverlay } from "./SwipeOverlay";
import type { ReviewQueueItem, SwipeAction } from "./types";
import { MIN_TOUCH_TARGET, SWIPE_ACTION_BADGE_VARIANT } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SegmentCardProps {
  item: ReviewQueueItem;
  onAction: (segmentId: number, action: SwipeAction) => void;
  onTap: (segmentId: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SegmentCard({ item, onAction, onTap }: SegmentCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleSwipeRight = useCallback(() => {
    onAction(item.segment_id, "approve");
  }, [item.segment_id, onAction]);

  const handleSwipeLeft = useCallback(() => {
    onAction(item.segment_id, "reject");
  }, [item.segment_id, onAction]);

  const handleSwipeUp = useCallback(() => {
    onAction(item.segment_id, "flag");
  }, [item.segment_id, onAction]);

  const { swipeDirection, swipeProgress } = useSwipeGesture(cardRef, {
    onSwipeRight: handleSwipeRight,
    onSwipeLeft: handleSwipeLeft,
    onSwipeUp: handleSwipeUp,
  });

  // Tilt transform based on horizontal swipe
  const tiltDeg = swipeDirection === "right"
    ? swipeProgress * 5
    : swipeDirection === "left"
      ? swipeProgress * -5
      : 0;

  return (
    <div
      ref={cardRef}
      data-testid="segment-card"
      role="button"
      tabIndex={0}
      onClick={() => onTap(item.segment_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap(item.segment_id);
        }
      }}
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-md)]",
        "border border-[var(--color-border-default)]",
        "bg-[var(--color-surface-secondary)]",
        "cursor-pointer select-none transition-transform",
        "active:scale-[0.98]",
      )}
      style={{
        minHeight: `${MIN_TOUCH_TARGET}px`,
        transform: tiltDeg !== 0 ? `rotate(${tiltDeg}deg)` : undefined,
      }}
    >
      {/* Swipe overlay */}
      <SwipeOverlay direction={swipeDirection} progress={swipeProgress} />

      {/* Card content */}
      <div className="flex items-center gap-3 p-3">
        {/* Thumbnail */}
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-tertiary)] overflow-hidden">
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt={`${item.avatar_name} thumbnail`}
              className="h-full w-full object-cover"
            />
          ) : (
            <Video
              size={iconSizes.lg}
              className="text-[var(--color-text-muted)]"
              aria-hidden="true"
            />
          )}
        </div>

        {/* Details */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
            {item.avatar_name}
          </span>
          <span className="truncate text-xs text-[var(--color-text-muted)]">
            {item.scene_type}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {formatDateTime(item.submitted_at)}
          </span>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          <Badge
            variant={statusToBadgeVariant(item.status)}
            size="sm"
          >
            {item.status}
          </Badge>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function statusToBadgeVariant(status: string) {
  const map: Record<string, typeof SWIPE_ACTION_BADGE_VARIANT.approve> = {
    approved: "success",
    rejected: "danger",
    flagged: "warning",
    pending: "default",
  };
  return map[status] ?? "default";
}
