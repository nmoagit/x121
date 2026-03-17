/**
 * Schedule list table (PRD-119, PRD-134).
 *
 * Displays all schedules in a table with expandable rows.
 * Supports filtering by action type (All, Generation, Other).
 */

import { useMemo, useState } from "react";

import { Card } from "@/components/composite";
import { Select, Spinner } from "@/components/primitives";
import { cn } from "@/lib/cn";

import { useSchedules } from "./hooks/use-job-scheduling";
import { ScheduleRow } from "./ScheduleRow";
import type { Schedule } from "./types";

/* --------------------------------------------------------------------------
   Filter options
   -------------------------------------------------------------------------- */

type ActionFilter = "all" | "generation" | "other";

const ACTION_FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "generation", label: "Generation" },
  { value: "other", label: "Other" },
];

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
   Helpers
   -------------------------------------------------------------------------- */

/** Check if a schedule is a generation schedule based on its action_config. */
function isGenerationSchedule(schedule: Schedule): boolean {
  const config = schedule.action_config;
  return Array.isArray(config?.scene_ids) || config?.type === "generation";
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface ScheduleListProps {
  onEdit: (schedule: Schedule) => void;
}

export function ScheduleList({ onEdit }: ScheduleListProps) {
  const { data: schedules, isPending, isError } = useSchedules();
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");

  const filteredSchedules = useMemo(() => {
    if (!schedules) return [];
    if (actionFilter === "all") return schedules;
    if (actionFilter === "generation") return schedules.filter(isGenerationSchedule);
    return schedules.filter((s) => !isGenerationSchedule(s));
  }, [schedules, actionFilter]);

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
    <div className="flex flex-col gap-[var(--spacing-3)]">
      {/* Filter bar */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        <Select
          value={actionFilter}
          onChange={(value) => setActionFilter(value as ActionFilter)}
          options={ACTION_FILTER_OPTIONS}
          size="sm"
        />
        {actionFilter !== "all" && (
          <span className="text-xs text-[var(--color-text-muted)]">
            {filteredSchedules.length} of {schedules.length} schedules
          </span>
        )}
      </div>

      {/* Table */}
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
            {filteredSchedules.map((schedule) => (
              <ScheduleRow key={schedule.id} schedule={schedule} onEdit={onEdit} />
            ))}
            {filteredSchedules.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
                  No schedules match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
