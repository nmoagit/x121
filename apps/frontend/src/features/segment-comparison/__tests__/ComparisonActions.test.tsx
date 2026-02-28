/**
 * Tests for ComparisonActions component (PRD-101).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ComparisonActions } from "../ComparisonActions";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

// Mock the useSelectVersion hook to avoid real API calls.
vi.mock("../hooks/use-segment-versions", () => ({
  useSelectVersion: () => ({
    mutate: vi.fn((_versionId: number, opts?: { onSuccess?: () => void }) => {
      // Immediately call onSuccess to simulate a successful mutation.
      opts?.onSuccess?.();
    }),
    isPending: false,
    variables: undefined,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ComparisonActions", () => {
  const defaultProps = {
    segmentId: 1,
    newVersionId: 10,
    oldVersionId: 5,
    onDecision: vi.fn(),
  };

  test("renders all three action buttons", () => {
    renderWithProviders(<ComparisonActions {...defaultProps} />);

    expect(screen.getByTestId("action-keep-new")).toBeInTheDocument();
    expect(screen.getByTestId("action-revert")).toBeInTheDocument();
    expect(screen.getByTestId("action-keep-both")).toBeInTheDocument();
  });

  test("calls onDecision with 'keep_new' when Keep New is clicked", () => {
    const onDecision = vi.fn();
    renderWithProviders(<ComparisonActions {...defaultProps} onDecision={onDecision} />);

    fireEvent.click(screen.getByTestId("action-keep-new"));
    expect(onDecision).toHaveBeenCalledWith("keep_new");
  });

  test("calls onDecision with 'revert' when Revert is clicked", () => {
    const onDecision = vi.fn();
    renderWithProviders(<ComparisonActions {...defaultProps} onDecision={onDecision} />);

    fireEvent.click(screen.getByTestId("action-revert"));
    expect(onDecision).toHaveBeenCalledWith("revert");
  });

  test("calls onDecision with 'keep_both' when Keep Both is clicked", () => {
    const onDecision = vi.fn();
    renderWithProviders(<ComparisonActions {...defaultProps} onDecision={onDecision} />);

    fireEvent.click(screen.getByTestId("action-keep-both"));
    expect(onDecision).toHaveBeenCalledWith("keep_both");
  });

  test("disables all buttons when disabled prop is true", () => {
    renderWithProviders(<ComparisonActions {...defaultProps} disabled />);

    expect(screen.getByTestId("action-keep-new")).toBeDisabled();
    expect(screen.getByTestId("action-revert")).toBeDisabled();
    expect(screen.getByTestId("action-keep-both")).toBeDisabled();
  });
});
