/**
 * Colored badge/pill for displaying track names (PRD-111).
 *
 * Uses a deterministic color based on track slug to ensure consistent
 * colors across the application.
 */

import { cn } from "@/lib/cn";

/* --------------------------------------------------------------------------
   Color palette for track badges
   -------------------------------------------------------------------------- */

/**
 * Explicit color assignments for known track slugs.
 *
 * Avoids green/yellow/red which are reserved for approval/status badges.
 */
const TRACK_SLUG_COLORS: Record<string, string> = {
  clothed: "bg-sky-500/15 text-sky-400",
  topless: "bg-pink-500/15 text-pink-400",
  clothes_off: "bg-orange-500/15 text-orange-400",
};

/** Fallback palette for unknown tracks — excludes success/warning/danger to avoid status clashes. */
const TRACK_COLORS = [
  "bg-[var(--color-action-primary)]/15 text-[var(--color-action-primary)]",
  "bg-purple-500/15 text-purple-400",
  "bg-cyan-500/15 text-cyan-400",
  "bg-pink-500/15 text-pink-400",
  "bg-orange-500/15 text-orange-400",
  "bg-teal-500/15 text-teal-400",
  "bg-indigo-500/15 text-indigo-400",
  "bg-lime-500/15 text-lime-400",
] as const;

/** Simple hash to get a stable index from a string. */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
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
  const explicitColor = TRACK_SLUG_COLORS[slug];
  const colorIndex = hashString(slug) % TRACK_COLORS.length;

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-[var(--radius-full)]",
        explicitColor ?? TRACK_COLORS[colorIndex],
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
      )}
    >
      {name}
    </span>
  );
}
