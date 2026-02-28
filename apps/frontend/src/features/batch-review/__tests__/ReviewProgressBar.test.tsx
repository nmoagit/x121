/**
 * Tests for ReviewProgressBar component (PRD-92).
 */

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ReviewProgressBar } from "../ReviewProgressBar";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-batch-review", () => ({
  useReviewProgress: vi.fn(),
}));

import { useReviewProgress } from "../hooks/use-batch-review";

function setupMocks({
  isPending = false,
  isError = false,
  data = undefined as ReturnType<typeof useReviewProgress>["data"],
} = {}) {
  vi.mocked(useReviewProgress).mockReturnValue({
    data,
    isPending,
    isError,
  } as ReturnType<typeof useReviewProgress>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ReviewProgressBar", () => {
  it("shows loading state", () => {
    setupMocks({ isPending: true });

    renderWithProviders(<ReviewProgressBar projectId={10} />);

    expect(screen.getByTestId("review-progress-loading")).toBeInTheDocument();
    expect(screen.getByText("Loading progress...")).toBeInTheDocument();
  });

  it("renders progress bar with correct percentages", () => {
    setupMocks({
      data: {
        total_segments: 100,
        reviewed_segments: 60,
        approved_segments: 45,
        rejected_segments: 15,
        pending_segments: 40,
        avg_pace_seconds: 12.5,
        estimated_remaining_seconds: 500,
      },
    });

    renderWithProviders(<ReviewProgressBar projectId={10} />);

    expect(screen.getByTestId("review-progress-bar")).toBeInTheDocument();
    expect(screen.getByText(/60 of 100 reviewed/)).toBeInTheDocument();
    expect(screen.getByText(/60%/)).toBeInTheDocument();
    expect(screen.getByText(/Approved: 45/)).toBeInTheDocument();
    expect(screen.getByText(/Rejected: 15/)).toBeInTheDocument();
    expect(screen.getByText(/Pending: 40/)).toBeInTheDocument();
  });

  it("shows pace and estimated time", () => {
    setupMocks({
      data: {
        total_segments: 50,
        reviewed_segments: 25,
        approved_segments: 20,
        rejected_segments: 5,
        pending_segments: 25,
        avg_pace_seconds: 30,
        estimated_remaining_seconds: 750,
      },
    });

    renderWithProviders(<ReviewProgressBar projectId={10} />);

    expect(screen.getByText(/Pace: 30s\/segment/)).toBeInTheDocument();
    expect(screen.getByText(/13m remaining/)).toBeInTheDocument();
  });

  it("handles zero segments gracefully", () => {
    setupMocks({
      data: {
        total_segments: 0,
        reviewed_segments: 0,
        approved_segments: 0,
        rejected_segments: 0,
        pending_segments: 0,
        avg_pace_seconds: null,
        estimated_remaining_seconds: null,
      },
    });

    renderWithProviders(<ReviewProgressBar projectId={10} />);

    expect(screen.getByText(/0 of 0 reviewed/)).toBeInTheDocument();
  });

  it("shows error state", () => {
    setupMocks({ isError: true });

    renderWithProviders(<ReviewProgressBar projectId={10} />);

    expect(screen.getByText("Failed to load review progress")).toBeInTheDocument();
  });
});
