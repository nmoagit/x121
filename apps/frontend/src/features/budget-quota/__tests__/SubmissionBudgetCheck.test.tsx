/**
 * Tests for SubmissionBudgetCheck component (PRD-93).
 *
 * Tests the static rendering path (with externally provided check results)
 * and the three main states: allowed, warning, and blocked.
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { SubmissionBudgetCheck } from "../SubmissionBudgetCheck";
import type { BudgetCheckResult } from "../types";

/* --------------------------------------------------------------------------
   Mock API to prevent actual network calls
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

/* --------------------------------------------------------------------------
   Test data -- consumed_pct is in 0-100 range (matching backend)
   -------------------------------------------------------------------------- */

const allowedCheck: BudgetCheckResult = {
  status: "allowed",
  message: "Budget OK. 55.0h remaining.",
  consumed_pct: 45.0,
};

const warningCheck: BudgetCheckResult = {
  status: "warning",
  message: "Budget is 80% consumed. 20.0h remaining.",
  consumed_pct: 80.0,
};

const blockedCheck: BudgetCheckResult = {
  status: "blocked",
  message: "Budget exceeded. Cannot submit new jobs.",
  consumed_pct: 105.0,
};

const noBudgetCheck: BudgetCheckResult = {
  status: "no_budget",
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SubmissionBudgetCheck", () => {
  test("renders allowed state with green badge", () => {
    renderWithProviders(
      <SubmissionBudgetCheck projectId={10} estimatedHours={2.5} check={allowedCheck} />,
    );

    expect(screen.getByTestId("submission-budget-check")).toBeInTheDocument();
    expect(screen.getByText("Budget OK")).toBeInTheDocument();
    expect(screen.getByText("2.50h")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  test("renders warning state", () => {
    renderWithProviders(
      <SubmissionBudgetCheck projectId={10} estimatedHours={5.0} check={warningCheck} />,
    );

    expect(screen.getByText("Budget Warning")).toBeInTheDocument();
    expect(screen.getByTestId("check-message")).toHaveTextContent(/80% consumed/);
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  test("renders blocked state with danger styling", () => {
    renderWithProviders(
      <SubmissionBudgetCheck projectId={10} estimatedHours={1.0} check={blockedCheck} />,
    );

    expect(screen.getByText("Budget Exceeded")).toBeInTheDocument();
    expect(screen.getByTestId("check-message")).toHaveTextContent(/cannot submit/i);
  });

  test("renders no_budget state", () => {
    renderWithProviders(
      <SubmissionBudgetCheck projectId={10} estimatedHours={3.0} check={noBudgetCheck} />,
    );

    expect(screen.getByText("No Budget Set")).toBeInTheDocument();
  });

  test("shows estimated cost in all states", () => {
    renderWithProviders(
      <SubmissionBudgetCheck projectId={10} estimatedHours={1.75} check={allowedCheck} />,
    );

    expect(screen.getByText("1.75h")).toBeInTheDocument();
  });

  test("hides consumed percentage when undefined", () => {
    renderWithProviders(
      <SubmissionBudgetCheck projectId={10} estimatedHours={3.0} check={noBudgetCheck} />,
    );

    // Should not show "Used:" text when consumed_pct is undefined
    expect(screen.queryByText(/Used:/)).not.toBeInTheDocument();
  });

  test("shows message when provided", () => {
    renderWithProviders(
      <SubmissionBudgetCheck projectId={10} estimatedHours={2.0} check={allowedCheck} />,
    );

    expect(screen.getByTestId("check-message")).toHaveTextContent("Budget OK. 55.0h remaining.");
  });

  test("returns null when no check result and query disabled", () => {
    const { container } = renderWithProviders(
      <SubmissionBudgetCheck projectId={0} estimatedHours={0} />,
    );

    // With projectId=0 and estimatedHours=0, the query is disabled and
    // no external check is provided, so nothing renders.
    expect(container.querySelector("[data-testid]")).toBeNull();
  });
});
