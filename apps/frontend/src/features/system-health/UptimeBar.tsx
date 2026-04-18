/**
 * Horizontal stacked bar showing healthy/degraded/down proportions (PRD-80).
 *
 * Displays a percentage bar with colour-coded segments and labels
 * for 7-day and 30-day uptime windows.
 */

import { Tooltip } from "@/components/primitives";

import type { UptimeResponse } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Minimum visual width (%) for a segment to render its label. */
const MIN_LABEL_WIDTH = 8;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface UptimeBarProps {
  uptime: UptimeResponse;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Calculate proportions from seconds, returning percentages. */
function computeSegments(uptime: UptimeResponse) {
  const total = uptime.total_seconds;
  if (total === 0) return { healthy: 0, degraded: 0, down: 0 };

  const healthy = (uptime.healthy_seconds / total) * 100;
  const degraded = (uptime.degraded_seconds / total) * 100;
  const down = 100 - healthy - degraded;

  return {
    healthy: Math.max(0, healthy),
    degraded: Math.max(0, degraded),
    down: Math.max(0, down),
  };
}

/** Format a percentage to one decimal. */
function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function UptimeBar({ uptime }: UptimeBarProps) {
  const segments = computeSegments(uptime);

  return (
    <div>
      {/* Uptime percentage label */}
      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-[var(--spacing-1)]">
        <span>24h uptime: {fmtPct(uptime.uptime_percent_24h)}</span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-4 w-full overflow-hidden rounded-[var(--radius-full)]">
        {segments.healthy > 0 && (
          <Tooltip content={`Healthy: ${fmtPct(segments.healthy)}`}>
            <div
              className="flex items-center justify-center bg-[var(--color-action-success)] text-[10px] font-medium text-white h-full"
              style={{ width: `${segments.healthy}%` }}
            >
              {segments.healthy >= MIN_LABEL_WIDTH && fmtPct(segments.healthy)}
            </div>
          </Tooltip>
        )}
        {segments.degraded > 0 && (
          <Tooltip content={`Degraded: ${fmtPct(segments.degraded)}`}>
            <div
              className="flex items-center justify-center bg-[var(--color-action-warning)] text-[10px] font-medium text-white h-full"
              style={{ width: `${segments.degraded}%` }}
            >
              {segments.degraded >= MIN_LABEL_WIDTH && fmtPct(segments.degraded)}
            </div>
          </Tooltip>
        )}
        {segments.down > 0 && (
          <Tooltip content={`Down: ${fmtPct(segments.down)}`}>
            <div
              className="flex items-center justify-center bg-[var(--color-action-danger)] text-[10px] font-medium text-white h-full"
              style={{ width: `${segments.down}%` }}
            >
              {segments.down >= MIN_LABEL_WIDTH && fmtPct(segments.down)}
            </div>
          </Tooltip>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-[var(--spacing-3)] mt-[var(--spacing-1)] text-xs text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-[var(--radius-full)] bg-[var(--color-action-success)]" />
          Healthy
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-[var(--radius-full)] bg-[var(--color-action-warning)]" />
          Degraded
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-[var(--radius-full)] bg-[var(--color-action-danger)]" />
          Down
        </span>
      </div>
    </div>
  );
}
