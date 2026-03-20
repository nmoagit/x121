/**
 * Completion checklist component (PRD-72).
 *
 * Displays delivery checklist items with pass/fail indicators and an
 * optional admin override button for forcing delivery.
 */

import { Check, XCircle, AlertTriangle } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { Button ,  WireframeLoader } from "@/components/primitives";
import { formatPercent } from "@/lib/format";

import { useCompletionChecklist, useTransitionProject } from "./hooks/use-project-lifecycle";
import type { ChecklistItem } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CompletionChecklistProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <li
      className="flex items-start gap-[var(--spacing-3)] py-[var(--spacing-2)]"
      data-testid={`checklist-item-${item.name}`}
    >
      <span className="mt-0.5 shrink-0">
        {item.passed ? (
          <Check
            size={iconSizes.md}
            className="text-[var(--color-action-success)]"
            aria-label="Passed"
          />
        ) : (
          <XCircle
            size={iconSizes.md}
            className="text-[var(--color-action-danger)]"
            aria-label="Failed"
          />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {item.description}
          </span>
          {item.blocking && !item.passed && (
            <AlertTriangle
              size={iconSizes.sm}
              className="text-[var(--color-action-warning)]"
              aria-label="Blocking"
            />
          )}
        </div>

        {!item.passed && item.details && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {item.details}
          </p>
        )}
      </div>
    </li>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CompletionChecklist({ projectId }: CompletionChecklistProps) {
  const { data: checklist, isLoading } = useCompletionChecklist(projectId);
  const transition = useTransitionProject();

  if (isLoading) {
    return (
      <div className="flex justify-center py-[var(--spacing-6)]" data-testid="checklist-loading">
        <WireframeLoader size={48} />
      </div>
    );
  }

  if (!checklist) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        No checklist data available.
      </p>
    );
  }

  const passedCount = checklist.items.filter((i) => i.passed).length;
  const totalCount = checklist.items.length;
  const passRate = totalCount > 0 ? passedCount / totalCount : 0;

  return (
    <div data-testid="completion-checklist">
      <div className="flex items-center justify-between mb-[var(--spacing-3)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Delivery Checklist
        </h3>
        <span className="text-xs text-[var(--color-text-muted)]">
          {passedCount}/{totalCount} passed ({formatPercent(passRate, 0)})
        </span>
      </div>

      <ul className="divide-y divide-[var(--color-border-default)]">
        {checklist.items.map((item) => (
          <ChecklistRow key={item.name} item={item} />
        ))}
      </ul>

      {!checklist.passed && (
        <div className="mt-[var(--spacing-4)] pt-[var(--spacing-3)] border-t border-[var(--color-border-default)]">
          <Button
            variant="danger"
            size="sm"
            loading={transition.isPending}
            onClick={() =>
              transition.mutate({
                projectId,
                targetState: "delivered",
                body: { admin_override: true },
              })
            }
          >
            Override & Deliver
          </Button>
          <p className="text-xs text-[var(--color-text-muted)] mt-[var(--spacing-2)]">
            Admin only: deliver despite failing checks.
          </p>
        </div>
      )}
    </div>
  );
}
