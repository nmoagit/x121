/**
 * Tests for BudgetDashboard component (PRD-93).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BudgetDashboard } from "../BudgetDashboard";
import type { BudgetStatus, DailyConsumption } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const baseBudgetStatus: BudgetStatus = {
  budget: {
    id: 1,
    project_id: 10,
    budget_gpu_hours: 100,
    period_type: "monthly",
    period_start: "2026-02-01T00:00:00Z",
    warning_threshold_pct: 75,
    critical_threshold_pct: 90,
    hard_limit_enabled: true,
    rollover_enabled: false,
    created_by: 1,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-20T00:00:00Z",
  },
  consumed_gpu_hours: 45,
  remaining_gpu_hours: 55,
  consumed_pct: 45.0,
  trend: {
    days_until_exhaustion: 12,
    daily_avg: 2.25,
    trend_direction: "stable",
  },
};

const criticalBudgetStatus: BudgetStatus = {
  ...baseBudgetStatus,
  consumed_gpu_hours: 95,
  remaining_gpu_hours: 5,
  consumed_pct: 95.0,
  trend: {
    days_until_exhaustion: 2,
    daily_avg: 4.75,
    trend_direction: "increasing",
  },
};

const sampleHistory: DailyConsumption[] = [
  { day: "2026-02-18", total_gpu_hours: 2.1 },
  { day: "2026-02-19", total_gpu_hours: 3.5 },
  { day: "2026-02-20", total_gpu_hours: 1.8 },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("BudgetDashboard", () => {
  test("shows empty state when status is null", () => {
    renderWithProviders(<BudgetDashboard status={null} />);

    expect(screen.getByTestId("budget-dashboard-empty")).toBeInTheDocument();
    expect(screen.getByText(/no budget configured/i)).toBeInTheDocument();
  });

  test("renders budget stats correctly", () => {
    renderWithProviders(<BudgetDashboard status={baseBudgetStatus} />);

    expect(screen.getByTestId("budget-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("stat-budget")).toHaveTextContent("100.0h");
    expect(screen.getByTestId("stat-consumed")).toHaveTextContent("45.0h");
    expect(screen.getByTestId("stat-remaining")).toHaveTextContent("55.0h");
  });

  test("renders period type badge", () => {
    renderWithProviders(<BudgetDashboard status={baseBudgetStatus} />);

    expect(screen.getByText("Monthly")).toBeInTheDocument();
  });

  test("shows trend projection", () => {
    renderWithProviders(<BudgetDashboard status={baseBudgetStatus} />);

    expect(screen.getByTestId("trend-projection")).toBeInTheDocument();
    expect(screen.getByText("Stable")).toBeInTheDocument();
    expect(screen.getByText("2.25h")).toBeInTheDocument();
    expect(screen.getByText("12d")).toBeInTheDocument();
  });

  test("shows progress bar with correct fill", () => {
    renderWithProviders(<BudgetDashboard status={baseBudgetStatus} />);

    const fill = screen.getByTestId("budget-progress-fill");
    expect(fill).toHaveStyle({ width: "45%" });
  });

  test("progress bar uses danger color at critical threshold", () => {
    renderWithProviders(<BudgetDashboard status={criticalBudgetStatus} />);

    const fill = screen.getByTestId("budget-progress-fill");
    expect(fill.className).toContain("danger");
  });

  test("renders consumption chart when history provided", () => {
    renderWithProviders(
      <BudgetDashboard status={baseBudgetStatus} history={sampleHistory} />,
    );

    expect(screen.getByTestId("consumption-chart")).toBeInTheDocument();
  });

  test("hides consumption chart when no history", () => {
    renderWithProviders(<BudgetDashboard status={baseBudgetStatus} />);

    expect(screen.queryByTestId("consumption-chart")).not.toBeInTheDocument();
  });

  test("trend shows dashes when days_until_exhaustion is null", () => {
    const statusWithNullExhaustion: BudgetStatus = {
      ...baseBudgetStatus,
      trend: {
        ...baseBudgetStatus.trend,
        days_until_exhaustion: null,
      },
    };
    renderWithProviders(<BudgetDashboard status={statusWithNullExhaustion} />);

    expect(screen.getByText("--")).toBeInTheDocument();
  });
});
