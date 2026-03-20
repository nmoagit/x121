/**
 * Modal for scheduling scene generation at a future time (PRD-134).
 */

import { useState } from "react";

import { Modal } from "@/components/composite/Modal";
import { toastStore } from "@/components/composite/useToast";
import { Button, Input } from "@/components/primitives";
import { Clock } from "@/tokens/icons";

import { useScheduleGeneration } from "./hooks/use-generation";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ScheduleGenerationModalProps {
  sceneIds: number[];
  onClose: () => void;
  onScheduled?: () => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Get tomorrow at midnight in local time, formatted for datetime-local input. */
function defaultScheduledTime(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ScheduleGenerationModal({ sceneIds, onClose, onScheduled }: ScheduleGenerationModalProps) {
  const [scheduledTime, setScheduledTime] = useState(defaultScheduledTime);
  const scheduleGeneration = useScheduleGeneration();

  const isOpen = sceneIds.length > 0;
  const selectedDate = new Date(scheduledTime);
  const isInFuture = selectedDate > new Date();

  function handleSchedule() {
    if (!isInFuture) return;

    scheduleGeneration.mutate(
      { scene_ids: sceneIds, scheduled_at: selectedDate.toISOString() },
      {
        onSuccess: () => {
          toastStore.addToast({
            message: `${sceneIds.length} scene${sceneIds.length === 1 ? "" : "s"} scheduled for generation`,
            variant: "success",
          });
          onScheduled?.();
          onClose();
        },
        onError: (error) => {
          toastStore.addToast({
            message: `Scheduling failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            variant: "error",
          });
        },
      },
    );
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Schedule Generation" size="sm">
      <div className="flex flex-col gap-[var(--spacing-4)]">
        <p className="font-mono text-xs text-[var(--color-text-secondary)]">
          Schedule <span className="text-cyan-400">{sceneIds.length}</span> scene{sceneIds.length === 1 ? "" : "s"} for generation at a future time.
        </p>

        <Input
          label="Date & Time"
          type="datetime-local"
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
        />

        {!isInFuture && scheduledTime && (
          <p className="font-mono text-xs text-red-400">
            Scheduled time must be in the future.
          </p>
        )}

        <p className="font-mono text-xs text-[var(--color-text-muted)]">
          Times are in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
        </p>

        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSchedule}
            disabled={!isInFuture}
            loading={scheduleGeneration.isPending}
            icon={<Clock size={14} />}
          >
            Schedule
          </Button>
        </div>
      </div>
    </Modal>
  );
}
