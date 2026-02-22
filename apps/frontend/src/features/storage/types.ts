/**
 * External & tiered storage types (PRD-48).
 */

import type { BadgeVariant } from "@/components/primitives";

// ---------------------------------------------------------------------------
// Storage backend types
// ---------------------------------------------------------------------------

/** Storage backend type ID matching storage_backend_types seed data. */
export type StorageBackendTypeId = 1 | 2 | 3;

/** Named constants for backend type IDs (avoids magic numbers). */
export const BACKEND_TYPE = {
  LOCAL: 1,
  S3: 2,
  NFS: 3,
} as const;

/** Human-readable label for each backend type. */
export const BACKEND_TYPE_LABELS: Record<StorageBackendTypeId, string> = {
  [BACKEND_TYPE.LOCAL]: "Local Filesystem",
  [BACKEND_TYPE.S3]: "Amazon S3",
  [BACKEND_TYPE.NFS]: "Network File System",
};

// ---------------------------------------------------------------------------
// Storage backend statuses
// ---------------------------------------------------------------------------

/** Storage backend status ID matching storage_backend_statuses seed data. */
export type StorageBackendStatusId = 1 | 2 | 3 | 4;

/** Named constants for backend status IDs. */
export const BACKEND_STATUS = {
  ACTIVE: 1,
  READ_ONLY: 2,
  OFFLINE: 3,
  DECOMMISSIONED: 4,
} as const;

/** Human-readable label for each backend status. */
export const BACKEND_STATUS_LABELS: Record<StorageBackendStatusId, string> = {
  [BACKEND_STATUS.ACTIVE]: "Active",
  [BACKEND_STATUS.READ_ONLY]: "Read Only",
  [BACKEND_STATUS.OFFLINE]: "Offline",
  [BACKEND_STATUS.DECOMMISSIONED]: "Decommissioned",
};

/** Badge variant for each backend status. */
export const BACKEND_STATUS_VARIANT: Record<StorageBackendStatusId, BadgeVariant> = {
  [BACKEND_STATUS.ACTIVE]: "success",
  [BACKEND_STATUS.READ_ONLY]: "warning",
  [BACKEND_STATUS.OFFLINE]: "danger",
  [BACKEND_STATUS.DECOMMISSIONED]: "default",
};

// ---------------------------------------------------------------------------
// Storage migration statuses
// ---------------------------------------------------------------------------

/** Storage migration status ID matching storage_migration_statuses seed data. */
export type StorageMigrationStatusId = 1 | 2 | 3 | 4 | 5 | 6;

/** Named constants for migration status IDs. */
export const MIGRATION_STATUS = {
  PENDING: 1,
  IN_PROGRESS: 2,
  VERIFYING: 3,
  COMPLETED: 4,
  FAILED: 5,
  ROLLED_BACK: 6,
} as const;

/** Human-readable label for each migration status. */
export const MIGRATION_STATUS_LABELS: Record<StorageMigrationStatusId, string> = {
  [MIGRATION_STATUS.PENDING]: "Pending",
  [MIGRATION_STATUS.IN_PROGRESS]: "In Progress",
  [MIGRATION_STATUS.VERIFYING]: "Verifying",
  [MIGRATION_STATUS.COMPLETED]: "Completed",
  [MIGRATION_STATUS.FAILED]: "Failed",
  [MIGRATION_STATUS.ROLLED_BACK]: "Rolled Back",
};

/** Badge variant for each migration status. */
export const MIGRATION_STATUS_VARIANT: Record<StorageMigrationStatusId, BadgeVariant> = {
  [MIGRATION_STATUS.PENDING]: "default",
  [MIGRATION_STATUS.IN_PROGRESS]: "info",
  [MIGRATION_STATUS.VERIFYING]: "warning",
  [MIGRATION_STATUS.COMPLETED]: "success",
  [MIGRATION_STATUS.FAILED]: "danger",
  [MIGRATION_STATUS.ROLLED_BACK]: "default",
};

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

/** A storage backend row from the API. */
export interface StorageBackend {
  id: number;
  name: string;
  backend_type_id: StorageBackendTypeId;
  status_id: StorageBackendStatusId;
  tier: "hot" | "cold";
  config: Record<string, unknown>;
  is_default: boolean;
  total_capacity_bytes: number | null;
  used_bytes: number;
  project_id: number | null;
  created_at: string;
  updated_at: string;
}

/** DTO for creating a storage backend. */
export interface CreateStorageBackend {
  name: string;
  backend_type_id: StorageBackendTypeId;
  tier?: "hot" | "cold";
  config: Record<string, unknown>;
  is_default?: boolean;
  total_capacity_bytes?: number;
  project_id?: number;
}

/** DTO for updating a storage backend. */
export interface UpdateStorageBackend {
  name?: string;
  tier?: "hot" | "cold";
  config?: Record<string, unknown>;
  is_default?: boolean;
  total_capacity_bytes?: number;
  project_id?: number;
}

/** An asset location row from the API. */
export interface AssetLocation {
  id: number;
  entity_type: string;
  entity_id: number;
  file_field: string;
  backend_id: number;
  storage_path: string;
  file_size_bytes: number;
  checksum_sha256: string | null;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
  updated_at: string;
}

/** A tiering policy row from the API. */
export interface TieringPolicy {
  id: number;
  name: string;
  description: string | null;
  source_tier: "hot" | "cold";
  target_tier: "hot" | "cold";
  target_backend_id: number;
  entity_type: string;
  condition_field: string | null;
  condition_operator: string | null;
  condition_value: string | null;
  age_threshold_days: number | null;
  access_threshold_days: number | null;
  project_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** DTO for creating a tiering policy. */
export interface CreateTieringPolicy {
  name: string;
  description?: string;
  source_tier: "hot" | "cold";
  target_tier: "hot" | "cold";
  target_backend_id: number;
  entity_type: string;
  condition_field?: string;
  condition_operator?: string;
  condition_value?: string;
  age_threshold_days?: number;
  access_threshold_days?: number;
  project_id?: number;
  is_active?: boolean;
}

/** A tiering simulation candidate. */
export interface TieringCandidate {
  entity_type: string;
  entity_id: number;
  file_field: string;
  file_size_bytes: number;
  current_backend_id: number;
  last_accessed_at: string | null;
  access_count: number;
}

/** A storage migration row from the API. */
export interface StorageMigration {
  id: number;
  status_id: StorageMigrationStatusId;
  source_backend_id: number;
  target_backend_id: number;
  total_files: number;
  transferred_files: number;
  verified_files: number;
  failed_files: number;
  total_bytes: number;
  transferred_bytes: number;
  error_log: unknown[];
  started_at: string | null;
  completed_at: string | null;
  initiated_by: number | null;
  created_at: string;
  updated_at: string;
}

/** DTO for starting a storage migration. */
export interface CreateStorageMigration {
  source_backend_id: number;
  target_backend_id: number;
}
