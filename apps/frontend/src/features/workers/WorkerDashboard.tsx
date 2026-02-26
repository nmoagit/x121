/**
 * Worker pool dashboard page (PRD-46).
 *
 * Displays fleet statistics at the top followed by a responsive grid of
 * worker cards. Clicking a card opens a detail panel with health log and
 * admin actions (approve, drain, decommission).
 */

import { useState } from "react";

import { Card } from "@/components/composite/Card";
import { Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { AlertCircle, Server } from "@/tokens/icons";

import {
  useApproveWorker,
  useDecommissionWorker,
  useDrainWorker,
  useFleetStats,
  useWorkers,
} from "./hooks/use-workers";
import type { Worker } from "./types";
import { WorkerCard } from "./WorkerCard";
import { WorkerDetailPanel } from "./WorkerDetailPanel";

/* --------------------------------------------------------------------------
   Fleet stats summary bar
   -------------------------------------------------------------------------- */

interface StatBadgeProps {
  label: string;
  value: number;
  className?: string;
}

function StatBadge({ label, value, className }: StatBadgeProps) {
  return (
    <Card elevation="flat" padding="sm" className={className}>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="text-lg font-semibold text-[var(--color-text-primary)]">
        {value}
      </p>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WorkerDashboard() {
  const { data: workers, isLoading, error } = useWorkers();
  const { data: stats } = useFleetStats();
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  const approveMutation = useApproveWorker();
  const drainMutation = useDrainWorker();
  const decommissionMutation = useDecommissionWorker();

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <Stack gap={6}>
          {/* Page header */}
          <div>
            <div className="flex items-center gap-[var(--spacing-2)]">
              <Server size={24} className="text-[var(--color-text-muted)]" aria-hidden />
              <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
                Worker Pool
              </h1>
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Manage GPU workers, monitor health, and control fleet capacity.
            </p>
          </div>

          {/* Fleet stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-[var(--spacing-3)] sm:grid-cols-3 lg:grid-cols-7">
              <StatBadge label="Total" value={stats.total_workers} />
              <StatBadge label="Idle" value={stats.idle_workers} />
              <StatBadge label="Busy" value={stats.busy_workers} />
              <StatBadge label="Offline" value={stats.offline_workers} />
              <StatBadge label="Draining" value={stats.draining_workers} />
              <StatBadge label="Approved" value={stats.approved_workers} />
              <StatBadge label="Enabled" value={stats.enabled_workers} />
            </div>
          )}

          {/* Worker grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-[var(--spacing-8)]">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
              <AlertCircle size={24} className="text-[var(--color-action-danger)]" aria-hidden />
              <p className="text-sm text-[var(--color-text-muted)]">
                Failed to load workers.
              </p>
            </div>
          ) : workers && workers.length > 0 ? (
            <div className="grid grid-cols-1 gap-[var(--spacing-4)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {workers.map((w) => (
                <WorkerCard
                  key={w.id}
                  worker={w}
                  onClick={(worker) => setSelectedWorker(worker)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
              <Server size={32} className="text-[var(--color-text-muted)]" aria-hidden />
              <p className="text-sm text-[var(--color-text-muted)]">
                No workers registered yet.
              </p>
            </div>
          )}
        </Stack>
      </div>

      {/* Detail panel (slide-in) */}
      {selectedWorker && (
        <div className="w-[400px] shrink-0 border-l border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
          <WorkerDetailPanel
            worker={selectedWorker}
            onClose={() => setSelectedWorker(null)}
            onApprove={(id) => {
              approveMutation.mutate(id);
              setSelectedWorker(null);
            }}
            onDrain={(id) => {
              drainMutation.mutate(id);
              setSelectedWorker(null);
            }}
            onDecommission={(id) => {
              decommissionMutation.mutate(id);
              setSelectedWorker(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
