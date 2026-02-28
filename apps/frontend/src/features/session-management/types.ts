/**
 * Session management types (PRD-98).
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Active sessions
   -------------------------------------------------------------------------- */

export interface ActiveSession {
  id: number;
  user_id: number;
  status: string;
  ip_address: string | null;
  user_agent: string | null;
  current_view: string | null;
  last_activity: string;
  started_at: string;
  ended_at: string | null;
}

/** Paginated active session response. */
export interface ActiveSessionPage {
  items: ActiveSession[];
  total: number;
}

/* --------------------------------------------------------------------------
   Login attempts
   -------------------------------------------------------------------------- */

export interface LoginAttempt {
  id: number;
  username: string;
  user_id: number | null;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
}

/** Paginated login-history response. */
export interface LoginHistoryPage {
  items: LoginAttempt[];
  total: number;
}

/* --------------------------------------------------------------------------
   Session configuration
   -------------------------------------------------------------------------- */

export interface SessionConfig {
  id: number;
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Analytics
   -------------------------------------------------------------------------- */

export interface SessionAnalytics {
  total_sessions: number;
  active_sessions: number;
  idle_sessions: number;
  avg_duration_seconds: number;
  peak_concurrent: number;
}

/* --------------------------------------------------------------------------
   Status lookup maps
   -------------------------------------------------------------------------- */

/** Badge variant for each session status (uses BadgeVariant from design system). */
export const SESSION_STATUS_BADGE: Record<string, BadgeVariant> = {
  active: "success",
  idle: "warning",
  terminated: "default",
};

/** Human-readable label for each session status. */
export const SESSION_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  idle: "Idle",
  terminated: "Terminated",
};
