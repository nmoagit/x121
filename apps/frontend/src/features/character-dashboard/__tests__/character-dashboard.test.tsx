import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { GenerationHistorySection } from "../GenerationHistorySection";
import { MetadataSummarySection } from "../MetadataSummarySection";
import { MissingItemsBanner } from "../MissingItemsBanner";
import { PipelineSettingsEditor } from "../PipelineSettingsEditor";
import { SceneAssignmentsSection } from "../SceneAssignmentsSection";
import { characterDashboardKeys } from "../hooks/use-character-dashboard";
import type {
  GenerationSummary,
  MissingItem,
  SceneAssignment,
} from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeMissingItem = (
  overrides: Partial<MissingItem> = {},
): MissingItem => ({
  category: "source_image",
  label: "source image",
  actionUrl: "/characters/1/source-images",
  ...overrides,
});

const makeGenerationSummary = (
  overrides: Partial<GenerationSummary> = {},
): GenerationSummary => ({
  total_segments: 100,
  approved: 60,
  rejected: 15,
  pending: 25,
  ...overrides,
});

const makeAssignment = (
  overrides: Partial<SceneAssignment> = {},
): SceneAssignment => ({
  scene_id: 1,
  scene_name: "Opening Scene",
  status: "completed",
  segment_count: 5,
  ...overrides,
});

/* --------------------------------------------------------------------------
   MissingItemsBanner tests
   -------------------------------------------------------------------------- */

describe("MissingItemsBanner", () => {
  it("renders nothing when items is empty", () => {
    const { container } = renderWithProviders(
      <MissingItemsBanner items={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the banner with correct count", () => {
    const items = [
      makeMissingItem(),
      makeMissingItem({
        category: "approved_variant",
        label: "approved variant",
      }),
    ];
    renderWithProviders(<MissingItemsBanner items={items} />);
    expect(screen.getByTestId("missing-items-banner")).toBeInTheDocument();
    expect(screen.getByTestId("missing-items-count")).toHaveTextContent(
      "2 missing items",
    );
  });

  it("renders singular text for one item", () => {
    renderWithProviders(
      <MissingItemsBanner items={[makeMissingItem()]} />,
    );
    expect(screen.getByTestId("missing-items-count")).toHaveTextContent(
      "1 missing item to resolve",
    );
  });

  it("renders item rows with categories", () => {
    const items = [
      makeMissingItem({ category: "source_image" }),
      makeMissingItem({
        category: "pipeline_setting",
        label: "a2c4 model",
      }),
    ];
    renderWithProviders(<MissingItemsBanner items={items} />);
    expect(screen.getByTestId("missing-item-source_image")).toBeInTheDocument();
    expect(
      screen.getByTestId("missing-item-pipeline_setting"),
    ).toBeInTheDocument();
  });

  it("calls onAction when resolve is clicked", () => {
    const onAction = vi.fn();
    const item = makeMissingItem();
    renderWithProviders(
      <MissingItemsBanner items={[item]} onAction={onAction} />,
    );
    fireEvent.click(screen.getByTestId("action-btn-source_image"));
    expect(onAction).toHaveBeenCalledWith(item);
  });
});

/* --------------------------------------------------------------------------
   PipelineSettingsEditor tests
   -------------------------------------------------------------------------- */

describe("PipelineSettingsEditor", () => {
  it("renders the editor with known keys", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <PipelineSettingsEditor settings={{}} onSave={onSave} />,
    );
    expect(
      screen.getByTestId("pipeline-settings-editor"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("setting-row-a2c4_model")).toBeInTheDocument();
    expect(
      screen.getByTestId("setting-row-elevenlabs_voice"),
    ).toBeInTheDocument();
  });

  it("populates inputs with existing settings", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <PipelineSettingsEditor
        settings={{ a2c4_model: "model_v2" }}
        onSave={onSave}
      />,
    );
    const input = screen.getByTestId(
      "setting-input-a2c4_model",
    ) as HTMLInputElement;
    expect(input.value).toBe("model_v2");
  });

  it("shows extra keys from settings", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <PipelineSettingsEditor
        settings={{ custom_key: "val" }}
        onSave={onSave}
      />,
    );
    expect(screen.getByTestId("setting-row-custom_key")).toBeInTheDocument();
  });

  it("save button is disabled when no changes", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <PipelineSettingsEditor settings={{}} onSave={onSave} />,
    );
    const btn = screen.getByTestId("save-settings-btn");
    expect(btn).toBeDisabled();
  });

  it("calls onSave with changed values", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <PipelineSettingsEditor settings={{}} onSave={onSave} />,
    );
    const input = screen.getByTestId("setting-input-a2c4_model");
    fireEvent.change(input, { target: { value: "new_model" } });
    fireEvent.click(screen.getByTestId("save-settings-btn"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ a2c4_model: "new_model" }),
    );
  });

  it("shows saving text when isSaving", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <PipelineSettingsEditor
        settings={{}}
        onSave={onSave}
        isSaving={true}
      />,
    );
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   MetadataSummarySection tests
   -------------------------------------------------------------------------- */

describe("MetadataSummarySection", () => {
  it("renders completeness percentage", () => {
    renderWithProviders(
      <MetadataSummarySection
        characterId={1}
        settings={{ a2c4_model: "v1", elevenlabs_voice: "v2" }}
        sourceImageCount={3}
      />,
    );
    expect(
      screen.getByTestId("metadata-summary-section"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("metadata-completeness-badge"),
    ).toBeInTheDocument();
  });

  it("shows 100% when all fields filled", () => {
    const settings = {
      a2c4_model: "v1",
      elevenlabs_voice: "v2",
      avatar_json: "j",
      lora_model: "m",
      comfyui_workflow: "w",
    };
    renderWithProviders(
      <MetadataSummarySection
        characterId={1}
        settings={settings}
        sourceImageCount={1}
      />,
    );
    expect(
      screen.getByTestId("metadata-completeness-badge"),
    ).toHaveTextContent("100%");
  });

  it("shows source image count", () => {
    renderWithProviders(
      <MetadataSummarySection
        characterId={1}
        settings={{}}
        sourceImageCount={5}
      />,
    );
    expect(screen.getByTestId("source-image-count")).toHaveTextContent(
      "5 source images",
    );
  });

  it("calls onEditClick when button clicked", () => {
    const onEdit = vi.fn();
    renderWithProviders(
      <MetadataSummarySection
        characterId={42}
        settings={{}}
        sourceImageCount={0}
        onEditClick={onEdit}
      />,
    );
    fireEvent.click(screen.getByTestId("edit-metadata-btn"));
    expect(onEdit).toHaveBeenCalledWith(42);
  });
});

/* --------------------------------------------------------------------------
   SceneAssignmentsSection tests
   -------------------------------------------------------------------------- */

describe("SceneAssignmentsSection", () => {
  it("shows scene count", () => {
    renderWithProviders(
      <SceneAssignmentsSection assignments={[]} sceneCount={7} />,
    );
    expect(screen.getByTestId("scene-count")).toHaveTextContent("7 scenes");
  });

  it("shows singular scene text", () => {
    renderWithProviders(
      <SceneAssignmentsSection assignments={[]} sceneCount={1} />,
    );
    expect(screen.getByTestId("scene-count")).toHaveTextContent("1 scene");
  });

  it("shows no-assignments when empty", () => {
    renderWithProviders(
      <SceneAssignmentsSection assignments={[]} sceneCount={0} />,
    );
    expect(screen.getByTestId("no-assignments")).toBeInTheDocument();
  });

  it("renders assignment rows", () => {
    const assignments = [
      makeAssignment({ scene_id: 1, scene_name: "Scene A" }),
      makeAssignment({ scene_id: 2, scene_name: "Scene B" }),
    ];
    renderWithProviders(
      <SceneAssignmentsSection assignments={assignments} sceneCount={2} />,
    );
    expect(screen.getByTestId("assignment-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("assignment-row-2")).toBeInTheDocument();
  });

  it("calls onSceneClick when row is clicked", () => {
    const onClick = vi.fn();
    const assignments = [makeAssignment({ scene_id: 42, scene_name: "S" })];
    renderWithProviders(
      <SceneAssignmentsSection
        assignments={assignments}
        sceneCount={1}
        onSceneClick={onClick}
      />,
    );
    fireEvent.click(screen.getByTestId("assignment-row-42"));
    expect(onClick).toHaveBeenCalledWith(42);
  });
});

/* --------------------------------------------------------------------------
   GenerationHistorySection tests
   -------------------------------------------------------------------------- */

describe("GenerationHistorySection", () => {
  it("renders summary stats", () => {
    renderWithProviders(
      <GenerationHistorySection summary={makeGenerationSummary()} />,
    );
    expect(
      screen.getByTestId("generation-history-section"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("gen-total")).toBeInTheDocument();
    expect(screen.getByTestId("gen-approved")).toBeInTheDocument();
    expect(screen.getByTestId("gen-rejected")).toBeInTheDocument();
    expect(screen.getByTestId("gen-pending")).toBeInTheDocument();
  });

  it("shows correct values", () => {
    renderWithProviders(
      <GenerationHistorySection
        summary={makeGenerationSummary({
          total_segments: 50,
          approved: 30,
          rejected: 10,
          pending: 10,
        })}
      />,
    );
    expect(screen.getByTestId("gen-total")).toHaveTextContent("50");
    expect(screen.getByTestId("gen-approved")).toHaveTextContent("30");
    expect(screen.getByTestId("gen-rejected")).toHaveTextContent("10");
    expect(screen.getByTestId("gen-pending")).toHaveTextContent("10");
  });

  it("shows progress bar when total > 0", () => {
    renderWithProviders(
      <GenerationHistorySection summary={makeGenerationSummary()} />,
    );
    expect(screen.getByTestId("gen-progress-bar")).toBeInTheDocument();
  });

  it("hides progress bar when total is 0", () => {
    renderWithProviders(
      <GenerationHistorySection
        summary={makeGenerationSummary({
          total_segments: 0,
          approved: 0,
          rejected: 0,
          pending: 0,
        })}
      />,
    );
    expect(screen.queryByTestId("gen-progress-bar")).not.toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   Hook key factory tests
   -------------------------------------------------------------------------- */

describe("characterDashboardKeys", () => {
  it("all key is stable", () => {
    expect(characterDashboardKeys.all).toEqual(["character-dashboard"]);
  });

  it("dashboard key includes characterId", () => {
    expect(characterDashboardKeys.dashboard(42)).toEqual([
      "character-dashboard",
      "dashboard",
      42,
    ]);
  });

  it("settings key includes characterId", () => {
    expect(characterDashboardKeys.settings(7)).toEqual([
      "character-dashboard",
      "settings",
      7,
    ]);
  });
});
