/**
 * Tests for ReviewQueue component (PRD-55).
 *
 * Verifies queue rendering, loading state, empty state, and error handling.
 */

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ReviewQueue } from "../ReviewQueue";
import type { ReviewQueueItem } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-directors-view", () => ({
  useReviewQueue: vi.fn(),
}));

import { useReviewQueue } from "../hooks/use-directors-view";

const mockItems: ReviewQueueItem[] = [
  {
    segment_id: 1,
    avatar_name: "Neo",
    scene_type: "action",
    status: "pending",
    thumbnail_url: null,
    video_url: null,
    submitted_at: "2026-02-20T08:00:00Z",
    submitted_by: "unknown",
  },
  {
    segment_id: 2,
    avatar_name: "Trinity",
    scene_type: "dialogue",
    status: "approved",
    thumbnail_url: null,
    video_url: null,
    submitted_at: "2026-02-20T09:00:00Z",
    submitted_by: "unknown",
  },
];

function setupMocks({
  isPending = false,
  isError = false,
  data = undefined as ReviewQueueItem[] | undefined,
} = {}) {
  vi.mocked(useReviewQueue).mockReturnValue({
    data,
    isPending,
    isError,
    refetch: vi.fn(),
    isRefetching: false,
  } as unknown as ReturnType<typeof useReviewQueue>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ReviewQueue", () => {
  const defaultProps = {
    onSegmentAction: vi.fn(),
    onSegmentTap: vi.fn(),
  };

  it("shows loading skeletons while pending", () => {
    setupMocks({ isPending: true });

    renderWithProviders(<ReviewQueue {...defaultProps} />);

    expect(screen.getByTestId("review-queue-loading")).toBeInTheDocument();
  });

  it("renders queue items", () => {
    setupMocks({ data: mockItems });

    renderWithProviders(<ReviewQueue {...defaultProps} />);

    expect(screen.getByTestId("review-queue")).toBeInTheDocument();
    expect(screen.getByText("Neo")).toBeInTheDocument();
    expect(screen.getByText("Trinity")).toBeInTheDocument();
  });

  it("shows empty state when no items", () => {
    setupMocks({ data: [] });

    renderWithProviders(<ReviewQueue {...defaultProps} />);

    expect(screen.getByTestId("review-queue-empty")).toBeInTheDocument();
    expect(screen.getByText("No segments in the review queue")).toBeInTheDocument();
  });

  it("shows error state", () => {
    setupMocks({ isError: true });

    renderWithProviders(<ReviewQueue {...defaultProps} />);

    expect(screen.getByText("Failed to load review queue")).toBeInTheDocument();
  });

  it("renders filter buttons", () => {
    setupMocks({ data: mockItems });

    renderWithProviders(<ReviewQueue {...defaultProps} />);

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("renders refresh button", () => {
    setupMocks({ data: mockItems });

    renderWithProviders(<ReviewQueue {...defaultProps} />);

    expect(screen.getByLabelText("Refresh queue")).toBeInTheDocument();
  });
});
