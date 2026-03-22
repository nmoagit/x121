/**
 * Scene catalogue & track management feature barrel export (PRD-111).
 */

// Components
export { SceneCatalogueList } from "./SceneCatalogueList";
export { SceneCatalogueForm } from "./SceneCatalogueForm";
export { TrackManager } from "./TrackManager";
export { TrackBadge } from "./TrackBadge";
export { SourceBadge, sourceLabel } from "./SourceBadge";
export { SceneSettingRow } from "./SceneSettingRow";
export type { SceneSettingRowProps } from "./SceneSettingRow";
export { ProjectSceneSettings } from "./ProjectSceneSettings";
export { AvatarSceneOverrides } from "./AvatarSceneOverrides";
export { GroupSceneOverrides } from "./GroupSceneOverrides";
export { SceneSettingOverridesPanel } from "./SceneSettingOverridesPanel";
export { AvatarWorkflowOverrides } from "./AvatarWorkflowOverrides";
export { GroupWorkflowOverrides } from "./GroupWorkflowOverrides";
export { ProjectWorkflowOverrides } from "./ProjectWorkflowOverrides";
export { WorkflowAssignmentTable } from "./WorkflowAssignmentTable";
export { TrackWorkflowManager } from "./TrackWorkflowManager";
export { TrackConfigRow } from "./TrackConfigRow";

// Hooks — Scene catalogue
export {
  sceneCatalogueKeys,
  useSceneCatalogue,
  useSceneCatalogueEntry,
  useCreateSceneCatalogueEntry,
  useUpdateSceneCatalogueEntry,
  useDeactivateSceneCatalogueEntry,
} from "./hooks/use-scene-catalogue";

// Hooks — Tracks
export {
  trackKeys,
  useTracks,
  useCreateTrack,
  useUpdateTrack,
} from "./hooks/use-tracks";

// Hooks — Project scene settings
export {
  projectSceneSettingKeys,
  useProjectSceneSettings,
  useBulkUpdateProjectSceneSettings,
  useToggleProjectSceneSetting,
} from "./hooks/use-project-scene-settings";

// Hooks — Group scene settings
export {
  groupSceneSettingKeys,
  useGroupSceneSettings,
  useToggleGroupSceneSetting,
  useRemoveGroupSceneOverride,
} from "./hooks/use-group-scene-settings";

// Hooks — Avatar scene settings
export {
  avatarSceneSettingKeys,
  useAvatarSceneSettings,
  useBulkUpdateAvatarSceneSettings,
  useToggleAvatarSceneSetting,
  useRemoveAvatarSceneOverride,
} from "./hooks/use-avatar-scene-settings";

// Hooks — Track configs (per-track workflow & prompt overrides)
export {
  trackConfigKeys,
  useTrackConfigs,
  useSceneTypeTracks,
  useUpsertTrackConfig,
  useDeleteTrackConfig,
} from "./hooks/use-track-configs";

// Hooks — Expanded settings (backend returns track-expanded rows; hook adds group annotations)
export { useExpandedSettings } from "./hooks/use-expanded-settings";

// Hooks — Single-track pipeline detection
export { useSingleTrack } from "./hooks/use-single-track";

// Types & utilities
export type {
  Track,
  SceneCatalogueEntry,
  CreateSceneCatalogueEntry,
  UpdateSceneCatalogueEntry,
  EffectiveSceneSetting,
  ExpandedSceneSetting,
  SceneSettingUpdate,
  CreateTrack,
  UpdateTrack,
} from "./types";
export type {
  SceneTypeTrackConfig,
  UpsertTrackConfig,
} from "./types";
export { annotateGroups, sceneSettingUrl } from "./types";
