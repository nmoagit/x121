/**
 * Onboarding feature public API (PRD-53).
 */

// Components
export { ContextualHint } from "./ContextualHint";
export { OnboardingChecklist } from "./OnboardingChecklist";
export { OnboardingGate } from "./OnboardingGate";
export { TourEngine } from "./TourEngine";

// Hooks
export {
  onboardingKeys,
  useCompleteChecklistItem,
  useDismissHint,
  useOnboarding,
  useResetOnboarding,
  useUpdateOnboarding,
} from "./hooks/use-onboarding";
export { useFeatureReveal } from "./hooks/useFeatureReveal";

// Data
export { hintDefinitions } from "./hintDefinitions";
export { tourPaths } from "./tourPaths";

// Types
export type {
  ChecklistItem,
  HintDefinition,
  TourStep,
  UpdateOnboarding,
  UserOnboarding,
} from "./types";
export {
  CHECKLIST_ITEM_IDS,
  CHECKLIST_LABELS,
  DISMISS_LINK_CLASSES,
  FEATURE_KEYS,
} from "./types";
