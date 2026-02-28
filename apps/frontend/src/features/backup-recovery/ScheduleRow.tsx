/**
 * ScheduleRow -- single backup schedule table row (PRD-81).
 *
 * Displays a single schedule with toggle, edit, and delete actions.
 */

import { Badge, Button, Toggle } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { cn } from "@/lib/cn";
import { Edit3, Trash2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { formatDateTime } from "@/lib/format";

import {
  useDeleteSchedule,
  useUpdateSchedule,
} from "./hooks/use-backup-recovery";
import type { BackupSchedule } from "./types";
import { BACKUP_TYPE_LABEL } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ScheduleRowProps {
  schedule: BackupSchedule;
  onEdit: (schedule: BackupSchedule) => void;
}

export function ScheduleRow({ schedule, onEdit }: ScheduleRowProps) {
  const updateMutation = useUpdateSchedule();
  const deleteMutation = useDeleteSchedule();

  const handleToggle = (enabled: boolean) => {
    updateMutation.mutate({ id: schedule.id, data: { enabled } });
  };

  const handleDelete = () => {
    if (window.confirm(`Delete schedule #${schedule.id}?`)) {
      deleteMutation.mutate(schedule.id);
    }
  };

  return (
    <tr
      className={cn(
        "border-b border-[var(--color-border-default)] last:border-b-0",
        "hover:bg-[var(--color-surface-tertiary)]/50",
        "transition-colors duration-[var(--duration-instant)]",
      )}
      data-testid={`schedule-row-${schedule.id}`}
    >
      <td className="px-3 py-2.5">
        <Badge variant="info" size="sm">
          {BACKUP_TYPE_LABEL[schedule.backup_type]}
        </Badge>
      </td>
      <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)] font-mono">
        {schedule.cron_expression}
      </td>
      <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)]">
        {schedule.destination}
      </td>
      <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)] tabular-nums">
        {schedule.retention_days}d
      </td>
      <td className="px-3 py-2.5 text-sm text-[var(--color-text-muted)]">
        {schedule.next_run_at ? formatDateTime(schedule.next_run_at) : "--"}
      </td>
      <td className="px-3 py-2.5">
        <Toggle
          checked={schedule.enabled}
          onChange={handleToggle}
          size="sm"
          disabled={updateMutation.isPending}
        />
      </td>
      <td className="px-3 py-2.5">
        <Stack direction="horizontal" gap={1} align="center">
          <Button
            variant="ghost"
            size="sm"
            icon={<Edit3 size={iconSizes.sm} />}
            aria-label="Edit"
            onClick={() => onEdit(schedule)}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={iconSizes.sm} />}
            aria-label="Delete"
            onClick={handleDelete}
            loading={deleteMutation.isPending}
            data-testid={`schedule-delete-${schedule.id}`}
          />
        </Stack>
      </td>
    </tr>
  );
}
