import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { SetPosterButton } from "../SetPosterButton";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockMutate = vi.fn();

vi.mock("../hooks/use-poster-frame", () => ({
  useSetCharacterPoster: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useSetScenePoster: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SetPosterButton", () => {
  beforeEach(() => {
    mockMutate.mockClear();
  });

  it("renders with correct text", () => {
    renderWithProviders(
      <SetPosterButton
        entityType="character"
        entityId={1}
        segmentId={10}
        currentFrame={42}
      />,
    );

    expect(screen.getByTestId("set-poster-button")).toHaveTextContent(
      "Set as Poster",
    );
  });

  it("calls character mutation with correct payload on click", () => {
    const onSuccess = vi.fn();

    renderWithProviders(
      <SetPosterButton
        entityType="character"
        entityId={5}
        segmentId={10}
        currentFrame={42}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByTestId("set-poster-button"));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        characterId: 5,
        body: {
          segment_id: 10,
          frame_number: 42,
          image_path: "/storage/posters/character/5.jpg",
        },
      },
      { onSuccess },
    );
  });

  it("calls scene mutation for scene entity type", () => {
    renderWithProviders(
      <SetPosterButton
        entityType="scene"
        entityId={3}
        segmentId={20}
        currentFrame={100}
      />,
    );

    fireEvent.click(screen.getByTestId("set-poster-button"));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        sceneId: 3,
        body: {
          segment_id: 20,
          frame_number: 100,
          image_path: "/storage/posters/scene/3.jpg",
        },
      },
      { onSuccess: undefined },
    );
  });
});
