/**
 * Individual job block rendered as an SVG rect inside the Gantt chart (PRD-90).
 *
 * Shows a colored rectangle with tooltip on hover and click handler.
 */

import { Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";

import { JobBlockTooltip } from "./JobBlockTooltip";
import type { TimelineJob } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface JobBlockProps {
  job: TimelineJob;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  onClick?: (job: TimelineJob) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function JobBlock({ job, x, y, width, height, color, onClick }: JobBlockProps) {
  return (
    <Tooltip content={<JobBlockTooltip job={job} />} side="top">
      <g
        className={cn(
          "cursor-pointer",
          "transition-opacity duration-[var(--duration-fast)]",
          "hover:opacity-80",
        )}
        onClick={() => onClick?.(job)}
        role="button"
        tabIndex={0}
        aria-label={`Job ${job.job_id}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClick?.(job);
        }}
      >
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={4}
          fill={color}
          data-testid={`job-block-${job.job_id}`}
        />
        {/* Job label (only if block is wide enough) */}
        {width > 60 && (
          <text
            x={x + 6}
            y={y + height / 2 + 4}
            fontSize={11}
            className="fill-[var(--color-text-inverse)] pointer-events-none"
          >
            #{job.job_id}
          </text>
        )}
      </g>
    </Tooltip>
  );
}
