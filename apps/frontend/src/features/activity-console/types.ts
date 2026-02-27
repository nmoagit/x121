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
export type ActivityLogSource = "api" | "comfyui" | "worker" | "agent" | "pipeline";
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
  items: ActivityLogEntry[];
  total: number;
}

/* --------------------------------------------------------------------------
   WebSocket actions (client -> server)
   -------------------------------------------------------------------------- */

export interface WsSubscribeAction {
  action: "subscribe";
  levels?: ActivityLogLevel[];
  sources?: ActivityLogSource[];
  mode?: ActivityLogCategory;
  entity_type?: string;
  entity_id?: number;
  search?: string;
}

export interface WsUpdateFilterAction {
  action: "update_filter";
  levels?: ActivityLogLevel[];
  sources?: ActivityLogSource[];
  mode?: ActivityLogCategory;
  entity_type?: string;
  entity_id?: number;
  search?: string;
}

export type WsClientAction = WsSubscribeAction | WsUpdateFilterAction;

/* --------------------------------------------------------------------------
   Connection status
   -------------------------------------------------------------------------- */

export type WsConnectionStatus = "connecting" | "connected" | "disconnected";

/* --------------------------------------------------------------------------
   UI constants
   -------------------------------------------------------------------------- */

export const ALL_LEVELS: ActivityLogLevel[] = ["debug", "info", "warn", "error"];
export const ALL_SOURCES: ActivityLogSource[] = ["api", "comfyui", "worker", "agent", "pipeline"];

export const LEVEL_BADGE_VARIANT: Record<ActivityLogLevel, BadgeVariant> = {
  debug: "default",
  info: "info",
  warn: "warning",
  error: "danger",
};

export const SOURCE_LABELS: Record<ActivityLogSource, string> = {
  api: "API",
  comfyui: "ComfyUI",
  worker: "Worker",
  agent: "Agent",
  pipeline: "Pipeline",
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
};
