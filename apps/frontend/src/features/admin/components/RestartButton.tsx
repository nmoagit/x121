import { useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input, Toggle } from "@/components/primitives";
import { useRestartService } from "@/features/admin/hooks/use-hardware";
import { TYPO_DATA_DANGER } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface RestartButtonProps {
  workerId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RestartButton({ workerId }: RestartButtonProps) {
  const [open, setOpen] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [reason, setReason] = useState("");
  const [force, setForce] = useState(false);

  const mutation = useRestartService(workerId);

  function resetForm() {
    setServiceName("");
    setReason("");
    setForce(false);
    mutation.reset();
  }

  function handleClose() {
    setOpen(false);
    resetForm();
  }

  function handleSubmit() {
    mutation.mutate(
      {
        service_name: serviceName.trim(),
        reason: reason.trim() || undefined,
        force,
      },
      { onSuccess: () => handleClose() },
    );
  }

  const canSubmit = serviceName.trim().length > 0 && !mutation.isPending;

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Restart
      </Button>

      <Modal open={open} onClose={handleClose} title="Restart Service" size="md">
        <Stack gap={4}>
          <Input
            label="Service name"
            placeholder="e.g. comfyui"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            disabled={mutation.isPending}
          />

          <Input
            label="Reason (optional)"
            placeholder="Why is a restart needed?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={mutation.isPending}
          />

          <div className="flex flex-col gap-2">
            <Toggle
              checked={force}
              onChange={setForce}
              label="Force restart"
              size="sm"
            />
            {force && (
              <p className={TYPO_DATA_DANGER}>
                Force restart will terminate the service immediately. In-progress tasks may be lost.
              </p>
            )}
          </div>

          {mutation.isError && (
            <p role="alert" className={TYPO_DATA_DANGER}>
              {mutation.error instanceof Error ? mutation.error.message : "Restart failed"}
            </p>
          )}

          <Stack direction="horizontal" gap={2} justify="end" className="pt-1 border-t border-[var(--color-border-default)]">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={mutation.isPending}
            >
              {force ? "Force Restart" : "Restart"}
            </Button>
          </Stack>
        </Stack>
      </Modal>
    </>
  );
}
