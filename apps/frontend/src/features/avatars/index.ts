/**
 * Barrel export for avatar detail feature (PRD-112).
 */

/* Pages */
export { AvatarDetailPage } from "./AvatarDetailPage";

/* Hooks */
export {
  avatarDetailKeys,
  useAvatarSettings,
  useUpdateAvatarSettings,
  useAvatarMetadata,
  useUpdateAvatarMetadata,
} from "./hooks/use-avatar-detail";

/* Types */
export type { AvatarSettings, AvatarMetadata } from "./types";
