import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TranscodeStatusBadge } from "./TranscodeStatusBadge";

describe("TranscodeStatusBadge", () => {
  it("renders nothing when state is 'completed'", () => {
    const { container } = render(<TranscodeStatusBadge state="completed" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders 'Processing' label for 'pending'", () => {
    render(<TranscodeStatusBadge state="pending" />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("renders 'Processing' label for 'in_progress'", () => {
    render(<TranscodeStatusBadge state="in_progress" />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("renders 'Transcode failed' label for 'failed'", () => {
    render(<TranscodeStatusBadge state="failed" />);
    expect(screen.getByText("Transcode failed")).toBeInTheDocument();
  });

  it("uses warning variant for pending/in_progress (processing)", () => {
    render(<TranscodeStatusBadge state="pending" />);
    const badge = screen.getByText("Processing");
    expect(badge.className).toContain("text-[var(--color-action-warning)]");
  });

  it("uses danger variant for failed", () => {
    render(<TranscodeStatusBadge state="failed" />);
    const badge = screen.getByText("Transcode failed");
    expect(badge.className).toContain("text-[var(--color-action-danger)]");
  });
});
