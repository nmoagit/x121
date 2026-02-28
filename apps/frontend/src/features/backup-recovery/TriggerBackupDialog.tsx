/**
 * TriggerBackupDialog -- modal form to trigger a manual backup (PRD-81).
 *
 * Allows selecting backup type and destination, then calls POST /admin/backups.
 */

import { useState } from "react";

import { Button, Input, Select } from "@/components/primitives";
import { Modal } from "@/components/composite";

import { useTriggerBackup } from "./hooks/use-backup-recovery";
import type { BackupType, CreateBackup } from "./types";
import { BACKUP_TYPE_OPTIONS } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_DESTINATION = "s3://backups";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface TriggerBackupDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TriggerBackupDialog({ open, onClose }: TriggerBackupDialogProps) {
  const [backupType, setBackupType] = useState<BackupType>("full");
  const [destination, setDestination] = useState(DEFAULT_DESTINATION);

  const triggerMutation = useTriggerBackup();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: CreateBackup = {
      backup_type: backupType,
      destination,
    };

    triggerMutation.mutate(payload, {
      onSuccess: () => {
        setBackupType("full");
        setDestination(DEFAULT_DESTINATION);
        onClose();
      },
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Trigger Backup" size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="trigger-backup-form">
        <Select
          label="Backup Type"
          options={BACKUP_TYPE_OPTIONS}
          value={backupType}
          onChange={(v) => setBackupType(v as BackupType)}
        />

        <Input
          label="Destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="s3://backups"
          required
        />

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={triggerMutation.isPending}
            disabled={!destination.trim()}
          >
            Trigger Backup
          </Button>
        </div>
      </form>
    </Modal>
  );
}
