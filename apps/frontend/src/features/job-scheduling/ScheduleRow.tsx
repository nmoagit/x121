/**
 * Individual schedule table row (PRD-119).
 *
 * Displays a single schedule row with action buttons and expandable history.
 */

import { useState } from "react";

import { ConfirmModal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { Edit3, Pause, Play, Trash2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useDeleteSchedule,
  usePauseSchedule,
  useResumeSchedule,
} from "./hooks/use-job-scheduling";
import { ScheduleHistoryPanel } from "./ScheduleHistoryPanel";
import { ScheduleStatusBadge } from "./ScheduleStatusBadge";
import { SCHEDULE_TYPE_LABEL } from "./types";
import type { Schedule } from "./types";

interface ScheduleRowProps {
  schedule: Schedule;
  onEdit: (schedule: Schedule) => void;
}

export function ScheduleRow({ schedule, onEdit }: ScheduleRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pauseMutation = usePauseSchedule();
  const resumeMutation = useResumeSchedule();
  const deleteMutation = useDeleteSchedule();

  const togglePause = () => {
    if (schedule.is_active) {
      pauseMutation.mutate(schedule.id);
    } else {
      resumeMutation.mutate(schedule.id);
    }
  };

  const handleDelete = () => {
    setConfirmDelete(true);
  };

  return (
    <>
      <tr
        className={cn(
          "border-b border-[var(--color-border-default)] last:border-b-0",
          "hover:bg-[var(--color-surface-tertiary)]/50",
          "transition-colors duration-[var(--duration-instant)] cursor-pointer",
        )}
        onClick={() => setExpanded((prev) => !prev)}
        data-testid={`schedule-row-${schedule.id}`}
      >
        <td className="px-3 py-2.5 text-sm font-medium text-[var(--color-text-primary)]">
          {schedule.name}
        </td>
        <td className="px-3 py-2.5">
          <Badge variant="info" size="sm">{SCHEDULE_TYPE_LABEL[schedule.schedule_type]}</Badge>
        </td>
        <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)] font-mono">
          {schedule.cron_expression ?? (schedule.scheduled_at ? formatDateTime(schedule.scheduled_at) : "\u2014")}
        </td>
        <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)]">
          {schedule.next_run_at ? formatDateTime(schedule.next_run_at) : "\u2014"}
        </td>
        <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)]">
          {schedule.last_run_at ? formatDateTime(schedule.last_run_at) : "\u2014"}
        </td>
        <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)] text-center">
          {schedule.run_count}
        </td>
        <td className="px-3 py-2.5"><ScheduleStatusBadge isActive={schedule.is_active} /></td>
        <td className="px-3 py-2.5">
          <Stack direction="horizontal" gap={1} align="center">
            <Button variant="ghost" size="sm" icon={schedule.is_active ? <Pause size={iconSizes.sm} /> : <Play size={iconSizes.sm} />} aria-label={schedule.is_active ? "Pause" : "Resume"} onClick={(e) => { e.stopPropagation(); togglePause(); }} disabled={pauseMutation.isPending || resumeMutation.isPending} data-testid={`schedule-toggle-${schedule.id}`} />
            <Button variant="ghost" size="sm" icon={<Edit3 size={iconSizes.sm} />} aria-label="Edit" onClick={(e) => { e.stopPropagation(); onEdit(schedule); }} />
            <Button variant="ghost" size="sm" icon={<Trash2 size={iconSizes.sm} />} aria-label="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(); }} disabled={deleteMutation.isPending} />
          </Stack>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="px-4 py-3 bg-[var(--color-surface-primary)]">
            <ScheduleHistoryPanel scheduleId={schedule.id} />
          </td>
        </tr>
      )}

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Schedule"
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          deleteMutation.mutate(schedule.id);
          setConfirmDelete(false);
        }}
      >
        <p>Delete schedule "{schedule.name}"?</p>
      </ConfirmModal>
    </>
  );
}
