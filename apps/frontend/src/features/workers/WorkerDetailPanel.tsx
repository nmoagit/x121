/**
 * Worker detail panel showing full info and health log (PRD-46).
 *
 * Displayed as a side panel / drawer when a worker card is clicked.
 */

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { formatDateTime } from "@/lib/format";
import { Badge, Button } from "@/components/primitives";
import { Cpu, Power, ShieldCheck, X } from "@/tokens/icons";

import { useWorkerHealthLog } from "./hooks/use-workers";
import type { HealthLogEntry, Worker, WorkerStatusId } from "./types";
import { WORKER_STATUS, WORKER_STATUS_LABELS, WORKER_STATUS_VARIANT } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface WorkerDetailPanelProps {
  worker: Worker;
  onClose: () => void;
  onApprove?: (id: number) => void;
  onDrain?: (id: number) => void;
  onDecommission?: (id: number) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Format an optional ISO string, returning "--" when null/undefined. */
function formatDateOrDash(iso: string | null | undefined): string {
  if (!iso) return "--";
  return formatDateTime(iso);
}

function statusLabel(id: number): string {
  return WORKER_STATUS_LABELS[id as WorkerStatusId] ?? `Status ${id}`;
}

function statusVariant(id: number) {
  return WORKER_STATUS_VARIANT[id as WorkerStatusId] ?? "default";
}

/* --------------------------------------------------------------------------
   Sub-component: Health log timeline
   -------------------------------------------------------------------------- */

function HealthLogTimeline({ entries }: { entries: HealthLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-[var(--spacing-4)] text-center text-sm text-[var(--color-text-muted)]">
        No status transitions recorded.
      </p>
    );
  }

  return (
    <ul className="space-y-[var(--spacing-2)]">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex items-start gap-[var(--spacing-2)] text-sm"
        >
          <div className="mt-0.5 shrink-0">
            <Badge variant={statusVariant(entry.to_status_id)} size="sm">
              {statusLabel(entry.to_status_id)}
            </Badge>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[var(--color-text-muted)]">
              from {statusLabel(entry.from_status_id)}
            </span>
            {entry.reason && (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {entry.reason}
              </p>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">
              {formatDateOrDash(entry.transitioned_at)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WorkerDetailPanel({
  worker,
  onClose,
  onApprove,
  onDrain,
  onDecommission,
}: WorkerDetailPanelProps) {
  const { data: healthLog = [] } = useWorkerHealthLog(worker.id);
  const variant = WORKER_STATUS_VARIANT[worker.status_id as WorkerStatusId] ?? "default";
  const label = WORKER_STATUS_LABELS[worker.status_id as WorkerStatusId] ?? "Unknown";

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-surface-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          {worker.name}
        </h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)]"
          aria-label="Close panel"
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-[var(--spacing-4)] py-[var(--spacing-4)] space-y-[var(--spacing-4)]">
        {/* Status + approval */}
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Badge variant={variant} size="md">
            {label}
          </Badge>
          {!worker.is_approved && (
            <Badge variant="warning" size="md">
              Not Approved
            </Badge>
          )}
          {!worker.is_enabled && (
            <Badge variant="danger" size="md">
              Disabled
            </Badge>
          )}
        </div>

        {/* GPU info card */}
        <Card elevation="flat" padding="md">
          <div className="flex items-center gap-[var(--spacing-2)] mb-[var(--spacing-2)]">
            <Cpu size={16} className="text-[var(--color-text-muted)]" aria-hidden />
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              GPU Information
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-y-[var(--spacing-1)] text-sm">
            <dt className="text-[var(--color-text-muted)]">Model</dt>
            <dd className="text-[var(--color-text-primary)]">
              {worker.gpu_model ?? "Unknown"}
            </dd>
            <dt className="text-[var(--color-text-muted)]">Count</dt>
            <dd className="text-[var(--color-text-primary)]">{worker.gpu_count}</dd>
            <dt className="text-[var(--color-text-muted)]">VRAM</dt>
            <dd className="text-[var(--color-text-primary)]">
              {worker.vram_total_mb
                ? `${Math.round(worker.vram_total_mb / 1024)} GB`
                : "Unknown"}
            </dd>
          </dl>
        </Card>

        {/* General info */}
        <Card elevation="flat" padding="md">
          <dl className="grid grid-cols-2 gap-y-[var(--spacing-1)] text-sm">
            <dt className="text-[var(--color-text-muted)]">Hostname</dt>
            <dd className="text-[var(--color-text-primary)]">{worker.hostname}</dd>
            <dt className="text-[var(--color-text-muted)]">IP Address</dt>
            <dd className="text-[var(--color-text-primary)]">
              {worker.ip_address ?? "--"}
            </dd>
            <dt className="text-[var(--color-text-muted)]">Registered</dt>
            <dd className="text-[var(--color-text-primary)]">
              {formatDateOrDash(worker.registered_at)}
            </dd>
            <dt className="text-[var(--color-text-muted)]">Last Heartbeat</dt>
            <dd className="text-[var(--color-text-primary)]">
              {formatDateOrDash(worker.last_heartbeat_at)}
            </dd>
            {worker.decommissioned_at && (
              <>
                <dt className="text-[var(--color-text-muted)]">Decommissioned</dt>
                <dd className="text-[var(--color-text-primary)]">
                  {formatDateOrDash(worker.decommissioned_at)}
                </dd>
              </>
            )}
          </dl>
        </Card>

        {/* Tags */}
        {Array.isArray(worker.tags) && worker.tags.length > 0 && (
          <div>
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Tags
            </span>
            <div className="mt-[var(--spacing-1)] flex flex-wrap gap-1">
              {worker.tags.map((tag) => (
                <Badge key={tag} variant="info" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-[var(--spacing-2)]">
          {!worker.is_approved && onApprove && (
            <Button
              variant="primary"
              size="sm"
              icon={<ShieldCheck size={14} />}
              onClick={() => onApprove(worker.id)}
            >
              Approve
            </Button>
          )}
          {worker.is_approved && worker.status_id !== WORKER_STATUS.DRAINING && onDrain && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDrain(worker.id)}
            >
              Drain
            </Button>
          )}
          {!worker.decommissioned_at && onDecommission && (
            <Button
              variant="danger"
              size="sm"
              icon={<Power size={14} />}
              onClick={() => onDecommission(worker.id)}
            >
              Decommission
            </Button>
          )}
        </div>

        {/* Health log */}
        <Card elevation="flat" padding="none">
          <CardHeader className="px-[var(--spacing-3)] py-[var(--spacing-2)]">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Health Log
            </span>
          </CardHeader>
          <CardBody className="px-[var(--spacing-3)] py-[var(--spacing-2)]">
            <HealthLogTimeline entries={healthLog} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
