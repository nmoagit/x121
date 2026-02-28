/**
 * Poster Frame & Thumbnail Selection feature public API (PRD-96).
 */

// Components
export { CharacterPoster } from "./CharacterPoster";
export { CropAdjust } from "./CropAdjust";
export { EntityPoster } from "./EntityPoster";
export { PosterGallery } from "./PosterGallery";
export { ScenePoster } from "./ScenePoster";
export { SetPosterButton } from "./SetPosterButton";

// Hooks
export {
  posterFrameKeys,
  useAutoSelectPosters,
  useGetPosterFrame,
  usePosterGallery,
  useSetCharacterPoster,
  useSetScenePoster,
  useUpdateAdjustments,
} from "./hooks/use-poster-frame";

// Types
export type {
  AutoSelectResult,
  CropSettings,
  PosterFrame,
  UpdatePosterFrameAdjustments,
  UpsertPosterFrame,
} from "./types";

export {
  ASPECT_RATIO_OPTIONS,
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  BRIGHTNESS_STEP,
  CONTRAST_MAX,
  CONTRAST_MIN,
  CONTRAST_STEP,
  DEFAULT_BRIGHTNESS,
  DEFAULT_CONTRAST,
  ENTITY_TYPE_CHARACTER,
  ENTITY_TYPE_SCENE,
} from "./types";
