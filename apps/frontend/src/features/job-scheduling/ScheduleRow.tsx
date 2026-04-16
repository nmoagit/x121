/**
 * Individual schedule table row (PRD-119, PRD-134).
 *
 * Displays a single schedule row with action buttons and expandable history.
 * Generation schedules show scene count from action_config.
 */

import { useState } from "react";

import { ConfirmModal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { TERMINAL_DIVIDER, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";
import { Ban, Edit3, Pause, Play, Trash2, Zap } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useCancelSchedule,
  useDeleteSchedule,
  usePauseSchedule,
  useResumeSchedule,
  useStartScheduleNow,
} from "./hooks/use-job-scheduling";
import { ScheduleHistoryPanel } from "./ScheduleHistoryPanel";
import { ScheduleStatusBadge } from "./ScheduleStatusBadge";
import { SCHEDULE_TYPE_LABEL } from "./types";
import type { Schedule } from "./types";
import { TYPO_DATA, TYPO_DATA_CYAN, TYPO_DATA_MUTED } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Extract scene count from a generation schedule's action_config. */
function getSceneCount(schedule: Schedule): number | null {
  const sceneIds = schedule.action_config?.scene_ids;
  if (Array.isArray(sceneIds)) return sceneIds.length;
  return null;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ScheduleRowProps {
  schedule: Schedule;
  onEdit: (schedule: Schedule) => void;
}

export function ScheduleRow({ schedule, onEdit }: ScheduleRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const pauseMutation = usePauseSchedule();
  const resumeMutation = useResumeSchedule();
  const deleteMutation = useDeleteSchedule();
  const cancelMutation = useCancelSchedule();
  const startNowMutation = useStartScheduleNow();

  const sceneCount = getSceneCount(schedule);

  const togglePause = () => {
    if (schedule.is_active) {
      pauseMutation.mutate(schedule.id);
    } else {
      resumeMutation.mutate(schedule.id);
    }
  };

  return (
    <>
      <tr
        className={cn(
          TERMINAL_DIVIDER,
          "last:border-b-0",
          TERMINAL_ROW_HOVER,
          "transition-colors cursor-pointer",
        )}
        onClick={() => setExpanded((prev) => !prev)}
        data-testid={`schedule-row-${schedule.id}`}
      >
        <td className={`px-3 py-2.5 ${TYPO_DATA} font-medium text-[var(--color-text-primary)]`}>
          <div className="flex flex-col gap-0.5">
            {schedule.name}
            {sceneCount !== null && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {sceneCount} scene{sceneCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={`${TYPO_DATA_CYAN} uppercase tracking-wide`}>{SCHEDULE_TYPE_LABEL[schedule.schedule_type]}</span>
        </td>
        <td className={`px-3 py-2.5 ${TYPO_DATA_MUTED}`}>
          {schedule.cron_expression ?? (schedule.scheduled_at ? formatDateTime(schedule.scheduled_at) : "\u2014")}
        </td>
        <td className={`px-3 py-2.5 ${TYPO_DATA_MUTED}`}>
          {schedule.next_run_at ? formatDateTime(schedule.next_run_at) : "\u2014"}
        </td>
        <td className={`px-3 py-2.5 ${TYPO_DATA_MUTED}`}>
          {schedule.last_run_at ? formatDateTime(schedule.last_run_at) : "\u2014"}
        </td>
        <td className={`${TYPO_DATA_CYAN} px-3 py-2.5 text-center`}>
          {schedule.run_count}
        </td>
        <td className="px-3 py-2.5"><ScheduleStatusBadge isActive={schedule.is_active} /></td>
        <td className="px-3 py-2.5">
          <Stack direction="horizontal" gap={1} align="center">
            <Button
              variant="ghost"
              size="sm"
              icon={<Zap size={iconSizes.sm} />}
              aria-label="Start Now"
              onClick={(e) => { e.stopPropagation(); startNowMutation.mutate(schedule.id); }}
              disabled={!schedule.is_active || startNowMutation.isPending}
              data-testid={`schedule-start-now-${schedule.id}`}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Ban size={iconSizes.sm} />}
              aria-label="Cancel"
              onClick={(e) => { e.stopPropagation(); setConfirmCancel(true); }}
              disabled={!schedule.is_active || cancelMutation.isPending}
              data-testid={`schedule-cancel-${schedule.id}`}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={schedule.is_active ? <Pause size={iconSizes.sm} /> : <Play size={iconSizes.sm} />}
              aria-label={schedule.is_active ? "Pause" : "Resume"}
              onClick={(e) => { e.stopPropagation(); togglePause(); }}
              disabled={pauseMutation.isPending || resumeMutation.isPending}
              data-testid={`schedule-toggle-${schedule.id}`}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Edit3 size={iconSizes.sm} />}
              aria-label="Edit / Reschedule"
              onClick={(e) => { e.stopPropagation(); onEdit(schedule); }}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={iconSizes.sm} />}
              aria-label="Delete"
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              disabled={deleteMutation.isPending}
            />
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

      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel Schedule"
        confirmLabel="Cancel Schedule"
        confirmVariant="danger"
        onConfirm={() => {
          cancelMutation.mutate(schedule.id);
          setConfirmCancel(false);
        }}
      >
        <p>Cancel schedule "{schedule.name}"? Pending scenes will revert to their previous status.</p>
      </ConfirmModal>
    </>
  );
}
