/**
 * Colored badge/pill for displaying track names (PRD-111).
 *
 * Uses a deterministic hash-based color derived from the track slug to ensure
 * consistent colors across the application for ANY track name.
 */

import { cn } from "@/lib/cn";

/* --------------------------------------------------------------------------
   Color palette for track badges
   -------------------------------------------------------------------------- */

/**
 * Deterministic color palette for track badges.
 * Excludes green/yellow/red which are reserved for approval/status badges.
 * Any track slug gets a consistent color via hash-based selection.
 */
const TRACK_COLORS = [
  "bg-sky-500/15 text-sky-400",
  "bg-pink-500/15 text-pink-400",
  "bg-emerald-500/15 text-emerald-400",
  "bg-amber-500/15 text-amber-400",
  "bg-violet-500/15 text-violet-400",
  "bg-cyan-500/15 text-cyan-400",
  "bg-orange-500/15 text-orange-400",
  "bg-teal-500/15 text-teal-400",
  "bg-indigo-500/15 text-indigo-400",
  "bg-lime-500/15 text-lime-400",
] as const;

/** Well-known track slugs with fixed colors for visual consistency. */
const FIXED_COLORS: Record<string, string> = {
  clothed: "bg-sky-500/15 text-sky-400",
  topless: "bg-pink-500/15 text-pink-400",
  clothes_off: "bg-violet-500/15 text-violet-400",
};

/** Deterministic color selection: fixed overrides for known slugs, hash-based for others. */
function trackColor(slug: string): string {
  if (slug in FIXED_COLORS) return FIXED_COLORS[slug]!;
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TRACK_COLORS[Math.abs(hash) % TRACK_COLORS.length]!;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface TrackBadgeProps {
  name: string;
  slug: string;
  size?: "sm" | "md";
}

export function TrackBadge({ name, slug, size = "sm" }: TrackBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-[var(--radius-full)]",
        trackColor(slug),
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
      )}
    >
      {name}
    </span>
  );
}
