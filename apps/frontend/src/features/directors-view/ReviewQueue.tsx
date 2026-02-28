/**
 * Review queue list with pull-to-refresh (PRD-55).
 *
 * Displays a scrollable list of SegmentCards with loading skeletons,
 * empty state, and status filtering.
 */

import { useCallback, useState } from "react";

import { cn } from "@/lib/cn";
import { RefreshCw } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useReviewQueue } from "./hooks/use-directors-view";
import { SegmentCard } from "./SegmentCard";
import type { SwipeAction } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STATUS_FILTER_OPTIONS = ["all", "pending", "approved", "rejected", "flagged"] as const;
type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

const SKELETON_COUNT = 5;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ReviewQueueProps {
  onSegmentAction: (segmentId: number, action: SwipeAction) => void;
  onSegmentTap: (segmentId: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReviewQueue({ onSegmentAction, onSegmentTap }: ReviewQueueProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const params = statusFilter !== "all" ? { status: statusFilter } : undefined;
  const { data: items, isPending, isError, refetch, isRefetching } = useReviewQueue(params);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  /* -- Loading ------------------------------------------------------------ */

  if (isPending) {
    return (
      <div data-testid="review-queue-loading" className="flex flex-col gap-3 p-4">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  /* -- Error -------------------------------------------------------------- */

  if (isError) {
    return (
      <div className="p-4 text-center text-sm text-[var(--color-status-error)]">
        Failed to load review queue
      </div>
    );
  }

  /* -- Main render -------------------------------------------------------- */

  return (
    <div data-testid="review-queue" className="flex flex-col">
      {/* Filter bar + refresh */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
        {STATUS_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setStatusFilter(opt)}
            className={cn(
              "shrink-0 rounded-[var(--radius-full)] px-3 py-1.5 text-xs font-medium transition-colors",
              opt === statusFilter
                ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
                : "bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]",
            )}
          >
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        ))}

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefetching}
          aria-label="Refresh queue"
          className={cn(
            "ml-auto shrink-0 rounded-[var(--radius-full)] p-2",
            "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)]",
            "disabled:opacity-50",
          )}
        >
          <RefreshCw
            size={iconSizes.sm}
            className={cn(isRefetching && "animate-spin")}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Queue items */}
      {items && items.length > 0 ? (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {items.map((item) => (
            <SegmentCard
              key={item.segment_id}
              item={item}
              onAction={onSegmentAction}
              onTap={onSegmentTap}
            />
          ))}
        </div>
      ) : (
        <div data-testid="review-queue-empty" className="px-4 py-12 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            No segments in the review queue
          </p>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Skeleton card for loading state
   -------------------------------------------------------------------------- */

function SkeletonCard() {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3 animate-pulse">
      <div className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface-tertiary)]" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-3 w-3/4 rounded bg-[var(--color-surface-tertiary)]" />
        <div className="h-2.5 w-1/2 rounded bg-[var(--color-surface-tertiary)]" />
        <div className="h-2.5 w-1/3 rounded bg-[var(--color-surface-tertiary)]" />
      </div>
      <div className="h-5 w-14 rounded-full bg-[var(--color-surface-tertiary)]" />
    </div>
  );
}
