// Components
export { ReferenceManager } from "./ReferenceManager";
export { RunHistoryPanel } from "./RunHistoryPanel";
export { RegressionReport } from "./RegressionReport";
export { VerdictBadge } from "./VerdictBadge";
export { ScoreDiffDisplay } from "./ScoreDiffDisplay";

// Hooks
export {
  regressionKeys,
  useCreateReference,
  useDeleteReference,
  useRegressionReferences,
  useRegressionRuns,
  useRunReport,
  useTriggerRun,
} from "./hooks/use-regression";

// Types
export type {
  CreateRegressionReference,
  RegressionReference,
  RegressionResult,
  RegressionRun,
  RunReport,
  RunReportSummary,
  RunStatus,
  TriggerRegressionRun,
  TriggerType,
  Verdict,
} from "./types";
export {
  RUN_STATUS_BADGE_VARIANT,
  RUN_STATUS_LABELS,
  TRIGGER_LORA_UPDATE,
  TRIGGER_MANUAL,
  TRIGGER_MODEL_UPDATE,
  TRIGGER_WORKFLOW_UPDATE,
  VERDICT_BADGE_VARIANTS,
  VERDICT_DEGRADED,
  VERDICT_ERROR,
  VERDICT_IMPROVED,
  VERDICT_LABELS,
  VERDICT_SAME,
} from "./types";
