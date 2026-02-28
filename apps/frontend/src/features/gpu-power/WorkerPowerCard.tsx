/**
 * Card displaying a single worker's power status with wake/shutdown controls (PRD-87).
 */

import { Card } from "@/components/composite/Card";
import { Button } from "@/components/primitives";
import { Cpu, Power, Zap } from "@/tokens/icons";

import { useShutdownWorker, useWakeWorker } from "./hooks/use-gpu-power";
import { PowerStateBadge } from "./PowerStateBadge";
import type { WorkerPowerStatus } from "./types";
import { WAKE_METHOD_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface WorkerPowerCardProps {
  status: WorkerPowerStatus;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Format TDP watts into a human-readable string. */
function formatTdp(watts: number | null): string {
  if (watts === null) return "Unknown TDP";
  return `${watts}W TDP`;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WorkerPowerCard({ status }: WorkerPowerCardProps) {
  const wakeMutation = useWakeWorker();
  const shutdownMutation = useShutdownWorker();

  // State machine (from backend core/src/gpu_power.rs):
  //   sleeping -> waking (wake action)
  //   idle -> shutting_down (shutdown action)
  const canWake = status.power_state === "sleeping";
  const canShutdown = status.power_state === "idle";
  const isTransitioning =
    status.power_state === "shutting_down" || status.power_state === "waking";

  return (
    <Card elevation="sm" padding="none">
      <div className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        {/* Header: name + power state */}
        <div className="flex items-center justify-between gap-[var(--spacing-2)]">
          <div className="flex items-center gap-[var(--spacing-2)] min-w-0">
            <Power
              size={16}
              className="shrink-0 text-[var(--color-text-muted)]"
              aria-hidden
            />
            <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              Worker #{status.worker_id}
              {status.worker_name ? ` - ${status.worker_name}` : ""}
            </span>
          </div>
          <PowerStateBadge state={status.power_state} />
        </div>

        {/* GPU / TDP info */}
        <div className="mt-[var(--spacing-2)] flex items-center gap-[var(--spacing-2)] text-xs text-[var(--color-text-muted)]">
          <Cpu size={14} aria-hidden />
          <span>{formatTdp(status.gpu_tdp_watts)}</span>
          {status.wake_method && (
            <>
              <span aria-hidden>|</span>
              <span>Wake: {WAKE_METHOD_LABELS[status.wake_method]}</span>
            </>
          )}
        </div>

        {/* Idle timeout + fleet membership */}
        <div className="mt-[var(--spacing-2)] flex items-center gap-[var(--spacing-2)] text-xs text-[var(--color-text-muted)]">
          {status.idle_timeout_minutes !== null && (
            <span>Idle timeout: {status.idle_timeout_minutes}m</span>
          )}
          {status.min_fleet_member && (
            <span className="text-[var(--color-action-primary)] font-medium">
              Min-fleet
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-[var(--spacing-3)] flex gap-[var(--spacing-2)]">
          {canWake && (
            <Button
              variant="primary"
              size="sm"
              icon={<Zap size={14} />}
              loading={wakeMutation.isPending}
              onClick={() => wakeMutation.mutate(status.worker_id)}
            >
              Wake
            </Button>
          )}
          {canShutdown && (
            <Button
              variant="danger"
              size="sm"
              icon={<Power size={14} />}
              loading={shutdownMutation.isPending}
              onClick={() => shutdownMutation.mutate(status.worker_id)}
            >
              Shutdown
            </Button>
          )}
          {isTransitioning && (
            <span className="text-xs italic text-[var(--color-text-muted)]">
              Transitioning...
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
