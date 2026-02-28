import { renderWithProviders } from "@/lib/test-utils";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GanttTimeline } from "../GanttTimeline";
import type { TimelineJob, WorkerLane } from "../types";

/* --------------------------------------------------------------------------
   Mock API (tooltip sub-components may call hooks internally)
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
  },
}));

/* --------------------------------------------------------------------------
   Test data (matches backend TimelineJobResponse / WorkerLaneResponse shapes)
   -------------------------------------------------------------------------- */

const workers: WorkerLane[] = [
  { id: 1, name: "gpu-worker-01", status_id: 2, current_job_id: 1 },
  { id: 2, name: "gpu-worker-02", status_id: 1, current_job_id: null },
];

const jobs: TimelineJob[] = [
  {
    job_id: 101,
    worker_id: 1,
    worker_name: "gpu-worker-01",
    status_id: 2,
    priority: 5,
    job_type: "render",
    progress_percent: 42,
    start: "2026-02-28T10:05:00Z",
    end: "2026-02-28T10:15:00Z",
    lane: 1,
  },
  {
    job_id: 102,
    worker_id: 2,
    worker_name: "gpu-worker-02",
    status_id: 3,
    priority: 0,
    job_type: "render",
    progress_percent: 100,
    start: "2026-02-28T09:05:00Z",
    end: "2026-02-28T09:30:00Z",
    lane: 2,
  },
];

const allStatuses = new Set(["pending", "running", "completed", "failed"]);

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("GanttTimeline", () => {
  it("renders the SVG timeline chart", () => {
    renderWithProviders(
      <GanttTimeline
        jobs={jobs}
        workers={workers}
        windowStart="2026-02-28T08:00:00Z"
        windowEnd="2026-02-28T14:00:00Z"
        zoom="6h"
        statusFilter={allStatuses}
        workerFilter={null}
      />,
    );

    const svg = screen.getByRole("img", { name: /Gantt timeline/i });
    expect(svg).toBeInTheDocument();
  });

  it("renders job blocks as SVG rects", () => {
    renderWithProviders(
      <GanttTimeline
        jobs={jobs}
        workers={workers}
        windowStart="2026-02-28T08:00:00Z"
        windowEnd="2026-02-28T14:00:00Z"
        zoom="6h"
        statusFilter={allStatuses}
        workerFilter={null}
      />,
    );

    expect(screen.getByTestId("job-block-101")).toBeInTheDocument();
    expect(screen.getByTestId("job-block-102")).toBeInTheDocument();
  });

  it("renders worker lane headers", () => {
    renderWithProviders(
      <GanttTimeline
        jobs={jobs}
        workers={workers}
        windowStart="2026-02-28T08:00:00Z"
        windowEnd="2026-02-28T14:00:00Z"
        zoom="6h"
        statusFilter={allStatuses}
        workerFilter={null}
      />,
    );

    // Worker names appear in lane headers (and possibly in tooltip content)
    expect(screen.getAllByText("gpu-worker-01").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("gpu-worker-02").length).toBeGreaterThanOrEqual(1);
  });

  it("filters jobs by status", () => {
    const completedOnly = new Set(["completed"]);

    renderWithProviders(
      <GanttTimeline
        jobs={jobs}
        workers={workers}
        windowStart="2026-02-28T08:00:00Z"
        windowEnd="2026-02-28T14:00:00Z"
        zoom="6h"
        statusFilter={completedOnly}
        workerFilter={null}
      />,
    );

    // Job 102 is completed, should be visible
    expect(screen.getByTestId("job-block-102")).toBeInTheDocument();
    // Job 101 is running, should not be visible
    expect(screen.queryByTestId("job-block-101")).not.toBeInTheDocument();
  });

  it("filters jobs by worker", () => {
    renderWithProviders(
      <GanttTimeline
        jobs={jobs}
        workers={workers}
        windowStart="2026-02-28T08:00:00Z"
        windowEnd="2026-02-28T14:00:00Z"
        zoom="6h"
        statusFilter={allStatuses}
        workerFilter={1}
      />,
    );

    // Only worker 1's job should be visible
    expect(screen.getByTestId("job-block-101")).toBeInTheDocument();
    expect(screen.queryByTestId("job-block-102")).not.toBeInTheDocument();
  });

  it("shows Workers label in the header", () => {
    renderWithProviders(
      <GanttTimeline
        jobs={jobs}
        workers={workers}
        windowStart="2026-02-28T08:00:00Z"
        windowEnd="2026-02-28T14:00:00Z"
        zoom="6h"
        statusFilter={allStatuses}
        workerFilter={null}
      />,
    );

    expect(screen.getByText("Workers")).toBeInTheDocument();
  });
});
