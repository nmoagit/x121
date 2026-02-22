/**
 * Recent items list for the command palette (PRD-31).
 *
 * Shown when the palette opens before the user types a query.
 * Items are ranked by frecency scoring.
 */

import { cn } from "@/lib/cn";
import { Clock } from "@/tokens/icons";

import { sortByFrecency } from "./frecencyScorer";
import { ENTITY_TYPE_LABELS } from "./types";
import type { UserRecentItem } from "./types";

interface RecentItemsProps {
  items: UserRecentItem[];
  selectedIndex: number;
  onSelect: (item: UserRecentItem) => void;
}

export function RecentItems({
  items,
  selectedIndex,
  onSelect,
}: RecentItemsProps) {
  const sorted = sortByFrecency(items);

  if (sorted.length === 0) {
    return (
      <div
        data-testid="recent-items-empty"
        className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]"
      >
        No recent items
      </div>
    );
  }

  return (
    <div data-testid="recent-items-list" role="listbox">
      <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)]">
        Recent
      </div>
      {sorted.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          data-testid="recent-item"
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
            "rounded-[var(--radius-sm)] transition-colors duration-[var(--duration-fast)]",
            index === selectedIndex
              ? "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]",
          )}
          onClick={() => onSelect(item)}
        >
          <Clock
            size={16}
            className="shrink-0 text-[var(--color-text-muted)]"
            aria-hidden="true"
          />
          <span className="flex-1 truncate">
            {ENTITY_TYPE_LABELS[item.entity_type] ?? item.entity_type} #{item.entity_id}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {item.entity_type}
          </span>
        </button>
      ))}
    </div>
  );
}
