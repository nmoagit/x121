import { useState } from "react";

import { EmptyState } from "@/components/domain";
import { Select } from "@/components/primitives";
import { useActivityFeed } from "@/features/dashboard/hooks/use-dashboard";
import type { ActivityFeedItem } from "@/features/dashboard/hooks/use-dashboard";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { AlertTriangle, Bell, Check, Layers, XCircle, Zap } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const CATEGORY_OPTIONS = [
  { value: "", label: "All events" },
  { value: "job", label: "Jobs" },
  { value: "review", label: "Reviews" },
  { value: "system", label: "System" },
  { value: "collaboration", label: "Collaboration" },
];

/** Pick an icon and color per event category/type. */
function eventVisual(item: ActivityFeedItem): {
  icon: React.ReactNode;
  color: string;
} {
  if (item.event_type.includes("completed") || item.event_type.includes("approved")) {
    return {
      icon: <Check size={14} />,
      color: "text-[var(--color-action-success)] bg-[var(--color-action-success)]/15",
    };
  }
  if (item.event_type.includes("failed") || item.event_type.includes("rejected")) {
    return {
      icon: <XCircle size={14} />,
      color: "text-[var(--color-action-danger)] bg-[var(--color-action-danger)]/15",
    };
  }
  if (item.category === "system") {
    return {
      icon: <AlertTriangle size={14} />,
      color: "text-[var(--color-action-warning)] bg-[var(--color-action-warning)]/15",
    };
  }
  return {
    icon: <Zap size={14} />,
    color: "text-[var(--color-action-primary)] bg-[var(--color-action-primary)]/15",
  };
}

/** Build a human-readable message from the event type and payload. */
function eventMessage(item: ActivityFeedItem): string {
  // Use a readable label from the event_type field (e.g. "job.completed" -> "Job completed").
  const label = item.event_type.replace(/\./g, " ").replace(/^./, (c) => c.toUpperCase());
  if (item.actor_name) {
    return `${item.actor_name} - ${label}`;
  }
  return label;
}

/* --------------------------------------------------------------------------
   Feed item row
   -------------------------------------------------------------------------- */

function FeedRow({ item }: { item: ActivityFeedItem }) {
  const visual = eventVisual(item);

  return (
    <div className="flex items-start gap-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] last:border-b-0">
      <div
        className={cn(
          "shrink-0 flex items-center justify-center w-7 h-7 rounded-full mt-0.5",
          visual.color,
        )}
        aria-hidden="true"
      >
        {visual.icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text-primary)] leading-snug">
          {eventMessage(item)}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {formatDateTime(item.created_at)}
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Widget
   -------------------------------------------------------------------------- */

export function ActivityFeedWidget() {
  const [category, setCategory] = useState("");
  const { data: events, isLoading, error, refetch } = useActivityFeed({
    limit: 50,
    category: category || undefined,
  });

  const filterControl = (
    <Select
      options={CATEGORY_OPTIONS}
      value={category}
      onChange={(val) => setCategory(val)}
    />
  );

  return (
    <WidgetBase
      title="Activity Feed"
      icon={<Bell size={16} />}
      loading={isLoading}
      error={error?.message}
      onRetry={() => void refetch()}
      headerActions={filterControl}
    >
      {!events || events.length === 0 ? (
        <EmptyState
          icon={<Layers size={32} />}
          title="No recent activity"
          description="Events will appear here as jobs run and reviews are submitted."
        />
      ) : (
        <div className="flex flex-col">
          {events.map((item) => (
            <FeedRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </WidgetBase>
  );
}
