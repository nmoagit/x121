/**
 * ScheduleForm -- create or edit form for backup schedules (PRD-81).
 *
 * Displays a modal with fields for backup type, cron expression,
 * destination, retention days, and enabled toggle.
 */

import { useEffect, useState } from "react";

import { Button, Input, Select, Toggle } from "@/components/primitives";
import { Modal } from "@/components/composite";

import {
  useCreateSchedule,
  useUpdateSchedule,
} from "./hooks/use-backup-recovery";
import type { BackupSchedule, BackupType } from "./types";
import { BACKUP_TYPE_OPTIONS } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_CRON = "0 2 * * *";
const DEFAULT_DESTINATION = "s3://backups";
const DEFAULT_RETENTION_DAYS = 30;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ScheduleFormProps {
  open: boolean;
  onClose: () => void;
  schedule?: BackupSchedule | null;
}

export function ScheduleForm({ open, onClose, schedule }: ScheduleFormProps) {
  const isEditing = !!schedule;

  const [backupType, setBackupType] = useState<BackupType>("full");
  const [cron, setCron] = useState(DEFAULT_CRON);
  const [destination, setDestination] = useState(DEFAULT_DESTINATION);
  const [retentionDays, setRetentionDays] = useState(DEFAULT_RETENTION_DAYS);
  const [enabled, setEnabled] = useState(true);

  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule();
  const isPending = createMutation.isPending || updateMutation.isPending;

  /* Populate form when editing */
  useEffect(() => {
    if (schedule) {
      setBackupType(schedule.backup_type);
      setCron(schedule.cron_expression);
      setDestination(schedule.destination);
      setRetentionDays(schedule.retention_days);
      setEnabled(schedule.enabled);
    } else {
      setBackupType("full");
      setCron(DEFAULT_CRON);
      setDestination(DEFAULT_DESTINATION);
      setRetentionDays(DEFAULT_RETENTION_DAYS);
      setEnabled(true);
    }
  }, [schedule]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const onSuccess = () => onClose();

    if (isEditing) {
      updateMutation.mutate(
        {
          id: schedule.id,
          data: {
            backup_type: backupType,
            cron_expression: cron,
            destination,
            retention_days: retentionDays,
            enabled,
          },
        },
        { onSuccess },
      );
    } else {
      createMutation.mutate(
        {
          backup_type: backupType,
          cron_expression: cron,
          destination,
          retention_days: retentionDays,
          enabled,
        },
        { onSuccess },
      );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Schedule" : "Create Schedule"}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="schedule-form">
        <Select
          label="Backup Type"
          options={BACKUP_TYPE_OPTIONS}
          value={backupType}
          onChange={(v) => setBackupType(v as BackupType)}
        />

        <Input
          label="Cron Expression"
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          placeholder="0 2 * * *"
          helperText="Standard 5-field cron (min hour dom month dow)"
          required
        />

        <Input
          label="Destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="s3://backups"
          required
        />

        <Input
          label="Retention (days)"
          type="number"
          min={1}
          value={String(retentionDays)}
          onChange={(e) => setRetentionDays(Number(e.target.value))}
          required
        />

        <Toggle
          label="Enabled"
          checked={enabled}
          onChange={setEnabled}
          size="sm"
        />

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={isPending}
            disabled={!cron.trim() || !destination.trim()}
          >
            {isEditing ? "Save Changes" : "Create Schedule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
