/**
 * Barrel export for project lifecycle & archival feature (PRD-72).
 */

/* Components */
export { LifecycleStateBadge } from "./LifecycleStateBadge";
export { TransitionControls } from "./TransitionControls";
export { CompletionChecklist } from "./CompletionChecklist";
export { SummaryReportCard } from "./SummaryReportCard";
export { BulkArchivalPanel } from "./BulkArchivalPanel";

/* Hooks */
export {
  lifecycleKeys,
  useCompletionChecklist,
  useProjectSummary,
  useTransitionProject,
  useBulkArchive,
} from "./hooks/use-project-lifecycle";

/* Types */
export type {
  LifecycleState,
  ChecklistItem,
  ChecklistResult,
  ProjectSummary,
  ProjectSummaryData,
  TransitionRequest,
  TransitionResponse,
  BulkArchiveRequest,
  BulkArchiveResponse,
} from "./types";
export {
  LIFECYCLE_STATE_LABELS,
  LIFECYCLE_STATE_BADGE_VARIANT,
  VALID_TRANSITIONS,
  LOCKED_STATES,
  TRANSITION_LABELS,
  CONFIRM_TRANSITIONS,
  isEditLocked,
} from "./types";
