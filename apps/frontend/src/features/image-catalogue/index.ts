/**
 * Image catalogue & image type management feature barrel export (PRD-154).
 */

// Components
export { ImageCatalogueList } from "./ImageCatalogueList";
export { ImageCatalogueForm } from "./ImageCatalogueForm";
export { ImageTrackConfigEditor } from "./ImageTrackConfigEditor";
export { ImageSettingRow } from "./ImageSettingRow";
export type { ImageSettingRowProps } from "./ImageSettingRow";
export { ImageSettingOverridesPanel } from "./ImageSettingOverridesPanel";
export { ProjectImageSettings } from "./ProjectImageSettings";
export { GroupImageOverrides } from "./GroupImageOverrides";
export { AvatarImageOverrides } from "./AvatarImageOverrides";

// Hooks — Image catalogue
export {
  imageCatalogueKeys,
  useImageTypes,
  useImageType,
  useCreateImageType,
  useUpdateImageType,
  useDeleteImageType,
} from "./hooks/use-image-catalogue";

// Hooks — Track configs
export {
  imageTrackConfigKeys,
  useImageTrackConfigs,
  useUpsertImageTrackConfig,
  useDeleteImageTrackConfig,
} from "./hooks/use-image-track-configs";

// Hooks — Avatar images
export {
  avatarImageKeys,
  useAvatarImages,
  useCreateAvatarImage,
  useUpdateAvatarImage,
  useDeleteAvatarImage,
  useApproveAvatarImage,
  useRejectAvatarImage,
} from "./hooks/use-avatar-images";

// Hooks — Project image settings
export {
  projectImageSettingKeys,
  useProjectImageSettings,
  useToggleProjectImageSetting,
} from "./hooks/use-project-image-settings";

// Hooks — Group image settings
export {
  groupImageSettingKeys,
  useGroupImageSettings,
  useToggleGroupImageSetting,
  useRemoveGroupImageOverride,
} from "./hooks/use-group-image-settings";

// Hooks — Avatar image settings
export {
  avatarImageSettingKeys,
  useAvatarImageSettings,
  useToggleAvatarImageSetting,
  useRemoveAvatarImageOverride,
} from "./hooks/use-avatar-image-settings";

// Types & utilities
export type {
  ImageType,
  CreateImageType,
  UpdateImageType,
  ImageTypeTrackConfig,
  UpsertImageTrackConfig,
  AvatarImage,
  AvatarImageDetail,
  CreateAvatarImage,
  UpdateAvatarImage,
  EffectiveImageSetting,
  ImageSettingUpdate,
} from "./types";
export { IMAGE_STATUS, IMAGE_STATUS_LABELS, imageSettingUrl } from "./types";
