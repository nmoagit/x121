/**
 * Frecency scoring for the command palette (PRD-31).
 *
 * Mirrors the scoring logic in the backend core module
 * (`crates/core/src/command_palette.rs`).
 */

import type { UserRecentItem } from "./types";

/** Frecency weight for items accessed within the last hour. */
const HOUR_WEIGHT = 10.0;
/** Frecency weight for items accessed within the last 24 hours. */
const DAY_WEIGHT = 5.0;
/** Frecency weight for items accessed within the last week. */
const WEEK_WEIGHT = 2.0;
/** Frecency weight for items accessed more than a week ago. */
const OLD_WEIGHT = 1.0;

/**
 * Get the recency weight based on how long ago the item was accessed.
 */
export function getRecencyWeight(lastAccessed: Date): number {
  const elapsedMs = Date.now() - lastAccessed.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  if (elapsedHours < 1) return HOUR_WEIGHT;
  if (elapsedHours < 24) return DAY_WEIGHT;
  if (elapsedHours < 168) return WEEK_WEIGHT; // 7 * 24
  return OLD_WEIGHT;
}

/**
 * Calculate a frecency score combining recency and frequency.
 *
 * Score = recency_weight * log2(access_count + 1)
 */
export function calculateFrecencyScore(item: UserRecentItem): number {
  const recency = getRecencyWeight(new Date(item.last_accessed_at));
  const frequency = Math.log2(item.access_count + 1);
  return recency * frequency;
}

/**
 * Sort items by frecency score (highest first).
 */
export function sortByFrecency<T extends UserRecentItem>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => calculateFrecencyScore(b) - calculateFrecencyScore(a),
  );
}
