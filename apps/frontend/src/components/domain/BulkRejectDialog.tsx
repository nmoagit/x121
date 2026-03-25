import { useState } from "react";
import { Modal } from "@/components/composite";
import { Button, Input } from "@/components/primitives";
import { Stack } from "@/components/layout";

interface BulkRejectDialogProps {
  open: boolean;
  count: number;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

/**
 * Confirmation dialog for bulk-rejecting items.
 * Requires a reason before confirming.
 */
export function BulkRejectDialog({
  open,
  count,
  onConfirm,
  onCancel,
  loading,
}: BulkRejectDialogProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason("");
  };

  const handleCancel = () => {
    setReason("");
    onCancel();
  };

  return (
    <Modal open={open} onClose={handleCancel} title={`Reject ${count} item${count !== 1 ? "s" : ""}?`} size="sm">
      <Stack gap={4}>
        <p className="font-mono text-xs text-[var(--color-text-muted)]">
          This will mark {count} item{count !== 1 ? "s" : ""} as rejected. A reason is required.
        </p>
        <Input
          label="Reason"
          size="sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are these items being rejected?"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="xs" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="xs"
            onClick={handleConfirm}
            disabled={!reason.trim() || loading}
            loading={loading}
          >
            Reject {count}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}

export type { BulkRejectDialogProps };
