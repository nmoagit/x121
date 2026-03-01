/**
 * Standalone async functions for bulk asset upload during character import.
 *
 * These delegate to canonical API helpers from their respective feature modules
 * rather than reimplementing FormData construction. The standalone wrappers exist
 * because bulk import needs to call these with varying characterId/sceneId per
 * iteration, which React hooks (bound to a fixed ID) cannot support.
 */

import { postImageVariantUpload } from "@/features/images/hooks/use-image-variants";
import { postClipImport } from "@/features/scenes/hooks/useClipManagement";
import type { Scene } from "@/features/scenes/types";
import { api } from "@/lib/api";

/** Upload a single image variant to a character. */
export async function uploadImageVariant(
  characterId: number,
  file: File,
  variantType: string,
): Promise<void> {
  await postImageVariantUpload(characterId, file, variantType);
}

/** Create a scene for a character with the given scene type and track. */
export async function createSceneForCharacter(
  characterId: number,
  sceneTypeId: number,
  trackId: number | null,
  imageVariantId: number | null,
): Promise<number> {
  const scene = await api.post<Scene>(`/characters/${characterId}/scenes`, {
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
