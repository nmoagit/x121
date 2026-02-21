/**
 * Reset layout button with confirmation dialog (PRD-04).
 *
 * Uses the design system Button and Modal components.
 * Resets both layout and navigation state to defaults on the server.
 */

import { useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Modal } from "@/components/composite/Modal";

import { useResetWorkspace } from "./hooks/use-workspace";

export function ResetLayoutButton() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const resetWorkspace = useResetWorkspace();

  const handleReset = () => {
    resetWorkspace.mutate(undefined, {
      onSettled: () => setConfirmOpen(false),
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setConfirmOpen(true)}
      >
        Reset Layout
      </Button>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Reset Layout"
        size="sm"
      >
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          This will reset all panels and navigation to their default positions.
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleReset}
            loading={resetWorkspace.isPending}
          >
            Reset
          </Button>
        </div>
      </Modal>
    </>
  );
}
