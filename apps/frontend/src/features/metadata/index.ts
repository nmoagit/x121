/**
 * Barrel export for the dual-metadata system feature (PRD-13).
 */

export { MetadataPreview } from "./MetadataPreview";
export { StalenessIndicator } from "./StalenessIndicator";
export { RegenerationControls } from "./RegenerationControls";
export {
  metadataKeys,
  useAvatarMetadataPreview,
  useVideoMetadataPreview,
  useStaleMetadata,
  useRegenerateAvatarMetadata,
  useRegenerateProjectMetadata,
} from "./hooks/use-metadata";
export type {
  AvatarMetadata,
  VideoMetadata,
  StaleMetadataEntry,
  StaleMetadataReport,
  RegenerationReport,
  RegenerateProjectRequest,
} from "./types";
