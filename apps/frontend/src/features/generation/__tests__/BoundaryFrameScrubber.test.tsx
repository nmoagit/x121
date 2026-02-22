import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";
import { BoundaryFrameScrubber } from "../BoundaryFrameScrubber";

const FRAME_URLS = [
  "/frames/0.jpg",
  "/frames/1.jpg",
  "/frames/2.jpg",
  "/frames/3.jpg",
];

describe("BoundaryFrameScrubber", () => {
  it("renders frame thumbnails", () => {
    renderWithProviders(
      <BoundaryFrameScrubber
        frameThumbnails={FRAME_URLS}
        selectedIndex={null}
        onSelectFrame={vi.fn()}
      />,
    );

    const thumbs = screen.getAllByTestId(/^frame-thumb-/);
    expect(thumbs).toHaveLength(4);
  });

  it("highlights selected frame", () => {
    renderWithProviders(
      <BoundaryFrameScrubber
        frameThumbnails={FRAME_URLS}
        selectedIndex={2}
        onSelectFrame={vi.fn()}
      />,
    );

    const selected = screen.getByTestId("frame-thumb-2");
    expect(selected).toHaveAttribute("aria-selected", "true");

    const unselected = screen.getByTestId("frame-thumb-0");
    expect(unselected).toHaveAttribute("aria-selected", "false");
  });

  it("calls select handler on click", () => {
    const handler = vi.fn();

    renderWithProviders(
      <BoundaryFrameScrubber
        frameThumbnails={FRAME_URLS}
        selectedIndex={null}
        onSelectFrame={handler}
      />,
    );

    fireEvent.click(screen.getByTestId("frame-thumb-1"));
    expect(handler).toHaveBeenCalledWith(1);
  });

  it("shows frame index labels", () => {
    renderWithProviders(
      <BoundaryFrameScrubber
        frameThumbnails={FRAME_URLS}
        selectedIndex={null}
        onSelectFrame={vi.fn()}
      />,
    );

    expect(screen.getByTestId("frame-label-0")).toHaveTextContent("0");
    expect(screen.getByTestId("frame-label-3")).toHaveTextContent("3");
  });
});
