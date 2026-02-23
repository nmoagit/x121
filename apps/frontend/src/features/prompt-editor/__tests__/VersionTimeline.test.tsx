import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { VersionTimeline } from "../VersionTimeline";
import type { PromptVersion } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeVersion = (overrides: Partial<PromptVersion> = {}): PromptVersion => ({
  id: 1,
  scene_type_id: 10,
  version: 1,
  positive_prompt: "A beautiful landscape",
  negative_prompt: null,
  change_notes: null,
  created_by_id: 1,
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

const versions: PromptVersion[] = [
  makeVersion({ id: 3, version: 3, change_notes: "Added lighting" }),
  makeVersion({ id: 2, version: 2, change_notes: "Updated style" }),
  makeVersion({ id: 1, version: 1, change_notes: "Initial prompt" }),
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("VersionTimeline", () => {
  it("renders the timeline with version items", () => {
    renderWithProviders(
      <VersionTimeline sceneTypeId={10} versions={versions} />,
    );

    expect(screen.getByTestId("version-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("version-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("version-item-2")).toBeInTheDocument();
    expect(screen.getByTestId("version-item-3")).toBeInTheDocument();
  });

  it("shows empty state when no versions provided", () => {
    renderWithProviders(
      <VersionTimeline sceneTypeId={10} versions={[]} />,
    );

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No versions yet. Save a prompt to create the first version.",
      ),
    ).toBeInTheDocument();
  });

  it("shows restore button for each version", () => {
    const onRestore = vi.fn();
    renderWithProviders(
      <VersionTimeline
        sceneTypeId={10}
        versions={versions}
        onRestore={onRestore}
      />,
    );

    expect(screen.getByTestId("restore-btn-1")).toBeInTheDocument();
    expect(screen.getByTestId("restore-btn-2")).toBeInTheDocument();
    expect(screen.getByTestId("restore-btn-3")).toBeInTheDocument();
  });

  it("calls onRestore when restore is clicked", () => {
    const onRestore = vi.fn();
    renderWithProviders(
      <VersionTimeline
        sceneTypeId={10}
        versions={versions}
        onRestore={onRestore}
      />,
    );

    fireEvent.click(screen.getByTestId("restore-btn-2"));
    expect(onRestore).toHaveBeenCalledWith(2);
  });

  it("displays version numbers as badges", () => {
    renderWithProviders(
      <VersionTimeline sceneTypeId={10} versions={versions} />,
    );

    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
  });
});
