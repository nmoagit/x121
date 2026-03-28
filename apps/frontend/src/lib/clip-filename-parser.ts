/**
 * Parse the clip naming convention used for derived clip folders/files.
 *
 * Convention: {pipeline}_{avatar}_{scene_type}_{track}_v{version}_[{labels}]_clip{NNNN}.ext
 * Example: sdg_allie-nicole_idle_topless_v1_[#phase_2,glitch]_clip0003.mp4
 *
 * Avatar slugs use hyphens (e.g., "allie-nicole"), components are underscore-separated.
 */

export interface ParsedClipName {
  pipelineCode: string;
  avatarSlug: string;
  sceneTypeSlug: string;
  trackSlug: string;
  version: number;
  labels: string[];
  clipIndex: number | null;
}

/**
 * Try to parse a folder or file name as a clip naming convention.
 * Returns null if the name doesn't match the expected pattern.
 */
export function parseClipName(name: string): ParsedClipName | null {
  let work = name;

  // Strip file extension if present
  const dotIdx = work.lastIndexOf(".");
  if (dotIdx > 0) {
    const ext = work.slice(dotIdx + 1).toLowerCase();
    if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) {
      work = work.slice(0, dotIdx);
    }
  }

  // Extract _clipNNNN suffix if present
  let clipIndex: number | null = null;
  const clipMatch = work.match(/_clip(\d+)$/i);
  if (clipMatch) {
    clipIndex = Number.parseInt(clipMatch[1]!, 10);
    work = work.slice(0, clipMatch.index!);
  }

  // Extract labels from [...] brackets
  let labels: string[] = [];
  const bracketMatch = work.match(/\[([^\]]*)\]/);
  if (bracketMatch) {
    labels = bracketMatch[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Remove the bracket section and surrounding underscores
    work = work.slice(0, bracketMatch.index!).replace(/_$/, "");
  }

  // Extract version _vN
  const versionMatch = work.match(/_v(\d+)$/);
  if (!versionMatch) return null;
  const version = Number.parseInt(versionMatch[1]!, 10);
  work = work.slice(0, versionMatch.index!);

  // Split remaining into components: pipeline_avatar_scene_track
  // Avatar slugs use hyphens, components use underscores
  const parts = work.split("_");
  if (parts.length < 4) return null;

  const pipelineCode = parts[0]!;
  const trackSlug = parts[parts.length - 1]!;
  const sceneTypeSlug = parts[parts.length - 2]!;
  const avatarSlug = parts.slice(1, parts.length - 2).join("-");

  if (!avatarSlug) return null;

  return {
    pipelineCode,
    avatarSlug,
    sceneTypeSlug,
    trackSlug,
    version,
    labels,
    clipIndex,
  };
}

/**
 * Try to detect if a folder name follows the clip naming convention.
 * Returns the parsed avatar name (spaces instead of hyphens) or null.
 */
export function detectClipFolderAvatarName(folderName: string): string | null {
  const parsed = parseClipName(folderName);
  if (!parsed) return null;
  // Convert slug to display name: hyphens → spaces, title case
  return parsed.avatarSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
