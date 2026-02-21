import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { QueueStatusView } from "../QueueStatusView";

// Mock the api module to prevent real HTTP requests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path === "/queue") {
        return Promise.resolve({
          total_queued: 3,
          total_running: 1,
          total_scheduled: 1,
          estimated_wait_secs: 120,
          jobs: [
            {
              id: 1,
              job_type: "render_scene",
              priority: 10,
              submitted_by: 1,
              submitted_at: "2026-02-21T10:00:00Z",
              queue_position: 1,
              scheduled_start_at: null,
              is_off_peak_only: false,
              is_paused: false,
            },
            {
              id: 2,
              job_type: "generate_thumbnails",
              priority: 0,
              submitted_by: 2,
              submitted_at: "2026-02-21T10:01:00Z",
              queue_position: 2,
              scheduled_start_at: null,
              is_off_peak_only: true,
              is_paused: false,
            },
            {
              id: 3,
              job_type: "batch_export",
              priority: -10,
              submitted_by: 1,
              submitted_at: "2026-02-21T10:02:00Z",
              queue_position: 3,
              scheduled_start_at: null,
              is_off_peak_only: false,
              is_paused: true,
            },
          ],
        });
      }
      return Promise.resolve({});
    }),
    post: vi.fn().mockResolvedValue({}),
  },
}));

describe("QueueStatusView", () => {
  it("renders the queue header", async () => {
    renderWithProviders(<QueueStatusView />);

    await waitFor(() => {
      expect(screen.getByText("Job Queue")).toBeInTheDocument();
    });
  });

  it("shows queue counts", async () => {
    renderWithProviders(<QueueStatusView />);

    await waitFor(() => {
      expect(screen.getByText("3 queued")).toBeInTheDocument();
      expect(screen.getByText("1 running")).toBeInTheDocument();
      expect(screen.getByText("1 scheduled")).toBeInTheDocument();
    });
  });

  it("shows estimated wait time", async () => {
    renderWithProviders(<QueueStatusView />);

    await waitFor(() => {
      expect(screen.getByText("Estimated wait: 2m")).toBeInTheDocument();
    });
  });

  it("shows job types in queue", async () => {
    renderWithProviders(<QueueStatusView />);

    await waitFor(() => {
      expect(screen.getByText("render_scene")).toBeInTheDocument();
      expect(screen.getByText("generate_thumbnails")).toBeInTheDocument();
      expect(screen.getByText("batch_export")).toBeInTheDocument();
    });
  });

  it("shows priority labels", async () => {
    renderWithProviders(<QueueStatusView />);

    await waitFor(() => {
      expect(screen.getByText(/Urgent/)).toBeInTheDocument();
      expect(screen.getByText(/Background/)).toBeInTheDocument();
    });
  });

  it("shows paused badge for paused jobs", async () => {
    renderWithProviders(<QueueStatusView />);

    await waitFor(() => {
      expect(screen.getByText("Paused")).toBeInTheDocument();
    });
  });

  it("shows off-peak indicator", async () => {
    renderWithProviders(<QueueStatusView />);

    await waitFor(() => {
      expect(screen.getByText(/Off-peak only/)).toBeInTheDocument();
    });
  });

  it("shows pause buttons for non-paused jobs", async () => {
    renderWithProviders(<QueueStatusView />);

    await waitFor(() => {
      const pauseButtons = screen.getAllByRole("button", { name: /Pause/ });
      expect(pauseButtons.length).toBe(2);
    });
  });

  it("shows resume button for paused jobs", async () => {
    renderWithProviders(<QueueStatusView />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Resume batch_export/ }),
      ).toBeInTheDocument();
    });
  });
});
