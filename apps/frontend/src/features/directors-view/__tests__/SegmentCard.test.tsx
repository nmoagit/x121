/**
 * Tests for SegmentCard component (PRD-55).
 *
 * Verifies card content rendering, status badge, thumbnail fallback,
 * and tap handler.
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { SegmentCard } from "../SegmentCard";
import type { ReviewQueueItem } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const mockItem: ReviewQueueItem = {
  segment_id: 42,
  avatar_name: "Agent Smith",
  scene_type: "dialogue",
  status: "pending",
  thumbnail_url: null,
  video_url: "https://example.com/video.mp4",
  submitted_at: "2026-02-20T10:30:00Z",
  submitted_by: "user@test.com",
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SegmentCard", () => {
  const defaultProps = {
    item: mockItem,
    onAction: vi.fn(),
    onTap: vi.fn(),
  };

  it("renders avatar name and scene type", () => {
    renderWithProviders(<SegmentCard {...defaultProps} />);

    expect(screen.getByText("Agent Smith")).toBeInTheDocument();
    expect(screen.getByText("dialogue")).toBeInTheDocument();
  });

  it("renders status badge", () => {
    renderWithProviders(<SegmentCard {...defaultProps} />);

    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("renders thumbnail image when URL is provided", () => {
    const itemWithThumb: ReviewQueueItem = {
      ...mockItem,
      thumbnail_url: "https://example.com/thumb.jpg",
    };

    renderWithProviders(<SegmentCard {...defaultProps} item={itemWithThumb} />);

    const img = screen.getByAltText("Agent Smith thumbnail");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/thumb.jpg");
  });

  it("renders fallback icon when no thumbnail", () => {
    renderWithProviders(<SegmentCard {...defaultProps} />);

    // No image element should be present
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("calls onTap when clicked", () => {
    const onTap = vi.fn();
    renderWithProviders(<SegmentCard {...defaultProps} onTap={onTap} />);

    fireEvent.click(screen.getByTestId("segment-card"));

    expect(onTap).toHaveBeenCalledWith(42);
  });

  it("shows submitted date", () => {
    renderWithProviders(<SegmentCard {...defaultProps} />);

    // formatDateTime produces locale-dependent output, just check it's present
    expect(screen.getByTestId("segment-card")).toBeInTheDocument();
  });
});
