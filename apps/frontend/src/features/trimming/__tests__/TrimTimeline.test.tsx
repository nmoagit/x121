import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { TrimTimeline } from "../TrimTimeline";

describe("TrimTimeline", () => {
  const defaultProps = {
    segmentId: 1,
    totalFrames: 100,
    framerate: 24,
    onTrimChange: vi.fn(),
  };

  it("renders the timeline container", () => {
    renderWithProviders(<TrimTimeline {...defaultProps} />);
    expect(screen.getByTestId("trim-timeline-1")).toBeInTheDocument();
  });

  it("displays default handles at full range", () => {
    renderWithProviders(<TrimTimeline {...defaultProps} />);
    expect(screen.getByTestId("in-handle")).toBeInTheDocument();
    expect(screen.getByTestId("out-handle")).toBeInTheDocument();
  });

  it("shows correct timecodes for default range", () => {
    renderWithProviders(<TrimTimeline {...defaultProps} />);
    expect(screen.getByTestId("in-timecode")).toHaveTextContent("frame 0");
    expect(screen.getByTestId("out-timecode")).toHaveTextContent("frame 100");
  });

  it("shows correct frame count", () => {
    renderWithProviders(<TrimTimeline {...defaultProps} />);
    expect(screen.getByTestId("frame-count")).toHaveTextContent(
      "100 / 100 frames",
    );
  });

  it("renders with custom in/out frames", () => {
    renderWithProviders(
      <TrimTimeline {...defaultProps} inFrame={10} outFrame={80} />,
    );
    expect(screen.getByTestId("in-timecode")).toHaveTextContent("frame 10");
    expect(screen.getByTestId("out-timecode")).toHaveTextContent("frame 80");
    expect(screen.getByTestId("frame-count")).toHaveTextContent(
      "70 / 100 frames",
    );
  });

  it("renders the kept region between handles", () => {
    renderWithProviders(<TrimTimeline {...defaultProps} />);
    expect(screen.getByTestId("kept-region")).toBeInTheDocument();
  });

  it("renders excluded regions", () => {
    renderWithProviders(
      <TrimTimeline {...defaultProps} inFrame={20} outFrame={80} />,
    );
    expect(screen.getByTestId("excluded-before")).toBeInTheDocument();
    expect(screen.getByTestId("excluded-after")).toBeInTheDocument();
  });
});
