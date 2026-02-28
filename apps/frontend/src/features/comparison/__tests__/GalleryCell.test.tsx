import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GalleryCell } from "../GalleryCell";
import type { ComparisonCell } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

function makeCell(overrides: Partial<ComparisonCell> = {}): ComparisonCell {
  return {
    character_id: 1,
    character_name: "Alice",
    scene_id: 10,
    segment_id: 100,
    scene_type_id: 5,
    scene_type_name: "Idle",
    image_variant_id: 1,
    status_id: 1,
    thumbnail_url: "/thumb.jpg",
    stream_url: "/stream.mp4",
    qa_score: 0.92,
    approval_status: null,
    duration_secs: 4.5,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("GalleryCell", () => {
  it("renders character name and QA score", () => {
    render(<GalleryCell cell={makeCell()} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("shows approval badge when approved", () => {
    render(<GalleryCell cell={makeCell({ approval_status: "approved" })} />);

    expect(screen.getByText("approved")).toBeInTheDocument();
  });

  it("shows approval badge when rejected", () => {
    render(<GalleryCell cell={makeCell({ approval_status: "rejected" })} />);

    expect(screen.getByText("rejected")).toBeInTheDocument();
  });

  it("shows approval badge when flagged", () => {
    render(<GalleryCell cell={makeCell({ approval_status: "flagged" })} />);

    expect(screen.getByText("flagged")).toBeInTheDocument();
  });

  it("shows 'No video' placeholder when no segment", () => {
    render(<GalleryCell cell={makeCell({ segment_id: null, stream_url: null })} />);

    expect(screen.getByText("No video")).toBeInTheDocument();
  });

  it("shows hover actions on mouseenter and calls callbacks", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onFlag = vi.fn();

    render(
      <GalleryCell
        cell={makeCell()}
        onApprove={onApprove}
        onReject={onReject}
        onFlag={onFlag}
      />,
    );

    const cellEl = screen.getByTestId("gallery-cell");

    // Actions not visible before hover.
    expect(screen.queryByTitle("Approve")).not.toBeInTheDocument();

    // Hover to reveal.
    fireEvent.mouseEnter(cellEl);

    expect(screen.getByTitle("Approve")).toBeInTheDocument();
    expect(screen.getByTitle("Reject")).toBeInTheDocument();
    expect(screen.getByTitle("Flag")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Approve"));
    expect(onApprove).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Reject"));
    expect(onReject).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Flag"));
    expect(onFlag).toHaveBeenCalledTimes(1);
  });

  it("uses primaryLabel override when provided", () => {
    render(<GalleryCell cell={makeCell()} primaryLabel="Walk Cycle" />);

    expect(screen.getByText("Walk Cycle")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });
});
