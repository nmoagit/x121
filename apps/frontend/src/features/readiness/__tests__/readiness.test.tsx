import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { CharacterLibraryStateView } from "../CharacterLibraryStateView";
import { MissingItemTags } from "../MissingItemTags";
import { ReadinessCriteriaEditor } from "../ReadinessCriteriaEditor";
import { ReadinessStateBadge } from "../ReadinessStateBadge";
import { ReadinessSummaryBar } from "../ReadinessSummaryBar";
import { readinessKeys } from "../hooks/use-readiness";
import type { CharacterReadinessCache, ReadinessSummary } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeCache = (
  overrides: Partial<CharacterReadinessCache> = {},
): CharacterReadinessCache => ({
  character_id: 1,
  state: "ready",
  missing_items: [],
  readiness_pct: 100,
  computed_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

const makeSummary = (
  overrides: Partial<ReadinessSummary> = {},
): ReadinessSummary => ({
  total: 10,
  ready: 5,
  partially_ready: 3,
  not_started: 2,
  ...overrides,
});

/* --------------------------------------------------------------------------
   ReadinessStateBadge tests
   -------------------------------------------------------------------------- */

describe("ReadinessStateBadge", () => {
  it("renders ready badge in green", () => {
    renderWithProviders(
      <ReadinessStateBadge state="ready" />,
    );

    expect(screen.getByTestId("readiness-badge-ready")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders partially_ready badge in yellow", () => {
    renderWithProviders(
      <ReadinessStateBadge state="partially_ready" />,
    );

    expect(
      screen.getByTestId("readiness-badge-partially_ready"),
    ).toBeInTheDocument();
    expect(screen.getByText("Partially Ready")).toBeInTheDocument();
  });

  it("renders not_started badge in red", () => {
    renderWithProviders(
      <ReadinessStateBadge state="not_started" />,
    );

    expect(
      screen.getByTestId("readiness-badge-not_started"),
    ).toBeInTheDocument();
    expect(screen.getByText("Not Started")).toBeInTheDocument();
  });

  it("shows missing items in tooltip", () => {
    renderWithProviders(
      <ReadinessStateBadge
        state="partially_ready"
        missingItems={["source_image", "elevenlabs_voice"]}
      />,
    );

    expect(
      screen.getByTestId("readiness-badge-partially_ready"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("missing-items-tooltip")).toBeInTheDocument();
  });

  it("no tooltip when no missing items", () => {
    renderWithProviders(
      <ReadinessStateBadge state="ready" missingItems={[]} />,
    );

    expect(screen.queryByTestId("missing-items-tooltip")).not.toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   MissingItemTags tests
   -------------------------------------------------------------------------- */

describe("MissingItemTags", () => {
  it("renders tags for each missing item", () => {
    renderWithProviders(
      <MissingItemTags items={["source_image", "a2c4_model"]} />,
    );

    expect(screen.getByTestId("missing-tag-source_image")).toBeInTheDocument();
    expect(screen.getByTestId("missing-tag-a2c4_model")).toBeInTheDocument();
  });

  it("returns null when no items", () => {
    const { container } = renderWithProviders(
      <MissingItemTags items={[]} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows overflow count when exceeding maxVisible", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    renderWithProviders(
      <MissingItemTags items={items} maxVisible={3} />,
    );

    expect(screen.getByTestId("missing-tag-overflow")).toBeInTheDocument();
    expect(screen.getByText("+3 more")).toBeInTheDocument();
  });

  it("formats underscores as spaces", () => {
    renderWithProviders(
      <MissingItemTags items={["source_image"]} />,
    );

    expect(screen.getByText("source image")).toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   ReadinessSummaryBar tests
   -------------------------------------------------------------------------- */

describe("ReadinessSummaryBar", () => {
  it("renders summary badges", () => {
    renderWithProviders(
      <ReadinessSummaryBar summary={makeSummary()} />,
    );

    expect(screen.getByTestId("readiness-summary-bar")).toBeInTheDocument();
    expect(screen.getByTestId("summary-ready")).toBeInTheDocument();
    expect(screen.getByTestId("summary-partial")).toBeInTheDocument();
    expect(screen.getByTestId("summary-not-started")).toBeInTheDocument();
  });

  it("shows correct counts", () => {
    renderWithProviders(
      <ReadinessSummaryBar
        summary={makeSummary({ ready: 8, partially_ready: 1, not_started: 1, total: 10 })}
      />,
    );

    expect(screen.getByText("8 ready")).toBeInTheDocument();
    expect(screen.getByText("1 partial")).toBeInTheDocument();
    expect(screen.getByText("1 not started")).toBeInTheDocument();
    expect(screen.getByText("10 total")).toBeInTheDocument();
  });

  it("shows progress bar", () => {
    renderWithProviders(
      <ReadinessSummaryBar summary={makeSummary()} />,
    );

    expect(screen.getByTestId("progress-bar")).toBeInTheDocument();
  });

  it("handles zero total gracefully", () => {
    renderWithProviders(
      <ReadinessSummaryBar
        summary={makeSummary({ total: 0, ready: 0, partially_ready: 0, not_started: 0 })}
      />,
    );

    expect(screen.getByText("0 total")).toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   CharacterLibraryStateView tests
   -------------------------------------------------------------------------- */

describe("CharacterLibraryStateView", () => {
  const characters = [
    {
      id: 1,
      name: "Alice",
      readiness: makeCache({
        character_id: 1,
        state: "ready",
        missing_items: [],
        readiness_pct: 100,
      }),
    },
    {
      id: 2,
      name: "Bob",
      readiness: makeCache({
        character_id: 2,
        state: "partially_ready",
        missing_items: ["source_image"],
        readiness_pct: 67,
      }),
    },
    {
      id: 3,
      name: "Charlie",
      readiness: makeCache({
        character_id: 3,
        state: "not_started",
        missing_items: ["source_image", "a2c4_model", "metadata_complete"],
        readiness_pct: 0,
      }),
    },
  ];

  it("renders character rows", () => {
    renderWithProviders(
      <CharacterLibraryStateView characters={characters} />,
    );

    expect(screen.getByTestId("character-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("character-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("character-row-3")).toBeInTheDocument();
  });

  it("shows empty state when no characters match", () => {
    renderWithProviders(
      <CharacterLibraryStateView characters={[]} />,
    );

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("displays readiness percentage", () => {
    renderWithProviders(
      <CharacterLibraryStateView characters={characters} />,
    );

    expect(screen.getByTestId("readiness-pct-1")).toHaveTextContent("100%");
    expect(screen.getByTestId("readiness-pct-2")).toHaveTextContent("67%");
    expect(screen.getByTestId("readiness-pct-3")).toHaveTextContent("0%");
  });

  it("calls onCharacterClick when name is clicked", () => {
    const onClick = vi.fn();
    renderWithProviders(
      <CharacterLibraryStateView
        characters={characters}
        onCharacterClick={onClick}
      />,
    );

    fireEvent.click(screen.getByTestId("character-name-1"));
    expect(onClick).toHaveBeenCalledWith(1);
  });
});

/* --------------------------------------------------------------------------
   ReadinessCriteriaEditor tests
   -------------------------------------------------------------------------- */

describe("ReadinessCriteriaEditor", () => {
  it("renders with scope label", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ReadinessCriteriaEditor scope="studio" onSave={onSave} />,
    );

    expect(screen.getByTestId("readiness-criteria-editor")).toBeInTheDocument();
    expect(screen.getByTestId("scope-label")).toHaveTextContent("studio");
  });

  it("renders boolean checkboxes", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ReadinessCriteriaEditor scope="studio" onSave={onSave} />,
    );

    expect(screen.getByTestId("boolean-criteria")).toBeInTheDocument();
    expect(screen.getByTestId("check-source-image")).toBeInTheDocument();
    expect(screen.getByTestId("check-approved-variant")).toBeInTheDocument();
    expect(screen.getByTestId("check-metadata-complete")).toBeInTheDocument();
  });

  it("renders default settings keys", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ReadinessCriteriaEditor scope="studio" onSave={onSave} />,
    );

    expect(screen.getByTestId("settings-key-a2c4_model")).toBeInTheDocument();
    expect(screen.getByTestId("settings-key-elevenlabs_voice")).toBeInTheDocument();
    expect(screen.getByTestId("settings-key-avatar_json")).toBeInTheDocument();
  });

  it("calls onSave with criteria when save is clicked", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ReadinessCriteriaEditor scope="project" onSave={onSave} />,
    );

    fireEvent.click(screen.getByTestId("save-criteria-btn"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        required_fields: expect.objectContaining({
          source_image: true,
          approved_variant: true,
          metadata_complete: true,
        }),
      }),
    );
  });

  it("shows affected count warning", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ReadinessCriteriaEditor
        scope="studio"
        onSave={onSave}
        affectedCount={42}
      />,
    );

    expect(screen.getByTestId("affected-count")).toBeInTheDocument();
    expect(screen.getByText(/42 characters/)).toBeInTheDocument();
  });

  it("calls onCancel when cancel is clicked", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <ReadinessCriteriaEditor
        scope="studio"
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByTestId("cancel-criteria-btn"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

/* --------------------------------------------------------------------------
   Hook key factory tests
   -------------------------------------------------------------------------- */

describe("readinessKeys", () => {
  it("all key is stable", () => {
    expect(readinessKeys.all).toEqual(["readiness"]);
  });

  it("character key includes id", () => {
    expect(readinessKeys.character(42)).toEqual([
      "readiness",
      "character",
      42,
    ]);
  });

  it("summary key includes project id", () => {
    expect(readinessKeys.summary(5)).toEqual(["readiness", "summary", 5]);
  });

  it("summary key with no project id", () => {
    expect(readinessKeys.summary()).toEqual([
      "readiness",
      "summary",
      undefined,
    ]);
  });

  it("criteria key is stable", () => {
    expect(readinessKeys.criteria).toEqual(["readiness", "criteria"]);
  });
});
