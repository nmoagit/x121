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

/** Suffix appended to scene filenames for clothes-off transition scene types. */
export const CLOTHES_OFF_SUFFIX = "_clothes_off";

/** Strip the file extension from a filename and return the stem. */
export function stripExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
}

/** Extract the file extension (uppercase, no dot) from a path or filename. */
export function getExtension(pathOrName: string): string {
  const name = getFilename(pathOrName);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : "";
}

/** Extract the filename (basename) from a file path. */
export function getFilename(path: string): string {
  return path.split("/").pop() ?? path;
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

/* --------------------------------------------------------------------------
   File reading helpers
   -------------------------------------------------------------------------- */

/** Read a File's text content via the FileReader API. Strips UTF-8 BOM. */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let text = reader.result as string;
      // Strip UTF-8 BOM if present (common in Windows-created files)
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
      }
      resolve(text);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "UTF-8");
  });
}

/**
 * Read a File as text, then parse as JSON.
 * Delegates to `readFileText` for BOM-safe reading.
 * Returns `null` on any read or parse failure (never throws).
 */
export async function readFileAsJson(file: File): Promise<Record<string, unknown> | null> {
  try {
    const text = await readFileText(file);
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
