import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { PromptSlotsPanel } from "../PromptSlotsPanel";
import type { SceneTypePromptDefault, WorkflowPromptSlot } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-prompt-management", () => ({
  useWorkflowPromptSlots: vi.fn(),
  useSceneTypePromptDefaults: vi.fn(),
  useUpsertPromptDefault: vi.fn(),
}));

import {
  useSceneTypePromptDefaults,
  useUpsertPromptDefault,
  useWorkflowPromptSlots,
} from "../hooks/use-prompt-management";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const SLOT_POSITIVE: WorkflowPromptSlot = {
  id: 1,
  workflow_id: 10,
  node_id: "node_1",
  input_name: "positive_prompt",
  slot_label: "Positive Prompt",
  slot_type: "positive",
  sort_order: 0,
  default_text: "A beautiful {subject}",
  is_user_editable: true,
  description: "Main positive prompt",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const SLOT_NEGATIVE: WorkflowPromptSlot = {
  id: 2,
  workflow_id: 10,
  node_id: "node_2",
  input_name: "negative_prompt",
  slot_label: "Negative Prompt",
  slot_type: "negative",
  sort_order: 1,
  default_text: "blurry, low quality",
  is_user_editable: false,
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const DEFAULT_1: SceneTypePromptDefault = {
  id: 100,
  scene_type_id: 5,
  prompt_slot_id: 1,
  prompt_text: "A stunning {character} portrait",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function setupMocks({
  slots,
  defaults,
  slotsLoading = false,
  defaultsLoading = false,
}: {
  slots?: WorkflowPromptSlot[];
  defaults?: SceneTypePromptDefault[];
  slotsLoading?: boolean;
  defaultsLoading?: boolean;
}) {
  vi.mocked(useWorkflowPromptSlots).mockReturnValue({
    data: slots,
    isPending: slotsLoading,
    isError: false,
  } as ReturnType<typeof useWorkflowPromptSlots>);

  vi.mocked(useSceneTypePromptDefaults).mockReturnValue({
    data: defaults,
    isPending: defaultsLoading,
    isError: false,
  } as ReturnType<typeof useSceneTypePromptDefaults>);

  vi.mocked(useUpsertPromptDefault).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpsertPromptDefault>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("PromptSlotsPanel", () => {
  it("renders all slots with labels", () => {
    setupMocks({ slots: [SLOT_POSITIVE, SLOT_NEGATIVE], defaults: [DEFAULT_1] });

    renderWithProviders(<PromptSlotsPanel workflowId={10} sceneTypeId={5} />);

    expect(screen.getByText("Positive Prompt")).toBeInTheDocument();
    expect(screen.getByText("Negative Prompt")).toBeInTheDocument();
  });

  it("shows read-only indicator for non-editable slots", () => {
    setupMocks({ slots: [SLOT_NEGATIVE], defaults: [] });

    renderWithProviders(<PromptSlotsPanel workflowId={10} sceneTypeId={5} />);

    expect(screen.getByText("(read only)")).toBeInTheDocument();
  });

  it("shows correct type badges", () => {
    setupMocks({ slots: [SLOT_POSITIVE, SLOT_NEGATIVE], defaults: [] });

    renderWithProviders(<PromptSlotsPanel workflowId={10} sceneTypeId={5} />);

    expect(screen.getByText("positive")).toBeInTheDocument();
    expect(screen.getByText("negative")).toBeInTheDocument();
  });

  it("renders textarea for each slot", () => {
    setupMocks({ slots: [SLOT_POSITIVE, SLOT_NEGATIVE], defaults: [DEFAULT_1] });

    renderWithProviders(<PromptSlotsPanel workflowId={10} sceneTypeId={5} />);

    const textarea1 = screen.getByTestId("slot-textarea-1");
    expect(textarea1).toBeInTheDocument();
    expect(textarea1).toHaveValue("A stunning {character} portrait");

    const textarea2 = screen.getByTestId("slot-textarea-2");
    expect(textarea2).toBeInTheDocument();
    expect(textarea2).toHaveAttribute("readOnly");
  });

  it("shows loading spinner while fetching", () => {
    setupMocks({ slotsLoading: true });

    renderWithProviders(<PromptSlotsPanel workflowId={10} sceneTypeId={5} />);

    expect(screen.getByTestId("prompt-slots-loading")).toBeInTheDocument();
  });

  it("shows empty state when no slots", () => {
    setupMocks({ slots: [], defaults: [] });

    renderWithProviders(<PromptSlotsPanel workflowId={10} sceneTypeId={5} />);

    expect(screen.getByTestId("prompt-slots-empty")).toBeInTheDocument();
  });
});
