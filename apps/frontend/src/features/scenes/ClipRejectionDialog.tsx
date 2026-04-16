import { Modal } from "@/components/composite/Modal";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { useState } from "react";
import { TYPO_DATA } from "@/lib/typography-tokens";

interface ClipRejectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string, notes: string | undefined) => void;
  isSubmitting?: boolean;
}

export function ClipRejectionDialog({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
}: ClipRejectionDialogProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    onSubmit(reason, notes || undefined);
    setReason("");
    setNotes("");
  };

  const handleClose = () => {
    setReason("");
    setNotes("");
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title="Reject Clip" size="lg">
      <div className="flex flex-col gap-4">
        <Input
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this clip being rejected?"
          required
        />
        <div className="flex flex-col gap-1.5">
          <span className={`${TYPO_DATA} font-medium text-[var(--color-text-muted)] uppercase tracking-wide`}>
            Notes (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes..."
            rows={3}
            className={`w-full rounded-[var(--radius-md)] border p-2
              border-[var(--color-border-default)]
              bg-[var(--color-surface-primary)]
              ${TYPO_DATA}
              placeholder:text-[var(--color-text-muted)]
              focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[var(--color-border-focus)]`}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleSubmit}
            disabled={!reason.trim() || isSubmitting}
            loading={isSubmitting}
          >
            Reject
          </Button>
        </div>
      </div>
    </Modal>
  );
}
