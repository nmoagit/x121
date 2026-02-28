/**
 * Tests for VersionFilmstrip component (PRD-101).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { VersionFilmstrip } from "../VersionFilmstrip";
import type { SegmentVersion } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockVersions: SegmentVersion[] = [
  {
    id: 1,
    segment_id: 100,
    version_number: 1,
    video_path: "/videos/v1.mp4",
    thumbnail_path: "/thumbs/v1.jpg",
    qa_scores_json: null,
    params_json: null,
    selected: false,
    created_by: 1,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
  },
  {
    id: 2,
    segment_id: 100,
    version_number: 2,
    video_path: "/videos/v2.mp4",
    thumbnail_path: null,
    qa_scores_json: null,
    params_json: null,
    selected: true,
    created_by: 1,
    created_at: "2026-02-21T10:00:00Z",
    updated_at: "2026-02-21T10:00:00Z",
  },
  {
    id: 3,
    segment_id: 100,
    version_number: 3,
    video_path: "/videos/v3.mp4",
    thumbnail_path: "/thumbs/v3.jpg",
    qa_scores_json: null,
    params_json: null,
    selected: false,
    created_by: 1,
    created_at: "2026-02-22T10:00:00Z",
    updated_at: "2026-02-22T10:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-segment-versions", () => ({
  useVersionHistory: () => ({
    data: mockVersions,
    isLoading: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("VersionFilmstrip", () => {
  const defaultProps = {
    segmentId: 100,
    selectedV1: 1,
    selectedV2: 3,
    onSelectPair: vi.fn(),
  };

  test("renders version thumbnails for each version", () => {
    renderWithProviders(<VersionFilmstrip {...defaultProps} />);

    expect(screen.getByTestId("filmstrip-version-1")).toBeInTheDocument();
    expect(screen.getByTestId("filmstrip-version-2")).toBeInTheDocument();
    expect(screen.getByTestId("filmstrip-version-3")).toBeInTheDocument();
  });

  test("marks the selected version with a Current badge", () => {
    renderWithProviders(<VersionFilmstrip {...defaultProps} />);

    // Version 2 has selected: true.
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  test("renders version numbers", () => {
    renderWithProviders(<VersionFilmstrip {...defaultProps} />);

    // Use testids because versions without thumbnails show "vN" in both
    // the placeholder and the label, causing duplicate text.
    expect(screen.getByTestId("filmstrip-version-1")).toHaveTextContent("v1");
    expect(screen.getByTestId("filmstrip-version-2")).toHaveTextContent("v2");
    expect(screen.getByTestId("filmstrip-version-3")).toHaveTextContent("v3");
  });

  test("calls onSelectPair when clicking two versions sequentially", () => {
    const onSelectPair = vi.fn();
    renderWithProviders(<VersionFilmstrip {...defaultProps} onSelectPair={onSelectPair} />);

    // Click v1 first, then v3 to form a pair.
    fireEvent.click(screen.getByTestId("filmstrip-version-1"));
    fireEvent.click(screen.getByTestId("filmstrip-version-3"));

    expect(onSelectPair).toHaveBeenCalledWith(1, 3);
  });

  test("shows pending selection message after first click", () => {
    renderWithProviders(<VersionFilmstrip {...defaultProps} />);

    fireEvent.click(screen.getByTestId("filmstrip-version-2"));

    expect(screen.getByText(/Selected v2 — click another version to compare/)).toBeInTheDocument();
  });
});
