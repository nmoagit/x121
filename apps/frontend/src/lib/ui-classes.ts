/**
 * Shared Tailwind class-string constants for common UI patterns.
 *
 * Use these instead of hand-typing the same long class strings across files.
 */

/**
 * Small icon-only action button (edit, settings, etc.).
 * Neutral hover — text goes from muted to primary.
 */
export const ICON_ACTION_BTN =
  "p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer";

/**
 * Small icon-only action button — danger variant (delete, remove, etc.).
 * Red hover — text goes from muted to danger.
 */
export const ICON_ACTION_BTN_DANGER =
  "p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-danger)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer";

/**
 * Shared chip-container styling used by ChipInput and TagInput.
 *
 * Renders a flex-wrap pill bag with a surface background, border, and
 * focus-within ring. Apply padding separately per component if it differs.
 */
/** Section heading text (h3 level) used across feature tabs and panels. */
export const SECTION_HEADING =
  "text-base font-semibold text-[var(--color-text-primary)]";

/**
 * Base textarea styling matching the design system input treatment.
 * Apply directly to `<textarea>` elements. Add `placeholder:text-[var(--color-text-muted)]`
 * when the textarea has a placeholder.
 */
export const TEXTAREA_BASE =
  "w-full px-3 py-2 text-sm bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]";

/**
 * Inline text-link style for small action buttons (e.g. "Clear", "+ Create new group").
 * Primary-coloured text with hover underline.
 */
export const INLINE_LINK_BTN =
  "text-xs text-[var(--color-action-primary)] hover:text-[var(--color-action-primary-hover)] hover:underline cursor-pointer";

export const CHIP_CONTAINER =
  "flex flex-wrap items-center gap-1.5 bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus-within:ring-2 focus-within:ring-[var(--color-border-focus)] focus-within:ring-offset-0 transition-colors duration-150";
