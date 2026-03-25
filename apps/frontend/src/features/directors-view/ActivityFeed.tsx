/**
 * Chronological activity feed (PRD-55).
 *
 * Shows a simple scrollable list of activity events. Each item is
 * tappable to navigate to the related segment (if any).
 */

import { ContextLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { Activity } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useActivityFeed } from "./hooks/use-directors-view";
import type { ActivityFeedItem } from "./types";
import { MIN_TOUCH_TARGET } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ActivityFeedProps {
  onSegmentTap: (segmentId: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ActivityFeed({ onSegmentTap }: ActivityFeedProps) {
  const { data: items, isPending, isError } = useActivityFeed();

  if (isPending) {
    return (
      <div data-testid="activity-feed-loading" className="flex items-center justify-center py-8">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-status-error)]">
        Failed to load activity feed
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div data-testid="activity-feed-empty" className="px-4 py-12 text-center">
        <Activity
          size={iconSizes.xl}
          className="mx-auto mb-2 text-[var(--color-text-muted)]"
          aria-hidden="true"
        />
        <p className="text-sm text-[var(--color-text-muted)]">No recent activity</p>
      </div>
    );
  }

  return (
    <div data-testid="activity-feed" className="flex flex-col">
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} onSegmentTap={onSegmentTap} />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Activity row
   -------------------------------------------------------------------------- */

function ActivityRow({
  item,
  onSegmentTap,
}: {
  item: ActivityFeedItem;
  onSegmentTap: (segmentId: number) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSegmentTap(item.target_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSegmentTap(item.target_id);
        }
      }}
      className={cn(
        "flex items-start gap-3 border-b border-[var(--color-border-default)] px-4 py-3",
        "cursor-pointer hover:bg-[var(--color-surface-secondary)]",
      )}
      style={{ minHeight: MIN_TOUCH_TARGET }}
    >
      <EventIcon eventType={item.action_type} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm text-[var(--color-text-primary)]">
          {item.action_type} segment #{item.target_id}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {formatDateTime(item.client_timestamp)}
        </span>
        {item.synced && (
          <span className="text-xs text-[var(--color-text-muted)] opacity-60">synced</span>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Event type icon
   -------------------------------------------------------------------------- */

const EVENT_TYPE_COLORS: Record<string, string> = {
  approved: "var(--color-action-success)",
  rejected: "var(--color-action-danger)",
  flagged: "var(--color-action-warning)",
};

function EventIcon({ eventType }: { eventType: string }) {
  const color = EVENT_TYPE_COLORS[eventType] ?? "var(--color-text-muted)";

  return (
    <span
      className="mt-1 flex h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}
