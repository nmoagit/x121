/**
 * State-dependent action buttons for a single cloud instance.
 *
 * Renders only the actions valid for the current instance status
 * and ComfyUI connection state.
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import { ConfirmDeleteModal } from "@/components/composite";
import { Stack } from "@/components/layout";
import {
  Play,
  Square,
  Trash2,
  RefreshCw,
  Wifi,
  RotateCw,
  RotateCcw,
} from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useRestartComfyui,
  useForceReconnect,
  useResetState,
  useBulkStart,
  useBulkStop,
  useBulkTerminate,
} from "../hooks/use-infrastructure-ops";
import type { EnrichedInstance } from "../types";
import { isStuck } from "./status-helpers";

interface InstanceActionsProps {
  instance: EnrichedInstance;
}

export function InstanceActions({ instance }: InstanceActionsProps) {
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);

  const restartComfyui = useRestartComfyui();
  const forceReconnect = useForceReconnect();
  const resetState = useResetState();
  const bulkStart = useBulkStart();
  const bulkStop = useBulkStop();
  const bulkTerminate = useBulkTerminate();

  const { status_name, comfyui_status, id } = instance;
  const stuck = isStuck(status_name, instance.created_at);

  const isBusy =
    restartComfyui.isPending ||
    forceReconnect.isPending ||
    resetState.isPending ||
    bulkStart.isPending ||
    bulkStop.isPending ||
    bulkTerminate.isPending;

  return (
    <>
      <Stack direction="horizontal" gap={1} className="flex-wrap">
        {/* Running + Connected */}
        {status_name === "running" && comfyui_status === "connected" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={iconSizes.sm} />}
              onClick={() => restartComfyui.mutate(id)}
              disabled={isBusy}
            >
              Restart ComfyUI
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Square size={iconSizes.sm} />}
              onClick={() => bulkStop.mutate({ instance_ids: [id] })}
              disabled={isBusy}
            >
              Stop
            </Button>
          </>
        )}

        {/* Running + Disconnected */}
        {status_name === "running" && comfyui_status !== "connected" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<Wifi size={iconSizes.sm} />}
              onClick={() => forceReconnect.mutate(id)}
              disabled={isBusy}
            >
              Reconnect
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={iconSizes.sm} />}
              onClick={() => restartComfyui.mutate(id)}
              disabled={isBusy}
            >
              Restart ComfyUI
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Square size={iconSizes.sm} />}
              onClick={() => bulkStop.mutate({ instance_ids: [id] })}
              disabled={isBusy}
            >
              Stop
            </Button>
          </>
        )}

        {/* Error */}
        {status_name === "error" && (
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={iconSizes.sm} />}
            onClick={() => resetState.mutate(id)}
            disabled={isBusy}
          >
            Reset State
          </Button>
        )}

        {/* Stopped */}
        {status_name === "stopped" && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Play size={iconSizes.sm} />}
            onClick={() => bulkStart.mutate({ instance_ids: [id] })}
            disabled={isBusy}
          >
            Start
          </Button>
        )}

        {/* Stuck in provisioning */}
        {stuck && (
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCw size={iconSizes.sm} />}
            onClick={() => resetState.mutate(id)}
            disabled={isBusy}
          >
            Reset State
          </Button>
        )}

        {/* Terminated — remove (same API as terminate with force) */}
        {status_name === "terminated" && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={iconSizes.sm} />}
            onClick={() =>
              bulkTerminate.mutate({ instance_ids: [id], force: true })
            }
            disabled={isBusy}
          >
            Remove
          </Button>
        )}

        {/* Terminate action (available for running, stopped, error) */}
        {["running", "stopped", "error"].includes(status_name) && (
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={iconSizes.sm} />}
            onClick={() => setShowTerminateConfirm(true)}
            disabled={isBusy}
          >
            Terminate
          </Button>
        )}
      </Stack>

      <ConfirmDeleteModal
        open={showTerminateConfirm}
        onClose={() => setShowTerminateConfirm(false)}
        title="Terminate Instance"
        entityName={instance.name ?? instance.external_id}
        warningText="The cloud instance will be permanently destroyed. This cannot be undone."
        onConfirm={() => {
          bulkTerminate.mutate({ instance_ids: [id] });
          setShowTerminateConfirm(false);
        }}
        loading={bulkTerminate.isPending}
      />
    </>
  );
}
