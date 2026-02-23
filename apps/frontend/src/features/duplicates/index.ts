// Components
export { SimilarityAlert } from "./SimilarityAlert";
export { BatchDuplicateGrid } from "./BatchDuplicateGrid";
export type { FlaggedPair } from "./BatchDuplicateGrid";
export { ThresholdSettings } from "./ThresholdSettings";

// Hooks
export {
  duplicateKeys,
  useBatchCheck,
  useCheckDuplicate,
  useDismissCheck,
  useDuplicateHistory,
  useDuplicateSettings,
  useResolveCheck,
  useUpdateDuplicateSettings,
} from "./hooks/use-duplicates";

// Types
export type {
  BatchCheckRequest,
  CheckDuplicateRequest,
  DuplicateCheck,
  DuplicateDetectionSetting,
  DuplicateMatchResponse,
  ResolveCheckRequest,
  UpdateDuplicateSetting,
} from "./types";
export { CHECK_STATUS_LABELS, RESOLUTION_LABELS } from "./types";
