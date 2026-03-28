/**
 * Standalone async functions for bulk asset upload during avatar import.
 *
 * These delegate to canonical API helpers from their respective feature modules
 * rather than reimplementing FormData construction. The standalone wrappers exist
 * because bulk import needs to call these with varying avatarId/sceneId per
 * iteration, which React hooks (bound to a fixed ID) cannot support.
 */

import { postMediaVariantUpload } from "@/features/media/hooks/use-media-variants";
import { postClipImport, postClipImportWithParent } from "@/features/scenes/hooks/useClipManagement";
import type { Scene } from "@/features/scenes/types";
import { api } from "@/lib/api";

/** Upload a single image variant to a avatar. */
export async function uploadMediaVariant(
  avatarId: number,
  file: File,
  variantType: string,
): Promise<void> {
  await postMediaVariantUpload(avatarId, file, variantType);
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
    media_variant_id: imageVariantId,
  });
  return scene.id;
}

/** Import a video file into a scene as a new version. */
export async function importVideoClip(sceneId: number, file: File): Promise<void> {
  await postClipImport(sceneId, file);
}

/** Import a video file as a derived clip under a parent version. */
export async function importDerivedClip(
  sceneId: number,
  file: File,
  parentVersionId: number,
  clipIndex?: number | null,
): Promise<void> {
  await postClipImportWithParent(sceneId, file, {
    parentVersionId,
    clipIndex: clipIndex ?? undefined,
  });
}
