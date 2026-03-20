/**
 * Terminal-styled horizontal stat ticker strip with pipe separators.
 *
 * Used across overview tabs (character, project) to display key metrics
 * in the "hacker terminal" aesthetic.
 */

import { Tooltip } from "@/components/primitives";
import { TERMINAL_LABEL, TERMINAL_PIPE } from "@/lib/ui-classes";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

/** A single stat entry for the ticker strip. */
export interface TickerStat {
  label: string;
  value: string | number;
  /** Tooltip on hover. */
  tooltip?: string;
  /** When true, value renders green; when false, cyan. */
  complete?: boolean;
  /** Explicit color class override (takes precedence over `complete`). */
  color?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

/** Resolves the text color class for a stat value. */
function resolveColor(stat: TickerStat): string {
  if (stat.color) return stat.color;
  return stat.complete ? "text-green-400" : "text-cyan-400";
}

/** Matrix-style horizontal ticker strip for stats. */
export function StatTicker({ stats }: { stats: TickerStat[] }) {
  return (
    <div className="flex items-center gap-0 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] px-[var(--spacing-3)] py-[var(--spacing-2)] font-mono text-xs overflow-x-auto">
      {stats.map((stat, idx) => (
        <span key={stat.label} className="flex items-center whitespace-nowrap">
          {idx > 0 && (
            <span className={`mx-3 ${TERMINAL_PIPE}`}>|</span>
          )}
          <span className={TERMINAL_LABEL}>
            {stat.label}:
          </span>
          {stat.tooltip ? (
            <Tooltip content={stat.tooltip} side="bottom">
              <span
                className={`ml-1.5 font-semibold text-sm cursor-help ${resolveColor(stat)}`}
              >
                {stat.value}
              </span>
            </Tooltip>
          ) : (
            <span
              className={`ml-1.5 font-semibold text-sm ${resolveColor(stat)}`}
            >
              {stat.value}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
