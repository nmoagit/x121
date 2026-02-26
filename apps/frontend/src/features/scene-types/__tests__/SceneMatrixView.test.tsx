import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";

import { SceneMatrixView } from "../SceneMatrixView";
import type { MatrixCell, SceneType } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_SCENE_TYPE: SceneType = {
  id: 1,
  project_id: null,
  name: "Close-up Portrait",
  status_id: 1,
  description: null,
  workflow_json: null,
  lora_config: null,
  model_config: null,
  prompt_template: "Photo of {character_name}",
  negative_prompt_template: null,
  prompt_start_clip: null,
  negative_prompt_start_clip: null,
  prompt_continuation_clip: null,
  negative_prompt_continuation_clip: null,
  target_duration_secs: null,
  segment_duration_secs: null,
  duration_tolerance_secs: 2,
  transition_segment_index: null,
  generation_params: null,
  sort_order: 0,
  is_active: true,
  is_studio_level: true,
  deleted_at: null,
  created_at: "2026-02-21T00:00:00Z",
  updated_at: "2026-02-21T00:00:00Z",
};

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
