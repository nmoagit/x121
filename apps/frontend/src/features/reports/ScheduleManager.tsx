/**
 * Schedule manager for Production Reporting (PRD-73).
 *
 * Lists all report schedules with enable/disable toggles,
 * and provides controls for creating, editing, and deleting schedules.
 */

import { useState } from "react";

import { Button, Toggle } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { formatDateTime } from "@/lib/format";
import { Trash2, iconSizes } from "@/tokens/icons";

import { CreateScheduleForm } from "./CreateScheduleForm";
import {
  useDeleteSchedule,
  useReportSchedules,
  useUpdateSchedule,
} from "./hooks/use-reports";
import { FORMAT_LABELS, SCHEDULE_LABELS } from "./types";
import type { ReportSchedule } from "./types";

/* --------------------------------------------------------------------------
   Schedule row
   -------------------------------------------------------------------------- */

function ScheduleRow({
  schedule,
  onToggle,
  onDelete,
}: {
  schedule: ReportSchedule;
  onToggle: (id: number, enabled: boolean) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      data-testid={`schedule-row-${schedule.id}`}
      className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border-default)] last:border-b-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-[var(--color-text-primary)]">
            Type {schedule.report_type_id}
          </span>
          <span className="text-[var(--color-text-muted)]">
            {FORMAT_LABELS[schedule.format]}
          </span>
          <span className="text-[var(--color-text-secondary)]">
            {SCHEDULE_LABELS[schedule.schedule] ?? schedule.schedule}
          </span>
        </div>
        {schedule.next_run_at && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Next: {formatDateTime(schedule.next_run_at)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Toggle
          checked={schedule.enabled}
          onChange={(checked) => onToggle(schedule.id, checked)}
          size="sm"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(schedule.id)}
          data-testid={`delete-schedule-${schedule.id}`}
          icon={<Trash2 size={iconSizes.sm} />}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ScheduleManager() {
  const { data: schedules, isLoading } = useReportSchedules();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();
  const [showForm, setShowForm] = useState(false);

  function handleToggle(id: number, enabled: boolean) {
    updateSchedule.mutate({ id, data: { enabled } });
  }

  function handleDelete(id: number) {
    deleteSchedule.mutate(id);
  }

  const list = schedules ?? [];

  return (
    <div data-testid="schedule-manager">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Report Schedules
          </h3>
          {!showForm && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowForm(true)}
              data-testid="add-schedule-btn"
            >
              New Schedule
            </Button>
          )}
        </CardHeader>

        <CardBody className="p-0">
          {showForm && (
            <CreateScheduleForm onCancel={() => setShowForm(false)} />
          )}

          {isLoading ? (
            <p className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">
              Loading schedules...
            </p>
          ) : list.length === 0 ? (
            <p
              data-testid="schedules-empty"
              className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center"
            >
              No schedules configured.
            </p>
          ) : (
            list.map((s) => (
              <ScheduleRow
                key={s.id}
                schedule={s}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
