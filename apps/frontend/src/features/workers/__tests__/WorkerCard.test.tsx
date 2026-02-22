import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { WorkerCard } from "../WorkerCard";

import type { Worker } from "../types";

const baseWorker: Worker = {
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
  last_heartbeat_at: new Date().toISOString(),
  registered_at: "2026-01-01T00:00:00Z",
  decommissioned_at: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
  },
}));

describe("WorkerCard", () => {
  it("renders the worker name", () => {
    renderWithProviders(<WorkerCard worker={baseWorker} />);
    expect(screen.getByText("gpu-worker-01")).toBeInTheDocument();
  });

  it("shows the correct status badge", () => {
    renderWithProviders(<WorkerCard worker={baseWorker} />);
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it("displays GPU information", () => {
    renderWithProviders(<WorkerCard worker={baseWorker} />);
    expect(screen.getByText(/NVIDIA A100 x2/)).toBeInTheDocument();
  });

  it("displays worker tags", () => {
    renderWithProviders(<WorkerCard worker={baseWorker} />);
    expect(screen.getByText("gpu")).toBeInTheDocument();
    expect(screen.getByText("a100")).toBeInTheDocument();
  });
});
