import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { PosterGallery } from "../PosterGallery";
import type { PosterFrame } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makePoster = (overrides: Partial<PosterFrame> = {}): PosterFrame => ({
  id: 1,
  entity_type: "character",
  entity_id: 1,
  segment_id: 10,
  frame_number: 42,
  image_path: "/posters/char1.jpg",
  crop_settings_json: null,
  brightness: 1.0,
  contrast: 1.0,
  created_by: 1,
  created_at: "2026-02-28T10:00:00Z",
  updated_at: "2026-02-28T10:00:00Z",
  ...overrides,
});

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockAutoSelectMutate = vi.fn();

let mockPosters: PosterFrame[] = [];
let mockIsLoading = false;

vi.mock("../hooks/use-poster-frame", () => ({
  usePosterGallery: () => ({
    data: mockPosters,
    isLoading: mockIsLoading,
  }),
  useAutoSelectPosters: () => ({
    mutate: mockAutoSelectMutate,
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("PosterGallery", () => {
  beforeEach(() => {
    mockPosters = [];
    mockIsLoading = false;
    mockAutoSelectMutate.mockClear();
  });

  it("renders empty state when no posters exist", () => {
    renderWithProviders(<PosterGallery projectId={1} />);

    expect(screen.getByTestId("poster-gallery-empty")).toBeInTheDocument();
    expect(screen.getByText("No poster frames have been set yet.")).toBeInTheDocument();
  });

  it("renders grid when posters exist", () => {
    mockPosters = [
      makePoster({ id: 1, entity_id: 1 }),
      makePoster({ id: 2, entity_id: 2, image_path: "/posters/char2.jpg" }),
    ];

    renderWithProviders(<PosterGallery projectId={1} />);

    expect(screen.getByTestId("poster-gallery")).toBeInTheDocument();
    expect(screen.getAllByTestId("poster-card")).toHaveLength(2);
    expect(screen.getByText("Poster Frames (2)")).toBeInTheDocument();
  });

  it("calls auto-select mutation when button is clicked", () => {
    mockPosters = [makePoster()];

    renderWithProviders(<PosterGallery projectId={7} />);

    fireEvent.click(screen.getByTestId("auto-select-button"));

    expect(mockAutoSelectMutate).toHaveBeenCalledWith(7);
  });

  it("calls auto-select from empty state button", () => {
    renderWithProviders(<PosterGallery projectId={7} />);

    fireEvent.click(screen.getByText("Auto-select best frames"));

    expect(mockAutoSelectMutate).toHaveBeenCalledWith(7);
  });

  it("fires onPosterClick when a card is clicked", () => {
    const onPosterClick = vi.fn();
    const poster = makePoster();
    mockPosters = [poster];

    renderWithProviders(
      <PosterGallery projectId={1} onPosterClick={onPosterClick} />,
    );

    fireEvent.click(screen.getByTestId("poster-card"));

    expect(onPosterClick).toHaveBeenCalledWith(poster);
  });
});
