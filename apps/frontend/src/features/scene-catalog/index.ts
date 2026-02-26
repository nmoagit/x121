/**
 * Scene catalog & track management feature barrel export (PRD-111).
 */

// Components
export { SceneCatalogList } from "./SceneCatalogList";
export { SceneCatalogForm } from "./SceneCatalogForm";
export { TrackManager } from "./TrackManager";
export { TrackBadge } from "./TrackBadge";
export { SourceBadge } from "./SourceBadge";
export { ProjectSceneSettings } from "./ProjectSceneSettings";
export { CharacterSceneOverrides } from "./CharacterSceneOverrides";

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

// Hooks — Character scene settings
export {
  characterSceneSettingKeys,
  useCharacterSceneSettings,
  useBulkUpdateCharacterSceneSettings,
  useToggleCharacterSceneSetting,
  useRemoveCharacterSceneOverride,
} from "./hooks/use-character-scene-settings";

// Types
export type {
  Track,
  SceneCatalogEntry,
  CreateSceneCatalogEntry,
  UpdateSceneCatalogEntry,
  EffectiveSceneSetting,
  SceneSettingUpdate,
  CreateTrack,
  UpdateTrack,
} from "./types";
