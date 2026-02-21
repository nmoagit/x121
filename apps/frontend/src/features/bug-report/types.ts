/**
 * Bug report types (PRD-44).
 */

export type BugReportStatus = "new" | "triaged" | "resolved" | "closed";

export interface BugReport {
  id: number;
  user_id: number;
  description: string | null;
  url: string | null;
  browser_info: string | null;
  console_errors_json: unknown | null;
  action_history_json: unknown | null;
  context_json: unknown | null;
  recording_path: string | null;
  screenshot_path: string | null;
  status: BugReportStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateBugReportInput {
  description?: string;
  url?: string;
  browser_info?: string;
  console_errors_json?: unknown;
  action_history_json?: unknown;
  context_json?: unknown;
}

export interface UpdateBugReportStatusInput {
  status: BugReportStatus;
}
