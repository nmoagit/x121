/**
 * Tests for TagSelector component (PRD-38).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { TagSelector } from "../TagSelector";
import type { ReviewTag } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockTags: ReviewTag[] = [
  {
    id: 1,
    name: "Face Melt",
    color: "#FF4444",
    category: "face",
    created_by: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
  {
    id: 2,
    name: "Jitter",
    color: "#FF8844",
    category: "motion",
    created_by: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
  {
    id: 3,
    name: "Boundary Pop",
    color: "#FFAA44",
    category: "transition",
    created_by: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("TagSelector", () => {
  test("renders available tags with colors", () => {
    renderWithProviders(
      <TagSelector
        tags={mockTags}
        selectedTagIds={[]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("tag-selector")).toBeInTheDocument();
    expect(screen.getByTestId("tag-option-1")).toHaveTextContent("Face Melt");
    expect(screen.getByTestId("tag-option-2")).toHaveTextContent("Jitter");
    expect(screen.getByTestId("tag-option-3")).toHaveTextContent("Boundary Pop");
  });

  test("allows selecting multiple tags", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <TagSelector
        tags={mockTags}
        selectedTagIds={[1]}
        onChange={onChange}
      />,
    );

    // Click to add tag 2.
    fireEvent.click(screen.getByTestId("tag-option-2"));
    expect(onChange).toHaveBeenCalledWith([1, 2]);
  });

  test("shows selected state", () => {
    renderWithProviders(
      <TagSelector
        tags={mockTags}
        selectedTagIds={[1, 3]}
        onChange={vi.fn()}
      />,
    );

    const tag1 = screen.getByTestId("tag-option-1");
    const tag2 = screen.getByTestId("tag-option-2");
    const tag3 = screen.getByTestId("tag-option-3");

    expect(tag1).toHaveAttribute("aria-pressed", "true");
    expect(tag2).toHaveAttribute("aria-pressed", "false");
    expect(tag3).toHaveAttribute("aria-pressed", "true");
  });
});
