/**
 * Recovery action buttons for instances in error or disconnected states.
 *
 * Renders contextual recovery options based on instance status
 * and ComfyUI connection state.
 */

import { Button } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  AlertTriangle,
  Wifi,
  RefreshCw,
  RotateCcw,
  RotateCw,
} from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useRestartComfyui,
  useForceReconnect,
  useResetState,
} from "../hooks/use-infrastructure-ops";
import type { EnrichedInstance } from "../types";
import { isStuck } from "./status-helpers";

interface RecoveryActionsProps {
  instance: EnrichedInstance;
}

export function RecoveryActions({ instance }: RecoveryActionsProps) {
  const restartComfyui = useRestartComfyui();
  const forceReconnect = useForceReconnect();
  const resetState = useResetState();

  const { status_name, comfyui_status, id } = instance;
  const stuck = isStuck(status_name, instance.created_at);
  const isBusy =
    restartComfyui.isPending ||
    forceReconnect.isPending ||
    resetState.isPending;

  const hasRecovery =
    status_name === "error" ||
    (status_name === "running" && comfyui_status === "disconnected") ||
    stuck;

  if (!hasRecovery) return null;

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-action-warning)]/5 border border-[var(--color-action-warning)]/20 px-3 py-2">
      <Stack gap={2}>
        {/* Error state */}
        {status_name === "error" && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--color-action-danger)]" />
              <span className="text-red-400 font-mono text-[10px] uppercase">Error</span>
              <span className="text-xs text-[var(--color-text-muted)]">
                Instance encountered an error
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw size={iconSizes.sm} />}
              onClick={() => resetState.mutate(id)}
              disabled={isBusy}
              loading={resetState.isPending}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Disconnected */}
        {status_name === "running" && comfyui_status === "disconnected" && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--color-action-warning)]" />
              <span className="text-orange-400 font-mono text-[10px] uppercase">Disconnected</span>
              <span className="text-xs text-[var(--color-text-muted)]">
                ComfyUI connection lost
              </span>
            </div>
            <Stack direction="horizontal" gap={1}>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw size={iconSizes.sm} />}
                onClick={() => restartComfyui.mutate(id)}
                disabled={isBusy}
                loading={restartComfyui.isPending}
              >
                Restart ComfyUI
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Wifi size={iconSizes.sm} />}
                onClick={() => forceReconnect.mutate(id)}
                disabled={isBusy}
                loading={forceReconnect.isPending}
              >
                Force Reconnect
              </Button>
            </Stack>
          </div>
        )}

        {/* Stuck in provisioning */}
        {stuck && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--color-action-warning)]" />
              <span className="text-orange-400 font-mono text-[10px] uppercase">Stuck</span>
              <span className="text-xs text-[var(--color-text-muted)]">
                Provisioning for over 10 minutes
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCw size={iconSizes.sm} />}
              onClick={() => resetState.mutate(id)}
              disabled={isBusy}
              loading={resetState.isPending}
            >
              Reset State
            </Button>
          </div>
        )}
      </Stack>
    </div>
  );
}
