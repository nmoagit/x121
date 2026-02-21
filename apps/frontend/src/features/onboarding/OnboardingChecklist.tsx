/**
 * Onboarding checklist dashboard widget (PRD-53).
 *
 * Displays a list of getting-started tasks with their completion status,
 * a progress bar, and a dismiss button.
 */

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components";
import { cn } from "@/lib/cn";

import { useOnboarding } from "./hooks/use-onboarding";
import type { ChecklistItem } from "./types";
import { CHECKLIST_ITEM_IDS, CHECKLIST_LABELS, DISMISS_LINK_CLASSES } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OnboardingChecklist() {
  const { data, isLoading } = useOnboarding();
  const [dismissed, setDismissed] = useState(false);

  const items: ChecklistItem[] = useMemo(() => {
    const progress = data?.checklist_progress_json ?? {};
    return CHECKLIST_ITEM_IDS.map((id) => ({
      id,
      label: CHECKLIST_LABELS[id] ?? id,
      completed: progress[id] === true,
    }));
  }, [data]);

  const completedCount = useMemo(() => items.filter((item) => item.completed).length, [items]);
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleItemClick = useCallback((itemId: string) => {
    // In a full implementation this would navigate to the relevant section.
    // For now we just log the intent.
    console.log(`[onboarding] Navigate to: ${itemId}`);
  }, []);

  if (dismissed || isLoading) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-4",
        "bg-[var(--color-surface-primary)]",
        "border border-[var(--color-border-default)]",
      )}
      data-testid="onboarding-checklist"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Getting Started</h3>
        <button
          type="button"
          className={DISMISS_LINK_CLASSES}
          onClick={() => setDismissed(true)}
          data-testid="checklist-dismiss"
        >
          Dismiss
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[var(--color-text-muted)]">
            {completedCount} of {totalCount} complete
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">{progressPct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-tertiary)]">
          <div
            className="h-1.5 rounded-full bg-[var(--color-action-primary)] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
            data-testid="checklist-progress-bar"
          />
        </div>
      </div>

      {/* Checklist items */}
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleItemClick(item.id)}
              className="w-full justify-start gap-2 text-left"
              data-testid={`checklist-item-${item.id}`}
            >
              <span
                className={cn(
                  "inline-flex h-4 w-4 items-center justify-center rounded-full border text-xs flex-shrink-0",
                  item.completed
                    ? "bg-[var(--color-action-primary)] border-[var(--color-action-primary)] text-white"
                    : "border-[var(--color-border-default)]",
                )}
              >
                {item.completed && "\u2713"}
              </span>
              <span
                className={cn(
                  "text-sm",
                  item.completed
                    ? "text-[var(--color-text-muted)] line-through"
                    : "text-[var(--color-text-primary)]",
                )}
              >
                {item.label}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
