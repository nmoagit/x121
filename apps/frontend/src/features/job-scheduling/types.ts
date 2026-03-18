/**
 * TypeScript types for time-based job scheduling (PRD-119).
 *
 * These types mirror the backend API response shapes for schedules,
 * execution history, and off-peak configuration.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Schedule
   -------------------------------------------------------------------------- */

export type ScheduleType = "one_time" | "recurring";
export type ActionType = "submit_job" | "submit_batch" | "schedule_generation";
export type HistoryStatus = "success" | "failed" | "skipped" | "cancelled";

export interface Schedule {
  id: number;
  name: string;
  description: string | null;
  schedule_type: ScheduleType;
  cron_expression: string | null;
  scheduled_at: string | null;
  timezone: string;
  is_off_peak_only: boolean;
  action_type: ActionType;
  action_config: Record<string, unknown>;
  owner_id: number;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Schedule history
   -------------------------------------------------------------------------- */

export interface ScheduleHistory {
  id: number;
  schedule_id: number;
  executed_at: string;
  status: HistoryStatus;
  result_job_id: number | null;
  error_message: string | null;
  execution_duration_ms: number | null;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Off-peak config
   -------------------------------------------------------------------------- */

export interface OffPeakConfig {
  id: number;
  day_of_week: number;
  start_hour: number;
  end_hour: number;
  timezone: string;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Mutation inputs
   -------------------------------------------------------------------------- */

export interface CreateSchedule {
  name: string;
  description?: string;
  schedule_type: ScheduleType;
  cron_expression?: string;
  scheduled_at?: string;
  timezone: string;
  is_off_peak_only: boolean;
  action_type: ActionType;
  action_config: Record<string, unknown>;
}

export type UpdateSchedule = Partial<CreateSchedule>;

export interface UpdateOffPeakConfig {
  /** Must match backend `UpdateOffPeakConfigBulk.entries` field name. */
  entries: Array<{
    day_of_week: number;
    start_hour: number;
    end_hour: number;
    timezone: string;
  }>;
}

/* --------------------------------------------------------------------------
   Display constants
   -------------------------------------------------------------------------- */

export const SCHEDULE_TYPE_LABEL: Record<ScheduleType, string> = {
  one_time: "One-Time",
  recurring: "Recurring",
};

export const ACTION_TYPE_LABEL: Record<ActionType, string> = {
  submit_job: "Submit Job",
  submit_batch: "Submit Batch",
  schedule_generation: "Schedule Generation",
};

export const HISTORY_STATUS_BADGE: Record<HistoryStatus, BadgeVariant> = {
  success: "success",
  failed: "danger",
  skipped: "warning",
  cancelled: "default",
};

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Hours of the day (0-23) for off-peak grid. */
export const HOURS_OF_DAY = Array.from({ length: 24 }, (_, i) => i);

/** Common timezone options for the timezone selector. */
export const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Europe/Prague", label: "Europe/Prague" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai" },
] as const;

/** Pre-mapped select options for timezone dropdowns. */
export const TIMEZONE_SELECT_OPTIONS = TIMEZONE_OPTIONS.map((tz) => ({
  value: tz.value,
  label: tz.label,
}));

/* --------------------------------------------------------------------------
   Schedule helpers (shared across dashboard widgets and queue panel)
   -------------------------------------------------------------------------- */

/** Extract scene IDs from a schedule's action config. */
export function getScheduleSceneIds(schedule: Schedule): number[] {
  const ids = schedule.action_config?.scene_ids;
  return Array.isArray(ids) ? ids : [];
}

/** Filter schedules to only active generation schedules. */
export function filterActiveGenerationSchedules(schedules: Schedule[]): Schedule[] {
  return schedules.filter(
    (s) => s.action_type === "schedule_generation" && s.is_active,
  );
}
