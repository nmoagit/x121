import { cn } from "@/lib/cn";
import { useCallback } from "react";
import type { ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  /** Visual style variant. Defaults to "underline". */
  variant?: "underline" | "pill";
  /** Size variant. "sm" uses compact padding suitable for toolbars/footers. */
  size?: "default" | "sm";
}

export function Tabs({ tabs, activeTab, onTabChange, variant = "underline", size = "default" }: TabsProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      if (currentIndex === -1) return;

      let nextIndex: number | undefined;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextIndex = findNextEnabledTab(tabs, currentIndex, 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nextIndex = findNextEnabledTab(tabs, currentIndex, -1);
      }

      if (nextIndex !== undefined) {
        const tab = tabs[nextIndex];
        if (tab) onTabChange(tab.id);
      }
    },
    [tabs, activeTab, onTabChange],
  );

  const isPill = variant === "pill";
  const isSmall = size === "sm";

  return (
    <div
      role="tablist"
      className={cn(
        "flex",
        isPill
          ? cn(
              "rounded-[3px] bg-[var(--color-surface-tertiary)]",
              isSmall ? "gap-0.5 p-0.5" : "gap-[var(--spacing-1)] p-[var(--spacing-1)]",
            )
          : "border-b border-[var(--color-border-default)]",
      )}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            aria-disabled={tab.disabled}
            disabled={tab.disabled}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "inline-flex items-center cursor-pointer",
              "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
              isSmall ? "gap-1 text-[11px] font-medium uppercase tracking-wide" : "gap-1.5 text-[11px] font-medium uppercase tracking-wide",
              isPill
                ? cn(
                    isSmall
                      ? "px-2 py-0.5 rounded-[2px]"
                      : "px-3 py-1 rounded-[2px]",
                    isActive
                      ? "bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                  )
                : cn(
                    isSmall ? "px-2.5 py-1 border-b-2 -mb-px" : "px-3 py-2 border-b-2 -mb-px",
                    isActive
                      ? "border-[var(--color-action-primary)] text-[var(--color-action-primary)]"
                      : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)]",
                  ),
              tab.disabled && "opacity-50 pointer-events-none",
            )}
          >
            {tab.icon && (
              <span className="shrink-0" aria-hidden="true">
                {tab.icon}
              </span>
            )}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Find the next enabled tab index in a given direction, wrapping around. */
function findNextEnabledTab(tabs: Tab[], current: number, direction: 1 | -1): number | undefined {
  const len = tabs.length;
  for (let i = 1; i <= len; i++) {
    const index = (current + i * direction + len) % len;
    const tab = tabs[index];
    if (tab && !tab.disabled) return index;
  }
  return undefined;
}
