import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { RetryHistoryPanel } from "../RetryHistoryPanel";
import type { RetryAttempt } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-auto-retry", () => ({
  useRetryAttempts: vi.fn(),
  useSelectRetryAttempt: vi.fn(),
}));

import { useRetryAttempts, useSelectRetryAttempt } from "../hooks/use-auto-retry";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const ATTEMPT_PASSED: RetryAttempt = {
  id: 1,
  segment_id: 100,
  attempt_number: 1,
  seed: 42,
  parameters: { steps: 20 },
  original_parameters: { steps: 20 },
  output_video_path: "/output/video_1.mp4",
  quality_scores: { face_confidence: 0.95, motion_score: 0.87 },
  overall_status: "passed",
  is_selected: false,
  gpu_seconds: 12.5,
  failure_reason: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const ATTEMPT_SELECTED: RetryAttempt = {
  id: 2,
  segment_id: 100,
  attempt_number: 2,
  seed: 99,
  parameters: { steps: 25 },
  original_parameters: { steps: 20 },
  output_video_path: "/output/video_2.mp4",
  quality_scores: { face_confidence: 0.98, motion_score: 0.92 },
  overall_status: "selected",
  is_selected: true,
  gpu_seconds: 15.3,
  failure_reason: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const ATTEMPT_FAILED: RetryAttempt = {
  id: 3,
  segment_id: 100,
  attempt_number: 3,
  seed: 77,
  parameters: { steps: 20 },
  original_parameters: { steps: 20 },
  output_video_path: null,
  quality_scores: null,
  overall_status: "failed",
  is_selected: false,
  gpu_seconds: 8.0,
  failure_reason: "Face not detected",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function setupMock(attempts?: RetryAttempt[], isPending = false) {
  vi.mocked(useRetryAttempts).mockReturnValue({
    data: attempts,
    isPending,
    isError: false,
  } as ReturnType<typeof useRetryAttempts>);

  vi.mocked(useSelectRetryAttempt).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  } as unknown as ReturnType<typeof useSelectRetryAttempt>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("RetryHistoryPanel", () => {
  it("renders loading spinner while fetching", () => {
    setupMock(undefined, true);

    renderWithProviders(<RetryHistoryPanel segmentId={100} />);

    expect(screen.getByTestId("retry-history-loading")).toBeInTheDocument();
  });

  it("renders empty state when no attempts", () => {
    setupMock([]);

    renderWithProviders(<RetryHistoryPanel segmentId={100} />);

    expect(screen.getByTestId("retry-history-empty")).toBeInTheDocument();
    expect(screen.getByText("No retry attempts for this segment.")).toBeInTheDocument();
  });

  it("renders attempt list with status badges", () => {
    setupMock([ATTEMPT_PASSED, ATTEMPT_SELECTED, ATTEMPT_FAILED]);

    renderWithProviders(<RetryHistoryPanel segmentId={100} />);

    expect(screen.getByTestId("retry-attempt-list")).toBeInTheDocument();
    expect(screen.getByTestId("attempt-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("attempt-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("attempt-row-3")).toBeInTheDocument();

    expect(screen.getByText("passed")).toBeInTheDocument();
    expect(screen.getByText("selected")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("shows selected attempt indicator", () => {
    setupMock([ATTEMPT_PASSED, ATTEMPT_SELECTED]);

    renderWithProviders(<RetryHistoryPanel segmentId={100} />);

    expect(screen.getByTestId("attempt-selected-2")).toBeInTheDocument();
    expect(screen.queryByTestId("attempt-selected-1")).not.toBeInTheDocument();
  });

  it("displays GPU time total", () => {
    setupMock([ATTEMPT_PASSED, ATTEMPT_SELECTED, ATTEMPT_FAILED]);

    renderWithProviders(<RetryHistoryPanel segmentId={100} />);

    expect(screen.getByTestId("retry-history-gpu-total")).toHaveTextContent("Total GPU: 35.8s");
  });

  it("displays attempt count in header", () => {
    setupMock([ATTEMPT_PASSED, ATTEMPT_SELECTED]);

    renderWithProviders(<RetryHistoryPanel segmentId={100} />);

    expect(screen.getByTestId("retry-history-header")).toHaveTextContent("Retry Attempts (2)");
  });

  it("shows seed for each attempt", () => {
    setupMock([ATTEMPT_PASSED]);

    renderWithProviders(<RetryHistoryPanel segmentId={100} />);

    expect(screen.getByTestId("attempt-seed-1")).toHaveTextContent("Seed: 42");
  });

  it("shows GPU seconds for each attempt", () => {
    setupMock([ATTEMPT_PASSED]);

    renderWithProviders(<RetryHistoryPanel segmentId={100} />);

    expect(screen.getByTestId("attempt-gpu-1")).toHaveTextContent("12.5s GPU");
  });
});
