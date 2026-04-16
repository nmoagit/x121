import { Link } from "@tanstack/react-router";

import { useDiskHealth } from "@/features/dashboard/hooks/use-dashboard";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { TERMINAL_LABEL, TERMINAL_DIVIDER } from "@/lib/ui-classes";
import { HardDrive } from "@/tokens/icons";
import { TYPO_DATA, TYPO_DATA_CYAN } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function gaugeTextColor(usagePct: number, warning: number, critical: number): string {
  if (usagePct >= critical) return "text-[var(--color-data-red)]";
  if (usagePct >= warning) return "text-[var(--color-data-orange)]";
  return "text-[var(--color-data-green)]";
}

function gaugeStroke(usagePct: number, warning: number, critical: number): string {
  if (usagePct >= critical) return "stroke-red-400";
  if (usagePct >= warning) return "stroke-orange-400";
  return "stroke-green-400";
}

function gaugeFill(usagePct: number, warning: number, critical: number): string {
  if (usagePct >= critical) return "bg-red-400";
  if (usagePct >= warning) return "bg-orange-400";
  return "bg-green-400";
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
      headerActions={
        <Link to="/admin/storage" className={`${TYPO_DATA_CYAN} hover:underline`}>
          Storage
        </Link>
      }
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
                className="stroke-white/10"
                strokeWidth="10"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                className={gaugeStroke(usagePct, warning, critical)}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(usagePct / 100) * 263.9} 263.9`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={cn(
                  "font-mono text-sm font-bold tabular-nums",
                  gaugeTextColor(usagePct, warning, critical),
                )}
              >
                {usagePct.toFixed(0)}%
              </span>
              <span className={TERMINAL_LABEL}>used</span>
            </div>
          </div>

          {/* Capacity details */}
          <div className="w-full space-y-1">
            <div className={`flex justify-between ${TYPO_DATA} py-1 ${TERMINAL_DIVIDER} last:border-b-0`}>
              <span className={TERMINAL_LABEL}>Used</span>
              <span className="text-[var(--color-data-cyan)] tabular-nums">
                {formatBytes(data.used_bytes)}
              </span>
            </div>
            <div className={`flex justify-between ${TYPO_DATA} py-1 ${TERMINAL_DIVIDER} last:border-b-0`}>
              <span className={TERMINAL_LABEL}>Free</span>
              <span className="text-[var(--color-data-cyan)] tabular-nums">
                {formatBytes(data.free_bytes)}
              </span>
            </div>
            <div className={`flex justify-between ${TYPO_DATA} py-1`}>
              <span className={TERMINAL_LABEL}>Total</span>
              <span className="text-[var(--color-data-cyan)] tabular-nums">
                {formatBytes(data.total_bytes)}
              </span>
            </div>
          </div>

          {/* Warning bar */}
          <div className="w-full">
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  gaugeFill(usagePct, warning, critical),
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
