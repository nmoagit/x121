/**
 * Storyboard View & Scene Thumbnails feature public API (PRD-62).
 */

// Components
export { HoverScrub } from "./HoverScrub";
export { MatrixThumbnail } from "./MatrixThumbnail";
export { ThumbnailStrip } from "./ThumbnailStrip";

// Hooks
export {
  storyboardKeys,
  useCreateKeyframe,
  useDeleteSegmentKeyframes,
  useSceneStoryboard,
  useSegmentKeyframes,
} from "./hooks/use-storyboard";

// Types
export type {
  CreateKeyframeRequest,
  Keyframe,
} from "./types";

export { formatTimecode } from "./types";
