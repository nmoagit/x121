import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { RequestVolumeChart } from "../RequestVolumeChart";
import type { ApiMetric } from "../types";
import { screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn().mockResolvedValue([]) },
}));

const MOCK_METRICS: ApiMetric[] = [
  {
    id: 1,
    period_start: "2026-02-28T10:00:00Z",
    period_granularity: "1h",
    endpoint: "/api/v1/jobs",
    http_method: "GET",
    api_key_id: null,
    request_count: 120,
    error_count_4xx: 3,
    error_count_5xx: 1,
    response_time_p50_ms: 45,
    response_time_p95_ms: 180,
    response_time_p99_ms: 350,
    response_time_avg_ms: 72,
    total_request_bytes: 24000,
    total_response_bytes: 960000,
    created_at: "2026-02-28T10:00:00Z",
  },
  {
    id: 2,
    period_start: "2026-02-28T11:00:00Z",
    period_granularity: "1h",
    endpoint: "/api/v1/jobs",
    http_method: "GET",
    api_key_id: null,
    request_count: 150,
    error_count_4xx: 5,
    error_count_5xx: 0,
    response_time_p50_ms: 50,
    response_time_p95_ms: 200,
    response_time_p99_ms: 400,
    response_time_avg_ms: 85,
    total_request_bytes: 30000,
    total_response_bytes: 1200000,
    created_at: "2026-02-28T11:00:00Z",
  },
];

describe("RequestVolumeChart", () => {
  it("renders loading spinner when loading", () => {
    renderWithProviders(<RequestVolumeChart data={[]} isLoading={true} />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("renders empty state with no data", () => {
    renderWithProviders(<RequestVolumeChart data={[]} isLoading={false} />);
    expect(screen.getByText("No request volume data available.")).toBeInTheDocument();
  });

  it("renders chart title with data", () => {
    renderWithProviders(<RequestVolumeChart data={MOCK_METRICS} isLoading={false} />);
    expect(screen.getByText("Request Volume")).toBeInTheDocument();
  });
});
