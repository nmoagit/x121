/**
 * GPU power management types (PRD-87).
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Power state
   -------------------------------------------------------------------------- */

export type PowerState = "on" | "idle" | "shutting_down" | "sleeping" | "waking";

/** Human-readable label for each power state. */
export const POWER_STATE_LABELS: Record<PowerState, string> = {
  on: "On",
  idle: "Idle",
  shutting_down: "Shutting Down",
  sleeping: "Sleeping",
  waking: "Waking",
};

/** Badge variant for each power state (uses BadgeVariant from design system -- DRY-211). */
export const POWER_STATE_BADGE_VARIANT: Record<PowerState, BadgeVariant> = {
  on: "success",
  idle: "warning",
  shutting_down: "warning",
  sleeping: "default",
  waking: "info",
};

/* --------------------------------------------------------------------------
   Schedule
   -------------------------------------------------------------------------- */

export type ScheduleScope = "individual" | "fleet";

/** On/off time pair for a single day. */
export interface DaySchedule {
  on: string;
  off: string;
}

/** Days of the week used as schedule keys. */
export const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/** Human-readable label for each day. */
export const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** A power schedule row from the API. */
export interface PowerSchedule {
  id: number;
  worker_id: number | null;
  scope: ScheduleScope;
  schedule_json: Record<string, DaySchedule>;
  timezone: string;
  override_for_queued_jobs: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** DTO for creating a power schedule. */
export interface CreatePowerScheduleInput {
  worker_id?: number | null;
  scope: ScheduleScope;
  schedule_json: Record<string, DaySchedule>;
  timezone: string;
  override_for_queued_jobs?: boolean;
  enabled?: boolean;
}

/** DTO for updating an existing power schedule. */
export interface UpdatePowerScheduleInput {
  schedule_json?: Record<string, DaySchedule>;
  timezone?: string;
  override_for_queued_jobs?: boolean;
  enabled?: boolean;
}

/* --------------------------------------------------------------------------
   Wake method
   -------------------------------------------------------------------------- */

export type WakeMethod = "wol" | "ssh" | "api";

/** Human-readable label for each wake method. */
export const WAKE_METHOD_LABELS: Record<WakeMethod, string> = {
  wol: "Wake-on-LAN",
  ssh: "SSH",
  api: "API",
};

/* --------------------------------------------------------------------------
   Worker power status
   -------------------------------------------------------------------------- */

/** Per-worker power status from the API. */
export interface WorkerPowerStatus {
  worker_id: number;
  worker_name: string;
  power_state: PowerState;
  idle_timeout_minutes: number | null;
  wake_method: WakeMethod | null;
  gpu_tdp_watts: number | null;
  min_fleet_member: boolean;
}

/* --------------------------------------------------------------------------
   Consumption
   -------------------------------------------------------------------------- */

/** A single consumption log entry (daily per worker). */
export interface ConsumptionEntry {
  worker_id: number;
  date: string;
  active_minutes: number;
  idle_minutes: number;
  off_minutes: number;
  estimated_kwh: number | null;
}

/** Aggregated consumption summary from the API (matches backend ConsumptionSummary). */
export interface ConsumptionSummaryData {
  worker_id: number | null;
  total_active_minutes: number;
  total_idle_minutes: number;
  total_off_minutes: number;
  total_estimated_kwh: number;
  always_on_kwh: number;
  savings_pct: number;
  entries: ConsumptionEntry[];
}

/** Query params for fetching consumption data (matches backend ConsumptionQuery). */
export interface ConsumptionParams {
  from: string;
  to: string;
  worker_id?: number;
}

/* --------------------------------------------------------------------------
   Fleet power settings
   -------------------------------------------------------------------------- */

/** Fleet-wide default power settings (matches backend FleetPowerSettings). */
export interface FleetPowerSettings {
  default_idle_timeout_minutes: number;
  default_wake_method: string | null;
  fleet_schedules: PowerSchedule[];
}

/** DTO for updating fleet power settings. */
export interface UpdateFleetPowerSettings {
  default_idle_timeout_minutes?: number;
  default_wake_method?: string | null;
  fleet_schedules?: PowerSchedule[];
}
