/**
 * Shared file-type constants for validation and filtering.
 *
 * Keep in sync with `SUPPORTED_VIDEO_EXTENSIONS` in
 * `api/src/handlers/scene_video_version.rs`.
 */

/** Accepted image file extensions (including leading dot, lowercase). */
export const IMAGE_EXTENSIONS: readonly string[] = [".png", ".jpg", ".jpeg", ".webp"];

/** Accepted video file extensions (including leading dot, lowercase). */
export const VIDEO_EXTENSIONS: readonly string[] = [".mp4", ".webm", ".mov"];

/** Maximum allowed video file size in bytes (500 MB). */
export const MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024;

/** Strip the file extension from a filename and return the stem. */
export function stripExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
}

/** Check whether a filename ends with a recognised image extension. */
export function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Check whether a filename ends with a recognised video extension. */
export function isVideoFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
