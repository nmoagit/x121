/**
 * Tab bar component with two visual variants:
 *
 * - "underline" (default): button strip with bottom border, used at the top of tabbed pages.
 * - "pills": compact segmented pill control for inline tab switching.
 */

import { Button } from "@/components/primitives/Button";
import { cn } from "@/lib/cn";

interface Tab {
  key: string;
  label: string;
}

interface TabBarProps {
  /** Tab definitions. */
  tabs: Tab[];
  /** Currently active tab key. */
  activeTab: string;
  /** Called when a tab is clicked. */
  onChange: (key: string) => void;
  /** Visual variant. */
  variant?: "underline" | "pills";
}

export function TabBar({ tabs, activeTab, onChange, variant = "underline" }: TabBarProps) {
  if (variant === "pills") {
    return (
      <div className="inline-flex rounded-[3px] bg-[var(--color-surface-tertiary)] p-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "px-3 py-1 text-[11px] font-medium uppercase tracking-wide rounded-[2px] transition-colors cursor-pointer",
              activeTab === tab.key
                ? "bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1 border-b border-[var(--color-border-default)]">
      {tabs.map((tab) => (
        <Button
          key={tab.key}
          type="button"
          variant={activeTab === tab.key ? "primary" : "ghost"}
          size="sm"
          onClick={() => onChange(tab.key)}
          className="rounded-b-none"
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}
