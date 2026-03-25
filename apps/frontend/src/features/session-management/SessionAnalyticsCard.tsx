/**
 * Session analytics summary cards (PRD-98).
 *
 * Displays key session metrics using the shared StatBadge component.
 */

import { StatBadge ,  ContextLoader } from "@/components/primitives";
import { formatDurationSecs } from "@/lib/format";

import { useSessionAnalytics } from "./hooks/use-session-management";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SessionAnalyticsCard() {
  const { data, isLoading, error } = useSessionAnalytics();

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <ContextLoader size={64} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load session analytics.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-[var(--spacing-3)] sm:grid-cols-3 lg:grid-cols-5">
      <StatBadge label="Total Sessions" value={data.total_sessions} />
      <StatBadge label="Active" value={data.active_sessions} />
      <StatBadge label="Idle" value={data.idle_sessions} />
      <StatBadge
        label="Avg Duration"
        value={formatDurationSecs(data.avg_duration_seconds)}
      />
      <StatBadge label="Peak Concurrent" value={data.peak_concurrent} />
    </div>
  );
}
