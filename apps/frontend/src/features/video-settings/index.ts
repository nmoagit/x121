// Video settings feature — barrel exports.

export { VideoSettingsPanel } from "./VideoSettingsPanel";
export { VideoSettingsDefaultsTab } from "./VideoSettingsDefaultsTab";
export { VideoSettingsOverrideTable } from "./VideoSettingsOverrideTable";
export { ProjectVideoSettings } from "./ProjectVideoSettings";
export { CharacterVideoSettings } from "./CharacterVideoSettings";
export {
  videoSettingsKeys,
  useProjectVideoSettings,
  useProjectVideoSettingsList,
  useGroupVideoSettings,
  useCharacterVideoSettings,
  useCharacterVideoSettingsList,
  useResolvedVideoSettings,
  useUpsertProjectVideoSettings,
  useDeleteProjectVideoSettings,
  useUpsertGroupVideoSettings,
  useDeleteGroupVideoSettings,
  useUpsertCharacterVideoSettings,
  useDeleteCharacterVideoSettings,
} from "./hooks/use-video-settings";
export type {
  VideoSettingsOverride,
  ResolvedVideoSettings,
  VideoSettingSource,
} from "./types";
export {
  RESOLUTION_OPTIONS,
  FPS_OPTIONS,
  SOURCE_LABELS,
  EMPTY_OVERRIDE,
} from "./types";
