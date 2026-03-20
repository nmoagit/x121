/**
 * Trigger list table (PRD-97).
 *
 * Displays all triggers with enable/disable toggle, edit/delete actions.
 */

import { WireframeLoader } from "@/components/primitives";
import { Card } from "@/components/composite";
import { cn } from "@/lib/cn";

import { useTriggers } from "./hooks/use-trigger-workflows";
import { TriggerRow } from "./TriggerRow";
import type { Trigger } from "./types";

/* --------------------------------------------------------------------------
   Table header
   -------------------------------------------------------------------------- */

const COLUMNS = ["Name", "Event", "Entity", "Enabled", "Actions"];

function TableHead() {
  return (
    <thead>
      <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/50">
        {COLUMNS.map((col) => (
          <th
            key={col}
            className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide"
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface TriggerListProps {
  projectId?: number;
  onEdit: (trigger: Trigger) => void;
}

export function TriggerList({ projectId, onEdit }: TriggerListProps) {
  const { data: triggers, isPending, isError } = useTriggers(projectId);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="trigger-list-loading">
        <WireframeLoader size={48} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load triggers.
      </div>
    );
  }

  if (!triggers || triggers.length === 0) {
    return (
      <Card elevation="flat" padding="lg">
        <div className="text-center text-sm text-[var(--color-text-muted)]" data-testid="trigger-list-empty">
          No triggers configured yet. Create one to get started.
        </div>
      </Card>
    );
  }

  return (
    <div
      className={cn(
        "overflow-x-auto",
        "border border-[var(--color-border-default)]",
        "rounded-[var(--radius-lg)]",
        "bg-[var(--color-surface-secondary)]",
      )}
      data-testid="trigger-list"
    >
      <table className="w-full text-left">
        <TableHead />
        <tbody>
          {triggers.map((trigger) => (
            <TriggerRow key={trigger.id} trigger={trigger} onEdit={onEdit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
