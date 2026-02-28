/**
 * Bottom tab navigation bar for the mobile director's view (PRD-55).
 *
 * Shows 3 tabs: Review Queue, My Projects, and Activity Feed.
 * The Review Queue tab displays a badge count for pending items.
 */

import { cn } from "@/lib/cn";
import { Activity, FolderKanban, List } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import type { MobileTab } from "./types";
import { MIN_TOUCH_TARGET, MOBILE_TAB_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface DirectorsViewNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  queueCount: number;
}

/* --------------------------------------------------------------------------
   Tab configuration
   -------------------------------------------------------------------------- */

const TAB_CONFIG: { key: MobileTab; icon: typeof List }[] = [
  { key: "queue", icon: List },
  { key: "projects", icon: FolderKanban },
  { key: "activity", icon: Activity },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DirectorsViewNav({ activeTab, onTabChange, queueCount }: DirectorsViewNavProps) {
  return (
    <nav
      data-testid="directors-view-nav"
      className={cn(
        "flex items-stretch border-t border-[var(--color-border-default)]",
        "bg-[var(--color-surface-primary)]",
      )}
      aria-label="Director's view navigation"
    >
      {TAB_CONFIG.map(({ key, icon: Icon }) => {
        const isActive = activeTab === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 py-2",
              "text-xs font-medium transition-colors",
              isActive
                ? "text-[var(--color-action-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
            )}
            style={{ minHeight: MIN_TOUCH_TARGET }}
          >
            <span className="relative">
              <Icon size={iconSizes.md} aria-hidden="true" />

              {/* Badge count on queue tab */}
              {key === "queue" && queueCount > 0 && (
                <span
                  data-testid="queue-badge"
                  className={cn(
                    "absolute -right-2.5 -top-1.5",
                    "flex h-4 min-w-4 items-center justify-center",
                    "rounded-full bg-[var(--color-action-danger)] px-1",
                    "text-[10px] font-bold text-white",
                  )}
                >
                  {queueCount > 99 ? "99+" : queueCount}
                </span>
              )}
            </span>

            <span>{MOBILE_TAB_LABELS[key]}</span>
          </button>
        );
      })}
    </nav>
  );
}
