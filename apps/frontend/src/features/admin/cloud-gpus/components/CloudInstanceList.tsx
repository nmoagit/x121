/**
 * Filterable table of cloud instances with action buttons (PRD-114).
 */

import { useState } from "react";

import { ConfirmModal } from "@/components/composite";
import { formatCents } from "@/lib/format";
import type { CloudInstance } from "../hooks/use-cloud-providers";
import { TYPO_DATA_MUTED } from "@/lib/typography-tokens";

interface Props {
  instances: CloudInstance[];
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  onTerminate: (id: number) => void;
}

// Sync: db/src/models/status.rs CloudInstanceStatus enum discriminants
const INSTANCE_STATUS = {
  PROVISIONING: 1,
  STARTING: 2,
  RUNNING: 3,
  STOPPING: 4,
  STOPPED: 5,
  TERMINATING: 6,
  TERMINATED: 7,
  ERROR: 8,
} as const;

const STATUS_LABELS: Record<number, string> = {
  [INSTANCE_STATUS.PROVISIONING]: "Provisioning",
  [INSTANCE_STATUS.STARTING]: "Starting",
  [INSTANCE_STATUS.RUNNING]: "Running",
  [INSTANCE_STATUS.STOPPING]: "Stopping",
  [INSTANCE_STATUS.STOPPED]: "Stopped",
  [INSTANCE_STATUS.TERMINATING]: "Terminating",
  [INSTANCE_STATUS.TERMINATED]: "Terminated",
  [INSTANCE_STATUS.ERROR]: "Error",
};

const STATUS_COLORS: Record<number, string> = {
  [INSTANCE_STATUS.PROVISIONING]: "text-yellow-500",
  [INSTANCE_STATUS.STARTING]: "text-yellow-500",
  [INSTANCE_STATUS.RUNNING]: "text-green-500",
  [INSTANCE_STATUS.STOPPING]: "text-orange-500",
  [INSTANCE_STATUS.STOPPED]: "text-[var(--color-text-muted)]",
  [INSTANCE_STATUS.TERMINATING]: "text-red-500",
  [INSTANCE_STATUS.TERMINATED]: "text-[var(--color-text-muted)]",
  [INSTANCE_STATUS.ERROR]: "text-red-600",
};

export function CloudInstanceList({ instances, onStart, onStop, onTerminate }: Props) {
  const [confirmTerminateId, setConfirmTerminateId] = useState<number | null>(null);

  return (
    <>

    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--color-border-default)] text-left text-xs text-[var(--color-text-muted)]">
          <th className="pb-2">ID</th>
          <th className="pb-2">Name</th>
          <th className="pb-2">Status</th>
          <th className="pb-2">IP</th>
          <th className="pb-2">Cost/hr</th>
          <th className="pb-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {instances.map((inst) => {
          const statusLabel = STATUS_LABELS[inst.status_id] ?? "Unknown";
          const statusColor = STATUS_COLORS[inst.status_id] ?? "";
          const isRunning = inst.status_id === INSTANCE_STATUS.RUNNING;
          const isStopped = inst.status_id === INSTANCE_STATUS.STOPPED;
          const isTerminal = inst.status_id === INSTANCE_STATUS.TERMINATED || inst.status_id === INSTANCE_STATUS.ERROR;

          return (
            <tr key={inst.id} className="border-b border-[var(--color-border-default)]">
              <td className={`py-2 ${TYPO_DATA_MUTED}`}>{inst.external_id.slice(0, 12)}</td>
              <td className="py-2 text-[var(--color-text-primary)]">{inst.name ?? "—"}</td>
              <td className={`py-2 font-medium ${statusColor}`}>{statusLabel}</td>
              <td className={`py-2 ${TYPO_DATA_MUTED}`}>
                {inst.ip_address ?? "—"}
                {inst.ssh_port ? `:${inst.ssh_port}` : ""}
              </td>
              <td className="py-2 text-[var(--color-text-muted)]">
                {formatCents(inst.cost_per_hour_cents)}
              </td>
              <td className="py-2">
                <div className="flex gap-1">
                  {isStopped && (
                    <button
                      onClick={() => onStart(inst.id)}
                      className="rounded border border-green-500 px-2 py-0.5 text-xs text-green-500 hover:bg-green-50"
                    >
                      Start
                    </button>
                  )}
                  {isRunning && (
                    <button
                      onClick={() => onStop(inst.id)}
                      className="rounded border border-yellow-500 px-2 py-0.5 text-xs text-yellow-500 hover:bg-yellow-50"
                    >
                      Stop
                    </button>
                  )}
                  {!isTerminal && (
                    <button
                      onClick={() => setConfirmTerminateId(inst.id)}
                      className="rounded border border-red-500 px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                    >
                      Terminate
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>

    <ConfirmModal
      open={confirmTerminateId !== null}
      onClose={() => setConfirmTerminateId(null)}
      title="Terminate Instance"
      confirmLabel="Terminate"
      confirmVariant="danger"
      onConfirm={() => {
        if (confirmTerminateId !== null) {
          onTerminate(confirmTerminateId);
        }
        setConfirmTerminateId(null);
      }}
    >
      <p>Terminate this instance? This is irreversible.</p>
    </ConfirmModal>
    </>
  );
}
