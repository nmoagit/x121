/**
 * Filename → scene slot matching for drag-and-drop video import.
 *
 * Convention:
 * - `{track}_bj.mp4` → scene "bj", track "{track}"
 * - `bj.mp4` (no prefix) → scene "bj", uses pipeline's primary track (first in list)
 * - `dance_clothes_off.mp4` → scene "dance", primary track (clothes-off suffix stripped)
 * - `{track}_dance_clothes_off_1.mp4` → scene "dance", track "{track}" (suffix + index stripped)
 *
 * Algorithm:
 * 1. Strip extension, lowercase → e.g. "alt_bj"
 * 2. Check if name starts with a known track slug + "_". If yes → track = slug, scene_type = remainder
 * 3. If no track prefix → scene_type = full name, track = first from trackSlugs list
 * 4. Strip `_clothes_off` suffix (with optional trailing `_N` index) from scene slug
 * 5. Match against expanded slots by (slug, track_slug)
 */

import type { ExpandedSceneSetting } from "@/features/scene-catalogue/types";
import { CLOTHES_OFF_SUFFIX, isVideoFile, stripExtension } from "@/lib/file-types";

/**
 * Determine the default track slug for files with no track prefix in the filename.
 * Uses the first track slug from the provided list (the pipeline's primary track),
 * falling back to the first slug or empty string.
 */
function defaultTrackSlug(trackSlugs: string[]): string {
  return trackSlugs[0] ?? "";
}

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
  /** True when the filename had a version suffix (e.g. bj_2, dance1). Signals "add as next version". */
  isAdditionalVersion: boolean;
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

/**
 * Strip trailing version digits from a scene slug and return the version number.
 * `bj1` → (`bj`, 1), `bj_2` → (`bj`, 2), `dance_3` → (`dance`, 3)
 * `slow_walk3` → (`slow_walk`, 3), `slow_walk_1` → (`slow_walk`, 1)
 * Does NOT strip if the entire slug is digits (`123` stays).
 */
function stripVersionSuffix(slug: string): { slug: string; version: number | null } {
  // Match trailing _N (underscore + digits)
  const underscoreMatch = slug.match(/^(.+?)_(\d+)$/);
  if (underscoreMatch) {
    return { slug: underscoreMatch[1]!, version: Number(underscoreMatch[2]) };
  }
  // Match trailing digits directly attached (bj1, dance2)
  const directMatch = slug.match(/^([a-z_]+?)(\d+)$/);
  if (directMatch) {
    return { slug: directMatch[1]!, version: Number(directMatch[2]) };
  }
  return { slug, version: null };
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
    // No track prefix — scene_type is the full stem, use the pipeline's primary track
    sceneSlug = stem;
    trackSlug = defaultTrackSlug(trackSlugs);
  }

  // Strip _clothes_off suffix (with optional index) from scene slug
  sceneSlug = stripClothesOffSuffix(sceneSlug!);

  // Strip trailing version digits (e.g. "bj1" → "bj", "bj_2" → "bj")
  // and flag as additional version so the import doesn't skip it
  const { slug: cleanSlug, version } = stripVersionSuffix(sceneSlug);
  sceneSlug = cleanSlug;

  return { sceneSlug, trackSlug: trackSlug!, isAdditionalVersion: version != null };
}

/**
 * Extract a character name hint from a filename.
 * Strips extension, removes known scene/track slugs and common suffixes,
 * and returns the remaining prefix as a character name hint.
 * Returns null if no clear character name can be extracted.
 */
/** Words that are track prefixes or scene slugs, not character names. */
const NON_CHARACTER_HINTS = new Set([
  "topless", "clothed", "nude", "naked", "dressed",
  "bj", "idle", "sex", "feet", "bottom", "boobs",
  "mesh", "txrs", "mouth", "smiles",
]);

export function extractCharacterHint(filename: string): string | null {
  const stem = stripExtension(filename).toLowerCase();
  // If the stem contains no underscores, it's likely just a scene name
  if (!stem.includes("_")) return null;
  // Take the first part before the first underscore
  // Common patterns: "anna_bj", "anna_scene_bj", "anna_01"
  const firstPart = stem.split("_")[0];
  if (!firstPart || firstPart.length < 2) return null;
  // Ignore known track/scene prefixes
  if (NON_CHARACTER_HINTS.has(firstPart)) return null;
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
