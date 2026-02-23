import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BatchMetadataPanel } from "../BatchMetadataPanel";
import { FieldOperationForm } from "../FieldOperationForm";
import { OperationPreview } from "../OperationPreview";
import { SearchReplaceForm } from "../SearchReplaceForm";
import { batchMetadataKeys } from "../hooks/use-batch-metadata";
import type { BatchMetadataOperation } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeOperation = (
  overrides: Partial<BatchMetadataOperation> = {},
): BatchMetadataOperation => ({
  id: 1,
  status_id: 1,
  operation_type: "search_replace",
  project_id: 10,
  character_ids: [1, 2, 3],
  character_count: 3,
  parameters: { search_pattern: "blonde", replace_with: "brown" },
  before_snapshot: {},
  after_snapshot: {},
  summary: "Search & replace in all fields across 3 characters",
  initiated_by: 1,
  applied_at: null,
  undone_at: null,
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

const defaultBuildRequest = vi.fn((params, fieldName) => ({
  operation_type: "search_replace" as const,
  project_id: 10,
  character_ids: [1, 2, 3],
  parameters: params,
  field_name: fieldName,
}));

/* --------------------------------------------------------------------------
   BatchMetadataPanel tests
   -------------------------------------------------------------------------- */

describe("BatchMetadataPanel", () => {
  it("renders the panel with operation type selector", () => {
    renderWithProviders(
      <BatchMetadataPanel
        projectId={10}
        characterIds={[1, 2, 3]}
      />,
    );

    expect(screen.getByTestId("batch-metadata-panel")).toBeInTheDocument();
    expect(screen.getByTestId("operation-type-selector")).toBeInTheDocument();
  });

  it("shows character count", () => {
    renderWithProviders(
      <BatchMetadataPanel
        projectId={10}
        characterIds={[1, 2, 3]}
      />,
    );

    expect(screen.getByTestId("character-count")).toHaveTextContent(
      "3 characters selected",
    );
  });

  it("shows singular character count for one character", () => {
    renderWithProviders(
      <BatchMetadataPanel
        projectId={10}
        characterIds={[1]}
      />,
    );

    expect(screen.getByTestId("character-count")).toHaveTextContent(
      "1 character selected",
    );
  });

  it("renders the operation form area", () => {
    renderWithProviders(
      <BatchMetadataPanel
        projectId={10}
        characterIds={[1, 2]}
      />,
    );

    expect(screen.getByTestId("operation-form")).toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   SearchReplaceForm tests
   -------------------------------------------------------------------------- */

describe("SearchReplaceForm", () => {
  it("renders all form fields", () => {
    const onPreview = vi.fn();
    renderWithProviders(
      <SearchReplaceForm
        buildRequest={defaultBuildRequest}
        onPreviewCreated={onPreview}
      />,
    );

    expect(screen.getByTestId("search-replace-form")).toBeInTheDocument();
    expect(screen.getByTestId("search-pattern-input")).toBeInTheDocument();
    expect(screen.getByTestId("replace-with-input")).toBeInTheDocument();
    expect(screen.getByTestId("field-name-input")).toBeInTheDocument();
    expect(screen.getByTestId("regex-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("case-sensitive-toggle")).toBeInTheDocument();
  });

  it("has preview button disabled when search pattern is empty", () => {
    const onPreview = vi.fn();
    renderWithProviders(
      <SearchReplaceForm
        buildRequest={defaultBuildRequest}
        onPreviewCreated={onPreview}
      />,
    );

    const btn = screen.getByTestId("preview-search-replace-btn");
    expect(btn).toBeDisabled();
  });

  it("enables preview button when search pattern is filled", () => {
    const onPreview = vi.fn();
    renderWithProviders(
      <SearchReplaceForm
        buildRequest={defaultBuildRequest}
        onPreviewCreated={onPreview}
      />,
    );

    const input = screen.getByTestId("search-pattern-input");
    fireEvent.change(input, { target: { value: "test" } });

    const btn = screen.getByTestId("preview-search-replace-btn");
    expect(btn).not.toBeDisabled();
  });
});

/* --------------------------------------------------------------------------
   FieldOperationForm tests
   -------------------------------------------------------------------------- */

describe("FieldOperationForm", () => {
  it("renders all base fields", () => {
    const onPreview = vi.fn();
    renderWithProviders(
      <FieldOperationForm
        buildRequest={defaultBuildRequest}
        onPreviewCreated={onPreview}
      />,
    );

    expect(screen.getByTestId("field-operation-form")).toBeInTheDocument();
    expect(screen.getByTestId("field-op-select")).toBeInTheDocument();
    expect(screen.getByTestId("target-field-input")).toBeInTheDocument();
  });

  it("has preview button disabled when target field is empty", () => {
    const onPreview = vi.fn();
    renderWithProviders(
      <FieldOperationForm
        buildRequest={defaultBuildRequest}
        onPreviewCreated={onPreview}
      />,
    );

    const btn = screen.getByTestId("preview-field-op-btn");
    expect(btn).toBeDisabled();
  });

  it("enables preview button when target field is filled", () => {
    const onPreview = vi.fn();
    renderWithProviders(
      <FieldOperationForm
        buildRequest={defaultBuildRequest}
        onPreviewCreated={onPreview}
      />,
    );

    const input = screen.getByTestId("target-field-input");
    fireEvent.change(input, { target: { value: "hair_color" } });

    const btn = screen.getByTestId("preview-field-op-btn");
    expect(btn).not.toBeDisabled();
  });
});

/* --------------------------------------------------------------------------
   OperationPreview tests
   -------------------------------------------------------------------------- */

describe("OperationPreview", () => {
  it("renders operation details", () => {
    const op = makeOperation();
    renderWithProviders(
      <OperationPreview operation={op} />,
    );

    expect(screen.getByTestId("operation-preview")).toBeInTheDocument();
    expect(screen.getByTestId("preview-summary")).toHaveTextContent(op.summary);
    expect(screen.getByTestId("preview-type")).toHaveTextContent(
      "search replace",
    );
    expect(screen.getByTestId("preview-character-count")).toHaveTextContent(
      "3",
    );
  });

  it("shows execute button enabled for preview status", () => {
    const op = makeOperation({ status_id: 1 });
    renderWithProviders(
      <OperationPreview operation={op} />,
    );

    const btn = screen.getByTestId("execute-btn");
    expect(btn).not.toBeDisabled();
  });

  it("shows execute button disabled for non-preview status", () => {
    const op = makeOperation({ status_id: 3 });
    renderWithProviders(
      <OperationPreview operation={op} />,
    );

    const btn = screen.getByTestId("execute-btn");
    expect(btn).toBeDisabled();
  });

  it("shows status badge", () => {
    const op = makeOperation({ status_id: 1 });
    renderWithProviders(
      <OperationPreview operation={op} />,
    );

    expect(screen.getByTestId("preview-status")).toHaveTextContent("Preview");
  });

  it("renders cancel button when onCancel is provided", () => {
    const op = makeOperation();
    const onCancel = vi.fn();
    renderWithProviders(
      <OperationPreview operation={op} onCancel={onCancel} />,
    );

    const btn = screen.getByTestId("cancel-preview-btn");
    fireEvent.click(btn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not render cancel button when onCancel is absent", () => {
    const op = makeOperation();
    renderWithProviders(
      <OperationPreview operation={op} />,
    );

    expect(
      screen.queryByTestId("cancel-preview-btn"),
    ).not.toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   Hook key factory tests
   -------------------------------------------------------------------------- */

describe("batchMetadataKeys", () => {
  it("all key is stable", () => {
    expect(batchMetadataKeys.all).toEqual(["batchMetadata"]);
  });

  it("list key includes params", () => {
    expect(
      batchMetadataKeys.list({ project_id: 5, limit: 10 }),
    ).toEqual(["batchMetadata", "list", { project_id: 5, limit: 10 }]);
  });

  it("list key with no params", () => {
    expect(batchMetadataKeys.list()).toEqual([
      "batchMetadata",
      "list",
      undefined,
    ]);
  });

  it("detail key includes id", () => {
    expect(batchMetadataKeys.detail(42)).toEqual([
      "batchMetadata",
      "detail",
      42,
    ]);
  });
});
