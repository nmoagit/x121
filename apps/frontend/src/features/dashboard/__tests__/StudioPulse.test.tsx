import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { StudioPulse } from "../StudioPulse";

// Mock the api module to prevent real HTTP requests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/active-tasks")) {
        return Promise.resolve([
          {
            job_id: 1,
            job_type: "render_scene",
            status: "running",
            progress_pct: 45,
            progress_message: "Processing frame 45/100",
            elapsed_seconds: 120,
            worker_id: 1,
            submitted_by: 1,
            submitted_at: "2026-02-21T10:00:00Z",
          },
          {
            job_id: 2,
            job_type: "generate_image",
            status: "pending",
            progress_pct: 0,
            progress_message: null,
            elapsed_seconds: null,
            worker_id: null,
            submitted_by: 1,
            submitted_at: "2026-02-21T10:01:00Z",
          },
        ]);
      }
      if (path.includes("/project-progress")) {
        return Promise.resolve([
          {
            project_id: 1,
            project_name: "Project Alpha",
            scenes_approved: 8,
            scenes_total: 10,
            progress_pct: 80.0,
            status_color: "green",
          },
          {
            project_id: 2,
            project_name: "Project Beta",
            scenes_approved: 2,
            scenes_total: 10,
            progress_pct: 20.0,
            status_color: "red",
          },
        ]);
      }
      if (path.includes("/disk-health")) {
        return Promise.resolve({
          total_bytes: 1_099_511_627_776,
          used_bytes: 659_706_976_666,
          free_bytes: 439_804_651_110,
          usage_pct: 0.6,
          warning_threshold: 0.8,
          critical_threshold: 0.9,
        });
      }
      if (path.includes("/activity-feed")) {
        return Promise.resolve([
          {
            id: 1,
            event_type: "job.completed",
            category: "job",
            source_entity_type: "job",
            source_entity_id: 10,
            actor_user_id: 1,
            actor_name: "alice",
            payload: {},
            created_at: "2026-02-21T09:55:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    }),
    put: vi.fn().mockResolvedValue({}),
  },
}));

describe("StudioPulse", () => {
  it("renders the dashboard title", async () => {
    renderWithProviders(<StudioPulse />);

    await waitFor(() => {
      expect(screen.getByText("Studio Pulse")).toBeInTheDocument();
    });
  });

  it("renders all four widget titles", async () => {
    renderWithProviders(<StudioPulse />);

    await waitFor(() => {
      expect(screen.getByText("Active Tasks")).toBeInTheDocument();
      expect(screen.getByText("Project Progress")).toBeInTheDocument();
      expect(screen.getByText("Disk Health")).toBeInTheDocument();
      expect(screen.getByText("Activity Feed")).toBeInTheDocument();
    });
  });

  it("shows active task data when loaded", async () => {
    renderWithProviders(<StudioPulse />);

    await waitFor(() => {
      expect(screen.getByText("render_scene")).toBeInTheDocument();
      expect(screen.getByText("generate_image")).toBeInTheDocument();
    });
  });

  it("shows project progress data when loaded", async () => {
    renderWithProviders(<StudioPulse />);

    await waitFor(() => {
      expect(screen.getByText("Project Alpha")).toBeInTheDocument();
      expect(screen.getByText("8/10 scenes")).toBeInTheDocument();
      expect(screen.getByText("Project Beta")).toBeInTheDocument();
      expect(screen.getByText("2/10 scenes")).toBeInTheDocument();
    });
  });

  it("shows disk health usage", async () => {
    renderWithProviders(<StudioPulse />);

    await waitFor(() => {
      expect(screen.getByText("60%")).toBeInTheDocument();
    });
  });

  it("shows activity feed events", async () => {
    renderWithProviders(<StudioPulse />);

    await waitFor(() => {
      expect(screen.getByText(/alice.*Job completed/i)).toBeInTheDocument();
    });
  });

  it("shows loading spinners initially", () => {
    renderWithProviders(<StudioPulse />);

    // Spinners should be rendered while data loads.
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });
});
