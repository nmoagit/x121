/**
 * TypeScript types for Generation Budget & Quota Management (PRD-93).
 *
 * These types mirror the backend API response shapes for project budgets,
 * user quotas, consumption ledger entries, exemptions, and status checks.
 *
 * Backend sources:
 * - db/src/models/budget_quota.rs (row structs, DTOs)
 * - core/src/budget_quota.rs (BudgetCheckResult, TrendProjection)
 */

import type { BadgeVariant } from "@/components/primitives";

/* -- Project budget -------------------------------------------------------- */

/** Mirrors db::models::budget_quota::ProjectBudget */
export interface ProjectBudget {
  id: number;
  project_id: number;
  budget_gpu_hours: number;
  period_type: PeriodType;
  period_start: string;
  warning_threshold_pct: number;
  critical_threshold_pct: number;
  hard_limit_enabled: boolean;
  rollover_enabled: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/* -- User quota ------------------------------------------------------------ */

/** Mirrors db::models::budget_quota::UserQuota */
export interface UserQuota {
  id: number;
  user_id: number;
  quota_gpu_hours: number;
  period_type: PeriodType;
  period_start: string;
  hard_limit_enabled: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/* -- Consumption ledger ---------------------------------------------------- */

/** Mirrors db::models::budget_quota::ConsumptionLedgerEntry */
export interface ConsumptionLedgerEntry {
  id: number;
  project_id: number;
  user_id: number;
  job_id: number | null;
  gpu_hours: number;
  job_type: string;
  resolution_tier: string | null;
  is_exempt: boolean;
  exemption_reason: string | null;
  recorded_at: string;
}

/* -- Budget exemption ------------------------------------------------------ */

/** Mirrors db::models::budget_quota::BudgetExemption */
export interface BudgetExemption {
  id: number;
  name: string;
  description: string | null;
  job_type: string;
  resolution_tier: string | null;
  is_enabled: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/* -- Trend projection ------------------------------------------------------ */

/** Mirrors core::budget_quota::TrendProjection */
export interface TrendProjection {
  days_until_exhaustion: number | null;
  daily_avg: number;
  trend_direction: string; // 'increasing' | 'stable' | 'decreasing'
}

/* -- Status types ---------------------------------------------------------- */

/**
 * Mirrors db::models::budget_quota::BudgetStatus.
 *
 * NOTE: consumed_pct is in 0-100 range (e.g. 75.0 for 75%).
 * Use `consumed_pct / 100` before passing to formatPercent() or threshold checks.
 */
export interface BudgetStatus {
  budget: ProjectBudget;
  consumed_gpu_hours: number;
  remaining_gpu_hours: number;
  consumed_pct: number;
  trend: TrendProjection;
}

/**
 * Mirrors db::models::budget_quota::QuotaStatus.
 *
 * NOTE: consumed_pct is in 0-100 range (e.g. 75.0 for 75%).
 */
export interface QuotaStatus {
  quota: UserQuota;
  consumed_gpu_hours: number;
  remaining_gpu_hours: number;
  consumed_pct: number;
}

/**
 * Mirrors core::budget_quota::BudgetCheckResult (tagged enum).
 *
 * NOTE: consumed_pct is in 0-100 range when present.
 */
export interface BudgetCheckResult {
  status: "allowed" | "warning" | "blocked" | "no_budget";
  message?: string;
  consumed_pct?: number;
}

/* -- Consumption history --------------------------------------------------- */

/** Mirrors db::models::budget_quota::DailyConsumption */
export interface DailyConsumption {
  day: string;
  total_gpu_hours: number;
}

/* -- Period type ----------------------------------------------------------- */

export type PeriodType = "daily" | "weekly" | "monthly" | "unlimited";

/* -- Mutation inputs ------------------------------------------------------- */

/** Mirrors db::models::budget_quota::CreateProjectBudget (project_id is in URL path). */
export interface CreateProjectBudget {
  budget_gpu_hours: number;
  period_type: string;
  period_start?: string;
  warning_threshold_pct?: number;
  critical_threshold_pct?: number;
  hard_limit_enabled?: boolean;
  rollover_enabled?: boolean;
}

export interface UpdateProjectBudget {
  budget_gpu_hours?: number;
  period_type?: string;
  period_start?: string;
  warning_threshold_pct?: number;
  critical_threshold_pct?: number;
  hard_limit_enabled?: boolean;
  rollover_enabled?: boolean;
}

/** Mirrors db::models::budget_quota::CreateUserQuota (user_id is in URL path). */
export interface CreateUserQuota {
  quota_gpu_hours: number;
  period_type: string;
  period_start?: string;
  hard_limit_enabled?: boolean;
}

export interface UpdateUserQuota {
  quota_gpu_hours?: number;
  period_type?: string;
  period_start?: string;
  hard_limit_enabled?: boolean;
}

/** Mirrors db::models::budget_quota::CreateBudgetExemption */
export interface CreateBudgetExemption {
  name: string;
  description?: string;
  job_type: string;
  resolution_tier?: string;
}

/** Mirrors db::models::budget_quota::UpdateBudgetExemption */
export interface UpdateBudgetExemption {
  name?: string;
  description?: string;
  job_type?: string;
  resolution_tier?: string;
  is_enabled?: boolean;
}

/* -- Display constants ----------------------------------------------------- */

/** Human-readable labels for period types. */
export const PERIOD_TYPE_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  unlimited: "Unlimited",
};

/** Badge variant mapping for budget check statuses. */
export const BUDGET_CHECK_BADGE: Record<string, BadgeVariant> = {
  allowed: "success",
  warning: "warning",
  blocked: "danger",
  no_budget: "default",
};

/** Human-readable labels for consumption trend directions (matches TrendProjection.trend_direction). */
export const TREND_DIRECTION_LABEL: Record<string, string> = {
  increasing: "Increasing",
  stable: "Stable",
  decreasing: "Decreasing",
};

/** Badge variant mapping for trend directions (matches TrendProjection.trend_direction). */
export const TREND_DIRECTION_BADGE: Record<string, BadgeVariant> = {
  increasing: "danger",
  stable: "info",
  decreasing: "success",
};

/* -- Threshold constants (shared by progress bars and badges) -------------- */

/** Warning threshold for consumed_pct (0-100 range, matching backend). */
export const WARNING_THRESHOLD_PCT = 75;

/** Critical threshold for consumed_pct (0-100 range, matching backend). */
export const CRITICAL_THRESHOLD_PCT = 90;

/**
 * Get the appropriate progress bar color class based on consumed_pct (0-100 range).
 */
export function budgetBarColor(consumedPct: number): string {
  if (consumedPct >= CRITICAL_THRESHOLD_PCT) return "bg-[var(--color-action-danger)]";
  if (consumedPct >= WARNING_THRESHOLD_PCT) return "bg-[var(--color-action-warning)]";
  return "bg-[var(--color-action-success)]";
}

/**
 * Get the appropriate badge variant based on consumed_pct (0-100 range).
 */
export function budgetBadgeVariant(consumedPct: number): BadgeVariant {
  if (consumedPct >= CRITICAL_THRESHOLD_PCT) return "danger";
  if (consumedPct >= WARNING_THRESHOLD_PCT) return "warning";
  return "success";
}
