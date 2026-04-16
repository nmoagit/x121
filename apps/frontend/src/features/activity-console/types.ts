/**
 * Activity Console types (PRD-118).
 *
 * TypeScript types matching the backend JSON shapes for activity log
 * streaming, history queries, and retention settings.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Domain types
   -------------------------------------------------------------------------- */

export type ActivityLogLevel = "debug" | "info" | "warn" | "error";
export type ActivityLogSource = "api" | "comfyui" | "worker" | "agent" | "pipeline" | "infrastructure";
export type ActivityLogCategory = "curated" | "verbose";

/** A single activity log entry from WebSocket or REST API. */
export interface ActivityLogEntry {
  type: "entry";
  timestamp: string;
  level: ActivityLogLevel;
  source: ActivityLogSource;
  message: string;
  fields: Record<string, unknown>;
  category: ActivityLogCategory;
  entity_type?: string;
  entity_id?: number;
  user_id?: number;
  job_id?: number;
  project_id?: number;
  trace_id?: string;
}

/** WebSocket message indicating the client fell behind. */
export interface ActivityLogLaggedMessage {
  type: "lagged";
  skipped: number;
}

/** Discriminated union for all WebSocket messages. */
export type WsMessage = ActivityLogEntry | ActivityLogLaggedMessage;

/* --------------------------------------------------------------------------
   Settings
   -------------------------------------------------------------------------- */

export interface ActivityLogSettings {
  id: number;
  retention_days_debug: number;
  retention_days_info: number;
  retention_days_warn: number;
  retention_days_error: number;
  batch_size: number;
  flush_interval_ms: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateActivityLogSettings {
  retention_days_debug?: number;
  retention_days_info?: number;
  retention_days_warn?: number;
  retention_days_error?: number;
  batch_size?: number;
  flush_interval_ms?: number;
}

/* --------------------------------------------------------------------------
   REST query
   -------------------------------------------------------------------------- */

/**
 * A persisted activity log row returned by the REST API.
 *
 * Unlike `ActivityLogEntry` (WebSocket shape), the REST model has numeric
 * `level_id`/`source_id` instead of string `level`/`source`, and includes
 * `id` and `created_at` from the database.
 */
export interface ActivityLogRow {
  id: number;
  timestamp: string;
  level_id: number;
  source_id: number;
  message: string;
  fields: Record<string, unknown>;
  category: string;
  entity_type?: string;
  entity_id?: number;
  user_id?: number;
  job_id?: number;
  project_id?: number;
  trace_id?: string;
  created_at: string;
}

export interface ActivityLogQueryParams {
  level?: string;
  source?: string;
  entity_type?: string;
  entity_id?: number;
  job_id?: number;
  from?: string;
  to?: string;
  search?: string;
  mode?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityLogPage {
  items: ActivityLogRow[];
  total: number;
}

/** Maps level_id from the REST API to the display level string. */
export const LEVEL_ID_MAP: Record<number, ActivityLogLevel> = {
  1: "debug",
  2: "info",
  3: "warn",
  4: "error",
};

/** Maps source_id from the REST API to the display source string. */
export const SOURCE_ID_MAP: Record<number, ActivityLogSource> = {
  1: "api",
  2: "comfyui",
  3: "worker",
  4: "agent",
  5: "pipeline",
  6: "infrastructure",
};

/* --------------------------------------------------------------------------
   WebSocket actions (client -> server)
   -------------------------------------------------------------------------- */

/** Client-to-server WebSocket message for subscribing or updating filters. */
export interface WsClientAction {
  action: "subscribe" | "update_filter";
  levels?: ActivityLogLevel[];
  sources?: ActivityLogSource[];
  mode?: ActivityLogCategory;
  entity_type?: string;
  entity_id?: number;
  search?: string;
}

/* --------------------------------------------------------------------------
   Connection status
   -------------------------------------------------------------------------- */

export type WsConnectionStatus = "connecting" | "connected" | "disconnected";

/* --------------------------------------------------------------------------
   UI constants
   -------------------------------------------------------------------------- */

export const ALL_LEVELS: ActivityLogLevel[] = ["debug", "info", "warn", "error"];
export const ALL_SOURCES: ActivityLogSource[] = ["api", "comfyui", "worker", "agent", "pipeline", "infrastructure"];

export const LEVEL_BADGE_VARIANT: Record<ActivityLogLevel, BadgeVariant> = {
  debug: "default",
  info: "info",
  warn: "warning",
  error: "danger",
};

/** Terminal text color classes for log levels. */
export const LEVEL_TERMINAL_COLORS: Record<ActivityLogLevel, string> = {
  debug: "text-[var(--color-text-muted)]",
  info: "text-[var(--color-data-cyan)]",
  warn: "text-[var(--color-data-orange)]",
  error: "text-[var(--color-data-red)]",
};

/** Terminal text color classes for log sources. */
export const SOURCE_TERMINAL_COLORS: Record<ActivityLogSource, string> = {
  api: "text-blue-400",
  comfyui: "text-purple-400",
  worker: "text-[var(--color-data-green)]",
  agent: "text-[var(--color-data-orange)]",
  pipeline: "text-teal-400",
  infrastructure: "text-yellow-400",
};

export const SOURCE_LABELS: Record<ActivityLogSource, string> = {
  api: "API",
  comfyui: "ComfyUI",
  worker: "Worker",
  agent: "Agent",
  pipeline: "Pipeline",
  infrastructure: "Infra",
};

export const LEVEL_LABELS: Record<ActivityLogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

/** CSS classes for source-colored left border accents. */
export const SOURCE_ACCENT_CLASSES: Record<ActivityLogSource, string> = {
  api: "border-l-blue-500",
  comfyui: "border-l-purple-500",
  worker: "border-l-green-500",
  agent: "border-l-orange-500",
  pipeline: "border-l-teal-500",
  infrastructure: "border-l-yellow-500",
};

/* --------------------------------------------------------------------------
   Formatting helpers (DRY-732)
   -------------------------------------------------------------------------- */

/**
 * Format ISO timestamp to "MMM DD HH:MM:SS" (or with .mmm when `includeMs` is true).
 * Used by LogEntryRow, InfrastructureActivityLog, and GenerationTerminal.
 */
export function formatLogTime(iso: string, includeMs = false): string {
  try {
    const d = new Date(iso);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mon = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    if (includeMs) {
      const ms = String(d.getMilliseconds()).padStart(3, "0");
      return `${mon} ${day} ${hh}:${mm}:${ss}.${ms}`;
    }
    return `${mon} ${day} ${hh}:${mm}:${ss}`;
  } catch {
    return iso;
  }
}
