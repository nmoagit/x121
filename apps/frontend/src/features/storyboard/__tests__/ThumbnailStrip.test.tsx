import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ThumbnailStrip } from "../ThumbnailStrip";
import type { Keyframe } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeKeyframe = (overrides: Partial<Keyframe> = {}): Keyframe => ({
  id: 1,
  segment_id: 10,
  frame_number: 0,
  timestamp_secs: 0.0,
  thumbnail_path: "/thumbs/frame0.jpg",
  full_res_path: null,
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

const keyframes: Keyframe[] = [
  makeKeyframe({ id: 1, frame_number: 0, timestamp_secs: 0.0 }),
  makeKeyframe({
    id: 2,
    frame_number: 48,
    timestamp_secs: 2.0,
    thumbnail_path: "/thumbs/frame48.jpg",
  }),
  makeKeyframe({
    id: 3,
    frame_number: 96,
    timestamp_secs: 4.0,
    thumbnail_path: "/thumbs/frame96.jpg",
  }),
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ThumbnailStrip", () => {
  it("renders thumbnails for given keyframes", () => {
    renderWithProviders(
      <ThumbnailStrip segmentId={10} keyframes={keyframes} />,
    );

    expect(screen.getByTestId("thumbnail-strip-10")).toBeInTheDocument();
    expect(screen.getByTestId("thumbnail-1")).toBeInTheDocument();
    expect(screen.getByTestId("thumbnail-2")).toBeInTheDocument();
    expect(screen.getByTestId("thumbnail-3")).toBeInTheDocument();
  });

  it("shows empty state when no keyframes provided", () => {
    renderWithProviders(
      <ThumbnailStrip segmentId={10} keyframes={[]} />,
    );

    expect(screen.getByTestId("empty-strip")).toBeInTheDocument();
    expect(
      screen.getByText("No keyframes extracted yet."),
    ).toBeInTheDocument();
  });

  it("shows loading skeletons when isLoading is true", () => {
    renderWithProviders(
      <ThumbnailStrip segmentId={10} keyframes={[]} isLoading />,
    );

    const skeletons = screen.getAllByTestId("thumbnail-skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("displays frame number and timecode for each keyframe", () => {
    renderWithProviders(
      <ThumbnailStrip segmentId={10} keyframes={keyframes} />,
    );

    // Frame 0 at 0.0s => "#0 00:00.0"
    expect(screen.getByTestId("frame-info-1")).toHaveTextContent("#0 00:00.0");
    // Frame 48 at 2.0s => "#48 00:02.0"
    expect(screen.getByTestId("frame-info-2")).toHaveTextContent("#48 00:02.0");
    // Frame 96 at 4.0s => "#96 00:04.0"
    expect(screen.getByTestId("frame-info-3")).toHaveTextContent("#96 00:04.0");
  });
});
