/**
 * Shared Tailwind class-string constants for common UI patterns.
 *
 * Use these instead of hand-typing the same long class strings across files.
 *
 * ## Design System: Terminal Style
 *
 * The app uses a "hacker terminal" aesthetic with these core principles:
 *
 * **Colors:**
 * - Panel background: `#0d1117` (dark terminal)
 * - Panel header: `#161b22` (slightly lighter)
 * - Row hover: `#161b22`
 * - Text: monospace, `text-xs` or `text-[10px]`
 * - Data values: `text-cyan-400` (default), `text-green-400` (complete/success)
 * - Warnings: `text-orange-400`
 * - Errors/danger: `text-red-400`
 * - Muted: `text-[var(--color-text-muted)]`
 * - Track colors: clothed=`text-sky-400`, topless=`text-pink-400`, clothes_off=`text-orange-400`
 *
 * **Layout patterns:**
 * - Pipe separators: `<span className="opacity-30">|</span>` between inline items
 * - Labels: `text-[10px] uppercase tracking-wide font-mono text-[var(--color-text-muted)]`
 * - Borders: `border-[var(--color-border-default)]/30` for subtle row dividers
 * - Buttons: `xs` size for inline actions, `sm` for toolbar actions
 *
 * **Components:**
 * - `TERMINAL_PANEL` — outer wrapper for dark sections
 * - `TERMINAL_HEADER` — section header bar inside a panel
 * - `TERMINAL_BODY` — content area inside a panel
 * - `TERMINAL_LABEL` — 10px uppercase monospace label
 * - `TERMINAL_ROW` — hover-able row inside a panel
 * - `TERMINAL_DIVIDER` — subtle row divider
 * - `TERMINAL_INPUT` — transparent background input override
 * - `TERMINAL_SELECT` — dark dropdown for selects
 * - `TERMINAL_TEXTAREA` — dark monospace textarea
 */

// ---------------------------------------------------------------------------
// Terminal panel system
// ---------------------------------------------------------------------------

/** Dark panel wrapper — use for sections, cards, data containers. */
export const TERMINAL_PANEL =
  "rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] overflow-hidden";

/** Section header bar inside a terminal panel. */
export const TERMINAL_HEADER =
  "px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] bg-[#161b22]";

/** Header title text inside TERMINAL_HEADER. */
export const TERMINAL_HEADER_TITLE =
  "text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono";

/** Content body area inside a terminal panel. */
export const TERMINAL_BODY =
  "p-[var(--spacing-3)]";

/** Scrollable dark log area (e.g. delivery logs, generation terminal). */
export const TERMINAL_LOG_AREA =
  "max-h-64 overflow-y-auto bg-[#0d1117] p-[var(--spacing-3)]";

// ---------------------------------------------------------------------------
// Terminal text patterns
// ---------------------------------------------------------------------------

/** 10px uppercase monospace label for table headers, field labels, section sub-titles. */
export const TERMINAL_LABEL =
  "text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono";

/** Monospace data text for table cells, status lines, info rows. */
export const TERMINAL_TEXT =
  "font-mono text-xs";

/** Pipe separator between inline items. Use inside a flex row. */
export const TERMINAL_PIPE =
  "text-[var(--color-text-muted)] opacity-30 select-none";

// ---------------------------------------------------------------------------
// Terminal table patterns
// ---------------------------------------------------------------------------

/** Table header row with subtle bottom border. */
export const TERMINAL_TH =
  "text-left text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono";

/** Subtle row divider (30% opacity). */
export const TERMINAL_DIVIDER =
  "border-b border-[var(--color-border-default)]/30";

/** Hover-able row inside a terminal panel. */
export const TERMINAL_ROW_HOVER =
  "hover:bg-[#161b22] transition-colors";

// ---------------------------------------------------------------------------
// Terminal form elements
// ---------------------------------------------------------------------------

/** Override class for Input components — transparent bg, smaller monospace text. */
export const TERMINAL_INPUT =
  "!bg-transparent !text-xs !py-1 font-mono";

/** Dark select dropdown matching terminal style. */
export const TERMINAL_SELECT =
  "appearance-none px-2 py-1 pr-6 text-xs font-mono bg-[#161b22] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)] [&>option]:bg-[#161b22] [&>option]:text-[var(--color-text-primary)]";

/** Dark monospace textarea for code/JSON editing. */
export const TERMINAL_TEXTAREA =
  "w-full rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] p-3 font-mono text-xs text-cyan-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]";

// ---------------------------------------------------------------------------
// Terminal status colors
// ---------------------------------------------------------------------------

/** Map status-like strings to terminal text color classes. */
export const TERMINAL_STATUS_COLORS: Record<string, string> = {
  // Success / complete
  approved: "text-green-400",
  completed: "text-green-400",
  delivered: "text-green-400",
  active: "text-green-400",
  final: "text-green-400",
  configured: "text-green-400",

  // In-progress / info
  generating: "text-cyan-400",
  in_progress: "text-cyan-400",
  generated: "text-cyan-400",
  imported: "text-cyan-400",
  pending: "text-[var(--color-text-muted)]",
  not_started: "text-[var(--color-text-muted)]",

  // Warning
  queued: "text-orange-400",
  outdated: "text-orange-400",
  rework: "text-orange-400",
  override: "text-orange-400",

  // Danger
  failed: "text-red-400",
  rejected: "text-red-400",
  error: "text-red-400",
  missing: "text-red-400",
};

/** Track slug to text color mapping (consistent with TrackBadge colors). */
export const TRACK_TEXT_COLORS: Record<string, string> = {
  clothed: "text-sky-400",
  topless: "text-pink-400",
  clothes_off: "text-orange-400",
};

// ---------------------------------------------------------------------------
// Legacy patterns (still used in some places)
// ---------------------------------------------------------------------------

/** Small icon-only action button (edit, settings, etc.). */
export const ICON_ACTION_BTN =
  "p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer";

/** Small icon-only action button — danger variant (delete, remove). */
export const ICON_ACTION_BTN_DANGER =
  "p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-danger)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer";

/** Section heading text (h3 level). Prefer TERMINAL_HEADER_TITLE inside panels. */
export const SECTION_HEADING =
  "text-base font-semibold text-[var(--color-text-primary)]";

/** Base textarea styling (legacy — prefer TERMINAL_TEXTAREA for new code). */
export const TEXTAREA_BASE =
  "w-full px-3 py-2 text-sm bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]";

/** Inline text-link style for small action buttons. */
export const INLINE_LINK_BTN =
  "text-xs text-[var(--color-action-primary)] hover:text-[var(--color-action-primary-hover)] hover:underline cursor-pointer";

/** Chip container styling used by ChipInput and TagInput. */
export const CHIP_CONTAINER =
  "flex flex-wrap items-center gap-1.5 bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus-within:ring-2 focus-within:ring-[var(--color-border-focus)] focus-within:ring-offset-0 transition-colors duration-150";

/** Ghost button with red text for destructive actions (delete, clear). */
export const GHOST_DANGER_BTN =
  "!text-red-400 hover:!text-red-300";
