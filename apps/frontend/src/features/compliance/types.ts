/**
 * TypeScript types for Video Compliance Checker (PRD-102).
 *
 * These types mirror the backend API response shapes for compliance rules,
 * check results, and summary statistics.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Rule type
   -------------------------------------------------------------------------- */

export type ComplianceRuleType =
  | "resolution"
  | "framerate"
  | "codec"
  | "duration"
  | "filesize"
  | "naming"
  | "custom";

/* --------------------------------------------------------------------------
   Entities
   -------------------------------------------------------------------------- */

export interface ComplianceRule {
  id: number;
  name: string;
  description: string | null;
  rule_type: ComplianceRuleType;
  config_json: Record<string, unknown>;
  is_global: boolean;
  project_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceCheck {
  id: number;
  scene_id: number;
  rule_id: number;
  passed: boolean;
  actual_value: string | null;
  expected_value: string | null;
  message: string | null;
  checked_at: string;
  created_at: string;
  updated_at: string;
}

export interface ComplianceSummary {
  total: number;
  passed: number;
  failed: number;
}

/** Compute pass rate from a compliance summary (DRY-502: backend does not return pass_rate). */
export function compliancePassRate(summary: ComplianceSummary): number {
  return summary.total > 0 ? summary.passed / summary.total : 0;
}

/* --------------------------------------------------------------------------
   DTOs
   -------------------------------------------------------------------------- */

export interface CreateRuleInput {
  name: string;
  description?: string;
  rule_type: ComplianceRuleType;
  config_json: Record<string, unknown>;
  is_global: boolean;
  project_id?: number;
}

export interface UpdateRuleInput {
  name?: string;
  description?: string;
  rule_type?: ComplianceRuleType;
  config_json?: Record<string, unknown>;
  is_global?: boolean;
}

/* --------------------------------------------------------------------------
   Compliance state (pass/fail/pending) display constants (DRY-503)
   -------------------------------------------------------------------------- */

export type ComplianceState = "pass" | "fail" | "pending";

export const COMPLIANCE_STATE_LABELS: Record<ComplianceState, string> = {
  pass: "Pass",
  fail: "Fail",
  pending: "Pending",
};

export const COMPLIANCE_STATE_BADGE_VARIANT: Record<ComplianceState, BadgeVariant> = {
  pass: "success",
  fail: "danger",
  pending: "default",
};

/* --------------------------------------------------------------------------
   Display constants
   -------------------------------------------------------------------------- */

export const RULE_TYPE_LABELS: Record<ComplianceRuleType, string> = {
  resolution: "Resolution",
  framerate: "Frame Rate",
  codec: "Codec",
  duration: "Duration",
  filesize: "File Size",
  naming: "Naming Convention",
  custom: "Custom",
};

export const RULE_TYPE_BADGE_VARIANT: Record<ComplianceRuleType, BadgeVariant> = {
  resolution: "info",
  framerate: "info",
  codec: "default",
  duration: "warning",
  filesize: "warning",
  naming: "default",
  custom: "default",
};
