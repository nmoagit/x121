/**
 * Schedule list table (PRD-119).
 *
 * Displays all schedules in a table with expandable rows.
 */

import { Spinner } from "@/components/primitives";
import { Card } from "@/components/composite";
import { cn } from "@/lib/cn";

import { useSchedules } from "./hooks/use-job-scheduling";
import { ScheduleRow } from "./ScheduleRow";
import type { Schedule } from "./types";

/* --------------------------------------------------------------------------
   Table header
   -------------------------------------------------------------------------- */

const COLUMNS = ["Name", "Type", "Schedule", "Next Run", "Last Run", "Runs", "Status", "Actions"];

function TableHead() {
  return (
    <thead>
      <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/50">
        {COLUMNS.map((col) => (
          <th
            key={col}
            className={cn(
              "px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide",
              col === "Runs" && "text-center",
            )}
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

interface ScheduleListProps {
  onEdit: (schedule: Schedule) => void;
}

export function ScheduleList({ onEdit }: ScheduleListProps) {
  const { data: schedules, isPending, isError } = useSchedules();

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="schedule-list-loading">
        <Spinner size="md" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load schedules.
      </div>
    );
  }

  if (!schedules || schedules.length === 0) {
    return (
      <Card elevation="flat" padding="lg">
        <div className="text-center text-sm text-[var(--color-text-muted)]" data-testid="schedule-list-empty">
          No schedules configured yet. Create one to get started.
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
      data-testid="schedule-list"
    >
      <table className="w-full text-left">
        <TableHead />
        <tbody>
          {schedules.map((schedule) => (
            <ScheduleRow key={schedule.id} schedule={schedule} onEdit={onEdit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
