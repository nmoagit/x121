/**
 * Avatar Settings Dashboard feature public API (PRD-108).
 */

// Components
export { AvatarDashboard } from "./AvatarDashboard";
export { deriveMissingItems } from "./helpers";
export { GenerationHistorySection } from "./GenerationHistorySection";
export { MetadataSummarySection } from "./MetadataSummarySection";
export { MissingItemsBanner } from "./MissingItemsBanner";
export { PipelineSettingsEditor } from "./PipelineSettingsEditor";
export { SceneAssignmentsSection } from "./SceneAssignmentsSection";

// Hooks
export {
  avatarDashboardKeys,
  useAvatarDashboard,
  usePatchSettings,
} from "./hooks/use-avatar-dashboard";

// Types
export type {
  AvatarDashboardData,
  DashboardSection,
  GenerationSummary,
  MissingItem,
  MissingItemCategory,
  PatchSettingsPayload,
  ReadinessSnapshot,
  SceneAssignment,
  VariantCounts,
} from "./types";
