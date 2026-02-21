import { cn } from "@/lib/cn";
import { ChevronRight } from "@/tokens/icons";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

interface AdvancedDrawerProps {
  /** Label displayed on the toggle button. Defaults to "Advanced". */
  label?: string;
  /** Whether the drawer starts open. Defaults to false. */
  defaultOpen?: boolean;
  /** Unique key for persisting open/closed state to localStorage. */
  persistKey?: string;
  children: ReactNode;
}

/**
 * Collapsible drawer for progressive disclosure of advanced controls.
 *
 * Uses a CSS grid-rows transition for smooth expand/collapse animation.
 * Persists its open/closed state to localStorage when a `persistKey` is provided.
 */
export function AdvancedDrawer({
  label = "Advanced",
  defaultOpen = false,
  persistKey,
  children,
}: AdvancedDrawerProps) {
  const [isOpen, setIsOpen] = useState(() => {
    if (persistKey) {
      const stored = localStorage.getItem(`advanced-drawer-${persistKey}`);
      if (stored !== null) return stored === "true";
    }
    return defaultOpen;
  });

  // Persist state changes to localStorage when persistKey is set.
  useEffect(() => {
    if (persistKey) {
      localStorage.setItem(`advanced-drawer-${persistKey}`, String(isOpen));
    }
  }, [isOpen, persistKey]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const contentId = persistKey
    ? `advanced-drawer-content-${persistKey}`
    : "advanced-drawer-content";
  const triggerId = persistKey
    ? `advanced-drawer-trigger-${persistKey}`
    : "advanced-drawer-trigger";

  return (
    <div className="border-t border-[var(--color-border-default)]">
      <button
        type="button"
        id={triggerId}
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={toggle}
        className={cn(
          "flex items-center gap-1.5 w-full py-2 px-3",
          "text-left text-xs font-medium text-[var(--color-text-muted)]",
          "hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
        )}
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-transform duration-200 ease-[var(--ease-default)]",
            isOpen && "rotate-90",
          )}
        />
        {label}
      </button>

      <section
        id={contentId}
        aria-labelledby={triggerId}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-[var(--ease-default)]",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 text-sm text-[var(--color-text-secondary)]">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
