// Components
export { ConsistencyHeatmap } from "./ConsistencyHeatmap";
export { ConsistencyOverview } from "./ConsistencyOverview";
export { ConsistencyReportCard } from "./ConsistencyReportCard";
export { OutlierPanel } from "./OutlierPanel";

// Hooks
export {
  consistencyKeys,
  useBatchConsistencyReport,
  useConsistencyReport,
  useGenerateConsistencyReport,
  useProjectConsistency,
} from "./hooks/use-consistency";

// Types
export type {
  BatchConsistencyInput,
  ConsistencyReport,
  ConsistencyReportType,
  GenerateConsistencyInput,
  PairwiseScores,
} from "./types";
export {
  CONSISTENCY_THRESHOLDS,
  consistencyBadgeVariant,
  consistencyBg,
  consistencyCellBg,
  consistencyColor,
  REPORT_TYPE_BADGE_VARIANT,
  REPORT_TYPE_LABELS,
} from "./types";
