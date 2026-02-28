/**
 * Off-peak hours visual grid (PRD-119).
 *
 * Renders a 7-day x 24-hour grid of toggle cells for defining off-peak windows.
 */

import { cn } from "@/lib/cn";
import { Stack } from "@/components/layout";

import { DAY_NAMES, HOURS_OF_DAY } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

/** 7 days x 24 hours boolean matrix. */
export type GridState = boolean[][];

export function createEmptyGrid(): GridState {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => false));
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface OffPeakGridProps {
  grid: GridState;
  onToggle: (day: number, hour: number) => void;
}

export function OffPeakGrid({ grid, onToggle }: OffPeakGridProps) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1 text-xs text-[var(--color-text-muted)]" />
              {HOURS_OF_DAY.map((h) => (
                <th key={h} className="px-0 py-1 text-[10px] text-[var(--color-text-muted)] text-center min-w-[28px]">
                  {formatHourLabel(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_NAMES.map((dayName, dayIndex) => (
              <tr key={dayName}>
                <td className="pr-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)] whitespace-nowrap">
                  {dayName.slice(0, 3)}
                </td>
                {HOURS_OF_DAY.map((hour) => {
                  const isOn = grid[dayIndex]?.[hour] ?? false;
                  return (
                    <td key={hour} className="p-0.5">
                      <button
                        type="button"
                        onClick={() => onToggle(dayIndex, hour)}
                        className={cn(
                          "w-6 h-5 rounded-[2px] border border-[var(--color-border-default)]",
                          "transition-colors duration-[var(--duration-instant)] hover:opacity-80",
                          isOn ? "bg-[var(--color-action-primary)]/40" : "bg-[var(--color-surface-tertiary)]",
                        )}
                        aria-label={`${dayName} ${hour}:00 ${isOn ? "on" : "off"}`}
                        data-testid={`offpeak-cell-${dayIndex}-${hour}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <Stack direction="horizontal" gap={3} align="center">
        <Stack direction="horizontal" gap={1} align="center">
          <div className="w-4 h-3 rounded-[2px] bg-[var(--color-action-primary)]/40 border border-[var(--color-border-default)]" />
          <span className="text-xs text-[var(--color-text-muted)]">Off-peak</span>
        </Stack>
        <Stack direction="horizontal" gap={1} align="center">
          <div className="w-4 h-3 rounded-[2px] bg-[var(--color-surface-tertiary)] border border-[var(--color-border-default)]" />
          <span className="text-xs text-[var(--color-text-muted)]">Peak</span>
        </Stack>
      </Stack>
    </>
  );
}
