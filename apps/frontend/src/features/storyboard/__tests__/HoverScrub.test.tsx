import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { HoverScrub } from "../HoverScrub";
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

describe("HoverScrub", () => {
  it("changes displayed frame on mouse move", () => {
    renderWithProviders(<HoverScrub keyframes={keyframes} />);

    const container = screen.getByTestId("hover-scrub");
    const image = screen.getByTestId("scrub-image");

    // Initially shows first frame.
    expect(image).toHaveAttribute("src", "/thumbs/frame0.jpg");

    // Simulate mouse move near the right edge to switch to last frame.
    // getBoundingClientRect is mocked to return 0,0 with width 300.
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 300, top: 0, height: 200 }),
    });
    fireEvent.mouseMove(container, { clientX: 280, clientY: 100 });

    // Should now show the last frame.
    expect(image).toHaveAttribute("src", "/thumbs/frame96.jpg");
  });

  it("fires onFrameSelect callback on click", () => {
    const onFrameSelect = vi.fn();
    renderWithProviders(
      <HoverScrub keyframes={keyframes} onFrameSelect={onFrameSelect} />,
    );

    const container = screen.getByTestId("hover-scrub");
    fireEvent.click(container);

    // Click fires with the currently active keyframe (defaults to index 0).
    expect(onFrameSelect).toHaveBeenCalledWith(keyframes[0]);
  });

  it("handles empty keyframes gracefully", () => {
    renderWithProviders(<HoverScrub keyframes={[]} />);

    const container = screen.getByTestId("hover-scrub");
    expect(container).toHaveTextContent("No keyframes available");
  });
});
