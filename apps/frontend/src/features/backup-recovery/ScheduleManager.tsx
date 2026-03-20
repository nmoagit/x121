/**
 * ScheduleManager -- list of backup schedules with CRUD and enable/disable toggle (PRD-81).
 *
 * Displays all backup schedules in a table with toggle, edit, and delete actions.
 * Includes a "Create Schedule" button that opens the ScheduleForm modal.
 */

import { useState } from "react";

import { Button ,  WireframeLoader } from "@/components/primitives";
import { Card } from "@/components/composite";
import { cn } from "@/lib/cn";
import { Plus } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useBackupSchedules } from "./hooks/use-backup-recovery";
import { ScheduleForm } from "./ScheduleForm";
import { ScheduleRow } from "./ScheduleRow";
import type { BackupSchedule } from "./types";

/* --------------------------------------------------------------------------
   Table header
   -------------------------------------------------------------------------- */

const COLUMNS = ["Type", "Cron", "Destination", "Retention", "Next Run", "Enabled", "Actions"];

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

export function ScheduleManager() {
  const { data: schedules, isPending, isError } = useBackupSchedules();
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<BackupSchedule | null>(null);

  const handleEdit = (schedule: BackupSchedule) => {
    setEditingSchedule(schedule);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingSchedule(null);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="schedule-manager">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
          Backup Schedules
        </h3>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={iconSizes.sm} />}
          onClick={() => setFormOpen(true)}
          data-testid="create-schedule-btn"
        >
          Create Schedule
        </Button>
      </div>

      {/* Content */}
      {isPending && (
        <div className="flex items-center justify-center py-8" data-testid="schedule-list-loading">
          <WireframeLoader size={48} />
        </div>
      )}

      {isError && (
        <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
          Failed to load schedules.
        </div>
      )}

      {!isPending && !isError && (!schedules || schedules.length === 0) && (
        <Card elevation="flat" padding="lg">
          <div className="text-center text-sm text-[var(--color-text-muted)]" data-testid="schedule-list-empty">
            No backup schedules configured yet.
          </div>
        </Card>
      )}

      {!isPending && schedules && schedules.length > 0 && (
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
                <ScheduleRow
                  key={schedule.id}
                  schedule={schedule}
                  onEdit={handleEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      <ScheduleForm
        open={formOpen}
        onClose={handleCloseForm}
        schedule={editingSchedule}
      />
    </div>
  );
}
