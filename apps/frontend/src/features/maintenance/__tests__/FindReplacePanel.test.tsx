import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { FindReplacePanel } from "../FindReplacePanel";
import type { FieldInfo } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const sampleFields: FieldInfo[] = [
  { entity_type: "character", table_name: "characters", column_name: "name" },
  { entity_type: "scene", table_name: "scenes", column_name: "title" },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("FindReplacePanel", () => {
  it("renders the panel shell", () => {
    renderWithProviders(<FindReplacePanel />);

    expect(screen.getByTestId("find-replace-panel")).toBeInTheDocument();
    expect(screen.getByText("Find & Replace")).toBeInTheDocument();
  });

  it("renders search and replace inputs", () => {
    renderWithProviders(<FindReplacePanel />);

    expect(screen.getByTestId("search-term-input")).toBeInTheDocument();
    expect(screen.getByTestId("replace-with-input")).toBeInTheDocument();
  });

  it("renders regex and case sensitivity toggles", () => {
    renderWithProviders(<FindReplacePanel />);

    expect(screen.getByTestId("use-regex-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("case-sensitive-toggle")).toBeInTheDocument();
  });

  it("disables preview button when inputs are empty", () => {
    renderWithProviders(<FindReplacePanel />);

    expect(screen.getByTestId("preview-btn")).toBeDisabled();
  });

  it("enables preview button when both inputs have values", () => {
    renderWithProviders(<FindReplacePanel />);

    fireEvent.change(screen.getByTestId("search-term-input"), {
      target: { value: "old-text" },
    });
    fireEvent.change(screen.getByTestId("replace-with-input"), {
      target: { value: "new-text" },
    });

    expect(screen.getByTestId("preview-btn")).not.toBeDisabled();
  });

  it("calls onPreview with correct body when preview is clicked", () => {
    const onPreview = vi.fn();
    renderWithProviders(<FindReplacePanel onPreview={onPreview} />);

    fireEvent.change(screen.getByTestId("search-term-input"), {
      target: { value: "foo" },
    });
    fireEvent.change(screen.getByTestId("replace-with-input"), {
      target: { value: "bar" },
    });
    fireEvent.click(screen.getByTestId("preview-btn"));

    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        search_term: "foo",
        replace_with: "bar",
        use_regex: false,
        case_sensitive: true,
      }),
    );
  });

  it("shows preview table when previewFields is provided", () => {
    renderWithProviders(
      <FindReplacePanel
        previewFields={sampleFields}
        previewTotalMatches={2}
        previewOperationId={1}
      />,
    );

    expect(screen.getByTestId("preview-table")).toBeInTheDocument();
    expect(screen.getByTestId("preview-match-count")).toHaveTextContent(
      "2 fields matched",
    );
  });

  it("shows confirmation dialog when execute is clicked", () => {
    renderWithProviders(
      <FindReplacePanel
        previewFields={sampleFields}
        previewTotalMatches={2}
        previewOperationId={1}
      />,
    );

    fireEvent.click(screen.getByTestId("execute-btn"));

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-execute-btn")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-execute-btn")).toBeInTheDocument();
  });

  it("calls onExecute with operation ID when confirmed", () => {
    const onExecute = vi.fn();
    renderWithProviders(
      <FindReplacePanel
        onExecute={onExecute}
        previewFields={sampleFields}
        previewTotalMatches={2}
        previewOperationId={42}
      />,
    );

    fireEvent.click(screen.getByTestId("execute-btn"));
    fireEvent.click(screen.getByTestId("confirm-execute-btn"));

    expect(onExecute).toHaveBeenCalledWith(42);
  });

  it("hides confirmation dialog when cancel is clicked", () => {
    renderWithProviders(
      <FindReplacePanel
        previewFields={sampleFields}
        previewTotalMatches={2}
        previewOperationId={1}
      />,
    );

    fireEvent.click(screen.getByTestId("execute-btn"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cancel-execute-btn"));
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });
});
