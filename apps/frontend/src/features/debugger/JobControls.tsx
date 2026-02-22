/**
 * Job debug controls: pause, resume, and abort buttons (PRD-34).
 *
 * Displays the current job control status with a colored Badge and
 * provides action buttons based on the current state.
 */

import { cn } from "@/lib/cn";
import { Badge, Button } from "@/components/primitives";
import { Stack } from "@/components/layout";

import type { JobControlStatus } from "./types";
import { DEBUGGER_CARD_CLASSES } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface JobControlsProps {
  /** Current control status of the job. */
  status: JobControlStatus;
  /** Whether a mutation is currently in progress. */
  isLoading: boolean;
  /** Called when the user clicks Pause. */
  onPause: () => void;
  /** Called when the user clicks Resume. */
  onResume: () => void;
  /** Called when the user clicks Abort. */
  onAbort: () => void;
}

/* --------------------------------------------------------------------------
   Status badge mapping
   -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<
  JobControlStatus,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  running: { label: "Running", variant: "success" },
  paused: { label: "Paused", variant: "warning" },
  aborted: { label: "Aborted", variant: "danger" },
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function JobControls({
  status,
  isLoading,
  onPause,
  onResume,
  onAbort,
}: JobControlsProps) {
  const badge = STATUS_BADGE[status];

  return (
    <div
      className={cn(...DEBUGGER_CARD_CLASSES)}
    >
      <Stack direction="horizontal" gap={3} align="center">
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">
          Status:
        </span>
        <Badge variant={badge.variant} size="sm">
          {badge.label}
        </Badge>

        <div className="flex-1" />

        {status === "running" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onPause}
            disabled={isLoading}
          >
            {isLoading ? "Pausing..." : "Pause"}
          </Button>
        )}

        {status === "paused" && (
          <Button
            variant="primary"
            size="sm"
            onClick={onResume}
            disabled={isLoading}
          >
            {isLoading ? "Resuming..." : "Resume"}
          </Button>
        )}

        <Button
          variant="danger"
          size="sm"
          onClick={onAbort}
          disabled={isLoading || status === "aborted"}
        >
          {isLoading ? "Aborting..." : "Abort"}
        </Button>
      </Stack>
    </div>
  );
}
