import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { PowerDashboard } from "../PowerDashboard";

// vi.mock is hoisted — all data must be inline (no external references).
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path === "/admin/power/workers/status") {
        return Promise.resolve([
          {
            worker_id: 1,
            worker_name: "gpu-worker-01",
            power_state: "on",
            idle_timeout_minutes: 30,
            wake_method: "api",
            gpu_tdp_watts: 350,
            min_fleet_member: true,
          },
          {
            worker_id: 2,
            worker_name: "gpu-worker-02",
            power_state: "sleeping",
            idle_timeout_minutes: 15,
            wake_method: "wol",
            gpu_tdp_watts: 300,
            min_fleet_member: false,
          },
          {
            worker_id: 3,
            worker_name: "gpu-worker-03",
            power_state: "idle",
            idle_timeout_minutes: 30,
            wake_method: null,
            gpu_tdp_watts: null,
            min_fleet_member: false,
          },
        ]);
      }
      if (path === "/admin/power/fleet") {
        return Promise.resolve({
          default_idle_timeout_minutes: 30,
          default_wake_method: null,
          fleet_schedules: [],
        });
      }
      if (path.startsWith("/admin/power/consumption")) {
        return Promise.resolve({
          worker_id: null,
          total_active_minutes: 600,
          total_idle_minutes: 200,
          total_off_minutes: 640,
          total_estimated_kwh: 42.5,
          always_on_kwh: 65.4,
          savings_pct: 35,
          entries: [
            {
              worker_id: 1,
              date: "2026-02-27",
              active_minutes: 600,
              idle_minutes: 200,
              off_minutes: 640,
              estimated_kwh: 15.2,
            },
          ],
        });
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
  },
}));

describe("PowerDashboard", () => {
  it("renders the page title", async () => {
    renderWithProviders(<PowerDashboard />);

    await waitFor(() => {
      expect(screen.getByText("GPU Power Management")).toBeInTheDocument();
    });
  });

  it("renders fleet power state counts", async () => {
    renderWithProviders(<PowerDashboard />);

    await waitFor(() => {
      // State labels appear in both stat cards and power badges, so use getAllByText.
      expect(screen.getAllByText("On").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Idle").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Sleeping").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Shutting Down")).toBeInTheDocument();
      expect(screen.getByText("Waking")).toBeInTheDocument();
    });
  });

  it("renders worker power cards when data loads", async () => {
    renderWithProviders(<PowerDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/gpu-worker-01/)).toBeInTheDocument();
      expect(screen.getByText(/gpu-worker-02/)).toBeInTheDocument();
      expect(screen.getByText(/gpu-worker-03/)).toBeInTheDocument();
    });
  });

  it("shows fleet settings when loaded", async () => {
    renderWithProviders(<PowerDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Fleet Power Settings")).toBeInTheDocument();
    });
  });

  it("shows a loading spinner initially", () => {
    renderWithProviders(<PowerDashboard />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });
});
