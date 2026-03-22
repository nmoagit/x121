import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { AvatarSceneOverrideEditor } from "../AvatarSceneOverrideEditor";
import type {
  AvatarScenePromptOverride,
  SceneTypePromptDefault,
  WorkflowPromptSlot,
} from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-prompt-management", () => ({
  useWorkflowPromptSlots: vi.fn(),
  useSceneTypePromptDefaults: vi.fn(),
  useAvatarSceneOverrides: vi.fn(),
  useUpsertAvatarSceneOverrides: vi.fn(),
  usePromptFragments: vi.fn(),
}));

import {
  useAvatarSceneOverrides,
  usePromptFragments,
  useSceneTypePromptDefaults,
  useUpsertAvatarSceneOverrides,
  useWorkflowPromptSlots,
} from "../hooks/use-prompt-management";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const EDITABLE_SLOT: WorkflowPromptSlot = {
  id: 1,
  workflow_id: 10,
  node_id: "node_1",
  input_name: "positive_prompt",
  slot_label: "Positive Prompt",
  slot_type: "positive",
  sort_order: 0,
  default_text: "default positive text",
  is_user_editable: true,
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const NON_EDITABLE_SLOT: WorkflowPromptSlot = {
  id: 2,
  workflow_id: 10,
  node_id: "node_2",
  input_name: "negative_prompt",
  slot_label: "Negative Prompt",
  slot_type: "negative",
  sort_order: 1,
  default_text: "blurry",
  is_user_editable: false,
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const PROMPT_DEFAULT: SceneTypePromptDefault = {
  id: 100,
  scene_type_id: 5,
  prompt_slot_id: 1,
  prompt_text: "scene type default text",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const OVERRIDE_WITH_FRAGMENTS: AvatarScenePromptOverride = {
  id: 200,
  avatar_id: 3,
  scene_type_id: 5,
  prompt_slot_id: 1,
  fragments: [
    { type: "fragment_ref", fragment_id: 10, text: "high quality" },
    { type: "inline", text: "custom addition" },
  ],
  override_text: null,
  notes: "Test notes",
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function setupMocks({
  slots,
  defaults,
  overrides,
  slotsLoading = false,
  overridesLoading = false,
}: {
  slots?: WorkflowPromptSlot[];
  defaults?: SceneTypePromptDefault[];
  overrides?: AvatarScenePromptOverride[];
  slotsLoading?: boolean;
  overridesLoading?: boolean;
}) {
  vi.mocked(useWorkflowPromptSlots).mockReturnValue({
    data: slots,
    isPending: slotsLoading,
    isError: false,
  } as ReturnType<typeof useWorkflowPromptSlots>);

  vi.mocked(useSceneTypePromptDefaults).mockReturnValue({
    data: defaults,
    isPending: false,
    isError: false,
  } as ReturnType<typeof useSceneTypePromptDefaults>);

  vi.mocked(useAvatarSceneOverrides).mockReturnValue({
    data: overrides,
    isPending: overridesLoading,
    isError: false,
  } as ReturnType<typeof useAvatarSceneOverrides>);

  vi.mocked(useUpsertAvatarSceneOverrides).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpsertAvatarSceneOverrides>);

  vi.mocked(usePromptFragments).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof usePromptFragments>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("AvatarSceneOverrideEditor", () => {
  it("renders slot sections with base text", () => {
    setupMocks({
      slots: [EDITABLE_SLOT],
      defaults: [PROMPT_DEFAULT],
      overrides: [],
    });

    renderWithProviders(
      <AvatarSceneOverrideEditor avatarId={3} sceneTypeId={5} workflowId={10} />,
    );

    expect(screen.getByText("Positive Prompt")).toBeInTheDocument();
    expect(screen.getByTestId("base-text-1")).toHaveTextContent("scene type default text");
  });

  it("only shows editable slots (filters out non-editable)", () => {
    setupMocks({
      slots: [EDITABLE_SLOT, NON_EDITABLE_SLOT],
      defaults: [],
      overrides: [],
    });

    renderWithProviders(
      <AvatarSceneOverrideEditor avatarId={3} sceneTypeId={5} workflowId={10} />,
    );

    expect(screen.getByText("Positive Prompt")).toBeInTheDocument();
    expect(screen.queryByText("Negative Prompt")).not.toBeInTheDocument();
  });

  it("shows fragment list for each slot", () => {
    setupMocks({
      slots: [EDITABLE_SLOT],
      defaults: [PROMPT_DEFAULT],
      overrides: [OVERRIDE_WITH_FRAGMENTS],
    });

    renderWithProviders(
      <AvatarSceneOverrideEditor avatarId={3} sceneTypeId={5} workflowId={10} />,
    );

    expect(screen.getByText("high quality")).toBeInTheDocument();
    expect(screen.getByText("custom addition")).toBeInTheDocument();
  });

  it("shows remove button for fragments", () => {
    setupMocks({
      slots: [EDITABLE_SLOT],
      defaults: [PROMPT_DEFAULT],
      overrides: [OVERRIDE_WITH_FRAGMENTS],
    });

    renderWithProviders(
      <AvatarSceneOverrideEditor avatarId={3} sceneTypeId={5} workflowId={10} />,
    );

    expect(screen.getByTestId("remove-fragment-1-0")).toBeInTheDocument();
    expect(screen.getByTestId("remove-fragment-1-1")).toBeInTheDocument();
  });

  it("shows loading spinner while fetching", () => {
    setupMocks({ slotsLoading: true });

    renderWithProviders(
      <AvatarSceneOverrideEditor avatarId={3} sceneTypeId={5} workflowId={10} />,
    );

    expect(screen.getByTestId("override-editor-loading")).toBeInTheDocument();
  });

  it("shows save button", () => {
    setupMocks({
      slots: [EDITABLE_SLOT],
      defaults: [],
      overrides: [],
    });

    renderWithProviders(
      <AvatarSceneOverrideEditor avatarId={3} sceneTypeId={5} workflowId={10} />,
    );

    expect(screen.getByTestId("override-save-btn")).toBeInTheDocument();
  });
});
