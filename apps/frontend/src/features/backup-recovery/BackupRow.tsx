/**
 * BackupRow -- single backup table row (PRD-81).
 *
 * Displays backup metadata with status badge, size, date, verification
 * indicator, and action buttons (verify, delete). Expandable to show
 * verification details.
 */

import { useState } from "react";

import { ConfirmModal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button } from "@/components/primitives";
import { Check, ShieldCheck, Trash2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { cn } from "@/lib/cn";
import { formatBytes, formatDateTime } from "@/lib/format";

import { useDeleteBackup, useVerifyBackup } from "./hooks/use-backup-recovery";
import { VerificationPanel } from "./VerificationPanel";
import type { Backup } from "./types";
import {
  BACKUP_STATUS_BADGE_VARIANT,
  BACKUP_STATUS_LABEL,
  BACKUP_TYPE_LABEL,
  TRIGGERED_BY_LABEL,
} from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface BackupRowProps {
  backup: Backup;
}

export function BackupRow({ backup }: BackupRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const verifyMutation = useVerifyBackup();
  const deleteMutation = useDeleteBackup();

  const canVerify = backup.status === "completed" && !backup.verified;
  const canDelete = backup.status !== "running";

  const handleVerify = (e: React.MouseEvent) => {
    e.stopPropagation();
    verifyMutation.mutate(backup.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
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
        data-testid={`backup-row-${backup.id}`}
      >
        {/* Type */}
        <td className="px-3 py-2.5">
          <Badge variant="info" size="sm">
            {BACKUP_TYPE_LABEL[backup.backup_type]}
          </Badge>
        </td>

        {/* Status */}
        <td className="px-3 py-2.5">
          <Badge variant={BACKUP_STATUS_BADGE_VARIANT[backup.status]} size="sm">
            {BACKUP_STATUS_LABEL[backup.status]}
          </Badge>
        </td>

        {/* Size */}
        <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)] tabular-nums">
          {backup.size_bytes !== null ? formatBytes(backup.size_bytes) : "--"}
        </td>

        {/* Date */}
        <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)] tabular-nums">
          {backup.completed_at ? formatDateTime(backup.completed_at) : formatDateTime(backup.created_at)}
        </td>

        {/* Triggered by */}
        <td className="px-3 py-2.5 text-sm text-[var(--color-text-muted)]">
          {TRIGGERED_BY_LABEL[backup.triggered_by]}
        </td>

        {/* Verified */}
        <td className="px-3 py-2.5">
          {backup.verified ? (
            <Check size={iconSizes.sm} className="text-[var(--color-action-success)]" aria-label="Verified" />
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">--</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <Stack direction="horizontal" gap={1} align="center">
            {canVerify && (
              <Button
                variant="ghost"
                size="sm"
                icon={<ShieldCheck size={iconSizes.sm} />}
                aria-label="Verify"
                onClick={handleVerify}
                loading={verifyMutation.isPending}
                data-testid={`backup-verify-${backup.id}`}
              />
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={iconSizes.sm} />}
                aria-label="Delete"
                onClick={handleDelete}
                loading={deleteMutation.isPending}
                data-testid={`backup-delete-${backup.id}`}
              />
            )}
          </Stack>
        </td>
      </tr>

      {/* Expanded verification panel */}
      {expanded && backup.verification_result_json && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-[var(--color-surface-primary)]">
            <VerificationPanel result={backup.verification_result_json} />
          </td>
        </tr>
      )}

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Backup"
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          deleteMutation.mutate(backup.id);
          setConfirmDelete(false);
        }}
      >
        <p>Delete backup #{backup.id}?</p>
      </ConfirmModal>
    </>
  );
}
