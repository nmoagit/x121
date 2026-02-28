/**
 * TypeScript types for Platform Setup Wizard (PRD-105).
 *
 * These types mirror the backend API response shapes for setup steps,
 * wizard state, step configs, and validation results.
 *
 * Backend sources:
 * - db/src/models/setup_wizard.rs (row structs, DTOs)
 * - core/src/setup_wizard.rs (validation logic)
 */

import type { BadgeVariant } from "@/components/primitives";

/* -- Step name union ------------------------------------------------------- */

export type SetupStepName =
  | "database"
  | "storage"
  | "comfyui"
  | "admin_account"
  | "worker_registration"
  | "integrations"
  | "health_check";

/* -- Step status ----------------------------------------------------------- */

export interface StepStatus {
  name: SetupStepName;
  completed: boolean;
  validated_at: string | null;
  error_message: string | null;
  has_config: boolean;
}

/* -- Wizard state ---------------------------------------------------------- */

export interface WizardState {
  steps: StepStatus[];
  completed: boolean;
  current_step_index: number;
}

/* -- Platform setup row ---------------------------------------------------- */

export interface PlatformSetup {
  id: number;
  step_name: SetupStepName;
  completed: boolean;
  config_json: Record<string, unknown> | null;
  validated_at: string | null;
  configured_by: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/* -- Step validation result ------------------------------------------------ */

export interface StepValidationResult {
  success: boolean;
  message: string;
  details: Record<string, unknown> | null;
}

/* -- Step config types ----------------------------------------------------- */

export interface DatabaseStepConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean;
}

export interface StorageStepConfig {
  root_path: string;
  min_space_gb: number;
}

export interface ComfyUiInstance {
  url: string;
  name: string;
}

export interface ComfyUiStepConfig {
  instances: ComfyUiInstance[];
}

export interface AdminAccountStepConfig {
  username: string;
  password: string;
}

export interface WorkerStepConfig {
  worker_url: string;
  name: string;
}

export interface IntegrationsStepConfig {
  email?: { host: string; port: number } | null;
  slack_webhook?: string | null;
  backup_destination?: string | null;
}

/* -- Test connection request ----------------------------------------------- */

export interface TestConnectionRequest {
  service_type: string;
  config: Record<string, unknown>;
}

/* -- Helpers --------------------------------------------------------------- */

/** Convert a StepStatus (from execute/reset endpoints) to a StepValidationResult for display. */
export function stepStatusToFeedback(status: StepStatus): StepValidationResult {
  return {
    success: status.completed,
    message:
      status.error_message ??
      (status.completed ? "Step completed successfully." : "Step is pending."),
    details: null,
  };
}

/* -- Display constants ----------------------------------------------------- */

/** Human-readable labels for each setup step. */
export const STEP_LABELS: Record<SetupStepName, string> = {
  database: "Database",
  storage: "Storage",
  comfyui: "ComfyUI",
  admin_account: "Admin Account",
  worker_registration: "Worker",
  integrations: "Integrations",
  health_check: "Health Check",
};

/** Descriptions explaining what each setup step configures. */
export const STEP_DESCRIPTIONS: Record<SetupStepName, string> = {
  database: "Connect and migrate the application database.",
  storage: "Set the root storage directory and verify disk space.",
  comfyui: "Register ComfyUI instances for image and video generation.",
  admin_account: "Create the initial administrator account.",
  worker_registration: "Register a GPU worker for render jobs.",
  integrations: "Configure optional email, Slack, and backup integrations.",
  health_check: "Verify all services are healthy and ready.",
};

/** Steps that must be completed before the wizard can finish. */
export const REQUIRED_STEPS: SetupStepName[] = [
  "database",
  "storage",
  "comfyui",
  "admin_account",
  "worker_registration",
  "health_check",
];

/** Ordered list of all steps in wizard progression. */
export const STEP_ORDER: SetupStepName[] = [
  "database",
  "storage",
  "comfyui",
  "admin_account",
  "worker_registration",
  "integrations",
  "health_check",
];

/** Total number of wizard steps. */
export const TOTAL_STEPS = STEP_ORDER.length;

/** Badge variant for step completion status. */
export const STEP_STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  completed: "success",
  current: "info",
  error: "danger",
  pending: "default",
};
