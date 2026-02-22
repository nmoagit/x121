import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { WorkerDashboard } from "../WorkerDashboard";

// vi.mock is hoisted — all data must be inline (no external references).
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path === "/admin/workers") {
        return Promise.resolve([
          {
            id: 1,
            name: "gpu-worker-01",
            hostname: "worker-01.local",
            ip_address: "10.0.0.11",
            gpu_model: "NVIDIA A100",
            gpu_count: 2,
            vram_total_mb: 81920,
            status_id: 1,
            tags: ["gpu", "a100"],
            comfyui_instance_id: null,
            is_approved: true,
            is_enabled: true,
            last_heartbeat_at: "2026-02-20T12:00:00Z",
            registered_at: "2026-01-01T00:00:00Z",
            decommissioned_at: null,
            metadata: {},
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
          {
            id: 2,
            name: "gpu-worker-02",
            hostname: "worker-02.local",
            ip_address: "10.0.0.12",
            gpu_model: "NVIDIA A100",
            gpu_count: 2,
            vram_total_mb: 81920,
            status_id: 2,
            tags: [],
            comfyui_instance_id: null,
            is_approved: true,
            is_enabled: true,
            last_heartbeat_at: "2026-02-20T12:00:00Z",
            registered_at: "2026-01-01T00:00:00Z",
            decommissioned_at: null,
            metadata: {},
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]);
      }
      if (path === "/admin/workers/stats") {
        return Promise.resolve({
          total_workers: 3,
          idle_workers: 1,
          busy_workers: 1,
          offline_workers: 1,
          draining_workers: 0,
          approved_workers: 2,
          enabled_workers: 2,
        });
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
  },
}));

describe("WorkerDashboard", () => {
  it("renders the page title", async () => {
    renderWithProviders(<WorkerDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Worker Pool")).toBeInTheDocument();
    });
  });

  it("renders fleet statistics when loaded", async () => {
    renderWithProviders(<WorkerDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("renders worker cards when loaded", async () => {
    renderWithProviders(<WorkerDashboard />);

    await waitFor(() => {
      expect(screen.getByText("gpu-worker-01")).toBeInTheDocument();
      expect(screen.getByText("gpu-worker-02")).toBeInTheDocument();
    });
  });

  it("shows a loading spinner initially", () => {
    renderWithProviders(<WorkerDashboard />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });
});
