/**
 * Tests for ComplianceCheckList component (PRD-102).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ComplianceCheckList } from "../ComplianceCheckList";
import type { ComplianceCheck, ComplianceSummary } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockChecks: ComplianceCheck[] = [
  {
    id: 1,
    scene_id: 10,
    rule_id: 1,
    passed: true,
    actual_value: "1920x1080",
    expected_value: "1920x1080",
    message: "Resolution meets minimum",
    checked_at: "2026-02-28T10:00:00Z",
    created_at: "2026-02-28T10:00:00Z",
    updated_at: "2026-02-28T10:00:00Z",
  },
  {
    id: 2,
    scene_id: 10,
    rule_id: 2,
    passed: false,
    actual_value: "20fps",
    expected_value: "24fps",
    message: "Frame rate below minimum",
    checked_at: "2026-02-28T10:00:00Z",
    created_at: "2026-02-28T10:00:00Z",
    updated_at: "2026-02-28T10:00:00Z",
  },
];

const mockSummary: ComplianceSummary = {
  total: 2,
  passed: 1,
  failed: 1,
};

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockCheckData: ComplianceCheck[] | undefined;
let mockSummaryData: ComplianceSummary | undefined;
let mockChecksLoading = false;

vi.mock("../hooks/use-compliance", () => ({
  useSceneChecks: () => ({
    data: mockCheckData,
    isLoading: mockChecksLoading,
  }),
  useSceneSummary: () => ({
    data: mockSummaryData,
    isLoading: false,
  }),
  useRunComplianceCheck: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ComplianceCheckList", () => {
  test("renders check rows", () => {
    mockCheckData = mockChecks;
    mockSummaryData = mockSummary;
    mockChecksLoading = false;

    renderWithProviders(<ComplianceCheckList sceneId={10} />);

    expect(screen.getByTestId("compliance-check-list")).toBeInTheDocument();
    expect(screen.getByTestId("check-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("check-row-2")).toBeInTheDocument();
  });

  test("shows pass/fail badges", () => {
    mockCheckData = mockChecks;
    mockSummaryData = mockSummary;
    mockChecksLoading = false;

    renderWithProviders(<ComplianceCheckList sceneId={10} />);

    expect(screen.getByTestId("compliance-badge-pass")).toBeInTheDocument();
    expect(screen.getByTestId("compliance-badge-fail")).toBeInTheDocument();
  });

  test("displays summary", () => {
    mockCheckData = mockChecks;
    mockSummaryData = mockSummary;
    mockChecksLoading = false;

    renderWithProviders(<ComplianceCheckList sceneId={10} />);

    const summary = screen.getByTestId("compliance-summary");
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveTextContent("1 of 2 passed");
    expect(summary).toHaveTextContent("50.0%");
  });

  test("has run checks button", () => {
    mockCheckData = [];
    mockSummaryData = undefined;
    mockChecksLoading = false;

    renderWithProviders(<ComplianceCheckList sceneId={10} />);

    expect(screen.getByTestId("run-checks-btn")).toBeInTheDocument();
    expect(screen.getByText("Run Checks")).toBeInTheDocument();
  });
});
