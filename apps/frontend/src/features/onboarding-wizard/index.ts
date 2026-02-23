/**
 * Bulk Character Onboarding Wizard feature public API (PRD-67).
 */

// Components
export { OnboardingWizard } from "./OnboardingWizard";
export { StepIndicator } from "./StepIndicator";
export { StepMetadata } from "./StepMetadata";
export { StepSceneTypes } from "./StepSceneTypes";
export { StepSummary } from "./StepSummary";
export { StepUpload } from "./StepUpload";
export { StepVariantGeneration } from "./StepVariantGeneration";
export { StepVariantReview } from "./StepVariantReview";

// Hooks
export {
  onboardingKeys,
  useAbandonSession,
  useAdvanceStep,
  useCompleteSession,
  useCreateSession,
  useGoBack,
  useOnboardingSession,
  useOnboardingSessions,
  useUpdateStepData,
} from "./hooks/use-onboarding-wizard";

// Types
export type {
  CreateOnboardingSession,
  OnboardingSession,
  OnboardingSessionStatus,
  OnboardingStepNumber,
  UpdateStepData,
} from "./types";

export { STEP_LABELS, TOTAL_STEPS } from "./types";
