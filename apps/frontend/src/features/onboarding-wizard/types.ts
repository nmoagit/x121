/**
 * Bulk Character Onboarding Wizard types (PRD-67).
 */

/* --------------------------------------------------------------------------
   Status and step unions
   -------------------------------------------------------------------------- */

/** Allowed status values for an onboarding session. */
export type OnboardingSessionStatus = "in_progress" | "completed" | "abandoned";

/** The six wizard steps (1-based). */
export type OnboardingStepNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** Step labels keyed by step number. */
export const STEP_LABELS: Record<OnboardingStepNumber, string> = {
  1: "Upload",
  2: "Variant Generation",
  3: "Variant Review",
  4: "Metadata Entry",
  5: "Scene Type Selection",
  6: "Summary",
};

/** Total number of wizard steps. */
export const TOTAL_STEPS = 6;

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** An onboarding session record from the server. */
export interface OnboardingSession {
  id: number;
  project_id: number;
  created_by_id: number;
  current_step: number;
  step_data: Record<string, unknown>;
  character_ids: number[];
  status: OnboardingSessionStatus;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating a new onboarding session. */
export interface CreateOnboardingSession {
  project_id: number;
}

/** Request body for updating step data. */
export interface UpdateStepData {
  step_data: Record<string, unknown>;
}
