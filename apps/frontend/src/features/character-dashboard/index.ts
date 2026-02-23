/**
 * Character Settings Dashboard feature public API (PRD-108).
 */

// Components
export { CharacterDashboard } from "./CharacterDashboard";
export { GenerationHistorySection } from "./GenerationHistorySection";
export { MetadataSummarySection } from "./MetadataSummarySection";
export { MissingItemsBanner } from "./MissingItemsBanner";
export { PipelineSettingsEditor } from "./PipelineSettingsEditor";
export { SceneAssignmentsSection } from "./SceneAssignmentsSection";

// Hooks
export {
  characterDashboardKeys,
  useCharacterDashboard,
  usePatchSettings,
} from "./hooks/use-character-dashboard";

// Types
export type {
  CharacterDashboardData,
  DashboardSection,
  GenerationSummary,
  MissingItem,
  MissingItemCategory,
  PatchSettingsPayload,
  ReadinessSnapshot,
  SceneAssignment,
  VariantCounts,
} from "./types";
