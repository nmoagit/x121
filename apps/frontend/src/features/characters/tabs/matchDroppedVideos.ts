/**
 * Filename → scene slot matching for drag-and-drop video import.
 *
 * Convention:
 * - `topless_bj.mp4` → scene "bj", track "topless"
 * - `bj.mp4` (no prefix) → scene "bj", track "clothed"
 * - `dance_clothes_off.mp4` → scene "dance", track "clothed" (clothes-off suffix stripped)
 * - `topless_dance_clothes_off_1.mp4` → scene "dance", track "topless" (suffix + index stripped)
 *
 * Algorithm:
 * 1. Strip extension, lowercase → e.g. "topless_bj"
 * 2. Check if name starts with a known track slug + "_". If yes → track = slug, scene_type = remainder
 * 3. If no track prefix → scene_type = full name, track = "clothed" (default)
 * 4. Strip `_clothes_off` suffix (with optional trailing `_N` index) from scene slug
 * 5. Match against expanded slots by (slug, track_slug)
 */

import type { ExpandedSceneSetting } from "@/features/scene-catalogue/types";
import { CLOTHES_OFF_SUFFIX, isVideoFile, stripExtension } from "@/lib/file-types";

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

export interface ParsedFilename {
  sceneSlug: string;
  trackSlug: string;
}

/**
 * Strip the `_clothes_off` suffix and optional trailing `_N` index
 * from a scene slug so it matches the actual scene type slug.
 *
 * Examples:
 * - `dance_clothes_off` → `dance`
 * - `slow_walk_clothes_off_1` → `slow_walk`
 * - `dance` → `dance` (no change)
 * - `idle_2` → `idle_2` (index without clothes_off is left alone)
 */
function stripClothesOffSuffix(slug: string): string {
  // Match the clothes-off suffix optionally followed by `_N` at end
  const pattern = new RegExp(`^(.+?)${CLOTHES_OFF_SUFFIX}(?:_\\d+)?$`);
  const match = slug.match(pattern);
  return match ? match[1]! : slug;
}

export function parseFilename(filename: string, trackSlugs: string[]): ParsedFilename {
  const stem = stripExtension(filename).toLowerCase();

  let sceneSlug: string;
  let trackSlug: string;

  // Check if stem starts with a track slug prefix (e.g. "topless_bj")
  let matched = false;
  for (const slug of trackSlugs) {
    const prefix = `${slug}_`;
    if (stem.startsWith(prefix)) {
      sceneSlug = stem.slice(prefix.length);
      trackSlug = slug;
      matched = true;
      break;
    }
  }

  if (!matched) {
    // No track prefix — scene_type is the full stem, default to "clothed"
    sceneSlug = stem;
    trackSlug = DEFAULT_TRACK_SLUG;
  }

  // Strip _clothes_off suffix (with optional index) from scene slug
  sceneSlug = stripClothesOffSuffix(sceneSlug!);

  return { sceneSlug, trackSlug: trackSlug! };
}

/**
 * Extract a character name hint from a filename.
 * Strips extension, removes known scene/track slugs and common suffixes,
 * and returns the remaining prefix as a character name hint.
 * Returns null if no clear character name can be extracted.
 */
export function extractCharacterHint(filename: string): string | null {
  const stem = stripExtension(filename).toLowerCase();
  // If the stem contains no underscores, it's likely just a scene name
  if (!stem.includes("_")) return null;
  // Take the first part before the first underscore
  // Common patterns: "anna_bj", "anna_scene_bj", "anna_01"
  const firstPart = stem.split("_")[0];
  if (!firstPart || firstPart.length < 2) return null;
  return firstPart;
}

/**
 * Check if a filename hint matches a character name.
 * Normalizes both by removing underscores/hyphens/spaces and lowercasing.
 */
export function matchesCharacterName(filenameHint: string, characterName: string): boolean {
  const normalize = (s: string) => s.replace(/[_\-\s]/g, "").toLowerCase();
  return normalize(filenameHint) === normalize(characterName);
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
