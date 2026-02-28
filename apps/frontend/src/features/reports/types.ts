/**
 * TypeScript types for Production Reporting & Data Export (PRD-73).
 *
 * These types mirror the backend API response shapes for report types,
 * generated reports, and report schedules.
 */

import {
  type JobStatusLabel,
  JOB_STATUS_BADGE_VARIANT,
  JOB_STATUS_LABELS,
  resolveJobStatus,
} from "@/lib/job-status";

/* --------------------------------------------------------------------------
   Report format
   -------------------------------------------------------------------------- */

export type ReportFormat = "json" | "csv" | "pdf";

/* --------------------------------------------------------------------------
   Report status -- delegates to shared job-status module
   -------------------------------------------------------------------------- */

/** @deprecated Use `JobStatusLabel` from `@/lib/job-status` directly. */
export type ReportStatus = JobStatusLabel;

/* --------------------------------------------------------------------------
   Entities
   -------------------------------------------------------------------------- */

export interface ReportType {
  id: number;
  name: string;
  description: string | null;
  config_schema_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: number;
  report_type_id: number;
  config_json: ReportConfig;
  data_json: Record<string, unknown> | null;
  file_path: string | null;
  format: ReportFormat;
  generated_by: number | null;
  status_id: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportConfig {
  date_from: string;
  date_to: string;
  filters?: Record<string, unknown>;
}

export interface ReportSchedule {
  id: number;
  report_type_id: number;
  config_json: ReportConfig;
  format: ReportFormat;
  schedule: string;
  recipients_json: string[];
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   DTOs
   -------------------------------------------------------------------------- */

export interface CreateReportInput {
  report_type_id: number;
  config_json: ReportConfig;
  format: ReportFormat;
}

export interface CreateScheduleInput {
  report_type_id: number;
  config_json: ReportConfig;
  format: ReportFormat;
  schedule: string;
  recipients_json: string[];
}

export interface UpdateScheduleInput {
  config_json?: ReportConfig;
  format?: ReportFormat;
  schedule?: string;
  recipients_json?: string[];
  enabled?: boolean;
}

/* --------------------------------------------------------------------------
   Display constants
   -------------------------------------------------------------------------- */

export const REPORT_TYPE_LABELS: Record<string, string> = {
  delivery_summary: "Delivery Summary",
  throughput_metrics: "Throughput Metrics",
  gpu_utilization: "GPU Utilization",
  quality_metrics: "Quality Metrics",
  cost_per_character: "Cost Per Character",
  reviewer_productivity: "Reviewer Productivity",
  video_technical: "Video Technical",
};

export const FORMAT_LABELS: Record<ReportFormat, string> = {
  json: "JSON",
  csv: "CSV",
  pdf: "PDF",
};

export const SCHEDULE_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

/* --------------------------------------------------------------------------
   Status styling -- delegates to shared job-status module
   -------------------------------------------------------------------------- */

/** @deprecated Use `JOB_STATUS_BADGE_VARIANT` from `@/lib/job-status`. */
export const REPORT_STATUS_BADGE_VARIANT = JOB_STATUS_BADGE_VARIANT;

/** @deprecated Use `JOB_STATUS_LABELS` from `@/lib/job-status`. */
export const REPORT_STATUS_LABELS = JOB_STATUS_LABELS;

/**
 * Resolves a numeric `status_id` to a status label string.
 *
 * @deprecated Use `resolveJobStatus` from `@/lib/job-status` directly.
 */
export const resolveReportStatus = resolveJobStatus;
