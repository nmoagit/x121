import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { OperationsHistory } from "../OperationsHistory";
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

describe("OperationsHistory", () => {
  it("renders empty state when no operations", () => {
    renderWithProviders(<OperationsHistory operations={[]} />);

    expect(screen.getByTestId("operations-history")).toBeInTheDocument();
    expect(screen.getByTestId("no-operations")).toHaveTextContent(
      "No operations found.",
    );
  });

  it("renders operations table with rows", () => {
    const ops = [makeOperation(), makeOperation({ id: 2, status_id: 4 })];
    renderWithProviders(<OperationsHistory operations={ops} />);

    expect(screen.getByTestId("operations-table")).toBeInTheDocument();
    expect(screen.getByTestId("operation-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("operation-row-2")).toBeInTheDocument();
  });

  it("shows undo button only for completed operations", () => {
    const ops = [
      makeOperation({ id: 1, status_id: 3 }),
      makeOperation({ id: 2, status_id: 4 }),
    ];
    renderWithProviders(<OperationsHistory operations={ops} />);

    expect(screen.getByTestId("undo-btn-1")).toBeInTheDocument();
    expect(screen.queryByTestId("undo-btn-2")).not.toBeInTheDocument();
  });

  it("calls onUndo with operation ID when undo is clicked", () => {
    const onUndo = vi.fn();
    const ops = [makeOperation({ id: 7, status_id: 3 })];
    renderWithProviders(<OperationsHistory operations={ops} onUndo={onUndo} />);

    fireEvent.click(screen.getByTestId("undo-btn-7"));
    expect(onUndo).toHaveBeenCalledWith(7);
  });

  it("calls onSelect when a row is clicked", () => {
    const onSelect = vi.fn();
    const ops = [makeOperation({ id: 3 })];
    renderWithProviders(
      <OperationsHistory operations={ops} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByTestId("operation-row-3"));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("displays correct status badges", () => {
    const ops = [
      makeOperation({ id: 1, status_id: 3 }),
      makeOperation({ id: 2, status_id: 4 }),
    ];
    renderWithProviders(<OperationsHistory operations={ops} />);

    expect(screen.getByTestId("status-badge-1")).toHaveTextContent("Completed");
    expect(screen.getByTestId("status-badge-2")).toHaveTextContent("Failed");
  });
});
