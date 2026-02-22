/**
 * Tests for SceneQaSummaryCard component (PRD-49).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { SceneQaSummaryCard } from "../SceneQaSummaryCard";
import type { SceneQaSummary } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const summary: SceneQaSummary = {
  scene_id: 1,
  total_segments: 10,
  segments_with_failures: 2,
  segments_with_warnings: 3,
  all_passed: 5,
};

const allPassed: SceneQaSummary = {
  scene_id: 2,
  total_segments: 8,
  segments_with_failures: 0,
  segments_with_warnings: 0,
  all_passed: 8,
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SceneQaSummaryCard", () => {
  test("renders summary counts", () => {
    renderWithProviders(<SceneQaSummaryCard summary={summary} />);

    expect(screen.getByTestId("stat-total")).toHaveTextContent("10");
    expect(screen.getByTestId("stat-failures")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-warnings")).toHaveTextContent("3");
    expect(screen.getByTestId("stat-passed")).toHaveTextContent("5");
  });

  test("shows progress bar proportions", () => {
    renderWithProviders(<SceneQaSummaryCard summary={summary} />);

    const bar = screen.getByTestId("progress-bar");
    expect(bar).toBeInTheDocument();
    expect(screen.getByTestId("bar-segment-failures")).toBeInTheDocument();
    expect(screen.getByTestId("bar-segment-warnings")).toBeInTheDocument();
    expect(screen.getByTestId("bar-segment-passed")).toBeInTheDocument();
  });

  test("color-codes based on failure count", () => {
    // With failures: header should use danger color class.
    const { unmount } = renderWithProviders(
      <SceneQaSummaryCard summary={summary} />,
    );
    const headerWithFailures = screen.getByText("Scene QA Summary");
    expect(headerWithFailures.className).toContain("color-action-danger");
    unmount();

    // Without failures: header should use default text color.
    renderWithProviders(<SceneQaSummaryCard summary={allPassed} />);
    const headerNoFailures = screen.getByText("Scene QA Summary");
    expect(headerNoFailures.className).toContain("color-text-primary");
  });
});
