/**
 * Tests for AbTestPanel component (PRD-91).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { AbTestPanel } from "../AbTestPanel";
import type { AbTestResult } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mutateAbTest = vi.fn();

vi.mock("../hooks/use-qa-rulesets", () => ({
  useEffectiveThresholds: vi.fn(),
  useAbTestThresholds: vi.fn(),
}));

import {
  useAbTestThresholds,
  useEffectiveThresholds,
} from "../hooks/use-qa-rulesets";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const AB_RESULT: AbTestResult = {
  total_segments: 200,
  current_pass: 150,
  current_warn: 30,
  current_fail: 20,
  proposed_pass: 160,
  proposed_warn: 25,
  proposed_fail: 15,
  per_metric: [
    {
      check_type: "face_confidence",
      current_pass: 180,
      current_warn: 15,
      current_fail: 5,
      proposed_pass: 185,
      proposed_warn: 12,
      proposed_fail: 3,
    },
  ],
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function setupMocks({
  effectivePending = false,
  abData,
  abPending = false,
}: {
  effectivePending?: boolean;
  abData?: AbTestResult;
  abPending?: boolean;
} = {}) {
  vi.mocked(useEffectiveThresholds).mockReturnValue({
    data: effectivePending
      ? undefined
      : {
          face_confidence: { warn: 0.7, fail: 0.4 },
          motion: { warn: 0.8, fail: 0.5 },
        },
    isPending: effectivePending,
  } as ReturnType<typeof useEffectiveThresholds>);

  mutateAbTest.mockClear();
  vi.mocked(useAbTestThresholds).mockReturnValue({
    mutate: mutateAbTest,
    data: abData,
    isPending: abPending,
  } as unknown as ReturnType<typeof useAbTestThresholds>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("AbTestPanel", () => {
  it("renders run button", () => {
    setupMocks();

    renderWithProviders(<AbTestPanel sceneTypeId={10} />);

    expect(screen.getByTestId("ab-test-run-btn")).toBeInTheDocument();
  });

  it("renders loading spinner while effective thresholds are loading", () => {
    setupMocks({ effectivePending: true });

    renderWithProviders(<AbTestPanel sceneTypeId={10} />);

    expect(screen.getByTestId("ab-test-loading")).toBeInTheDocument();
  });

  it("calls mutation when run button clicked", () => {
    setupMocks();

    renderWithProviders(<AbTestPanel sceneTypeId={10} />);

    fireEvent.click(screen.getByTestId("ab-test-run-btn"));

    expect(mutateAbTest).toHaveBeenCalledTimes(1);
    expect(mutateAbTest).toHaveBeenCalledWith(
      expect.objectContaining({ scene_type_id: 10 }),
    );
  });

  it("shows results after test completes", () => {
    setupMocks({ abData: AB_RESULT });

    renderWithProviders(<AbTestPanel sceneTypeId={10} />);

    expect(screen.getByTestId("ab-test-results")).toBeInTheDocument();
    expect(screen.getByTestId("ab-row-current")).toBeInTheDocument();
    expect(screen.getByTestId("ab-row-proposed")).toBeInTheDocument();
    expect(screen.getByText(/200 segments/)).toBeInTheDocument();
  });

  it("displays per-metric breakdown", () => {
    setupMocks({ abData: AB_RESULT });

    renderWithProviders(<AbTestPanel sceneTypeId={10} />);

    expect(screen.getByTestId("ab-per-metric")).toBeInTheDocument();
    expect(
      screen.getByTestId("ab-metric-face_confidence"),
    ).toBeInTheDocument();
  });

  it("renders proposed threshold sliders", () => {
    setupMocks();

    renderWithProviders(<AbTestPanel sceneTypeId={10} />);

    expect(
      screen.getByTestId("ab-proposed-thresholds"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("threshold-slider-face_confidence"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("threshold-slider-motion"),
    ).toBeInTheDocument();
  });
});
