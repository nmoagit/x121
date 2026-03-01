/**
 * Filename → scene slot matching for drag-and-drop video import.
 *
 * Convention:
 * - `topless_bj.mp4` → scene "bj", track "topless"
 * - `bj.mp4` (no prefix) → scene "bj", track "clothed"
 *
 * Algorithm:
 * 1. Strip extension, lowercase → e.g. "topless_bj"
 * 2. Check if name starts with a known track slug + "_". If yes → track = slug, scene_type = remainder
 * 3. If no track prefix → scene_type = full name, track = "clothed" (default)
 * 4. Match against expanded slots by (slug, track_slug)
 */

import type { ExpandedSceneSetting } from "@/features/scene-catalog/types";
import { isVideoFile } from "@/lib/file-types";

/** Default track for files with no track prefix in the filename. */
const DEFAULT_TRACK_SLUG = "clothed";

export interface MatchedVideo {
  file: File;
  row: ExpandedSceneSetting;
}

export interface MatchResult {
  matched: MatchedVideo[];
  unmatched: File[];
}

function stripExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
}

interface ParsedFilename {
  sceneSlug: string;
  trackSlug: string;
}

function parseFilename(filename: string, trackSlugs: string[]): ParsedFilename {
  const stem = stripExtension(filename).toLowerCase();

  // Check if stem starts with a track slug prefix (e.g. "topless_bj")
  for (const slug of trackSlugs) {
    const prefix = `${slug}_`;
    if (stem.startsWith(prefix)) {
      return { sceneSlug: stem.slice(prefix.length), trackSlug: slug };
    }
  }

  // No track prefix — scene_type is the full stem, default to "clothed"
  return { sceneSlug: stem, trackSlug: DEFAULT_TRACK_SLUG };
}

export function matchDroppedVideos(
  files: File[],
  slots: ExpandedSceneSetting[],
  trackSlugs: string[],
): MatchResult {
  const videoFiles = Array.from(files).filter((f) => isVideoFile(f.name));

  // Build lookup: "sceneSlug::trackSlug" → ExpandedSceneSetting
  const slotMap = new Map<string, ExpandedSceneSetting>();
  for (const slot of slots) {
    const key = `${slot.slug}::${slot.track_slug ?? ""}`;
    slotMap.set(key, slot);
  }

  const matched: MatchedVideo[] = [];
  const unmatched: File[] = [];

  for (const file of videoFiles) {
    const parsed = parseFilename(file.name, trackSlugs);
    const key = `${parsed.sceneSlug}::${parsed.trackSlug ?? ""}`;
    const row = slotMap.get(key);

    if (row) {
      matched.push({ file, row });
    } else {
      unmatched.push(file);
    }
  }

  // Also collect non-video files as unmatched
  for (const file of files) {
    if (!isVideoFile(file.name)) {
      unmatched.push(file);
    }
  }

  return { matched, unmatched };
}
