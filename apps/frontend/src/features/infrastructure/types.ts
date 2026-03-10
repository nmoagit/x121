/**
 * Types for Infrastructure Control Panel (PRD-131).
 *
 * Covers orphan scanning, bulk instance operations,
 * and enriched instance views that combine cloud + ComfyUI data.
 */

/* --------------------------------------------------------------------------
   Orphan scan results
   -------------------------------------------------------------------------- */

/** Full scan result combining cloud, DB, and ComfyUI orphans. */
export interface OrphanScanResult {
  cloud_orphans: CloudOrphan[];
  db_orphans: DbOrphan[];
  comfyui_orphans: ComfyuiOrphan[];
}

/** Cloud instance that exists at the provider but not in the DB. */
export interface CloudOrphan {
  external_id: string;
  name: string | null;
  provider_id: number;
  provider_name: string;
  status: string;
  cost_per_hour_cents: number | null;
}

/** DB record whose status doesn't match the cloud provider. */
export interface DbOrphan {
  instance_id: number;
  external_id: string;
  db_status: string;
  actual_status: string;
  provider_id: number;
}

/** ComfyUI instance with no backing cloud instance or other issues. */
export interface ComfyuiOrphan {
  comfyui_instance_id: number;
  name: string;
  cloud_instance_id: number | null;
  reason: string;
}

/* --------------------------------------------------------------------------
   Orphan cleanup
   -------------------------------------------------------------------------- */

export interface OrphanCleanupRequest {
  cloud_orphans: CloudOrphanAction[];
  db_orphans: DbOrphanAction[];
  comfyui_orphans: number[];
}

export interface CloudOrphanAction {
  external_id: string;
  provider_id: number;
  action: "import" | "terminate";
}

export interface DbOrphanAction {
  instance_id: number;
  action: "remove" | "resync";
}

export interface CleanupSummary {
  cloud_imported: number;
  cloud_terminated: number;
  db_removed: number;
  db_resynced: number;
  comfyui_disabled: number;
  errors: string[];
}

/* --------------------------------------------------------------------------
   Bulk operations
   -------------------------------------------------------------------------- */

export interface BulkRequest {
  instance_ids: number[];
  force?: boolean;
}

export interface BulkResult {
  results: InstanceActionResult[];
}

export interface InstanceActionResult {
  instance_id: number;
  success: boolean;
  error: string | null;
}

/* --------------------------------------------------------------------------
   Enriched instance (combines cloud + ComfyUI data)
   -------------------------------------------------------------------------- */

export type ComfyuiConnectionStatus =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "not_registered";

export interface EnrichedInstance {
  id: number;
  external_id: string;
  name: string | null;
  provider_id: number;
  provider_name: string;
  provider_type: string;
  gpu_type: string | null;
  gpu_count: number;
  status_id: number;
  status_name: string;
  ip_address: string | null;
  ssh_port: number | null;
  started_at: string | null;
  cost_per_hour_cents: number | null;
  total_cost_cents: number | null;
  comfyui_status: ComfyuiConnectionStatus;
  comfyui_instance_id: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
