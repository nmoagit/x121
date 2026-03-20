/**
 * Schedule execution history panel (PRD-119).
 *
 * Displays the execution history for a given schedule in a table format
 * with status badges, job links, durations, and error messages.
 */

import { WireframeLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDuration } from "@/lib/format";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_TH,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_STATUS_COLORS,
} from "@/lib/ui-classes";

import { useScheduleHistory } from "./hooks/use-job-scheduling";
import type { ScheduleHistory } from "./types";

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function HistoryRow({ entry }: { entry: ScheduleHistory }) {
  const statusColor = TERMINAL_STATUS_COLORS[entry.status] ?? "text-[var(--color-text-muted)]";
  return (
    <tr
      className={cn(
        TERMINAL_DIVIDER,
        "last:border-b-0",
        TERMINAL_ROW_HOVER,
        "transition-colors",
      )}
    >
      <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">
        {formatDateTime(entry.executed_at)}
      </td>
      <td className="px-3 py-2">
        <span className={`font-mono text-xs uppercase tracking-wide ${statusColor}`}>
          {entry.status}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-cyan-400">
        {entry.result_job_id ? `#${entry.result_job_id}` : "\u2014"}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">
        {entry.execution_duration_ms != null
          ? formatDuration(entry.execution_duration_ms)
          : "\u2014"}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-red-400 max-w-[200px] truncate">
        {entry.error_message ?? ""}
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface ScheduleHistoryPanelProps {
  scheduleId: number;
}

export function ScheduleHistoryPanel({ scheduleId }: ScheduleHistoryPanelProps) {
  const { data, isPending, isError } = useScheduleHistory(scheduleId);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="history-loading">
        <WireframeLoader size={48} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load execution history.
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]" data-testid="history-empty">
        No execution history yet.
      </div>
    );
  }

  return (
    <div data-testid="schedule-history-panel" className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <span className={TERMINAL_HEADER_TITLE}>Execution History</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className={TERMINAL_DIVIDER}>
              <th className={`${TERMINAL_TH} px-3 py-2`}>Executed At</th>
              <th className={`${TERMINAL_TH} px-3 py-2`}>Status</th>
              <th className={`${TERMINAL_TH} px-3 py-2`}>Job</th>
              <th className={`${TERMINAL_TH} px-3 py-2`}>Duration</th>
              <th className={`${TERMINAL_TH} px-3 py-2`}>Error</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
