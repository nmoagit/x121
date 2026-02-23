/**
 * Tests for EstimationCard component (PRD-61).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { EstimationCard } from "../EstimationCard";
import type { BatchEstimate } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const highConfidenceEstimate: BatchEstimate = {
  total_scenes: 3,
  total_gpu_hours: 2.5,
  wall_clock_hours: 0.833,
  total_disk_gb: 4.25,
  worker_count: 3,
  confidence: "high",
  scene_estimates: [
    { segments_needed: 6, gpu_seconds: 3600, disk_mb: 1536, confidence: "high" },
    { segments_needed: 4, gpu_seconds: 2400, disk_mb: 1024, confidence: "high" },
    { segments_needed: 5, gpu_seconds: 3000, disk_mb: 1792, confidence: "medium" },
  ],
};

const noConfidenceEstimate: BatchEstimate = {
  total_scenes: 1,
  total_gpu_hours: 0,
  wall_clock_hours: 0,
  total_disk_gb: 0,
  worker_count: 1,
  confidence: "none",
  scene_estimates: [
    { segments_needed: 6, gpu_seconds: 0, disk_mb: 0, confidence: "none" },
  ],
};

const emptyEstimate: BatchEstimate = {
  total_scenes: 0,
  total_gpu_hours: 0,
  wall_clock_hours: 0,
  total_disk_gb: 0,
  worker_count: 1,
  confidence: "none",
  scene_estimates: [],
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("EstimationCard", () => {
  test("renders batch estimate summary with stats", () => {
    renderWithProviders(<EstimationCard estimate={highConfidenceEstimate} />);

    expect(screen.getByTestId("estimation-card")).toBeInTheDocument();
    expect(screen.getByTestId("stat-gpu-hours")).toHaveTextContent("2.5h");
    expect(screen.getByTestId("stat-disk-space")).toHaveTextContent("4.25 GB");
    expect(screen.getByTestId("stat-scenes")).toHaveTextContent("3");
  });

  test("shows 'no estimate' when confidence is none", () => {
    renderWithProviders(<EstimationCard estimate={noConfidenceEstimate} />);

    expect(screen.getByTestId("estimation-card-empty")).toBeInTheDocument();
    expect(screen.getByText(/no estimate available/i)).toBeInTheDocument();
  });

  test("shows 'no estimate' when estimate is null", () => {
    renderWithProviders(<EstimationCard estimate={null} />);

    expect(screen.getByTestId("estimation-card-empty")).toBeInTheDocument();
  });

  test("shows high confidence badge", () => {
    renderWithProviders(<EstimationCard estimate={highConfidenceEstimate} />);

    expect(screen.getByTestId("confidence-badge")).toHaveTextContent("High confidence");
  });

  test("displays worker count in wall clock stat", () => {
    renderWithProviders(<EstimationCard estimate={highConfidenceEstimate} />);

    expect(screen.getByTestId("stat-wall-clock")).toHaveTextContent("(3w)");
  });

  test("toggles per-scene breakdown on click", () => {
    renderWithProviders(<EstimationCard estimate={highConfidenceEstimate} />);

    // Breakdown should not be visible initially.
    expect(screen.queryByTestId("scene-breakdown")).not.toBeInTheDocument();

    // Click to expand.
    fireEvent.click(
      screen.getByRole("button", { name: /toggle per-scene breakdown/i }),
    );
    expect(screen.getByTestId("scene-breakdown")).toBeInTheDocument();

    // Click to collapse.
    fireEvent.click(
      screen.getByRole("button", { name: /toggle per-scene breakdown/i }),
    );
    expect(screen.queryByTestId("scene-breakdown")).not.toBeInTheDocument();
  });

  test("handles empty scene list gracefully", () => {
    renderWithProviders(<EstimationCard estimate={emptyEstimate} />);

    // With 0 scenes and confidence "none", it should show the empty state.
    expect(screen.getByTestId("estimation-card-empty")).toBeInTheDocument();
  });
});
