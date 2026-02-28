/* Components */
export { RegenerationComparison } from "./RegenerationComparison";
export { BatchComparison } from "./BatchComparison";
export { QAScoreComparison } from "./QAScoreComparison";
export { ComparisonActions } from "./ComparisonActions";
export { VersionFilmstrip } from "./VersionFilmstrip";
export { DiffOverlay, DiffOverlayToggle, DiffOverlayPanel } from "./DiffOverlay";

/* Hooks */
export {
  segmentVersionKeys,
  useVersionHistory,
  useVersionComparison,
  useVersionDetail,
  useSelectVersion,
} from "./hooks/use-segment-versions";
export { useDualSync } from "./hooks/useDualSync";
export type { DualSyncControls } from "./hooks/useDualSync";

/* Types */
export type {
  SegmentVersion,
  VersionComparison,
  ComparisonDecision,
  BatchSummary,
} from "./types";
export {
  DECISION_KEEP_NEW,
  DECISION_REVERT,
  DECISION_KEEP_BOTH,
} from "./types";
