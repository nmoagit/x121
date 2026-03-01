import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";

import { InheritanceTree } from "../InheritanceTree";
import type { SceneType } from "../types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function makeSceneType(overrides: Partial<SceneType> & { id: number; name: string }): SceneType {
  return {
    project_id: null,
    slug: overrides.name.toLowerCase().replace(/\s+/g, "_"),
    status_id: 1,
    description: null,
    workflow_json: null,
    lora_config: null,
    model_config: null,
    prompt_template: null,
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
    has_clothes_off_transition: false,
    is_studio_level: true,
    parent_scene_type_id: null,
    depth: 0,
    generation_strategy: "platform_orchestrated",
    expected_chunks: null,
    chunk_output_pattern: null,
    auto_retry_enabled: false,
    auto_retry_max_attempts: 3,
    auto_retry_trigger_checks: null,
    auto_retry_seed_variation: true,
    auto_retry_cfg_jitter: null,
    deleted_at: null,
    created_at: "2026-02-28T00:00:00Z",
    updated_at: "2026-02-28T00:00:00Z",
    ...overrides,
  };
}

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const ROOT = makeSceneType({ id: 1, name: "Base Portrait", depth: 0 });

const CHILD_A = makeSceneType({
  id: 2,
  name: "Close-up Portrait",
  parent_scene_type_id: 1,
  depth: 1,
});

const CHILD_B = makeSceneType({
  id: 3,
  name: "Wide Portrait",
  parent_scene_type_id: 1,
  depth: 1,
  is_active: false,
});

const GRANDCHILD = makeSceneType({
  id: 4,
  name: "Extreme Close-up",
  parent_scene_type_id: 2,
  depth: 2,
});

const ALL_SCENE_TYPES = [ROOT, CHILD_A, CHILD_B, GRANDCHILD];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("InheritanceTree", () => {
  it("renders all scene type names", () => {
    renderWithProviders(
      <InheritanceTree sceneTypes={ALL_SCENE_TYPES} onSelect={vi.fn()} />,
    );

    expect(screen.getByText("Base Portrait")).toBeInTheDocument();
    expect(screen.getByText("Close-up Portrait")).toBeInTheDocument();
    expect(screen.getByText("Wide Portrait")).toBeInTheDocument();
    expect(screen.getByText("Extreme Close-up")).toBeInTheDocument();
  });

  it("shows active/inactive badges", () => {
    renderWithProviders(
      <InheritanceTree sceneTypes={ALL_SCENE_TYPES} onSelect={vi.fn()} />,
    );

    const activeBadges = screen.getAllByText("Active");
    const inactiveBadges = screen.getAllByText("Inactive");
    expect(activeBadges).toHaveLength(3);
    expect(inactiveBadges).toHaveLength(1);
  });

  it("calls onSelect when a node is clicked", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <InheritanceTree sceneTypes={ALL_SCENE_TYPES} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByText("Close-up Portrait"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("highlights the selected node", () => {
    renderWithProviders(
      <InheritanceTree
        sceneTypes={ALL_SCENE_TYPES}
        selectedId={2}
        onSelect={vi.fn()}
      />,
    );

    const selectedButton = screen.getByText("Close-up Portrait").closest("button");
    expect(selectedButton).toHaveAttribute("aria-current", "true");
  });

  it("renders empty message when no scene types", () => {
    renderWithProviders(
      <InheritanceTree sceneTypes={[]} onSelect={vi.fn()} />,
    );

    expect(screen.getByText("No scene types available.")).toBeInTheDocument();
  });

  it("treats orphan nodes (parent not in list) as roots", () => {
    const orphan = makeSceneType({
      id: 99,
      name: "Orphan Type",
      parent_scene_type_id: 999,
      depth: 1,
    });

    renderWithProviders(
      <InheritanceTree sceneTypes={[orphan]} onSelect={vi.fn()} />,
    );

    expect(screen.getByText("Orphan Type")).toBeInTheDocument();
  });
});
