/**
 * Modal for rejecting a metadata version with a required reason.
 */

import { useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";

interface RejectVersionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  versionNumber: number;
  isPending?: boolean;
}

export function RejectVersionModal({
  open,
  onClose,
  onConfirm,
  versionNumber,
  isPending,
}: RejectVersionModalProps) {
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setReason("");
  };

  return (
    <Modal open={open} onClose={onClose} title={`Reject Version ${versionNumber}`} size="lg">
      <Stack gap={3}>
        <p className="text-xs font-mono text-[var(--color-text-secondary)]">
          Provide a reason for rejecting this metadata version.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Rejection reason..."
          rows={3}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-2 text-xs font-mono text-[var(--color-text-primary)] focus:outline-2 focus:outline-[var(--color-border-focus)]"
        />
        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleSubmit}
            disabled={!reason.trim() || isPending}
          >
            {isPending ? "Rejecting..." : "Reject"}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
