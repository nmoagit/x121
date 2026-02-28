/**
 * Shared constants for the render timeline feature (PRD-90).
 */

import type { ZoomLevel } from "./types";

/** Left panel width for worker lane headers (pixels). */
export const HEADER_WIDTH = 180;

/** Height of the time-axis header row (pixels). */
export const TIME_HEADER_HEIGHT = 32;

/** Minimum width of a job block to remain visible (pixels). */
export const MIN_BLOCK_WIDTH = 4;

/** Time marker intervals per zoom level (milliseconds). */
export const MARKER_INTERVALS: Record<ZoomLevel, number> = {
  "1h": 10 * 60 * 1000, // 10 minutes
  "6h": 60 * 60 * 1000, // 1 hour
  "24h": 4 * 60 * 60 * 1000, // 4 hours
  "7d": 24 * 60 * 60 * 1000, // 1 day
};

/** Format a time marker label based on zoom level. */
export function formatMarkerLabel(date: Date, zoom: ZoomLevel): string {
  if (zoom === "7d") {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
