/**
 * Barrel export for the dual-metadata system feature (PRD-13).
 */

export { MetadataPreview } from "./MetadataPreview";
export { StalenessIndicator } from "./StalenessIndicator";
export { RegenerationControls } from "./RegenerationControls";
export {
  metadataKeys,
  useCharacterMetadataPreview,
  useVideoMetadataPreview,
  useStaleMetadata,
  useRegenerateCharacterMetadata,
  useRegenerateProjectMetadata,
} from "./hooks/use-metadata";
export type {
  CharacterMetadata,
  VideoMetadata,
  StaleMetadataEntry,
  StaleMetadataReport,
  RegenerationReport,
  RegenerateProjectRequest,
} from "./types";
