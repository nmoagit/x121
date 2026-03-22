/**
 * Tests for CompletionChecklist component (PRD-72).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { CompletionChecklist } from "../CompletionChecklist";
import type { ChecklistResult } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const MOCK_CHECKLIST: ChecklistResult = {
  passed: false,
  items: [
    {
      name: "all_scenes_approved",
      description: "All scenes must be approved",
      passed: true,
      blocking: true,
      details: null,
    },
    {
      name: "qa_pass_rate",
      description: "QA pass rate above 95%",
      passed: false,
      blocking: true,
      details: "Current QA pass rate is 87%",
    },
    {
      name: "metadata_complete",
      description: "All metadata fields populated",
      passed: false,
      blocking: false,
      details: "3 avatars missing metadata",
    },
  ],
};

const PASSING_CHECKLIST: ChecklistResult = {
  passed: true,
  items: [
    {
      name: "all_scenes_approved",
      description: "All scenes must be approved",
      passed: true,
      blocking: true,
      details: null,
    },
  ],
};

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockChecklistData: ChecklistResult | undefined;
let mockChecklistLoading = false;

vi.mock("../hooks/use-project-lifecycle", () => ({
  useCompletionChecklist: () => ({
    data: mockChecklistData,
    isLoading: mockChecklistLoading,
  }),
  useTransitionProject: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("CompletionChecklist", () => {
  test("shows loading state", () => {
    mockChecklistData = undefined;
    mockChecklistLoading = true;

    renderWithProviders(<CompletionChecklist projectId={1} />);
    expect(screen.getByTestId("checklist-loading")).toBeInTheDocument();
  });

  test("renders all checklist items", () => {
    mockChecklistData = MOCK_CHECKLIST;
    mockChecklistLoading = false;

    renderWithProviders(<CompletionChecklist projectId={1} />);
    expect(screen.getByTestId("completion-checklist")).toBeInTheDocument();
    expect(screen.getByTestId("checklist-item-all_scenes_approved")).toBeInTheDocument();
    expect(screen.getByTestId("checklist-item-qa_pass_rate")).toBeInTheDocument();
    expect(screen.getByTestId("checklist-item-metadata_complete")).toBeInTheDocument();
  });

  test("shows green check for passed items", () => {
    mockChecklistData = MOCK_CHECKLIST;
    mockChecklistLoading = false;

    renderWithProviders(<CompletionChecklist projectId={1} />);
    const passedItem = screen.getByTestId("checklist-item-all_scenes_approved");
    expect(passedItem.querySelector("[aria-label='Passed']")).toBeInTheDocument();
  });

  test("shows red X for failed items", () => {
    mockChecklistData = MOCK_CHECKLIST;
    mockChecklistLoading = false;

    renderWithProviders(<CompletionChecklist projectId={1} />);
    const failedItem = screen.getByTestId("checklist-item-qa_pass_rate");
    expect(failedItem.querySelector("[aria-label='Failed']")).toBeInTheDocument();
  });

  test("shows details for failed items", () => {
    mockChecklistData = MOCK_CHECKLIST;
    mockChecklistLoading = false;

    renderWithProviders(<CompletionChecklist projectId={1} />);
    expect(screen.getByText("Current QA pass rate is 87%")).toBeInTheDocument();
    expect(screen.getByText("3 avatars missing metadata")).toBeInTheDocument();
  });

  test("shows admin override button when checklist fails", () => {
    mockChecklistData = MOCK_CHECKLIST;
    mockChecklistLoading = false;

    renderWithProviders(<CompletionChecklist projectId={1} />);
    expect(screen.getByText("Override & Deliver")).toBeInTheDocument();
  });

  test("hides override button when checklist passes", () => {
    mockChecklistData = PASSING_CHECKLIST;
    mockChecklistLoading = false;

    renderWithProviders(<CompletionChecklist projectId={1} />);
    expect(screen.queryByText("Override & Deliver")).not.toBeInTheDocument();
  });
});
