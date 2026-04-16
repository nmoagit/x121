/**
 * Worker drain management panel (PRD-132).
 *
 * Shows each ComfyUI instance with its status, active job count,
 * drain toggle, and redistribute button. Displays a "Ready to stop"
 * badge when an instance is drained with zero active jobs.
 */

import { Button, Toggle ,  ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { Server, RefreshCw } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { TERMINAL_PANEL, TERMINAL_BODY, TERMINAL_DIVIDER, TERMINAL_LABEL } from "@/lib/ui-classes";

import {
  useWorkerInstances,
  useDrainWorker,
  useUndrainWorker,
  useRedistributeQueue,
} from "./hooks/use-queue";
import type { ComfyUIInstanceInfo } from "@/features/generation/hooks/use-infrastructure";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Sub-component: instance row
   -------------------------------------------------------------------------- */

interface WorkerRowProps {
  instance: ComfyUIInstanceInfo;
  load: { active_jobs: number; drain_mode: boolean } | undefined;
}

function WorkerRow({ instance, load }: WorkerRowProps) {
  const drainWorker = useDrainWorker();
  const undrainWorker = useUndrainWorker();

  const isDraining = load?.drain_mode ?? false;
  const activeJobs = load?.active_jobs ?? 0;
  const readyToStop = isDraining && activeJobs === 0;

  const handleToggleDrain = (checked: boolean) => {
    if (checked) {
      drainWorker.mutate(instance.id);
    } else {
      undrainWorker.mutate(instance.id);
    }
  };

  return (
    <div className={`flex items-center justify-between px-4 py-3 ${TERMINAL_DIVIDER} last:border-b-0`}>
      <Stack direction="horizontal" gap={3} align="center">
        <Server size={iconSizes.md} className="text-[var(--color-text-muted)] shrink-0" />
        <div>
          <Stack direction="horizontal" gap={2} align="center">
            <span className={TYPO_DATA}>
              {instance.name}
            </span>
            <span className={`font-mono text-[10px] uppercase ${instance.is_enabled ? "text-[var(--color-data-green)]" : "text-[var(--color-text-muted)]"}`}>
              {instance.is_enabled ? "ONLINE" : "OFFLINE"}
            </span>
            {readyToStop && (
              <span className="font-mono text-[10px] uppercase text-[var(--color-data-orange)]">READY</span>
            )}
          </Stack>
          <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
            {activeJobs} active job{activeJobs !== 1 ? "s" : ""}
          </span>
        </div>
      </Stack>

      <Stack direction="horizontal" gap={3} align="center">
        <Toggle
          label="Drain"
          size="sm"
          checked={isDraining}
          onChange={handleToggleDrain}
          disabled={drainWorker.isPending || undrainWorker.isPending}
        />
      </Stack>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface WorkerDrainPanelProps {
  /** Per-worker load data from QueueStats (optional, used for active_jobs/drain_mode). */
  workerLoad?: Array<{ instance_id: number; active_jobs: number; drain_mode: boolean }>;
}

export function WorkerDrainPanel({ workerLoad }: WorkerDrainPanelProps) {
  const { data: instances, isLoading } = useWorkerInstances();
  const redistribute = useRedistributeQueue();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (!instances || instances.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-[var(--color-text-muted)]">
        No worker instances registered
      </div>
    );
  }

  return (
    <div className={TERMINAL_PANEL}>
      <div className="px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] flex items-center justify-between">
        <span className={TERMINAL_LABEL}>
          Worker Instances
        </span>
        <Button
          variant="secondary"
          size="xs"
          icon={<RefreshCw size={iconSizes.sm} />}
          onClick={() => redistribute.mutate()}
          disabled={redistribute.isPending}
        >
          Redistribute
        </Button>
      </div>

      <div className={TERMINAL_BODY}>
        {instances.map((inst) => {
          const load = workerLoad?.find((w) => w.instance_id === inst.id);
          return <WorkerRow key={inst.id} instance={inst} load={load} />;
        })}
      </div>
    </div>
  );
}
