/**
 * Admin platform settings types (PRD-110).
 */

import type { BadgeVariant } from "@/components/primitives";

/** A platform setting returned by the API. */
export interface PlatformSetting {
  key: string;
  category: string;
  label: string;
  description: string;
  value: string;
  source: SettingSource;
  value_type: string;
  requires_restart: boolean;
  sensitive: boolean;
  updated_at: string | null;
  updated_by: number | null;
}

/** Where a setting's current value originates from. */
export type SettingSource = "database" | "env" | "default";

/** Response envelope for the settings list endpoint. */
export interface SettingsListResponse {
  settings: PlatformSetting[];
  pending_restart: boolean;
  pending_restart_keys: string[];
}

/** Result of a connection test (must match backend `TestConnectionResponse`). */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency_ms: number | null;
}

/** Human-readable label for each setting source. */
export const SOURCE_LABELS: Record<SettingSource, string> = {
  database: "Database",
  env: "Env",
  default: "Default",
};

/** Badge variant for each setting source. */
export const SOURCE_VARIANT: Record<SettingSource, BadgeVariant> = {
  database: "success",
  env: "warning",
  default: "default",
};

/** Category tab definitions for the settings panel. */
export const SETTING_CATEGORIES = [
  { id: "storage", label: "Storage" },
  { id: "comfyui", label: "ComfyUI" },
  { id: "auth", label: "Authentication" },
  { id: "system", label: "System" },
  { id: "templates", label: "Templates" },
] as const;

/** Value types that support connection testing (must match backend `SettingValueType::as_str()`). */
export const TESTABLE_VALUE_TYPES = new Set(["url", "ws_url"]);
