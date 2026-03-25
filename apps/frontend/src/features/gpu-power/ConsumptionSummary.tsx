/**
 * Energy consumption summary panel showing kWh stats and time breakdown (PRD-87).
 */

import { StatBadge ,  ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { formatPercent } from "@/lib/format";
import { BarChart3, Zap } from "@/tokens/icons";

import type { ConsumptionParams } from "./types";
import { useConsumptionSummary } from "./hooks/use-gpu-power";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ConsumptionSummaryProps {
  params: ConsumptionParams;
}

/* --------------------------------------------------------------------------
   Time breakdown bar (per entry)
   -------------------------------------------------------------------------- */

interface TimeBarProps {
  active: number;
  idle: number;
  off: number;
}

/** Total minutes in a day. */
const MINUTES_PER_DAY = 1440;

function TimeBreakdownBar({ active, idle, off }: TimeBarProps) {
  const total = active + idle + off || MINUTES_PER_DAY;
  const pctActive = (active / total) * 100;
  const pctIdle = (idle / total) * 100;
  const pctOff = (off / total) * 100;

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-[var(--radius-full)]">
      <div
        className="bg-[var(--color-action-success)]"
        style={{ width: `${pctActive}%` }}
        title={`Active: ${active}m`}
      />
      <div
        className="bg-[var(--color-action-warning)]"
        style={{ width: `${pctIdle}%` }}
        title={`Idle: ${idle}m`}
      />
      <div
        className="bg-[var(--color-surface-tertiary)]"
        style={{ width: `${pctOff}%` }}
        title={`Off: ${off}m`}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ConsumptionSummary({ params }: ConsumptionSummaryProps) {
  const { data, isLoading, error } = useConsumptionSummary(params);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <ContextLoader size={64} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
        <BarChart3
          size={24}
          className="text-[var(--color-action-danger)]"
          aria-hidden
        />
        <p className="text-sm text-[var(--color-text-muted)]">
          Failed to load consumption data.
        </p>
      </div>
    );
  }

  return (
    <Stack gap={4}>
      {/* Aggregate stats */}
      <div className="grid grid-cols-2 gap-[var(--spacing-3)] sm:grid-cols-3">
        <StatBadge
          label="Total Consumption"
          value={`${data.total_estimated_kwh.toFixed(1)} kWh`}
        />
        <StatBadge
          label="Energy Savings"
          value={formatPercent(data.savings_pct / 100, 1)}
        />
        <StatBadge label="Entries" value={String(data.entries.length)} />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-[var(--spacing-4)] text-xs text-[var(--color-text-muted)]">
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-[var(--radius-full)] bg-[var(--color-action-success)]" />
          Active
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-[var(--radius-full)] bg-[var(--color-action-warning)]" />
          Idle
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-[var(--radius-full)] bg-[var(--color-surface-tertiary)]" />
          Off
        </div>
      </div>

      {/* Per-entry breakdown */}
      {data.entries.length > 0 ? (
        <div className="space-y-[var(--spacing-3)]">
          {data.entries.map((entry) => (
            <div key={`${entry.worker_id}-${entry.date}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Worker #{entry.worker_id} &mdash; {entry.date}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  <Zap size={12} className="inline mr-0.5" aria-hidden />
                  {(entry.estimated_kwh ?? 0).toFixed(2)} kWh
                </span>
              </div>
              <TimeBreakdownBar
                active={entry.active_minutes}
                idle={entry.idle_minutes}
                off={entry.off_minutes}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-center text-[var(--color-text-muted)] py-[var(--spacing-4)]">
          No consumption data for this period.
        </p>
      )}
    </Stack>
  );
}
