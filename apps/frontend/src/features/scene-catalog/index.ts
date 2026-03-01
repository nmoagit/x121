/**
 * Scene catalog & track management feature barrel export (PRD-111).
 */

// Components
export { SceneCatalogList } from "./SceneCatalogList";
export { SceneCatalogForm } from "./SceneCatalogForm";
export { TrackManager } from "./TrackManager";
export { TrackBadge } from "./TrackBadge";
export { SourceBadge, sourceLabel } from "./SourceBadge";
export { SceneSettingRow } from "./SceneSettingRow";
export type { SceneSettingRowProps } from "./SceneSettingRow";
export { ProjectSceneSettings } from "./ProjectSceneSettings";
export { CharacterSceneOverrides } from "./CharacterSceneOverrides";
export { GroupSceneOverrides } from "./GroupSceneOverrides";
export { SceneSettingOverridesPanel } from "./SceneSettingOverridesPanel";

// Hooks — Scene catalog
export {
  sceneCatalogKeys,
  useSceneCatalog,
  useSceneCatalogEntry,
  useCreateSceneCatalogEntry,
  useUpdateSceneCatalogEntry,
  useDeactivateSceneCatalogEntry,
} from "./hooks/use-scene-catalog";

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

// Hooks — Character scene settings
export {
  characterSceneSettingKeys,
  useCharacterSceneSettings,
  useBulkUpdateCharacterSceneSettings,
  useToggleCharacterSceneSetting,
  useRemoveCharacterSceneOverride,
} from "./hooks/use-character-scene-settings";

// Hooks — Expanded settings (backend returns track-expanded rows; hook adds group annotations)
export { useExpandedSettings } from "./hooks/use-expanded-settings";

// Types & utilities
export type {
  Track,
  SceneCatalogEntry,
  CreateSceneCatalogEntry,
  UpdateSceneCatalogEntry,
  EffectiveSceneSetting,
  ExpandedSceneSetting,
  SceneSettingUpdate,
  CreateTrack,
  UpdateTrack,
} from "./types";
export { annotateGroups, sceneSettingUrl } from "./types";
