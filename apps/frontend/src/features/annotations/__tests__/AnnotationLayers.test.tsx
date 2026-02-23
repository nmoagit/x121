/**
 * Tests for AnnotationLayers component (PRD-70).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { AnnotationLayers } from "../AnnotationLayers";
import type { AnnotationLayer } from "../types";

const mockLayers: AnnotationLayer[] = [
  {
    userId: 1,
    userName: "Alice",
    visible: true,
    annotations: [
      {
        id: 1,
        segment_id: 10,
        user_id: 1,
        frame_number: 0,
        annotations_json: [{ tool: "pen", data: {}, color: "#FF0000", strokeWidth: 2 }],
        review_note_id: null,
        created_at: "2026-02-20T10:00:00Z",
        updated_at: "2026-02-20T10:00:00Z",
      },
      {
        id: 2,
        segment_id: 10,
        user_id: 1,
        frame_number: 5,
        annotations_json: [{ tool: "circle", data: {}, color: "#0000FF", strokeWidth: 3 }],
        review_note_id: null,
        created_at: "2026-02-20T10:05:00Z",
        updated_at: "2026-02-20T10:05:00Z",
      },
    ],
  },
  {
    userId: 2,
    userName: "Bob",
    visible: false,
    annotations: [
      {
        id: 3,
        segment_id: 10,
        user_id: 2,
        frame_number: 10,
        annotations_json: [{ tool: "text", data: { content: "Note" }, color: "#000000", strokeWidth: 0 }],
        review_note_id: null,
        created_at: "2026-02-20T11:00:00Z",
        updated_at: "2026-02-20T11:00:00Z",
      },
    ],
  },
];

describe("AnnotationLayers", () => {
  test("lists all reviewer layers", () => {
    renderWithProviders(<AnnotationLayers layers={mockLayers} />);
    expect(screen.getByTestId("annotation-layers")).toBeInTheDocument();
    expect(screen.getByTestId("layer-1")).toBeInTheDocument();
    expect(screen.getByTestId("layer-2")).toBeInTheDocument();
  });

  test("shows reviewer names", () => {
    renderWithProviders(<AnnotationLayers layers={mockLayers} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  test("shows annotation count badges", () => {
    renderWithProviders(<AnnotationLayers layers={mockLayers} />);
    expect(screen.getByText("2")).toBeInTheDocument(); // Alice
    expect(screen.getByText("1")).toBeInTheDocument(); // Bob
  });

  test("shows visibility toggles", () => {
    renderWithProviders(<AnnotationLayers layers={mockLayers} />);
    expect(screen.getByTestId("layer-toggle-1")).toBeChecked();
    expect(screen.getByTestId("layer-toggle-2")).not.toBeChecked();
  });

  test("shows Show All button", () => {
    renderWithProviders(<AnnotationLayers layers={mockLayers} />);
    expect(screen.getByTestId("show-all-button")).toBeInTheDocument();
  });

  test("shows Show Mine Only button when currentUserId is set", () => {
    renderWithProviders(
      <AnnotationLayers layers={mockLayers} currentUserId={1} />,
    );
    expect(screen.getByTestId("show-mine-button")).toBeInTheDocument();
  });

  test("shows empty state when no layers", () => {
    renderWithProviders(<AnnotationLayers layers={[]} />);
    expect(screen.getByText("No annotations yet.")).toBeInTheDocument();
  });
});
