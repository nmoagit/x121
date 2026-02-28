/**
 * Left-side header for a worker lane in the Gantt timeline (PRD-90).
 *
 * Displays worker name, status badge, and current job indicator.
 * Uses canonical WORKER_STATUS_LABELS / WORKER_STATUS_VARIANT from
 * the workers feature (NOT job status -- workers have a different status table).
 */

import { Stack } from "@/components/layout";
import { Badge } from "@/components/primitives";
import type { WorkerStatusId } from "@/features/workers";
import { WORKER_STATUS_LABELS, WORKER_STATUS_VARIANT } from "@/features/workers/types";

import type { WorkerLane } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const LANE_HEIGHT = 48;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface WorkerLaneHeaderProps {
  worker: WorkerLane;
}

export function WorkerLaneHeader({ worker }: WorkerLaneHeaderProps) {
  const status = WORKER_STATUS_LABELS[worker.status_id as WorkerStatusId] ?? "Unknown";
  const variant = WORKER_STATUS_VARIANT[worker.status_id as WorkerStatusId] ?? "default";

  return (
    <div
      className="flex items-center px-3 border-b border-[var(--color-border-default)]"
      style={{ height: LANE_HEIGHT }}
    >
      <Stack direction="horizontal" gap={2} align="center">
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate max-w-[120px]">
          {worker.name}
        </span>
        <Badge variant={variant} size="sm">
          {status}
        </Badge>
        {worker.current_job_id != null && (
          <span className="text-xs text-[var(--color-text-muted)]">#{worker.current_job_id}</span>
        )}
      </Stack>
    </div>
  );
}

export { LANE_HEIGHT };
