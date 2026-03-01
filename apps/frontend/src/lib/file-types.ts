/**
 * Shared file-type constants for validation and filtering.
 *
 * Keep in sync with `SUPPORTED_VIDEO_EXTENSIONS` in
 * `api/src/handlers/scene_video_version.rs`.
 */

/** Accepted video file extensions (including leading dot, lowercase). */
export const VIDEO_EXTENSIONS: readonly string[] = [".mp4", ".webm", ".mov"];

/** Maximum allowed video file size in bytes (500 MB). */
export const MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024;

/** Check whether a filename ends with a recognised video extension. */
export function isVideoFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
