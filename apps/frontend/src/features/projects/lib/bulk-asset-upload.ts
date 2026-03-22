/**
 * Standalone async functions for bulk asset upload during avatar import.
 *
 * These delegate to canonical API helpers from their respective feature modules
 * rather than reimplementing FormData construction. The standalone wrappers exist
 * because bulk import needs to call these with varying avatarId/sceneId per
 * iteration, which React hooks (bound to a fixed ID) cannot support.
 */

import { postImageVariantUpload } from "@/features/images/hooks/use-image-variants";
import { postClipImport } from "@/features/scenes/hooks/useClipManagement";
import type { Scene } from "@/features/scenes/types";
import { api } from "@/lib/api";

/** Upload a single image variant to a avatar. */
export async function uploadImageVariant(
  avatarId: number,
  file: File,
  variantType: string,
): Promise<void> {
  await postImageVariantUpload(avatarId, file, variantType);
}

/** Create a scene for a avatar with the given scene type and track. */
export async function createSceneForAvatar(
  avatarId: number,
  sceneTypeId: number,
  trackId: number | null,
  imageVariantId: number | null,
): Promise<number> {
  const scene = await api.post<Scene>(`/avatars/${avatarId}/scenes`, {
    scene_type_id: sceneTypeId,
    track_id: trackId,
    image_variant_id: imageVariantId,
  });
  return scene.id;
}

/** Import a video file into a scene as a new version. */
export async function importVideoClip(sceneId: number, file: File): Promise<void> {
  await postClipImport(sceneId, file);
}
