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
