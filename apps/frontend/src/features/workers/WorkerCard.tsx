/**
 * Individual worker card for the worker pool dashboard (PRD-46).
 *
 * Displays worker name, status badge, GPU info, tags, and heartbeat.
 */

import { Card } from "@/components/composite/Card";
import { Badge } from "@/components/primitives";
import { Cpu, Server } from "@/tokens/icons";

import type { Worker, WorkerStatusId } from "./types";
import { WORKER_STATUS_LABELS, WORKER_STATUS_VARIANT } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface WorkerCardProps {
  worker: Worker;
  onClick?: (worker: Worker) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Format a heartbeat timestamp as a relative time string. */
function formatHeartbeat(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1_000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WorkerCard({ worker, onClick }: WorkerCardProps) {
  const statusVariant = WORKER_STATUS_VARIANT[worker.status_id as WorkerStatusId] ?? "default";
  const statusLabel = WORKER_STATUS_LABELS[worker.status_id as WorkerStatusId] ?? "Unknown";

  return (
    <Card
      elevation="sm"
      padding="none"
      className={`cursor-pointer transition-shadow hover:shadow-[var(--shadow-md)]${
        !worker.is_enabled ? " opacity-60" : ""
      }`}
    >
      <div
        className="px-[var(--spacing-4)] py-[var(--spacing-3)]"
        onClick={() => onClick?.(worker)}
        role="button"
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") onClick?.(worker);
        }}
      >
        {/* Header: name + status */}
        <div className="flex items-center justify-between gap-[var(--spacing-2)]">
          <div className="flex items-center gap-[var(--spacing-2)] min-w-0">
            <Server size={16} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
            <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {worker.name}
            </span>
          </div>
          <Badge variant={statusVariant} size="sm">
            {statusLabel}
          </Badge>
        </div>

        {/* GPU info */}
        <div className="mt-[var(--spacing-2)] flex items-center gap-[var(--spacing-2)] text-xs text-[var(--color-text-muted)]">
          <Cpu size={14} aria-hidden />
          <span>
            {worker.gpu_model ?? "Unknown GPU"} x{worker.gpu_count}
            {worker.vram_total_mb ? ` (${Math.round(worker.vram_total_mb / 1024)}GB)` : ""}
          </span>
        </div>

        {/* Tags */}
        {Array.isArray(worker.tags) && worker.tags.length > 0 && (
          <div className="mt-[var(--spacing-2)] flex flex-wrap gap-1">
            {worker.tags.map((tag) => (
              <Badge key={tag} variant="info" size="sm">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Footer: hostname + heartbeat */}
        <div className="mt-[var(--spacing-2)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span className="truncate">{worker.hostname}</span>
          <span>{formatHeartbeat(worker.last_heartbeat_at)}</span>
        </div>

        {/* Approval badge */}
        {!worker.is_approved && (
          <div className="mt-[var(--spacing-2)]">
            <Badge variant="warning" size="sm">
              Pending Approval
            </Badge>
          </div>
        )}
      </div>
    </Card>
  );
}
