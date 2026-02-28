/**
 * Deadline tracking display for review assignments (PRD-92).
 *
 * Highlights overdue items with danger styling and shows countdown
 * timers for upcoming deadlines.
 */

import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatCountdown, formatDateTime } from "@/lib/format";

import type { ReviewAssignment } from "./types";
import { ASSIGNMENT_STATUS_BADGE_VARIANT, ASSIGNMENT_STATUS_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface DeadlineTrackerProps {
  assignments: ReviewAssignment[];
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DeadlineTracker({ assignments }: DeadlineTrackerProps) {
  if (assignments.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] py-2">
        No assignments to track.
      </div>
    );
  }

  // Sort: overdue first, then by deadline ascending
  const sorted = [...assignments]
    .filter((a) => a.deadline != null)
    .sort((a, b) => {
      const aOverdue = a.status === "overdue" ? 0 : 1;
      const bOverdue = b.status === "overdue" ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return (a.deadline ?? "").localeCompare(b.deadline ?? "");
    });

  if (sorted.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] py-2">
        No deadlines set.
      </div>
    );
  }

  return (
    <div data-testid="deadline-tracker" className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Deadlines
      </h4>
      <ul className="flex flex-col gap-1.5">
        {sorted.map((assignment) => (
          <li
            key={assignment.id}
            className={cn(
              "flex items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-sm",
              assignment.status === "overdue"
                ? "bg-[var(--color-action-danger)]/10 border border-[var(--color-action-danger)]/30"
                : "bg-[var(--color-surface-secondary)]",
            )}
          >
            <span className="text-[var(--color-text-primary)]">
              Reviewer #{assignment.reviewer_user_id}
            </span>
            <div className="flex items-center gap-2">
              <Badge
                variant={ASSIGNMENT_STATUS_BADGE_VARIANT[assignment.status]}
                size="sm"
              >
                {ASSIGNMENT_STATUS_LABELS[assignment.status]}
              </Badge>
              <span
                className={cn(
                  "text-xs",
                  assignment.status === "overdue"
                    ? "text-[var(--color-action-danger)] font-medium"
                    : "text-[var(--color-text-muted)]",
                )}
              >
                {assignment.deadline
                  ? assignment.status === "overdue"
                    ? `Overdue (${formatDateTime(assignment.deadline)})`
                    : formatCountdown(assignment.deadline)
                  : "\u2014"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
