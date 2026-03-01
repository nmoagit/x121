/**
 * Simple button-based tab bar.
 *
 * Renders a horizontal strip of tabs with an active indicator,
 * used at the top of tabbed pages (workflows, readiness, scene catalog, etc.).
 */

import { Button } from "@/components/primitives/Button";

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
}

export function TabBar({ tabs, activeTab, onChange }: TabBarProps) {
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
