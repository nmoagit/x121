import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { WorkerDetailPanel } from "../WorkerDetailPanel";

import type { HealthLogEntry, Worker } from "../types";

const mockWorker: Worker = {
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
};

const mockHealthLog: HealthLogEntry[] = [
  {
    id: 1,
    worker_id: 1,
    from_status_id: 3,
    to_status_id: 1,
    reason: "Approved by admin 1",
    transitioned_at: "2026-02-20T10:00:00Z",
  },
];

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/health-log")) {
        return Promise.resolve(mockHealthLog);
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({}),
  },
}));

describe("WorkerDetailPanel", () => {
  const onClose = vi.fn();

  it("renders the health log section", async () => {
    renderWithProviders(
      <WorkerDetailPanel worker={mockWorker} onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Health Log")).toBeInTheDocument();
    });
  });

  it("shows GPU information", () => {
    renderWithProviders(
      <WorkerDetailPanel worker={mockWorker} onClose={onClose} />,
    );

    expect(screen.getByText("GPU Information")).toBeInTheDocument();
    expect(screen.getByText("NVIDIA A100")).toBeInTheDocument();
    expect(screen.getByText("80 GB")).toBeInTheDocument();
  });

  it("displays action buttons for admin actions", () => {
    const unapprovedWorker = { ...mockWorker, is_approved: false };
    const onApprove = vi.fn();
    const onDecommission = vi.fn();

    renderWithProviders(
      <WorkerDetailPanel
        worker={unapprovedWorker}
        onClose={onClose}
        onApprove={onApprove}
        onDecommission={onDecommission}
      />,
    );

    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Decommission")).toBeInTheDocument();
  });
});
