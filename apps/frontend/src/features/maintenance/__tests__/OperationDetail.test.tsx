import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { OperationDetail } from "../OperationDetail";
import type { BulkOperation } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeOperation = (
  overrides: Partial<BulkOperation> = {},
): BulkOperation => ({
  id: 1,
  operation_type_id: 1,
  status_id: 3,
  parameters: { search_term: "foo", replace_with: "bar" },
  scope_project_id: null,
  affected_entity_type: "character",
  affected_field: "name",
  preview_count: 5,
  affected_count: 3,
  undo_data: [],
  error_message: null,
  executed_by: 1,
  executed_at: "2026-02-23T12:00:00Z",
  undone_at: null,
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T12:00:00Z",
  ...overrides,
});

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("OperationDetail", () => {
  it("renders the detail view", () => {
    renderWithProviders(<OperationDetail operation={makeOperation()} />);

    expect(screen.getByTestId("operation-detail")).toBeInTheDocument();
    expect(screen.getByText("Operation #1")).toBeInTheDocument();
  });

  it("displays operation metadata", () => {
    renderWithProviders(<OperationDetail operation={makeOperation()} />);

    expect(screen.getByTestId("operation-metadata")).toBeInTheDocument();
    expect(screen.getByText("Find & Replace")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("displays operation parameters as JSON", () => {
    renderWithProviders(<OperationDetail operation={makeOperation()} />);

    const params = screen.getByTestId("operation-parameters");
    expect(params).toHaveTextContent("foo");
    expect(params).toHaveTextContent("bar");
  });

  it("shows undo button for completed operations", () => {
    renderWithProviders(
      <OperationDetail operation={makeOperation({ status_id: 3 })} />,
    );

    expect(screen.getByTestId("undo-btn")).toBeInTheDocument();
  });

  it("hides undo button for non-completed operations", () => {
    renderWithProviders(
      <OperationDetail operation={makeOperation({ status_id: 4 })} />,
    );

    expect(screen.queryByTestId("undo-btn")).not.toBeInTheDocument();
  });

  it("calls onUndo when undo button is clicked", () => {
    const onUndo = vi.fn();
    renderWithProviders(
      <OperationDetail
        operation={makeOperation({ id: 9, status_id: 3 })}
        onUndo={onUndo}
      />,
    );

    fireEvent.click(screen.getByTestId("undo-btn"));
    expect(onUndo).toHaveBeenCalledWith(9);
  });

  it("calls onBack when back button is clicked", () => {
    const onBack = vi.fn();
    renderWithProviders(
      <OperationDetail operation={makeOperation()} onBack={onBack} />,
    );

    fireEvent.click(screen.getByTestId("back-btn"));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows error message when present", () => {
    renderWithProviders(
      <OperationDetail
        operation={makeOperation({ error_message: "Something went wrong" })}
      />,
    );

    expect(screen.getByTestId("error-message")).toHaveTextContent(
      "Something went wrong",
    );
  });

  it("does not show error message when absent", () => {
    renderWithProviders(
      <OperationDetail operation={makeOperation({ error_message: null })} />,
    );

    expect(screen.queryByTestId("error-message")).not.toBeInTheDocument();
  });
});
