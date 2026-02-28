/**
 * Tests for RegressionReport component (PRD-65).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { RegressionReport } from "../RegressionReport";
import type { RegressionResult, RegressionRun, RunReport, RunReportSummary } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockRun: RegressionRun = {
  id: 1,
  trigger_type: "manual",
  trigger_description: "Manual test run",
  status: "completed",
  total_references: 3,
  completed_count: 3,
  passed_count: 2,
  failed_count: 1,
  started_at: "2026-02-28T10:00:00Z",
  completed_at: "2026-02-28T10:05:00Z",
  triggered_by: 1,
  created_at: "2026-02-28T10:00:00Z",
  updated_at: "2026-02-28T10:05:00Z",
};

const mockResults: RegressionResult[] = [
  {
    id: 1,
    run_id: 1,
    reference_id: 10,
    new_scene_id: 100,
    baseline_scores: { face_confidence: 0.85 },
    new_scores: { face_confidence: 0.9 },
    score_diffs: { face_confidence: 0.05 },
    verdict: "improved",
    error_message: null,
    created_at: "2026-02-28T10:01:00Z",
    updated_at: "2026-02-28T10:01:00Z",
  },
  {
    id: 2,
    run_id: 1,
    reference_id: 11,
    new_scene_id: 101,
    baseline_scores: { face_confidence: 0.9 },
    new_scores: { face_confidence: 0.9 },
    score_diffs: { face_confidence: 0.0 },
    verdict: "same",
    error_message: null,
    created_at: "2026-02-28T10:02:00Z",
    updated_at: "2026-02-28T10:02:00Z",
  },
  {
    id: 3,
    run_id: 1,
    reference_id: 12,
    new_scene_id: 102,
    baseline_scores: { face_confidence: 0.88 },
    new_scores: { face_confidence: 0.7 },
    score_diffs: { face_confidence: -0.18 },
    verdict: "degraded",
    error_message: null,
    created_at: "2026-02-28T10:03:00Z",
    updated_at: "2026-02-28T10:03:00Z",
  },
];

const passedSummary: RunReportSummary = {
  total: 2,
  improved: 1,
  same: 1,
  degraded: 0,
  errors: 0,
  overall_passed: true,
};

const failedSummary: RunReportSummary = {
  total: 3,
  improved: 1,
  same: 1,
  degraded: 1,
  errors: 0,
  overall_passed: false,
};

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockReport: RunReport | undefined;
let mockLoading = false;

vi.mock("../hooks/use-regression", () => ({
  useRunReport: () => ({
    data: mockReport,
    isLoading: mockLoading,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("RegressionReport", () => {
  test("renders summary bar with counts", () => {
    mockReport = { run: mockRun, results: mockResults, summary: failedSummary };
    mockLoading = false;

    renderWithProviders(<RegressionReport runId={1} />);

    const summary = screen.getByTestId("report-summary");
    expect(summary).toHaveTextContent("3 results");
    expect(summary).toHaveTextContent("1 improved");
    expect(summary).toHaveTextContent("1 unchanged");
    expect(summary).toHaveTextContent("1 degraded");
  });

  test("shows overall passed indicator when no degraded", () => {
    mockReport = {
      run: mockRun,
      results: mockResults.slice(0, 2),
      summary: passedSummary,
    };
    mockLoading = false;

    renderWithProviders(<RegressionReport runId={1} />);

    expect(screen.getByText("PASSED")).toBeInTheDocument();
  });

  test("shows overall failed indicator when degraded present", () => {
    mockReport = { run: mockRun, results: mockResults, summary: failedSummary };
    mockLoading = false;

    renderWithProviders(<RegressionReport runId={1} />);

    expect(screen.getByText("FAILED")).toBeInTheDocument();
  });

  test("renders result rows with verdict badges", () => {
    mockReport = { run: mockRun, results: mockResults, summary: failedSummary };
    mockLoading = false;

    renderWithProviders(<RegressionReport runId={1} />);

    expect(screen.getByTestId("result-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("result-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("result-row-3")).toBeInTheDocument();

    // Verdict labels.
    expect(screen.getByText("Improved")).toBeInTheDocument();
    expect(screen.getByText("No Change")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  test("shows loading state while fetching", () => {
    mockReport = undefined;
    mockLoading = true;

    renderWithProviders(<RegressionReport runId={1} />);

    expect(screen.getByText("Loading report...")).toBeInTheDocument();
  });
});
