/**
 * Subscribes to job completion/failure events and shows toast notifications.
 *
 * Uses the existing Toast system (PRD-029 useToast) and event bus (PRD-010).
 * Activate this hook once at the app level — it handles all job notifications.
 */

import { useToast } from "@/components/composite/useToast";
import { useEventBus } from "@/hooks/useEventBus";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface JobCompletedEvent {
  jobId: string;
  jobName: string;
  segmentId?: string;
}

interface JobFailedEvent {
  jobId: string;
  jobName: string;
  errorMessage?: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const TOAST_DURATION = 5000;

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useJobToasts(): void {
  const { addToast } = useToast();

  useEventBus<JobCompletedEvent>("job.completed", (event) => {
    addToast({
      message: `Generation complete: ${event.jobName}`,
      variant: "success",
      duration: TOAST_DURATION,
    });
  });

  useEventBus<JobFailedEvent>("job.failed", (event) => {
    const detail = event.errorMessage ? ` — ${event.errorMessage}` : "";
    addToast({
      message: `Generation failed: ${event.jobName}${detail}`,
      variant: "error",
      duration: TOAST_DURATION,
    });
  });
}
