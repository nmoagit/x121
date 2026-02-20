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
}

export function Tabs({ tabs, activeTab, onTabChange }: TabsProps) {
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

  return (
    <div
      role="tablist"
      className="flex border-b border-[var(--color-border-default)]"
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
              "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium",
              "border-b-2 -mb-px",
              "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
              isActive
                ? "border-[var(--color-action-primary)] text-[var(--color-action-primary)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)]",
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
