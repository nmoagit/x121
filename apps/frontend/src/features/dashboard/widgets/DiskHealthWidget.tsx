import { useDiskHealth } from "@/features/dashboard/hooks/use-dashboard";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { HardDrive } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Determine gauge color based on usage percentage and thresholds. */
function gaugeColor(usagePct: number, warning: number, critical: number): string {
  if (usagePct >= critical) return "text-[var(--color-action-danger)]";
  if (usagePct >= warning) return "text-[var(--color-action-warning)]";
  return "text-[var(--color-action-success)]";
}

function gaugeBg(usagePct: number, warning: number, critical: number): string {
  if (usagePct >= critical) return "bg-[var(--color-action-danger)]";
  if (usagePct >= warning) return "bg-[var(--color-action-warning)]";
  return "bg-[var(--color-action-success)]";
}

function gaugeTrack(usagePct: number, warning: number, critical: number): string {
  if (usagePct >= critical) return "bg-[var(--color-action-danger)]/20";
  if (usagePct >= warning) return "bg-[var(--color-action-warning)]/20";
  return "bg-[var(--color-action-success)]/20";
}

/* --------------------------------------------------------------------------
   Widget
   -------------------------------------------------------------------------- */

export function DiskHealthWidget() {
  const { data, isLoading, error, refetch } = useDiskHealth();

  const usagePct = data ? data.usage_pct * 100 : 0;
  const warning = data ? data.warning_threshold * 100 : 80;
  const critical = data ? data.critical_threshold * 100 : 90;

  return (
    <WidgetBase
      title="Disk Health"
      icon={<HardDrive size={16} />}
      loading={isLoading}
      error={error?.message}
      onRetry={() => void refetch()}
    >
      {data && (
        <div className="flex flex-col items-center gap-[var(--spacing-4)]">
          {/* Usage gauge */}
          <div className="relative flex items-center justify-center w-28 h-28">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="var(--color-surface-tertiary)"
                strokeWidth="10"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                className={cn(
                  usagePct >= critical
                    ? "stroke-[var(--color-action-danger)]"
                    : usagePct >= warning
                      ? "stroke-[var(--color-action-warning)]"
                      : "stroke-[var(--color-action-success)]",
                )}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(usagePct / 100) * 263.9} 263.9`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  gaugeColor(usagePct, warning, critical),
                )}
              >
                {usagePct.toFixed(0)}%
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">used</span>
            </div>
          </div>

          {/* Capacity details */}
          <div className="w-full space-y-[var(--spacing-2)]">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">Used</span>
              <span className="text-[var(--color-text-primary)] font-medium tabular-nums">
                {formatBytes(data.used_bytes)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">Free</span>
              <span className="text-[var(--color-text-primary)] font-medium tabular-nums">
                {formatBytes(data.free_bytes)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">Total</span>
              <span className="text-[var(--color-text-primary)] font-medium tabular-nums">
                {formatBytes(data.total_bytes)}
              </span>
            </div>
          </div>

          {/* Warning bar */}
          <div className="w-full">
            <div
              className={cn(
                "w-full h-1.5 rounded-full overflow-hidden",
                gaugeTrack(usagePct, warning, critical),
              )}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  gaugeBg(usagePct, warning, critical),
                )}
                style={{ width: `${Math.min(usagePct, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </WidgetBase>
  );
}
