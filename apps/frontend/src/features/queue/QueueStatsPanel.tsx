/**
 * Queue statistics summary panel (PRD-132).
 *
 * Displays aggregate queue stats: pending/running counts, throughput,
 * average wait and execution times, and per-worker load bars.
 */

import { StatBadge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";

import { useQueueStats } from "./hooks/use-queue";
import type { WorkerLoad } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function formatSecs(secs: number | null): string {
  if (secs == null || secs <= 0) return "--";
  return formatDuration(secs * 1000);
}

/* --------------------------------------------------------------------------
   Sub-component: worker load bar
   -------------------------------------------------------------------------- */

function WorkerLoadBar({ worker }: { worker: WorkerLoad }) {
  const maxJobs = 4; // visual max for bar scaling
  const pct = Math.min((worker.active_jobs / maxJobs) * 100, 100);

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-[var(--color-text-primary)] w-28 truncate">
        {worker.name}
      </span>
      <div className="flex-1 h-2 rounded-[var(--radius-full)] bg-[var(--color-surface-tertiary)] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-[var(--radius-full)] transition-all duration-300",
            worker.drain_mode
              ? "bg-[var(--color-status-warning)]"
              : pct >= 75
                ? "bg-[var(--color-status-error)]"
                : "bg-[var(--color-status-info)]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-[var(--color-text-muted)] w-16 text-right">
        {worker.active_jobs} job{worker.active_jobs !== 1 ? "s" : ""}
      </span>
      {worker.drain_mode && (
        <span className="text-xs text-[var(--color-status-warning)]">Draining</span>
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

  return (
    <div className="space-y-4">
      {/* Stat cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatBadge label="Pending" value={pending + queued} />
        <StatBadge label="Running" value={running} />
        <StatBadge
          label="Throughput"
          value={`${stats?.throughput_per_hour?.toFixed(1) ?? "0"}/hr`}
        />
        <StatBadge label="Avg Wait" value={formatSecs(stats?.avg_wait_secs ?? null)} />
        <StatBadge label="Avg Execution" value={formatSecs(stats?.avg_execution_secs ?? null)} />
      </div>

      {/* Per-worker load bars */}
      {stats?.per_worker_load && stats.per_worker_load.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-[var(--color-text-muted)]">
            Worker Load
          </h4>
          {stats.per_worker_load.map((w) => (
            <WorkerLoadBar key={w.instance_id} worker={w} />
          ))}
        </div>
      )}
    </div>
  );
}
