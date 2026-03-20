import { useState } from "react";

import { EmptyState } from "@/components/domain";
import { Select } from "@/components/primitives";
import { useActivityFeed } from "@/features/dashboard/hooks/use-dashboard";
import type { ActivityFeedItem } from "@/features/dashboard/hooks/use-dashboard";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import {
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_PIPE,
  TERMINAL_SELECT,
} from "@/lib/ui-classes";
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
  textColor: string;
} {
  if (item.event_type.includes("completed") || item.event_type.includes("approved")) {
    return {
      icon: <Check size={14} />,
      color: "bg-green-400/15",
      textColor: "text-green-400",
    };
  }
  if (item.event_type.includes("failed") || item.event_type.includes("rejected")) {
    return {
      icon: <XCircle size={14} />,
      color: "bg-red-400/15",
      textColor: "text-red-400",
    };
  }
  if (item.category === "system") {
    return {
      icon: <AlertTriangle size={14} />,
      color: "bg-orange-400/15",
      textColor: "text-orange-400",
    };
  }
  return {
    icon: <Zap size={14} />,
    color: "bg-cyan-400/15",
    textColor: "text-cyan-400",
  };
}

/** Build a human-readable message from the event type and payload. */
function eventMessage(item: ActivityFeedItem): string {
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
    <div className={`flex items-start gap-[var(--spacing-3)] py-2 ${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER}`}>
      <div
        className={cn(
          "shrink-0 flex items-center justify-center w-7 h-7 rounded-full mt-0.5",
          visual.color,
          visual.textColor,
        )}
        aria-hidden="true"
      >
        {visual.icon}
      </div>

      <div className="flex-1 min-w-0 font-mono">
        <p className="text-xs text-[var(--color-text-primary)] leading-snug">
          {eventMessage(item)}
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-[var(--color-text-muted)]">
            {formatDateTime(item.created_at)}
          </span>
          {item.category && (
            <>
              <span className={TERMINAL_PIPE}>|</span>
              <span className="text-xs text-[var(--color-text-muted)]">{item.category}</span>
            </>
          )}
        </div>
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
      className={TERMINAL_SELECT}
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
          description="Events will appear as jobs run."
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
