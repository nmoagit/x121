import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ConfigDiffView } from "../ConfigDiffView";
import type { ConfigDiffEntry } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const DIFF_ENTRIES: ConfigDiffEntry[] = [
  {
    scene_type_name: "close-up",
    status: "added",
    current_value: null,
    incoming_value: { name: "close-up", prompt: "test" },
  },
  {
    scene_type_name: "wide-shot",
    status: "changed",
    current_value: { name: "wide-shot", prompt: "old" },
    incoming_value: { name: "wide-shot", prompt: "new" },
  },
  {
    scene_type_name: "aerial",
    status: "unchanged",
    current_value: { name: "aerial", prompt: "same" },
    incoming_value: { name: "aerial", prompt: "same" },
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ConfigDiffView", () => {
  it("renders diff entries", () => {
    renderWithProviders(<ConfigDiffView entries={DIFF_ENTRIES} />);

    expect(screen.getByTestId("config-diff-view")).toBeInTheDocument();
    expect(screen.getByTestId("diff-entry-close-up")).toBeInTheDocument();
    expect(screen.getByTestId("diff-entry-wide-shot")).toBeInTheDocument();
    expect(screen.getByTestId("diff-entry-aerial")).toBeInTheDocument();
  });

  it("shows added badge for added entries", () => {
    renderWithProviders(<ConfigDiffView entries={DIFF_ENTRIES} />);

    const addedEntry = screen.getByTestId("diff-entry-close-up");
    expect(addedEntry).toHaveTextContent("Added");
  });

  it("shows changed badge for changed entries", () => {
    renderWithProviders(<ConfigDiffView entries={DIFF_ENTRIES} />);

    const changedEntry = screen.getByTestId("diff-entry-wide-shot");
    expect(changedEntry).toHaveTextContent("Changed");
  });

  it("shows unchanged badge for unchanged entries", () => {
    renderWithProviders(<ConfigDiffView entries={DIFF_ENTRIES} />);

    const unchangedEntry = screen.getByTestId("diff-entry-aerial");
    expect(unchangedEntry).toHaveTextContent("Unchanged");
  });

  it("shows empty state when no entries", () => {
    renderWithProviders(<ConfigDiffView entries={[]} />);

    expect(screen.getByTestId("diff-empty")).toBeInTheDocument();
  });

  it("renders accept and cancel buttons when provided", () => {
    const onAccept = () => {};
    const onCancel = () => {};

    renderWithProviders(
      <ConfigDiffView
        entries={DIFF_ENTRIES}
        onAccept={onAccept}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId("diff-accept-btn")).toBeInTheDocument();
    expect(screen.getByTestId("diff-cancel-btn")).toBeInTheDocument();
  });
});
