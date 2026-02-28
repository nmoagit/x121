/**
 * System health monitoring types (PRD-80).
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Status enum & lookup maps
   -------------------------------------------------------------------------- */

export type HealthStatus = "healthy" | "degraded" | "down";

/** Human-readable label for each health status. */
export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
};

/** Badge variant for each health status (uses BadgeVariant from design system -- DRY-211). */
export const HEALTH_STATUS_BADGE_VARIANT: Record<HealthStatus, BadgeVariant> = {
  healthy: "success",
  degraded: "warning",
  down: "danger",
};

/** Human-readable labels for known service names. */
export const SERVICE_LABELS: Record<string, string> = {
  database: "PostgreSQL",
  comfyui: "ComfyUI",
  workers: "Worker Pool",
  filesystem: "Filesystem",
  event_bus: "Event Bus",
  backend: "Backend API",
};

/* --------------------------------------------------------------------------
   Health check data
   -------------------------------------------------------------------------- */

/** A single health check record from the API. */
export interface HealthCheck {
  id: number;
  service_name: string;
  status: HealthStatus;
  latency_ms: number | null;
  error_message: string | null;
  details_json: Record<string, unknown> | null;
  checked_at: string;
}

/** Current status for a service (latest check). */
export interface ServiceStatusResponse {
  service_name: string;
  status: HealthStatus;
  latency_ms: number | null;
  checked_at: string;
  error_message: string | null;
}

/* --------------------------------------------------------------------------
   Uptime
   -------------------------------------------------------------------------- */

/** Uptime statistics for a service (24-hour window). */
export interface UptimeResponse {
  service_name: string;
  /** 24-hour uptime percentage (0-100). */
  uptime_percent_24h: number;
  healthy_seconds: number;
  degraded_seconds: number;
  down_seconds: number;
  total_seconds: number;
}

/* --------------------------------------------------------------------------
   Startup checks
   -------------------------------------------------------------------------- */

/** A single startup readiness check. */
export interface StartupCheck {
  name: string;
  passed: boolean;
  error: string | null;
  required: boolean;
}

/** Aggregate startup check result. */
export interface StartupCheckResult {
  all_passed: boolean;
  checks: StartupCheck[];
}

/* --------------------------------------------------------------------------
   Alert configuration
   -------------------------------------------------------------------------- */

/** Alert configuration for a service. */
export interface HealthAlertConfig {
  id: number;
  service_name: string;
  escalation_delay_seconds: number;
  webhook_url: string | null;
  notification_channels_json: string[] | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** DTO for updating an alert configuration. */
export interface UpdateAlertConfigInput {
  escalation_delay_seconds?: number;
  webhook_url?: string | null;
  notification_channels_json?: string[];
  enabled?: boolean;
}
