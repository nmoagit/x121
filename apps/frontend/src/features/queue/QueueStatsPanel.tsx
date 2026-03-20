/**
 * Queue statistics summary panel (PRD-132).
 *
 * Displays aggregate queue stats: pending/running counts, throughput,
 * average wait and execution times, and per-worker load bars.
 */

import { cn } from "@/lib/cn";
import { formatDurationSecs } from "@/lib/format";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
  TERMINAL_PIPE,
} from "@/lib/ui-classes";

import { useQueueStats } from "./hooks/use-queue";
import type { WorkerLoad } from "./types";

/* --------------------------------------------------------------------------
   Sub-component: worker load bar
   -------------------------------------------------------------------------- */

function WorkerLoadBar({ worker }: { worker: WorkerLoad }) {
  const maxJobs = 4; // visual max for bar scaling
  const pct = Math.min((worker.active_jobs / maxJobs) * 100, 100);

  return (
    <div className="flex items-center gap-3 font-mono text-xs">
      <span className="text-[var(--color-text-primary)] w-28 truncate">
        {worker.name}
      </span>
      <div className="flex-1 h-1.5 rounded-[var(--radius-full)] bg-[var(--color-surface-tertiary)] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-[var(--radius-full)] transition-all duration-300",
            worker.drain_mode
              ? "bg-orange-400"
              : pct >= 75
                ? "bg-red-400"
                : "bg-cyan-400",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[var(--color-text-muted)] w-16 text-right">
        {worker.active_jobs} job{worker.active_jobs !== 1 ? "s" : ""}
      </span>
      {worker.drain_mode && (
        <span className="text-orange-400">DRAIN</span>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function QueueStatsPanel() {
  const { data: stats } = useQueueStats();

  const pending = stats?.counts_by_status?.Pending ?? 0;
  const queued = stats?.counts_by_status?.Queued ?? 0;
  const running = stats?.counts_by_status?.Running ?? 0;

  const tickerStats = [
    { label: "Pending", value: String(pending + queued), color: pending + queued > 0 ? "text-orange-400" : "text-[var(--color-text-muted)]" },
    { label: "Running", value: String(running), color: running > 0 ? "text-cyan-400" : "text-[var(--color-text-muted)]" },
    { label: "Throughput", value: `${stats?.throughput_per_hour?.toFixed(1) ?? "0"}/hr`, color: "text-green-400" },
    { label: "Avg Wait", value: formatDurationSecs(stats?.avg_wait_secs ?? null), color: "text-cyan-400" },
    { label: "Avg Exec", value: formatDurationSecs(stats?.avg_execution_secs ?? null), color: "text-cyan-400" },
  ];

  return (
    <div className="space-y-3">
      {/* Stats ticker strip */}
      <div className="flex items-center gap-0 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] px-[var(--spacing-3)] py-[var(--spacing-2)] font-mono text-xs overflow-x-auto">
        {tickerStats.map((stat, idx) => (
          <span key={stat.label} className="flex items-center whitespace-nowrap">
            {idx > 0 && (
              <span className={`mx-3 ${TERMINAL_PIPE} select-none`}>|</span>
            )}
            <span className="uppercase tracking-wide text-[var(--color-text-muted)]">
              {stat.label}:
            </span>
            <span className={`ml-1 ${stat.color}`}>{stat.value}</span>
          </span>
        ))}
      </div>

      {/* Per-worker load bars */}
      {stats?.per_worker_load && stats.per_worker_load.length > 0 && (
        <div className={TERMINAL_PANEL}>
          <div className={TERMINAL_HEADER}>
            <span className={TERMINAL_HEADER_TITLE}>Worker Load</span>
          </div>
          <div className={`${TERMINAL_BODY} space-y-2`}>
            {stats.per_worker_load.map((w) => (
              <WorkerLoadBar key={w.instance_id} worker={w} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
