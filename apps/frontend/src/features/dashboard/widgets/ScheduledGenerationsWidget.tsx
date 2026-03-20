/**
 * Scheduled Generations widget for StudioPulse dashboard.
 *
 * Compact list of upcoming scheduled generations with countdown timers,
 * scene counts, and a "View all" link to the Queue Manager.
 */

import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { useScheduledGenerationsWidget } from "@/features/dashboard/hooks/use-dashboard";
import type { Schedule } from "@/features/job-scheduling/types";
import { getScheduleSceneIds, filterActiveGenerationSchedules } from "@/features/job-scheduling/types";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { formatCountdown } from "@/lib/format";
import {
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_PIPE,
} from "@/lib/ui-classes";
import { Calendar, Clock } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const MAX_ITEMS = 5;

/* --------------------------------------------------------------------------
   Row
   -------------------------------------------------------------------------- */

function ScheduleRow({ schedule }: { schedule: Schedule }) {
  const firesAt = schedule.next_run_at ?? schedule.scheduled_at;
  const sceneCount = getScheduleSceneIds(schedule).length;

  return (
    <div className={`flex items-center justify-between gap-2 py-2 ${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER}`}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-[var(--color-text-primary)] truncate">
          {schedule.name}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
        <span className="text-cyan-400 tabular-nums">
          {sceneCount} scene{sceneCount === 1 ? "" : "s"}
        </span>
        <span className={TERMINAL_PIPE}>|</span>
        <span className="text-[var(--color-text-muted)] tabular-nums w-16 text-right">
          {firesAt ? formatCountdown(firesAt, "imminent") : ""}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Widget
   -------------------------------------------------------------------------- */

export function ScheduledGenerationsWidget() {
  const { data: schedules, isLoading, error, refetch } = useScheduledGenerationsWidget();

  const generationSchedules = filterActiveGenerationSchedules(schedules ?? []);

  const visible = generationSchedules.slice(0, MAX_ITEMS);
  const remaining = generationSchedules.length - visible.length;

  return (
    <WidgetBase
      title="Scheduled Generations"
      icon={<Calendar size={16} />}
      loading={isLoading}
      error={error?.message}
      onRetry={() => void refetch()}
      headerActions={
        generationSchedules.length > 0 ? (
          <Link
            to="/admin/queue"
            className="font-mono text-xs text-cyan-400 hover:underline"
          >
            View all
          </Link>
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={<Clock size={32} />}
          title="No scheduled generations"
          description="Schedule generations to see them here."
        />
      ) : (
        <div className="flex flex-col">
          {visible.map((schedule) => (
            <ScheduleRow key={schedule.id} schedule={schedule} />
          ))}
          {remaining > 0 && (
            <Link
              to="/admin/queue"
              className="font-mono text-xs text-cyan-400 hover:underline pt-2 text-center"
            >
              +{remaining} more
            </Link>
          )}
        </div>
      )}
    </WidgetBase>
  );
}
