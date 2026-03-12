import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";

import { SceneMatrixView } from "../SceneMatrixView";
import type { MatrixCell } from "../types";

import { makeSceneType } from "./fixtures";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_SCENE_TYPE = makeSceneType({
  id: 1,
  name: "Close-up Portrait",
  prompt_template: "Photo of {character_name}",
});

const MOCK_CHARACTERS = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
];

const MOCK_CELLS: MatrixCell[] = [
  {
    character_id: 1,
    scene_type_id: 1,
    variant_type: "clothed",
    existing_scene_id: 10,
    status: "approved",
  },
  {
    character_id: 2,
    scene_type_id: 1,
    variant_type: "clothed",
    existing_scene_id: null,
    status: "not_started",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SceneMatrixView", () => {
  it("renders character rows and scene type columns", () => {
    renderWithProviders(
      <SceneMatrixView
        cells={MOCK_CELLS}
        characters={MOCK_CHARACTERS}
        sceneTypes={[MOCK_SCENE_TYPE]}
      />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Close-up Portrait")).toBeInTheDocument();
  });

  it("shows status badges with colors", () => {
    renderWithProviders(
      <SceneMatrixView
        cells={MOCK_CELLS}
        characters={MOCK_CHARACTERS}
        sceneTypes={[MOCK_SCENE_TYPE]}
      />,
    );

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Not Started")).toBeInTheDocument();
  });

  it("handles empty matrix", () => {
    renderWithProviders(
      <SceneMatrixView
        cells={[]}
        characters={[]}
        sceneTypes={[]}
      />,
    );

    expect(screen.getByText(/No matrix data/)).toBeInTheDocument();
  });
});
