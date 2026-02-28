import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { EndpointHeatmap } from "../EndpointHeatmap";
import type { HeatmapCell } from "../types";
import { screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn().mockResolvedValue([]) },
}));

const MOCK_HEATMAP: HeatmapCell[] = [
  {
    endpoint: "/api/v1/jobs",
    time_bucket: "2026-02-28T10:00:00Z",
    request_count: 50,
    intensity: 0.5,
  },
  {
    endpoint: "/api/v1/jobs",
    time_bucket: "2026-02-28T11:00:00Z",
    request_count: 100,
    intensity: 1.0,
  },
  {
    endpoint: "/api/v1/scenes",
    time_bucket: "2026-02-28T10:00:00Z",
    request_count: 20,
    intensity: 0.2,
  },
  {
    endpoint: "/api/v1/scenes",
    time_bucket: "2026-02-28T11:00:00Z",
    request_count: 30,
    intensity: 0.3,
  },
];

describe("EndpointHeatmap", () => {
  it("renders loading spinner when loading", () => {
    renderWithProviders(
      <EndpointHeatmap data={undefined} isLoading={true} granularity="1h" period="24h" />,
    );
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("renders empty state with no data", () => {
    renderWithProviders(
      <EndpointHeatmap
        data={[]}
        isLoading={false}
        granularity="1h"
        period="24h"
      />,
    );
    expect(screen.getByText("No heatmap data available.")).toBeInTheDocument();
  });

  it("renders heatmap header with data", () => {
    renderWithProviders(
      <EndpointHeatmap data={MOCK_HEATMAP} isLoading={false} granularity="1h" period="24h" />,
    );
    expect(screen.getByText("Endpoint Heatmap")).toBeInTheDocument();
  });

  it("renders endpoint labels as row headers", () => {
    renderWithProviders(
      <EndpointHeatmap data={MOCK_HEATMAP} isLoading={false} granularity="1h" period="24h" />,
    );
    expect(screen.getByText("/api/v1/jobs")).toBeInTheDocument();
    expect(screen.getByText("/api/v1/scenes")).toBeInTheDocument();
  });

  it("renders heatmap cells with gridcell role", () => {
    renderWithProviders(
      <EndpointHeatmap data={MOCK_HEATMAP} isLoading={false} granularity="1h" period="24h" />,
    );
    const cells = document.querySelectorAll('[role="gridcell"]');
    // 2 endpoints x 2 time buckets = 4 cells
    expect(cells.length).toBe(4);
  });
});
