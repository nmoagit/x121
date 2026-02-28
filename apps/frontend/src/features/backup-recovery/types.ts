/**
 * TypeScript types for Backup & Disaster Recovery (PRD-81).
 *
 * These types mirror the backend API response shapes for backups,
 * backup schedules, verification results, and summary statistics.
 *
 * Backend sources:
 * - db/src/models/backup_recovery.rs (row structs, DTOs)
 * - core/src/backup_recovery.rs (VerificationResult)
 */

import type { BadgeVariant } from "@/components/primitives";

/* -- Enums / union types --------------------------------------------------- */

export type BackupType = "full" | "incremental" | "config" | "wal";

export type BackupStatus = "pending" | "running" | "completed" | "failed" | "verified";

export type TriggeredBy = "schedule" | "manual" | "system";

/* -- Verification result --------------------------------------------------- */

/** Mirrors core::backup_recovery::VerificationResult */
export interface VerificationResult {
  backup_id: number;
  success: boolean;
  restore_duration_secs: number;
  queries_passed: number;
  queries_total: number;
  errors: string[];
}

/* -- Backup ---------------------------------------------------------------- */

/** Mirrors db::models::backup_recovery::Backup */
export interface Backup {
  id: number;
  backup_type: BackupType;
  destination: string;
  file_path: string | null;
  size_bytes: number | null;
  status: BackupStatus;
  started_at: string | null;
  completed_at: string | null;
  verified: boolean;
  verified_at: string | null;
  verification_result_json: VerificationResult | null;
  error_message: string | null;
  triggered_by: TriggeredBy;
  retention_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/* -- Backup schedule ------------------------------------------------------- */

/** Mirrors db::models::backup_recovery::BackupSchedule */
export interface BackupSchedule {
  id: number;
  backup_type: BackupType;
  cron_expression: string;
  destination: string;
  retention_days: number;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

/* -- Summary --------------------------------------------------------------- */

/** Mirrors db::models::backup_recovery::BackupSummary */
export interface BackupSummary {
  total_count: number;
  total_size_bytes: number;
  last_full_at: string | null;
  last_verified_at: string | null;
  next_scheduled_at: string | null;
}

/* -- Mutation inputs ------------------------------------------------------- */

/** POST /admin/backups body */
export interface CreateBackup {
  backup_type: BackupType;
  destination: string;
}

/** POST /admin/backup-schedules body */
export interface CreateBackupSchedule {
  backup_type: BackupType;
  cron_expression: string;
  destination: string;
  retention_days?: number;
  enabled?: boolean;
}

/** PUT /admin/backup-schedules/:id body */
export interface UpdateBackupSchedule {
  backup_type?: BackupType;
  cron_expression?: string;
  destination?: string;
  retention_days?: number;
  enabled?: boolean;
}

/* -- Display constants ----------------------------------------------------- */

/** Human-readable labels for backup types. */
export const BACKUP_TYPE_LABEL: Record<BackupType, string> = {
  full: "Full",
  incremental: "Incremental",
  config: "Config",
  wal: "WAL",
};

/** Select options derived from BACKUP_TYPE_LABEL -- shared by TriggerBackupDialog and ScheduleForm. */
export const BACKUP_TYPE_OPTIONS = (
  Object.entries(BACKUP_TYPE_LABEL) as [BackupType, string][]
).map(([value, label]) => ({ value, label }));

/** Human-readable labels for backup statuses. */
export const BACKUP_STATUS_LABEL: Record<BackupStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  verified: "Verified",
};

/** Badge variant mapping for backup statuses. */
export const BACKUP_STATUS_BADGE_VARIANT: Record<BackupStatus, BadgeVariant> = {
  pending: "default",
  running: "info",
  completed: "success",
  failed: "danger",
  verified: "success",
};

/** Human-readable labels for triggered-by source. */
export const TRIGGERED_BY_LABEL: Record<TriggeredBy, string> = {
  schedule: "Scheduled",
  manual: "Manual",
  system: "System",
};
