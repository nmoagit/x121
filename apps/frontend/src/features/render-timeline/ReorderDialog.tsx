/**
 * Admin dialog for changing a job's priority (PRD-90).
 *
 * Allows entering a new priority number and confirms before submitting.
 */

import { useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input } from "@/components/primitives";

import { useReorderJob } from "./hooks/use-render-timeline";
import type { TimelineJob } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ReorderDialogProps {
  job: TimelineJob | null;
  open: boolean;
  onClose: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReorderDialog({ job, open, onClose }: ReorderDialogProps) {
  const [priority, setPriority] = useState("");
  const reorder = useReorderJob();

  function handleOpen() {
    if (job) {
      setPriority(String(job.priority));
    }
  }

  function handleSubmit() {
    if (!job) return;

    const newPriority = Number(priority);
    if (Number.isNaN(newPriority)) return;

    reorder.mutate(
      { job_id: job.job_id, new_priority: newPriority },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  }

  // Reset form state when dialog opens
  if (open && job && priority === "") {
    handleOpen();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={job ? `Reorder Job #${job.job_id}` : "Reorder Job"}
      size="sm"
    >
      <Stack direction="vertical" gap={4}>
        <Input
          label="New Priority"
          type="number"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          helperText="Higher values = higher priority. Typical range: -10 to 10."
        />

        <Stack direction="horizontal" gap={2} justify="end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={reorder.isPending || priority === ""}>
            {reorder.isPending ? "Saving..." : "Update Priority"}
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
}
