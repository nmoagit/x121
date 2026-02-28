import { renderWithProviders } from "@/lib/test-utils";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RenderTimelinePage } from "../RenderTimelinePage";
import type { TimelineData } from "../types";

/* --------------------------------------------------------------------------
   Mock data (matches backend TimelineResponse shape)
   -------------------------------------------------------------------------- */

const mockTimelineData: TimelineData = {
  zoom: "6h",
  from: "2026-02-28T08:00:00Z",
  to: "2026-02-28T14:00:00Z",
  idle_workers: 0,
  busy_workers: 1,
  jobs: [
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
  ],
  workers: [{ id: 1, name: "gpu-worker-01", status_id: 2, current_job_id: 101 }],
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.startsWith("/queue/timeline")) {
        return Promise.resolve(mockTimelineData);
      }
      return Promise.resolve({});
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("RenderTimelinePage", () => {
  it("renders the page title", async () => {
    renderWithProviders(<RenderTimelinePage />);

    await waitFor(() => {
      expect(screen.getByText("Render Queue Timeline")).toBeInTheDocument();
    });
  });

  it("renders zoom controls", async () => {
    renderWithProviders(<RenderTimelinePage />);

    await waitFor(() => {
      expect(screen.getByText("Zoom")).toBeInTheDocument();
    });
  });

  it("renders status filter checkboxes", async () => {
    renderWithProviders(<RenderTimelinePage />);

    await waitFor(() => {
      expect(screen.getByText("Status:")).toBeInTheDocument();
      expect(screen.getByText("pending")).toBeInTheDocument();
      expect(screen.getByText("running")).toBeInTheDocument();
      expect(screen.getByText("completed")).toBeInTheDocument();
    });
  });

  it("renders the Gantt chart after data loads", async () => {
    renderWithProviders(<RenderTimelinePage />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: /Gantt timeline/i })).toBeInTheDocument();
    });
  });

  it("renders worker lane headers after data loads", async () => {
    renderWithProviders(<RenderTimelinePage />);

    await waitFor(() => {
      // Worker name appears in lane header, worker filter dropdown, and tooltip
      expect(screen.getAllByText("gpu-worker-01").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders job blocks after data loads", async () => {
    renderWithProviders(<RenderTimelinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("job-block-101")).toBeInTheDocument();
    });
  });
});
