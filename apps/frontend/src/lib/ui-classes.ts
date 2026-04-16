/**
 * Shared Tailwind class-string constants for layout patterns.
 *
 * ## Architecture
 *
 *   Layer 1: CSS Variables (`tokens/typography.css`, `tokens/colors.css`)
 *   Layer 2: Semantic Typography Tokens (`lib/typography-tokens.ts`)
 *   Layer 3: Layout Composition (this file)
 *
 * **For text styling**, import from `typography-tokens.ts` (`TYPO_*` constants).
 * This file composes those tokens with layout classes (padding, borders, backgrounds).
 *
 * **Layout components:**
 * - `TERMINAL_PANEL` — outer wrapper for sections
 * - `TERMINAL_HEADER` — section header bar (layout only)
 * - `TERMINAL_BODY` — content area
 * - `TERMINAL_ROW_HOVER` — hover-able row
 * - `TERMINAL_DIVIDER` — subtle row divider
 * - `TERMINAL_INPUT` — transparent background input override
 * - `TERMINAL_SELECT` — dropdown with layout + typography
 * - `TERMINAL_TEXTAREA` — textarea with layout + typography
 *
 * **Text constants (re-exported from typography-tokens.ts):**
 * - `TERMINAL_HEADER_TITLE` → `TYPO_LABEL`
 * - `TERMINAL_LABEL` → `TYPO_LABEL`
 * - `TERMINAL_TH` → `text-left` + `TYPO_LABEL`
 * - `TERMINAL_TEXT` → `TYPO_DATA`
 * - `TERMINAL_PIPE` → `TYPO_PIPE`
 * - `SECTION_HEADING` → `TYPO_SECTION_TITLE`
 */

import {
  TYPO_DATA,
  TYPO_DATA_CYAN,
  TYPO_LABEL,
  TYPO_LINK,
  TYPO_PIPE,
  TYPO_SECTION_TITLE,
} from "./typography-tokens";

// ---------------------------------------------------------------------------
// Terminal panel system
// ---------------------------------------------------------------------------

/** Dark panel wrapper — use for sections, cards, data containers. */
export const TERMINAL_PANEL =
  "rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden";

/** Section header bar inside a terminal panel. */
export const TERMINAL_HEADER =
  "px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]";

/** Header title text inside TERMINAL_HEADER. @see TYPO_LABEL */
export const TERMINAL_HEADER_TITLE = TYPO_LABEL;

/** Content body area inside a terminal panel. */
export const TERMINAL_BODY =
  "p-[var(--spacing-3)]";

/** Scrollable dark log area (e.g. delivery logs, generation terminal). */
export const TERMINAL_LOG_AREA =
  "max-h-64 overflow-y-auto bg-[var(--color-surface-primary)] p-[var(--spacing-3)]";

// ---------------------------------------------------------------------------
// Terminal text patterns
// ---------------------------------------------------------------------------

/** 10px uppercase monospace label for table headers, field labels, section sub-titles. @see TYPO_LABEL */
export const TERMINAL_LABEL = TYPO_LABEL;

/** Monospace data text for table cells, status lines, info rows. @see TYPO_DATA */
export const TERMINAL_TEXT = TYPO_DATA;

/** Pipe separator between inline items. Use inside a flex row. @see TYPO_PIPE */
export const TERMINAL_PIPE = TYPO_PIPE;

// ---------------------------------------------------------------------------
// Terminal table patterns
// ---------------------------------------------------------------------------

/** Table header row with subtle bottom border. @see TYPO_LABEL */
export const TERMINAL_TH = `text-left ${TYPO_LABEL}`;

/** Subtle row divider (30% opacity). */
export const TERMINAL_DIVIDER =
  "border-b border-[var(--color-border-default)]/30";

/** Hover-able row inside a terminal panel. */
export const TERMINAL_ROW_HOVER =
  "hover:bg-[var(--color-surface-secondary)] transition-colors";

// ---------------------------------------------------------------------------
// Terminal form elements
// ---------------------------------------------------------------------------

/** Override class for Input components — transparent bg, smaller monospace text. */
export const TERMINAL_INPUT =
  "!bg-transparent !text-xs !py-1 font-mono";

/** Dark select dropdown matching terminal style. */
export const TERMINAL_SELECT =
  `appearance-none px-2 py-1 pr-6 ${TYPO_DATA} bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)] [&>option]:bg-[var(--color-surface-secondary)] [&>option]:text-[var(--color-text-primary)]`;

/** Dark monospace textarea for code/JSON editing. */
export const TERMINAL_TEXTAREA =
  `w-full rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 ${TYPO_DATA_CYAN} focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]`;

// ---------------------------------------------------------------------------
// Terminal status colors
// ---------------------------------------------------------------------------

/** Map status-like strings to terminal text color classes. */
export const TERMINAL_STATUS_COLORS: Record<string, string> = {
  // Success / complete
  approved: "text-[var(--color-data-green)]",
  completed: "text-[var(--color-data-green)]",
  delivered: "text-[var(--color-data-green)]",
  active: "text-[var(--color-data-green)]",
  final: "text-[var(--color-data-green)]",
  configured: "text-[var(--color-data-green)]",

  // In-progress / info
  generating: "text-[var(--color-data-cyan)]",
  in_progress: "text-[var(--color-data-cyan)]",
  generated: "text-[var(--color-data-cyan)]",
  imported: "text-[var(--color-data-cyan)]",
  pending: "text-[var(--color-text-muted)]",
  not_started: "text-[var(--color-text-muted)]",

  // Warning
  queued: "text-[var(--color-data-orange)]",
  outdated: "text-[var(--color-data-orange)]",
  rework: "text-[var(--color-data-orange)]",
  override: "text-[var(--color-data-orange)]",

  // Danger
  failed: "text-[var(--color-data-red)]",
  rejected: "text-[var(--color-data-red)]",
  error: "text-[var(--color-data-red)]",
  missing: "text-[var(--color-data-red)]",
};

/**
 * Deterministic text color palette for track slugs (consistent with TrackBadge colors).
 * Any track slug gets a stable color via hash-based selection.
 */
const TRACK_TEXT_COLOR_PALETTE = [
  "text-[var(--color-data-sky)]",
  "text-[var(--color-data-pink)]",
  "text-emerald-400",
  "text-amber-400",
  "text-[var(--color-data-violet)]",
  "text-[var(--color-data-cyan)]",
  "text-[var(--color-data-orange)]",
  "text-teal-400",
  "text-indigo-400",
  "text-lime-400",
] as const;

/** Well-known track slugs with fixed text colors. */
const FIXED_TEXT_COLORS: Record<string, string> = {
  clothed: "text-[var(--color-data-sky)]",
  topless: "text-[var(--color-data-pink)]",
  clothes_off: "text-[var(--color-data-violet)]",
};

/** Get a deterministic text color for any track slug. */
export function trackTextColor(slug: string): string {
  if (slug in FIXED_TEXT_COLORS) return FIXED_TEXT_COLORS[slug]!;
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TRACK_TEXT_COLOR_PALETTE[Math.abs(hash) % TRACK_TEXT_COLOR_PALETTE.length]!;
}

/**
 * Track slug to text color — uses deterministic hashing for any slug.
 * Kept as a Proxy for backward compatibility with existing `TRACK_TEXT_COLORS[slug]` usage.
 */
export const TRACK_TEXT_COLORS: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  { get: (_target, prop: string) => trackTextColor(prop) },
);

// ---------------------------------------------------------------------------
// Legacy patterns (still used in some places)
// ---------------------------------------------------------------------------

/** Small icon-only action button (edit, settings, etc.). */
export const ICON_ACTION_BTN =
  "p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer";

/** Small icon-only action button — danger variant (delete, remove). */
export const ICON_ACTION_BTN_DANGER =
  "p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-danger)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer";

/** Section heading text (h3 level). @see TYPO_SECTION_TITLE */
export const SECTION_HEADING = TYPO_SECTION_TITLE;

/** Base textarea styling (legacy — prefer TERMINAL_TEXTAREA for new code). */
export const TEXTAREA_BASE =
  "w-full px-3 py-2 text-sm bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]";

/** Inline text-link style for small action buttons. @see TYPO_LINK */
export const INLINE_LINK_BTN = `${TYPO_LINK} cursor-pointer`;

/** Chip container styling used by ChipInput and TagInput. */
export const CHIP_CONTAINER =
  "flex flex-wrap items-center gap-1.5 bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus-within:ring-2 focus-within:ring-[var(--color-border-focus)] focus-within:ring-offset-0 transition-colors duration-150";

/** Ghost button with red text for destructive actions (delete, clear). */
export const GHOST_DANGER_BTN =
  "!text-[var(--color-data-red)] hover:!text-[var(--color-action-danger)]";
