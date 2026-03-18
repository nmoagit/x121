/**
 * Displays active scheduled generation entries in the Queue Manager (PRD-134).
 *
 * Shows generation schedules with enriched scene details (character name,
 * scene type, track) and per-scene cancel capability.
 */

import { useState } from "react";

import { Badge, Button } from "@/components/primitives";
import { toastStore } from "@/components/composite/useToast";
import {
  useBatchSceneDetails,
  useRemoveScenesFromSchedule,
} from "@/features/generation/hooks/use-generation";
import type { SceneDetail } from "@/features/generation/hooks/use-generation";
import { ScheduleGenerationModal } from "@/features/generation/ScheduleGenerationModal";
import {
  useSchedules,
  useCancelSchedule,
  useStartScheduleNow,
} from "@/features/job-scheduling/hooks/use-job-scheduling";
import type { Schedule } from "@/features/job-scheduling/types";
import { getScheduleSceneIds, filterActiveGenerationSchedules } from "@/features/job-scheduling/types";
import { sceneStatusLabel, sceneStatusBadgeVariant } from "@/features/scenes/types";
import { formatCountdown } from "@/lib/format";
import { Ban, ChevronDown, ChevronRight, Clock, Edit3, X, Zap } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function formatDateTime(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeUntil(iso: string | null): string {
  if (!iso) return "";
  return `in ${formatCountdown(iso, "imminent")}`;
}

/* --------------------------------------------------------------------------
   SceneRow — a single scene within an expanded schedule
   -------------------------------------------------------------------------- */

function SceneRow({
  scene,
  scheduleId,
  onRemove,
  removePending,
}: {
  scene: SceneDetail;
  scheduleId: number;
  onRemove: (scheduleId: number, sceneId: number) => void;
  removePending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--color-surface-tertiary)]/50 transition-colors">
      <span className="w-16 shrink-0 font-mono text-xs text-[var(--color-text-muted)]">
        #{scene.id}
      </span>
      <span className="flex-1 min-w-0 truncate text-[var(--color-text-primary)]">
        {scene.character_name}
      </span>
      <span className="shrink-0 text-[var(--color-text-secondary)]">
        {scene.scene_type_name}
        {scene.track_name && (
          <span className="text-[var(--color-text-muted)]"> / {scene.track_name}</span>
        )}
      </span>
      <Badge variant={sceneStatusBadgeVariant(scene.status_id)} size="sm">
        {sceneStatusLabel(scene.status_id)}
      </Badge>
      <Button
        size="sm"
        variant="ghost"
        icon={<X size={14} />}
        onClick={() => onRemove(scheduleId, scene.id)}
        loading={removePending}
        aria-label={`Remove scene ${scene.id} from schedule`}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   ScheduleDetailRow — expandable row for a single schedule
   -------------------------------------------------------------------------- */

function ScheduleDetailRow({
  schedule,
  onCancel,
  onStartNow,
  onReschedule,
  onRemoveScene,
  cancelPending,
  startNowPending,
  removeScenePending,
}: {
  schedule: Schedule;
  onCancel: (id: number) => void;
  onStartNow: (id: number) => void;
  onReschedule: (sceneIds: number[]) => void;
  onRemoveScene: (scheduleId: number, sceneId: number) => void;
  cancelPending: boolean;
  startNowPending: boolean;
  removeScenePending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sceneIds = getScheduleSceneIds(schedule);
  const firesAt = schedule.next_run_at ?? schedule.scheduled_at;

  // Fetch enriched scene details only when expanded.
  const { data: scenes } = useBatchSceneDetails(expanded ? sceneIds : []);

  return (
    <div>
      {/* Summary row */}
      <div
        className="px-4 py-3 flex items-center gap-3 text-sm cursor-pointer hover:bg-[var(--color-surface-tertiary)] transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="shrink-0 text-[var(--color-text-muted)]">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-medium text-[var(--color-text-primary)] truncate">
            {schedule.name}
          </span>
          <Badge variant="info" size="sm">
            {sceneIds.length} scene{sceneIds.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
          {timeUntil(firesAt)}
        </span>

        <span className="shrink-0 text-[var(--color-text-secondary)] text-xs">
          {formatDateTime(firesAt)}
        </span>

        <div
          className="shrink-0 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="sm"
            variant="primary"
            icon={<Zap size={14} />}
            onClick={() => onStartNow(schedule.id)}
            loading={startNowPending}
          >
            Start Now
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Edit3 size={14} />}
            onClick={() => onReschedule(sceneIds)}
          >
            Reschedule
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Ban size={14} />}
            onClick={() => onCancel(schedule.id)}
            loading={cancelPending}
          >
            Cancel All
          </Button>
        </div>
      </div>

      {/* Expanded: scene table */}
      {expanded && (
        <div className="border-t border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-1.5 text-xs font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border-default)]">
            <span className="w-16 shrink-0">ID</span>
            <span className="flex-1">Model</span>
            <span className="shrink-0">Target</span>
            <span className="shrink-0 w-20">Status</span>
            <span className="shrink-0 w-8" />
          </div>

          {/* Scene rows */}
          {scenes && scenes.length > 0 ? (
            scenes.map((scene) => (
              <SceneRow
                key={scene.id}
                scene={scene}
                scheduleId={schedule.id}
                onRemove={onRemoveScene}
                removePending={removeScenePending}
              />
            ))
          ) : (
            <div className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
              {scenes ? "No scene data available" : "Loading scene details\u2026"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   ScheduledGenerationsPanel
   -------------------------------------------------------------------------- */

export function ScheduledGenerationsPanel() {
  const { data: schedules } = useSchedules({ is_active: "true" });
  const cancelSchedule = useCancelSchedule();
  const startNow = useStartScheduleNow();
  const removeScenes = useRemoveScenesFromSchedule();
  const [rescheduleSceneIds, setRescheduleSceneIds] = useState<number[]>([]);

  const generationSchedules = filterActiveGenerationSchedules(schedules ?? []);

  if (generationSchedules.length === 0) return null;

  function handleCancel(id: number) {
    cancelSchedule.mutate(id, {
      onSuccess: () =>
        toastStore.addToast({ message: "Schedule cancelled", variant: "info" }),
    });
  }

  function handleStartNow(id: number) {
    startNow.mutate(id, {
      onSuccess: () =>
        toastStore.addToast({
          message: "Generation started immediately",
          variant: "success",
        }),
    });
  }

  function handleRemoveScene(scheduleId: number, sceneId: number) {
    removeScenes.mutate(
      { scheduleId, sceneIds: [sceneId] },
      {
        onSuccess: (result) => {
          const msg = result.remaining === 0
            ? "Last scene removed \u2014 schedule cancelled"
            : `Scene removed (${result.remaining} remaining)`;
          toastStore.addToast({ message: msg, variant: "info" });
        },
      },
    );
  }

  return (
    <div className="border border-[var(--color-border-default)] rounded-[var(--radius-lg)] overflow-hidden bg-[var(--color-surface-secondary)]">
      <div className="px-4 py-3 border-b border-[var(--color-border-default)] flex items-center gap-2">
        <Clock size={16} className="text-[var(--color-status-info)]" />
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          Scheduled Generations
        </span>
        <Badge variant="info" size="sm">
          {generationSchedules.length}
        </Badge>
      </div>

      <div className="divide-y divide-[var(--color-border-default)]">
        {generationSchedules.map((schedule) => (
          <ScheduleDetailRow
            key={schedule.id}
            schedule={schedule}
            onCancel={handleCancel}
            onStartNow={handleStartNow}
            onReschedule={setRescheduleSceneIds}
            onRemoveScene={handleRemoveScene}
            cancelPending={cancelSchedule.isPending}
            startNowPending={startNow.isPending}
            removeScenePending={removeScenes.isPending}
          />
        ))}
      </div>

      {/* Reschedule modal — reuses ScheduleGenerationModal which auto-moves scenes */}
      <ScheduleGenerationModal
        sceneIds={rescheduleSceneIds}
        onClose={() => setRescheduleSceneIds([])}
        onScheduled={() => setRescheduleSceneIds([])}
      />
    </div>
  );
}
