/**
 * Tests for QuotaStatusWidget component (PRD-93).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { QuotaStatusWidget } from "../QuotaStatusWidget";
import type { QuotaStatus } from "../types";

/* --------------------------------------------------------------------------
   Test data -- consumed_pct is in 0-100 range (matching backend)
   -------------------------------------------------------------------------- */

const healthyQuota: QuotaStatus = {
  quota: {
    id: 1,
    user_id: 5,
    quota_gpu_hours: 10,
    period_type: "daily",
    period_start: new Date().toISOString(),
    hard_limit_enabled: true,
    created_by: 1,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-20T00:00:00Z",
  },
  consumed_gpu_hours: 3,
  remaining_gpu_hours: 7,
  consumed_pct: 30.0,
};

const warningQuota: QuotaStatus = {
  ...healthyQuota,
  consumed_gpu_hours: 8,
  remaining_gpu_hours: 2,
  consumed_pct: 80.0,
};

const criticalQuota: QuotaStatus = {
  ...healthyQuota,
  consumed_gpu_hours: 9.5,
  remaining_gpu_hours: 0.5,
  consumed_pct: 95.0,
};

const weeklyQuota: QuotaStatus = {
  ...healthyQuota,
  quota: {
    ...healthyQuota.quota,
    period_type: "weekly",
  },
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("QuotaStatusWidget", () => {
  test("shows empty state when status is null", () => {
    renderWithProviders(<QuotaStatusWidget status={null} />);

    expect(screen.getByTestId("quota-widget-empty")).toBeInTheDocument();
    expect(screen.getByText(/no quota assigned/i)).toBeInTheDocument();
  });

  test("renders consumed and total values", () => {
    renderWithProviders(<QuotaStatusWidget status={healthyQuota} />);

    expect(screen.getByTestId("quota-widget")).toBeInTheDocument();
    expect(screen.getByTestId("quota-consumed")).toHaveTextContent("3.0h");
    expect(screen.getByTestId("quota-total")).toHaveTextContent("10.0h");
  });

  test("shows period type badge", () => {
    renderWithProviders(<QuotaStatusWidget status={healthyQuota} />);

    expect(screen.getByText("Daily")).toBeInTheDocument();
  });

  test("shows weekly period type", () => {
    renderWithProviders(<QuotaStatusWidget status={weeklyQuota} />);

    expect(screen.getByText("Weekly")).toBeInTheDocument();
  });

  test("progress bar reflects consumption", () => {
    renderWithProviders(<QuotaStatusWidget status={healthyQuota} />);

    const fill = screen.getByTestId("quota-progress-fill");
    expect(fill).toHaveStyle({ width: "30%" });
  });

  test("progress bar uses warning color at 80%", () => {
    renderWithProviders(<QuotaStatusWidget status={warningQuota} />);

    const fill = screen.getByTestId("quota-progress-fill");
    expect(fill.className).toContain("warning");
  });

  test("progress bar uses danger color at 95%", () => {
    renderWithProviders(<QuotaStatusWidget status={criticalQuota} />);

    const fill = screen.getByTestId("quota-progress-fill");
    expect(fill.className).toContain("danger");
  });

  test("shows percentage badge", () => {
    renderWithProviders(<QuotaStatusWidget status={healthyQuota} />);

    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  test("shows reset countdown", () => {
    renderWithProviders(<QuotaStatusWidget status={healthyQuota} />);

    expect(screen.getByTestId("quota-reset")).toBeInTheDocument();
    // Since period_start is "now", the countdown should show a time value
    const resetText = screen.getByTestId("quota-reset").textContent;
    expect(resetText).toBeTruthy();
  });

  test("clamps progress bar at 100% when over quota", () => {
    const overQuota: QuotaStatus = {
      ...healthyQuota,
      consumed_gpu_hours: 12,
      remaining_gpu_hours: -2,
      consumed_pct: 120.0,
    };
    renderWithProviders(<QuotaStatusWidget status={overQuota} />);

    const fill = screen.getByTestId("quota-progress-fill");
    expect(fill).toHaveStyle({ width: "100%" });
  });
});
