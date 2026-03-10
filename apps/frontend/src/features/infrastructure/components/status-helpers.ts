/**
 * Status-to-badge mappings and uptime calculation for infrastructure instances.
 */

import type { BadgeVariant } from "@/components/primitives";
import type { ComfyuiConnectionStatus } from "../types";

/* --------------------------------------------------------------------------
   Instance status badge mapping
   -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<string, BadgeVariant> = {
  provisioning: "info",
  running: "success",
  stopped: "default",
  terminated: "default",
  error: "danger",
  unknown: "warning",
};

export function statusVariant(statusName: string): BadgeVariant {
  return STATUS_BADGE[statusName] ?? "default";
}

/* --------------------------------------------------------------------------
   ComfyUI connection status badge mapping
   -------------------------------------------------------------------------- */

const COMFYUI_BADGE: Record<ComfyuiConnectionStatus, BadgeVariant> = {
  connected: "success",
  disconnected: "danger",
  reconnecting: "warning",
  not_registered: "default",
};

const COMFYUI_LABEL: Record<ComfyuiConnectionStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  reconnecting: "Reconnecting",
  not_registered: "Not Registered",
};

export function comfyuiVariant(status: ComfyuiConnectionStatus): BadgeVariant {
  return COMFYUI_BADGE[status];
}

export function comfyuiLabel(status: ComfyuiConnectionStatus): string {
  return COMFYUI_LABEL[status];
}

/* --------------------------------------------------------------------------
   Uptime calculation
   -------------------------------------------------------------------------- */

/** Calculate uptime in ms from started_at to now. Returns 0 if not started. */
export function calculateUptimeMs(startedAt: string | null): number {
  if (!startedAt) return 0;
  return Math.max(0, Date.now() - new Date(startedAt).getTime());
}

/* --------------------------------------------------------------------------
   Stuck detection (>10 min in provisioning/starting)
   -------------------------------------------------------------------------- */

const STUCK_THRESHOLD_MS = 10 * 60 * 1000;

export function isStuck(statusName: string, createdAt: string): boolean {
  if (statusName !== "provisioning") return false;
  return Date.now() - new Date(createdAt).getTime() > STUCK_THRESHOLD_MS;
}
