/**
 * TypeScript types for the System Integrity & Repair Tools feature (PRD-43).
 *
 * These types mirror the backend API response shapes for integrity scans,
 * model checksums, and health assessments.
 */

/* --------------------------------------------------------------------------
   Integrity scans
   -------------------------------------------------------------------------- */

export interface IntegrityScan {
  id: number;
  worker_id: number;
  scan_type: string;
  status_id: number;
  results_json: Record<string, unknown> | null;
  models_found: number;
  models_missing: number;
  models_corrupted: number;
  nodes_found: number;
  nodes_missing: number;
  started_at: string | null;
  completed_at: string | null;
  triggered_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateIntegrityScan {
  worker_id: number;
  scan_type: string;
}

export interface WorkerReport {
  scan: IntegrityScan | null;
  health_status: string | null;
}

/* --------------------------------------------------------------------------
   Model checksums
   -------------------------------------------------------------------------- */

export interface ModelChecksum {
  id: number;
  model_name: string;
  file_path: string;
  expected_hash: string;
  file_size_bytes: number | null;
  model_type: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateModelChecksum {
  model_name: string;
  file_path: string;
  expected_hash: string;
  file_size_bytes?: number | null;
  model_type?: string | null;
  source_url?: string | null;
}

export interface UpdateModelChecksum {
  model_name?: string;
  file_path?: string;
  expected_hash?: string;
  file_size_bytes?: number | null;
  model_type?: string | null;
  source_url?: string | null;
}

/* --------------------------------------------------------------------------
   Constants and helpers
   -------------------------------------------------------------------------- */

/** Health status constants matching the backend. */
export const HEALTH_HEALTHY = "healthy" as const;
export const HEALTH_WARNING = "warning" as const;
export const HEALTH_CRITICAL = "critical" as const;

export type HealthStatus =
  | typeof HEALTH_HEALTHY
  | typeof HEALTH_WARNING
  | typeof HEALTH_CRITICAL;

/** Human-readable labels for scan types. */
export const SCAN_TYPE_LABELS: Record<string, string> = {
  models: "Model Verification",
  nodes: "Node Check",
  full: "Full System Scan",
};

/** Map health status to color tokens for traffic lights. */
export const HEALTH_STATUS_COLORS: Record<string, string> = {
  [HEALTH_HEALTHY]: "var(--color-action-success)",
  [HEALTH_WARNING]: "var(--color-action-warning)",
  [HEALTH_CRITICAL]: "var(--color-action-danger)",
};

/** Map health status to Badge variant. */
export function healthBadgeVariant(
  status: string,
): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case HEALTH_HEALTHY:
      return "success";
    case HEALTH_WARNING:
      return "warning";
    case HEALTH_CRITICAL:
      return "danger";
    default:
      return "default";
  }
}
