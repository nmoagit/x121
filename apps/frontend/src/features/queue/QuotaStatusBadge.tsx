/**
 * Quota status badge (PRD-08).
 *
 * Displays the user's current GPU quota usage as a compact badge.
 * Shows a warning color at 80% usage, error color when exceeded.
 */

import { Badge } from "@/components/primitives";
import { useQuotaStatus } from "./hooks/use-queue";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Threshold at which the badge turns to warning color (80%). */
const WARNING_THRESHOLD = 0.8;

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function formatSeconds(secs: number): string {
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

function usageRatio(used: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null;
  return used / limit;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QuotaStatusBadge() {
  const { data, isLoading } = useQuotaStatus();

  if (isLoading || !data) return null;

  if (data.status === "no_quota") {
    return (
      <Badge variant="default" size="sm">
        Unlimited GPU
      </Badge>
    );
  }

  if (data.status === "exceeded") {
    return (
      <Badge variant="danger" size="sm">
        Quota exceeded ({data.exceeded_type})
      </Badge>
    );
  }

  // data.status === "within_limits"
  const dailyRatio = usageRatio(data.used_today_secs, data.daily_limit_secs);
  const weeklyRatio = usageRatio(
    data.used_this_week_secs,
    data.weekly_limit_secs,
  );

  // Use the highest ratio for badge variant
  const maxRatio = Math.max(dailyRatio ?? 0, weeklyRatio ?? 0);
  const variant = maxRatio >= WARNING_THRESHOLD ? "warning" : "default";

  // Show the most relevant limit
  const label = data.daily_limit_secs != null
    ? `${formatSeconds(data.used_today_secs)} / ${formatSeconds(data.daily_limit_secs)} today`
    : data.weekly_limit_secs != null
      ? `${formatSeconds(data.used_this_week_secs)} / ${formatSeconds(data.weekly_limit_secs)} this week`
      : `${formatSeconds(data.used_today_secs)} used today`;

  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}
