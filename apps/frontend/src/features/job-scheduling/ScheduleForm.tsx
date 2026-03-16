/**
 * Schedule create/edit form (PRD-119).
 *
 * Provides form fields for name, description, type (one-time vs recurring),
 * cron expression or datetime, timezone, off-peak toggle, action type,
 * and action configuration.
 */

import { useCallback, useState } from "react";

import { Button, Input, Select, Toggle } from "@/components/primitives";
import { Stack } from "@/components/layout";

import { CronPreview } from "./CronPreview";
import { JsonTextarea } from "./JsonTextarea";
import type { ActionType, CreateSchedule, Schedule, ScheduleType } from "./types";
import { ACTION_TYPE_LABEL, SCHEDULE_TYPE_LABEL, TIMEZONE_SELECT_OPTIONS } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SCHEDULE_TYPE_OPTIONS = Object.entries(SCHEDULE_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);
const ACTION_TYPE_OPTIONS = Object.entries(ACTION_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

const DEFAULT_ACTION_CONFIG = '{\n  "workflow_id": 1\n}';

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ScheduleFormProps {
  schedule?: Schedule;
  onSubmit: (data: CreateSchedule) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ScheduleForm({
  schedule,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ScheduleFormProps) {
  const [name, setName] = useState(schedule?.name ?? "");
  const [description, setDescription] = useState(schedule?.description ?? "");
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    schedule?.schedule_type ?? "recurring",
  );
  const [cronExpression, setCronExpression] = useState(
    schedule?.cron_expression ?? "0 2 * * *",
  );
  const [scheduledAt, setScheduledAt] = useState(schedule?.scheduled_at ?? "");
  const [timezone, setTimezone] = useState(schedule?.timezone ?? "UTC");
  const [isOffPeakOnly, setIsOffPeakOnly] = useState(schedule?.is_off_peak_only ?? false);
  const [actionType, setActionType] = useState<ActionType>(schedule?.action_type ?? "submit_job");
  const [actionConfigJson, setActionConfigJson] = useState(
    schedule?.action_config ? JSON.stringify(schedule.action_config, null, 2) : DEFAULT_ACTION_CONFIG,
  );
  const [configError, setConfigError] = useState<string | undefined>();

  const isEdit = schedule != null;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      let parsedConfig: Record<string, unknown>;
      try {
        parsedConfig = JSON.parse(actionConfigJson);
        setConfigError(undefined);
      } catch {
        setConfigError("Invalid JSON");
        return;
      }
      onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        schedule_type: scheduleType,
        cron_expression: scheduleType === "recurring" ? cronExpression : undefined,
        scheduled_at: scheduleType === "one_time" ? scheduledAt : undefined,
        timezone,
        is_off_peak_only: isOffPeakOnly,
        action_type: actionType,
        action_config: parsedConfig,
      });
    },
    [name, description, scheduleType, cronExpression, scheduledAt, timezone, isOffPeakOnly, actionType, actionConfigJson, onSubmit],
  );

  return (
    <form onSubmit={handleSubmit} data-testid="schedule-form">
      <Stack direction="vertical" gap={4}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Daily render batch" required data-testid="schedule-name" />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" data-testid="schedule-description" />
        <Select label="Schedule Type" options={SCHEDULE_TYPE_OPTIONS} value={scheduleType} onChange={(v) => setScheduleType(v as ScheduleType)} />

        {scheduleType === "recurring" ? (
          <Stack direction="vertical" gap={2}>
            <Input label="Cron Expression" value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} placeholder="0 2 * * *" helperText="Standard 5-field cron: minute hour day month weekday" data-testid="schedule-cron" />
            {cronExpression && <CronPreview expression={cronExpression} />}
          </Stack>
        ) : (
          <Input label="Scheduled At" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required={scheduleType === "one_time"} data-testid="schedule-datetime" />
        )}

        <Select label="Timezone" options={TIMEZONE_SELECT_OPTIONS} value={timezone} onChange={setTimezone} />
        <Toggle checked={isOffPeakOnly} onChange={setIsOffPeakOnly} label="Off-peak hours only" size="sm" />
        <Select label="Action Type" options={ACTION_TYPE_OPTIONS} value={actionType} onChange={(v) => setActionType(v as ActionType)} />

        <JsonTextarea
          label="Action Config (JSON)"
          value={actionConfigJson}
          onChange={setActionConfigJson}
          error={configError}
          onErrorClear={() => setConfigError(undefined)}
          data-testid="schedule-action-config"
        />

        <Stack direction="horizontal" gap={2} justify="end">
          <Button variant="secondary" size="md" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button variant="primary" size="md" type="submit" loading={isSubmitting} disabled={!name.trim()} data-testid="schedule-submit-btn">
            {isEdit ? "Update Schedule" : "Create Schedule"}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
