/**
 * Tests for WorkerHealthDashboard component (PRD-43).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { WorkerHealthDashboard } from "../WorkerHealthDashboard";
import type { IntegrityScan } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const scan: IntegrityScan = {
  id: 1,
  worker_id: 10,
  scan_type: "full",
  status_id: 3,
  results_json: null,
  models_found: 42,
  models_missing: 2,
  models_corrupted: 0,
  nodes_found: 15,
  nodes_missing: 1,
  started_at: "2026-02-22T10:00:00Z",
  completed_at: "2026-02-22T10:05:00Z",
  triggered_by: 1,
  created_at: "2026-02-22T10:00:00Z",
  updated_at: "2026-02-22T10:05:00Z",
};

const workers = [
  {
    workerId: 10,
    workerName: "Worker A",
    latestScan: scan,
    healthStatus: "warning",
    onStartScan: vi.fn(),
    onRepair: vi.fn(),
  },
  {
    workerId: 20,
    workerName: "Worker B",
    latestScan: null,
    healthStatus: "healthy",
    onStartScan: vi.fn(),
    onRepair: vi.fn(),
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("WorkerHealthDashboard", () => {
  test("renders worker cards", () => {
    renderWithProviders(<WorkerHealthDashboard workers={workers} />);

    expect(screen.getByTestId("worker-card-10")).toBeInTheDocument();
    expect(screen.getByTestId("worker-card-20")).toBeInTheDocument();
    expect(screen.getByText("Worker A")).toBeInTheDocument();
    expect(screen.getByText("Worker B")).toBeInTheDocument();
  });

  test("shows health status colors", () => {
    renderWithProviders(<WorkerHealthDashboard workers={workers} />);

    expect(screen.getByTestId("health-indicator-warning")).toBeInTheDocument();
    expect(screen.getByTestId("health-indicator-healthy")).toBeInTheDocument();
  });

  test("triggers scan when button clicked", () => {
    renderWithProviders(<WorkerHealthDashboard workers={workers} />);

    fireEvent.click(screen.getByTestId("scan-btn-10"));
    expect(workers[0]!.onStartScan).toHaveBeenCalledWith(10, "full");
  });
});
