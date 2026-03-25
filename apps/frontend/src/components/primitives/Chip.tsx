/**
 * Design system chip component — consistent style for tags, labels, badges, and filters.
 *
 * No background fill, subtle border, monospace text. Matches the terminal aesthetic.
 */

import { cn } from "@/lib/cn";

type ChipSize = "xs" | "sm" | "md";

interface ChipProps {
  children: React.ReactNode;
  size?: ChipSize;
  /** Optional accent color shown as a left border or dot. */
  color?: string | null;
  /** Show a remove (×) button. */
  onRemove?: () => void;
  /** Make the chip clickable. */
  onClick?: () => void;
  /** Whether this chip is currently "active" / selected. */
  active?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<ChipSize, string> = {
  xs: "text-[10px] px-1 py-0",
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
};

export function Chip({
  children,
  size = "sm",
  color,
  onRemove,
  onClick,
  active,
  className,
}: ChipProps) {
  const isInteractive = onClick != null;

  return (
    <span
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isInteractive ? (e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); } : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-sm)]",
        "font-mono",
        "border transition-colors duration-100",
        active
          ? "border-[var(--color-border-primary)] text-[var(--color-text-primary)]"
          : "border-[var(--color-border-default)] text-[var(--color-text-muted)]",
        isInteractive && "cursor-pointer hover:border-[var(--color-border-primary)] hover:text-[var(--color-text-primary)]",
        SIZE_CLASSES[size],
        className,
      )}
      style={color ? { borderLeftColor: color, borderLeftWidth: "3px" } : undefined}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)] transition-colors leading-none"
          aria-label="Remove"
        >
          <svg width={10} height={10} viewBox="0 0 14 14" fill="none">
            <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}
