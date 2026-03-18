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
  const tooltipContent = total > 0 ? (
    <div className="space-y-0.5 text-xs">
      <div className="font-medium">Jobs</div>
      <div>{jobs.running} running</div>
      <div>{jobs.queued} queued</div>
      <div>{jobs.overallProgress}% overall progress</div>
    </div>
  ) : (
    <div className="text-xs">No active jobs</div>
  );

  return (
    <>
      <Separator />
      <Tooltip content={tooltipContent} side="top">
        <FooterSegment href="/admin/queue" label="Job status">
          <Zap size={14} aria-hidden="true" />
          <span className="tabular-nums">{total}</span>
          <span className="hidden md:inline">{total === 1 ? "job" : "jobs"}</span>
          {total > 0 && <MiniProgressBar progress={jobs.overallProgress} />}
        </FooterSegment>
      </Tooltip>
    </>
  );
}
