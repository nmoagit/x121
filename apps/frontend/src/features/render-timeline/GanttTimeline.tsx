/**
 * SVG-based Gantt chart for the render queue timeline (PRD-90).
 *
 * Workers are rows on the Y-axis, time flows on the X-axis.
 * Each job is a colored rectangle (color by status).
 * A red vertical line marks the current time.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import { JobBlock } from "./JobBlock";
import { LANE_HEIGHT, WorkerLaneHeader } from "./WorkerLaneHeader";
import {
  HEADER_WIDTH,
  MARKER_INTERVALS,
  MIN_BLOCK_WIDTH,
  TIME_HEADER_HEIGHT,
  formatMarkerLabel,
} from "./constants";
import type { TimelineJob, WorkerLane, ZoomLevel } from "./types";
import { JOB_STATUS_COLORS, resolveJobStatus } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface GanttTimelineProps {
  jobs: TimelineJob[];
  workers: WorkerLane[];
  windowStart: string;
  windowEnd: string;
  zoom: ZoomLevel;
  statusFilter: Set<string>;
  workerFilter: number | null;
  onJobClick?: (job: TimelineJob) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GanttTimeline({
  jobs,
  workers,
  windowStart,
  windowEnd,
  zoom,
  statusFilter,
  workerFilter,
  onJobClick,
}: GanttTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);

  const startMs = new Date(windowStart).getTime();
  const endMs = new Date(windowEnd).getTime();
  const durationMs = endMs - startMs;

  // Measure container width for responsive SVG
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      containerRef.current = node;

      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            setChartWidth(entry.contentRect.width - HEADER_WIDTH);
          }
        });
        observer.observe(node);
        return () => observer.disconnect();
      }

      // Fallback: measure once synchronously (jsdom returns 0, use default)
      const measured = node.clientWidth - HEADER_WIDTH;
      if (measured > 0) setChartWidth(measured);
    }
  }, []);

  // Filter workers
  const filteredWorkers = useMemo(() => {
    if (workerFilter == null) return workers;
    return workers.filter((w) => w.id === workerFilter);
  }, [workers, workerFilter]);

  // Filter jobs by status and worker
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (statusFilter.size > 0 && !statusFilter.has(resolveJobStatus(job.status_id))) {
        return false;
      }
      if (workerFilter != null && job.worker_id !== workerFilter) {
        return false;
      }
      return true;
    });
  }, [jobs, statusFilter, workerFilter]);

  // Build worker index for Y positioning
  const workerIndex = useMemo(() => {
    const map = new Map<number, number>();
    filteredWorkers.forEach((w, i) => map.set(w.id, i));
    return map;
  }, [filteredWorkers]);

  // Compute time markers
  const markers = useMemo(() => {
    const interval = MARKER_INTERVALS[zoom];
    const result: { x: number; label: string }[] = [];
    const firstMarker = Math.ceil(startMs / interval) * interval;

    for (let t = firstMarker; t <= endMs; t += interval) {
      const x = ((t - startMs) / durationMs) * chartWidth;
      result.push({ x, label: formatMarkerLabel(new Date(t), zoom) });
    }
    return result;
  }, [startMs, endMs, durationMs, chartWidth, zoom]);

  // Current time indicator
  const nowMs = Date.now();
  const nowX =
    nowMs >= startMs && nowMs <= endMs ? ((nowMs - startMs) / durationMs) * chartWidth : null;

  const svgHeight = filteredWorkers.length * LANE_HEIGHT;
  const totalHeight = TIME_HEADER_HEIGHT + svgHeight;

  return (
    <div
      ref={measureRef}
      className="flex overflow-hidden border border-[var(--color-border-default)] rounded-[var(--radius-lg)]"
    >
      {/* Worker lane headers */}
      <div
        className="flex-shrink-0 bg-[var(--color-surface-secondary)] border-r border-[var(--color-border-default)]"
        style={{ width: HEADER_WIDTH }}
      >
        {/* Spacer for time header alignment */}
        <div
          className="border-b border-[var(--color-border-default)] px-3 flex items-center"
          style={{ height: TIME_HEADER_HEIGHT }}
        >
          <span className="text-xs font-medium text-[var(--color-text-muted)]">Workers</span>
        </div>
        {filteredWorkers.map((worker) => (
          <WorkerLaneHeader key={worker.id} worker={worker} />
        ))}
      </div>

      {/* SVG chart area */}
      <div className="flex-1 overflow-x-auto">
        <svg
          width={chartWidth}
          height={totalHeight}
          className="bg-[var(--color-surface-primary)]"
          role="img"
          aria-label="Render queue Gantt timeline"
        >
          {/* Time header background */}
          <rect
            x={0}
            y={0}
            width={chartWidth}
            height={TIME_HEADER_HEIGHT}
            className="fill-[var(--color-surface-secondary)]"
          />

          {/* Time markers */}
          {markers.map((marker, i) => (
            <g key={i}>
              <line
                x1={marker.x}
                y1={TIME_HEADER_HEIGHT}
                x2={marker.x}
                y2={totalHeight}
                className="stroke-[var(--color-border-default)]"
                strokeWidth={1}
                strokeDasharray="4 2"
              />
              <text
                x={marker.x}
                y={TIME_HEADER_HEIGHT - 8}
                className="fill-[var(--color-text-muted)]"
                fontSize={11}
                textAnchor="middle"
              >
                {marker.label}
              </text>
            </g>
          ))}

          {/* Worker lane separators */}
          {filteredWorkers.map((_, i) => (
            <line
              key={i}
              x1={0}
              y1={TIME_HEADER_HEIGHT + (i + 1) * LANE_HEIGHT}
              x2={chartWidth}
              y2={TIME_HEADER_HEIGHT + (i + 1) * LANE_HEIGHT}
              className="stroke-[var(--color-border-default)]"
              strokeWidth={1}
            />
          ))}

          {/* Job blocks -- start/end/lane are pre-computed by the backend */}
          {filteredJobs.map((job) => {
            // Use backend lane, but fall back to workerIndex for filtered views
            const yIndex = job.worker_id != null ? (workerIndex.get(job.worker_id) ?? 0) : 0;
            if (filteredWorkers.length === 0 && job.worker_id != null) return null;

            const jobStartMs = new Date(job.start).getTime();
            const jobEndMs = new Date(job.end).getTime();

            const x = Math.max(0, ((jobStartMs - startMs) / durationMs) * chartWidth);
            const x2 = Math.min(chartWidth, ((jobEndMs - startMs) / durationMs) * chartWidth);
            const width = Math.max(MIN_BLOCK_WIDTH, x2 - x);
            const y = TIME_HEADER_HEIGHT + yIndex * LANE_HEIGHT + 6;
            const height = LANE_HEIGHT - 12;
            const status = resolveJobStatus(job.status_id);
            const color = JOB_STATUS_COLORS[status] ?? "var(--color-text-muted)";

            return (
              <JobBlock
                key={job.job_id}
                job={job}
                x={x}
                y={y}
                width={width}
                height={height}
                color={color}
                onClick={onJobClick}
              />
            );
          })}

          {/* Current time indicator */}
          {nowX != null && (
            <line
              x1={nowX}
              y1={TIME_HEADER_HEIGHT}
              x2={nowX}
              y2={totalHeight}
              stroke="var(--color-action-danger)"
              strokeWidth={2}
              data-testid="now-indicator"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
