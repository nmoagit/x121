/**
 * Minimal collapsed footer — a thin accent line that expands on hover/click.
 *
 * When `hasAlert` is true, the line pulses to draw attention.
 */

import { cn } from "@/lib/cn";
import { ChevronUp } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CollapsedFooterProps {
  onExpand: () => void;
  hasAlert: boolean;
}

export function CollapsedFooter({ onExpand, hasAlert }: CollapsedFooterProps) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Expand footer"
      className={cn(
        "group flex h-1.5 w-full shrink-0 items-center justify-center",
        "border-t border-[var(--color-border-subtle)]",
        "bg-[var(--color-surface-primary)]",
        "transition-all duration-200",
        "hover:h-5 hover:bg-[var(--color-surface-tertiary)]",
        hasAlert && "animate-pulse",
      )}
    >
      <ChevronUp
        size={12}
        className="text-[var(--color-text-muted)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
}
