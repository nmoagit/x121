/**
 * Worker pool management types (PRD-46).
 */

import type { BadgeVariant } from "@/components/primitives";

/** Worker status ID matching worker_statuses seed data. */
export type WorkerStatusId = 1 | 2 | 3 | 4;

/** Named constants for worker status IDs (avoids magic numbers). */
export const WORKER_STATUS = {
  IDLE: 1,
  BUSY: 2,
  OFFLINE: 3,
  DRAINING: 4,
} as const;

/** Human-readable label for each worker status. */
export const WORKER_STATUS_LABELS: Record<WorkerStatusId, string> = {
  [WORKER_STATUS.IDLE]: "Idle",
  [WORKER_STATUS.BUSY]: "Busy",
  [WORKER_STATUS.OFFLINE]: "Offline",
  [WORKER_STATUS.DRAINING]: "Draining",
};

/** Badge variant for each worker status (uses BadgeVariant from design system -- DRY-211). */
export const WORKER_STATUS_VARIANT: Record<WorkerStatusId, BadgeVariant> = {
  [WORKER_STATUS.IDLE]: "success",
  [WORKER_STATUS.BUSY]: "warning",
  [WORKER_STATUS.OFFLINE]: "danger",
  [WORKER_STATUS.DRAINING]: "default",
};

/** A worker row from the API. */
export interface Worker {
  id: number;
  name: string;
  hostname: string;
  ip_address: string | null;
  gpu_model: string | null;
  gpu_count: number;
  vram_total_mb: number | null;
  status_id: WorkerStatusId;
  tags: string[];
  comfyui_instance_id: number | null;
  is_approved: boolean;
  is_enabled: boolean;
  last_heartbeat_at: string | null;
  registered_at: string;
  decommissioned_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** DTO for registering a new worker. */
export interface CreateWorker {
  name: string;
  hostname: string;
  ip_address?: string;
  gpu_model?: string;
  gpu_count?: number;
  vram_total_mb?: number;
  tags?: string[];
  comfyui_instance_id?: number;
  metadata?: Record<string, unknown>;
}

/** DTO for updating an existing worker. */
export interface UpdateWorker {
  hostname?: string;
  ip_address?: string;
  gpu_model?: string;
  gpu_count?: number;
  vram_total_mb?: number;
  tags?: string[];
  comfyui_instance_id?: number;
  is_enabled?: boolean;
  metadata?: Record<string, unknown>;
}

/** Aggregate fleet statistics. */
export interface FleetStats {
  total_workers: number;
  idle_workers: number;
  busy_workers: number;
  offline_workers: number;
  draining_workers: number;
  approved_workers: number;
  enabled_workers: number;
}

/** A worker health-log entry (status transition record). */
export interface HealthLogEntry {
  id: number;
  worker_id: number;
  from_status_id: WorkerStatusId;
  to_status_id: WorkerStatusId;
  reason: string | null;
  transitioned_at: string;
}
