// Video settings feature — barrel exports.

export { VideoSettingsPanel } from "./VideoSettingsPanel";
export { VideoSettingsDefaultsTab } from "./VideoSettingsDefaultsTab";
export { VideoSettingsOverrideTable } from "./VideoSettingsOverrideTable";
export { ProjectVideoSettings } from "./ProjectVideoSettings";
export { AvatarVideoSettings } from "./AvatarVideoSettings";
export {
  videoSettingsKeys,
  useProjectVideoSettings,
  useProjectVideoSettingsList,
  useGroupVideoSettings,
  useAvatarVideoSettings,
  useAvatarVideoSettingsList,
  useResolvedVideoSettings,
  useUpsertProjectVideoSettings,
  useDeleteProjectVideoSettings,
  useUpsertGroupVideoSettings,
  useDeleteGroupVideoSettings,
  useUpsertAvatarVideoSettings,
  useDeleteAvatarVideoSettings,
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
