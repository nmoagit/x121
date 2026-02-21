/**
 * TypeScript types for audit logging & compliance (PRD-45).
 *
 * These types mirror the backend API response shapes.
 */

/* --------------------------------------------------------------------------
   Audit log entry
   -------------------------------------------------------------------------- */

export interface AuditLog {
  id: number;
  timestamp: string;
  user_id: number | null;
  session_id: string | null;
  action_type: string;
  entity_type: string | null;
  entity_id: number | null;
  details_json: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  integrity_hash: string | null;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Query parameters
   -------------------------------------------------------------------------- */

export interface AuditQueryParams {
  user_id?: number;
  action_type?: string;
  entity_type?: string;
  entity_id?: number;
  from?: string;
  to?: string;
  search_text?: string;
  limit?: number;
  offset?: number;
}

/* --------------------------------------------------------------------------
   Paginated response
   -------------------------------------------------------------------------- */

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
}

/* --------------------------------------------------------------------------
   Retention policy
   -------------------------------------------------------------------------- */

export interface AuditRetentionPolicy {
  id: number;
  log_category: string;
  active_retention_days: number;
  archive_retention_days: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateRetentionPolicy {
  active_retention_days?: number;
  archive_retention_days?: number;
  enabled?: boolean;
}

/* --------------------------------------------------------------------------
   Integrity check result
   -------------------------------------------------------------------------- */

export interface IntegrityCheckResult {
  verified_entries: number;
  chain_valid: boolean;
  first_break: number | null;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Known action types for display/filtering. */
export const ACTION_TYPES = [
  "login",
  "logout",
  "job_submit",
  "approve",
  "reject",
  "config_change",
  "entity_create",
  "entity_update",
  "entity_delete",
  "system",
] as const;

/** Known entity types for display/filtering. */
export const ENTITY_TYPES = [
  "project",
  "character",
  "scene",
  "segment",
  "workflow",
  "job",
  "user",
] as const;

/** Human-readable labels for action types. */
export function actionTypeLabel(action: string): string {
  const labels: Record<string, string> = {
    login: "Login",
    logout: "Logout",
    job_submit: "Job Submit",
    approve: "Approve",
    reject: "Reject",
    config_change: "Config Change",
    entity_create: "Create",
    entity_update: "Update",
    entity_delete: "Delete",
    system: "System",
  };
  return labels[action] ?? action;
}
