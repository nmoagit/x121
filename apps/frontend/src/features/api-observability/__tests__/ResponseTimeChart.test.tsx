import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { ResponseTimeChart } from "../ResponseTimeChart";
import type { ApiMetric } from "../types";
import { screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn().mockResolvedValue([]) },
}));

const MOCK_METRIC: ApiMetric = {
  id: 1,
  period_start: "2026-02-28T10:00:00Z",
  period_granularity: "1h",
  endpoint: "/api/v1/jobs",
  http_method: "GET",
  api_key_id: null,
  request_count: 100,
  error_count_4xx: 2,
  error_count_5xx: 0,
  response_time_p50_ms: 45,
  response_time_p95_ms: 180,
  response_time_p99_ms: 350,
  response_time_avg_ms: 72,
  total_request_bytes: 20000,
  total_response_bytes: 800000,
  created_at: "2026-02-28T10:00:00Z",
};

describe("ResponseTimeChart", () => {
  it("renders loading spinner when loading", () => {
    renderWithProviders(<ResponseTimeChart data={[]} isLoading={true} />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("renders empty state with no data", () => {
    renderWithProviders(<ResponseTimeChart data={[]} isLoading={false} />);
    expect(screen.getByText("No response time data available.")).toBeInTheDocument();
  });

  it("renders chart title with data", () => {
    renderWithProviders(<ResponseTimeChart data={[MOCK_METRIC]} isLoading={false} />);
    expect(screen.getByText("Response Time (ms)")).toBeInTheDocument();
  });
});
