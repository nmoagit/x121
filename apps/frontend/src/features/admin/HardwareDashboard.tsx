import { useMemo, useState } from "react";

import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Spinner } from "@/components/primitives";
import { MetricsChart } from "@/features/admin/components/MetricsChart";
import { WorkerCard } from "@/features/admin/components/WorkerCard";
import { useCurrentMetrics, useThresholds } from "@/features/admin/hooks/use-hardware";
import type { WorkerCurrentMetrics } from "@/features/admin/hooks/use-hardware";
import { Monitor } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/**
 * Groups metrics by worker_id.
 * When a worker has multiple GPUs, we pick the first entry as the representative
 * for the card display. The full list is available for expansion later.
 */
function groupByWorker(metrics: WorkerCurrentMetrics[]): Map<number, WorkerCurrentMetrics> {
  const map = new Map<number, WorkerCurrentMetrics>();
  for (const m of metrics) {
    if (!map.has(m.worker_id)) {
      map.set(m.worker_id, m);
    }
  }
  return map;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function HardwareDashboard() {
  const { data: allMetrics, isLoading: metricsLoading } = useCurrentMetrics();
  const { data: thresholds } = useThresholds();
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);

  const workerMap = useMemo(() => groupByWorker(allMetrics ?? []), [allMetrics]);
  const sortedWorkers = useMemo(
    () => Array.from(workerMap.values()).sort((a, b) => a.worker_id - b.worker_id),
    [workerMap],
  );

  function handleSelectWorker(workerId: number) {
    setSelectedWorkerId((prev) => (prev === workerId ? null : workerId));
  }

  if (metricsLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Hardware Monitoring
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Live GPU metrics across all workers. Data refreshes every 5 seconds.
          </p>
        </div>

        {sortedWorkers.length === 0 ? (
          <EmptyState
            icon={<Monitor size={40} />}
            title="No workers reporting"
            description="No GPU workers are currently sending metrics. Check that your worker agents are running and connected."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-[var(--spacing-4)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedWorkers.map((metrics) => (
                <WorkerCard
                  key={`${metrics.worker_id}-${metrics.gpu_index}`}
                  metrics={metrics}
                  thresholds={thresholds ?? []}
                  isSelected={selectedWorkerId === metrics.worker_id}
                  onSelect={handleSelectWorker}
                />
              ))}
            </div>

            {selectedWorkerId !== null && <MetricsChart workerId={selectedWorkerId} />}
          </>
        )}
      </Stack>
    </div>
  );
}
