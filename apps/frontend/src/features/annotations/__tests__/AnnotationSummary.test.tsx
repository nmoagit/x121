/**
 * Tests for AnnotationSummary component (PRD-70).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { AnnotationSummary } from "../AnnotationSummary";
import type { FrameAnnotation } from "../types";

const mockAnnotations: FrameAnnotation[] = [
  {
    id: 1,
    segment_id: 10,
    user_id: 100,
    frame_number: 5,
    annotations_json: [
      { tool: "pen", data: {}, color: "#FF0000", strokeWidth: 2 },
      { tool: "text", data: { content: "note" }, color: "#000000", strokeWidth: 0 },
    ],
    review_note_id: null,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
  },
  {
    id: 2,
    segment_id: 10,
    user_id: 101,
    frame_number: 15,
    annotations_json: [
      { tool: "circle", data: {}, color: "#0000FF", strokeWidth: 3 },
    ],
    review_note_id: null,
    created_at: "2026-02-20T11:00:00Z",
    updated_at: "2026-02-20T11:00:00Z",
  },
];

describe("AnnotationSummary", () => {
  test("lists annotations sorted by frame number", () => {
    renderWithProviders(
      <AnnotationSummary annotations={mockAnnotations} />,
    );
    expect(screen.getByTestId("annotation-summary")).toBeInTheDocument();
    expect(screen.getByTestId("summary-entry-1")).toBeInTheDocument();
    expect(screen.getByTestId("summary-entry-2")).toBeInTheDocument();
  });

  test("shows frame numbers", () => {
    renderWithProviders(
      <AnnotationSummary annotations={mockAnnotations} />,
    );
    expect(screen.getByTestId("summary-frame-1")).toHaveTextContent("Frame 5");
    expect(screen.getByTestId("summary-frame-2")).toHaveTextContent("Frame 15");
  });

  test("shows tool type badges", () => {
    renderWithProviders(
      <AnnotationSummary annotations={mockAnnotations} />,
    );
    expect(screen.getByText("Pen")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Circle")).toBeInTheDocument();
  });

  test("clicking entry calls onFrameSelect", () => {
    const onFrameSelect = vi.fn();

    renderWithProviders(
      <AnnotationSummary
        annotations={mockAnnotations}
        onFrameSelect={onFrameSelect}
      />,
    );

    fireEvent.click(screen.getByTestId("summary-entry-1"));
    expect(onFrameSelect).toHaveBeenCalledWith(5);
  });

  test("shows empty state when no annotations", () => {
    renderWithProviders(
      <AnnotationSummary annotations={[]} />,
    );
    expect(screen.getByText("No annotations found.")).toBeInTheDocument();
  });
});
