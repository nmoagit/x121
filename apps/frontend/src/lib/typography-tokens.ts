/**
 * Semantic typography tokens — named class strings for every text role.
 *
 * Import these instead of hand-writing text class combinations.
 * Each token is a complete Tailwind class string: font, size, weight,
 * color, tracking, and case — no composition required at call site.
 *
 * Architecture:
 *   Layer 1: CSS Variables (tokens/typography.css)
 *   Layer 2: Semantic Tokens (this file)     ← you are here
 *   Layer 3: Layout Composition (lib/ui-classes.ts)
 */

// ---------------------------------------------------------------------------
// Page-level
// ---------------------------------------------------------------------------

/** Page heading — largest text on the page. */
export const TYPO_PAGE_TITLE =
  "text-xl font-semibold text-[var(--color-text-primary)]";

/** Page subtitle / description below the title. */
export const TYPO_PAGE_DESCRIPTION =
  "text-sm text-[var(--color-text-secondary)]";

// ---------------------------------------------------------------------------
// Section-level
// ---------------------------------------------------------------------------

/** Section heading within a page. */
export const TYPO_SECTION_TITLE =
  "text-base font-semibold text-[var(--color-text-primary)]";

/** Section description / subtitle. */
export const TYPO_SECTION_SUBTITLE =
  "text-sm text-[var(--color-text-secondary)]";

// ---------------------------------------------------------------------------
// Labels (the most common pattern — 200+ occurrences)
// ---------------------------------------------------------------------------

/** 10px uppercase monospace label — table headers, field labels, sub-titles. */
export const TYPO_LABEL =
  "text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono";

/** Same as TYPO_LABEL but without uppercase (inline contextual labels). */
export const TYPO_LABEL_INLINE =
  "text-[10px] font-medium text-[var(--color-text-muted)] tracking-wide font-mono";

// ---------------------------------------------------------------------------
// Data / terminal text
// ---------------------------------------------------------------------------

/** Monospace data text — default primary color. */
export const TYPO_DATA =
  "font-mono text-xs text-[var(--color-text-primary)]";

/** Monospace data text — muted. */
export const TYPO_DATA_MUTED =
  "font-mono text-xs text-[var(--color-text-muted)]";

/** Monospace 10px data text for compact displays. */
export const TYPO_DATA_TINY =
  "font-mono text-[10px] text-[var(--color-text-primary)]";

/** Data value — cyan (default value color, ~400 occurrences). */
export const TYPO_DATA_CYAN =
  "font-mono text-xs text-[var(--color-data-cyan)]";

/** Data value — success / complete. */
export const TYPO_DATA_SUCCESS =
  "font-mono text-xs text-[var(--color-data-green)]";

/** Data value — warning. */
export const TYPO_DATA_WARNING =
  "font-mono text-xs text-[var(--color-data-orange)]";

/** Data value — error / danger. */
export const TYPO_DATA_DANGER =
  "font-mono text-xs text-[var(--color-data-red)]";

// ---------------------------------------------------------------------------
// Card / panel
// ---------------------------------------------------------------------------

/** Card field label (alias of TYPO_LABEL for semantic clarity). */
export const TYPO_CARD_LABEL = TYPO_LABEL;

/** Card data value. */
export const TYPO_CARD_VALUE = TYPO_DATA;

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

/** Table column header (alias of TYPO_LABEL for semantic clarity). */
export const TYPO_TABLE_HEADER = TYPO_LABEL;

/** Table cell text. */
export const TYPO_TABLE_CELL = TYPO_DATA;

// ---------------------------------------------------------------------------
// Numeric
// ---------------------------------------------------------------------------

/** Tabular-nums monospace for numbers and counts. */
export const TYPO_NUMERIC =
  "font-mono text-xs tabular-nums text-[var(--color-text-primary)]";

/** Large numeric display — stat tickers, dashboard KPIs. */
export const TYPO_NUMERIC_LARGE =
  "font-mono text-lg font-medium tabular-nums text-[var(--color-text-primary)]";

// ---------------------------------------------------------------------------
// Form / input
// ---------------------------------------------------------------------------

/** Form field label. */
export const TYPO_INPUT_LABEL =
  "text-xs font-medium text-[var(--color-text-secondary)]";

/** Helper / hint text below inputs. */
export const TYPO_INPUT_HELPER =
  "text-xs text-[var(--color-text-muted)]";

/** Validation error text. */
export const TYPO_INPUT_ERROR =
  "text-xs font-mono text-[var(--color-action-danger)]";

// ---------------------------------------------------------------------------
// Interactive
// ---------------------------------------------------------------------------

/** Text link. */
export const TYPO_LINK =
  "text-xs text-[var(--color-action-primary)] hover:text-[var(--color-action-primary-hover)] hover:underline";

/** Badge / tag text. */
export const TYPO_BADGE =
  "text-xs font-medium";

/** Button text base (mono, uppercase, tracked). */
export const TYPO_BUTTON =
  "text-xs font-mono font-medium uppercase tracking-wide";

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/** Empty state message. */
export const TYPO_EMPTY_STATE =
  "text-sm italic text-[var(--color-text-muted)]";

/** Error display text. */
export const TYPO_ERROR_MESSAGE =
  "text-xs font-mono text-[var(--color-action-danger)]";

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Inline code / technical text. */
export const TYPO_CODE = TYPO_DATA;

/** Image / media caption. */
export const TYPO_CAPTION =
  "text-xs text-[var(--color-text-secondary)]";

/** Timestamp text. */
export const TYPO_TIMESTAMP =
  "text-[10px] font-mono text-[var(--color-text-muted)]";

/** Pipe separator between inline items. */
export const TYPO_PIPE =
  "text-[var(--color-text-muted)] opacity-30 select-none";
