/**
 * Job status segment with mini progress bar.
 * Shows running/queued counts and overall progress.
 */

import { Tooltip } from "@/components/primitives";
import { Zap } from "@/tokens/icons";

import { FooterSegment, MiniProgressBar, Separator } from "./FooterSegment";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface JobSegmentProps {
  jobs: {
    running: number;
    queued: number;
    overallProgress: number;
  };
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function JobSegment({ jobs }: JobSegmentProps) {
  const total = jobs.running + jobs.queued;
  const tooltipText =
    total > 0
      ? `${jobs.running} running, ${jobs.queued} queued — ${jobs.overallProgress}% overall`
      : "No active jobs";

  return (
    <>
      <Separator />
      <Tooltip content={tooltipText} side="top">
        <FooterSegment href="/jobs" label="Job status">
          <Zap size={14} aria-hidden="true" />
          <span className="tabular-nums">{total}</span>
          <span className="hidden md:inline">{total === 1 ? "job" : "jobs"}</span>
          {total > 0 && <MiniProgressBar progress={jobs.overallProgress} />}
        </FooterSegment>
      </Tooltip>
    </>
  );
}
