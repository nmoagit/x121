/**
 * Tests for FailureTrendChart component (PRD-64).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { FailureTrendChart } from "../FailureTrendChart";
import type { TrendPoint } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockTrendData: TrendPoint[] = [
  { period: "2026-02-01", failure_rate: 0.45, sample_count: 20 },
  { period: "2026-02-08", failure_rate: 0.35, sample_count: 25 },
  { period: "2026-02-15", failure_rate: 0.2, sample_count: 30 },
];

vi.mock("../hooks/use-failure-analytics", () => ({
  useFailureTrends: () => ({
    data: mockTrendData,
    isPending: false,
    isError: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("FailureTrendChart", () => {
  test("renders trend chart container", () => {
    renderWithProviders(<FailureTrendChart patternId={1} />);

    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
  });

  test("renders trend data points", () => {
    renderWithProviders(<FailureTrendChart patternId={1} />);

    const points = screen.getAllByTestId("trend-point");
    expect(points).toHaveLength(3);
  });

  test("displays failure rate percentages", () => {
    renderWithProviders(<FailureTrendChart patternId={1} />);

    expect(screen.getByText("45.0%")).toBeInTheDocument();
    expect(screen.getByText("35.0%")).toBeInTheDocument();
    expect(screen.getByText("20.0%")).toBeInTheDocument();
  });

  test("displays sample counts", () => {
    renderWithProviders(<FailureTrendChart patternId={1} />);

    expect(screen.getByText("20 samples")).toBeInTheDocument();
    expect(screen.getByText("25 samples")).toBeInTheDocument();
    expect(screen.getByText("30 samples")).toBeInTheDocument();
  });

  test("renders period selector buttons", () => {
    renderWithProviders(<FailureTrendChart patternId={1} />);

    expect(screen.getByTestId("period-7")).toBeInTheDocument();
    expect(screen.getByTestId("period-30")).toBeInTheDocument();
    expect(screen.getByTestId("period-90")).toBeInTheDocument();
  });
});
