import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { MatrixThumbnail } from "../MatrixThumbnail";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

// Mock the storyboard hooks to avoid real API calls.
vi.mock("../hooks/use-storyboard", () => ({
  storyboardKeys: {
    all: ["storyboard"],
    scene: (id: number) => ["storyboard", "scene", id],
    segment: (id: number) => ["storyboard", "segment", id],
  },
  useSceneStoryboard: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
import { useSceneStoryboard } from "../hooks/use-storyboard";

const mockUseSceneStoryboard = vi.mocked(useSceneStoryboard);

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("MatrixThumbnail", () => {
  it("renders poster frame when showThumbnail is true and keyframes exist", () => {
    mockUseSceneStoryboard.mockReturnValue({
      data: [
        {
          id: 1,
          segment_id: 10,
          frame_number: 0,
          timestamp_secs: 0.0,
          thumbnail_path: "/thumbs/poster.jpg",
          full_res_path: null,
          created_at: "2026-02-23T10:00:00Z",
          updated_at: "2026-02-23T10:00:00Z",
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useSceneStoryboard>);

    renderWithProviders(<MatrixThumbnail sceneId={42} showThumbnail />);

    const poster = screen.getByTestId("matrix-poster-42");
    expect(poster).toHaveAttribute("src", "/thumbs/poster.jpg");
  });

  it("renders status-only mode when showThumbnail is false", () => {
    mockUseSceneStoryboard.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useSceneStoryboard>);

    renderWithProviders(
      <MatrixThumbnail sceneId={42} showThumbnail={false} />,
    );

    const container = screen.getByTestId("matrix-thumb-42");
    expect(container).toHaveTextContent("Scene 42");
    expect(screen.queryByTestId("matrix-poster-42")).not.toBeInTheDocument();
  });

  it("shows placeholder when showThumbnail is true but no keyframes exist", () => {
    mockUseSceneStoryboard.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useSceneStoryboard>);

    renderWithProviders(<MatrixThumbnail sceneId={42} showThumbnail />);

    const container = screen.getByTestId("matrix-thumb-42");
    expect(container).toHaveTextContent("No poster");
  });
});
