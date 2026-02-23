import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { PreviewTable } from "../PreviewTable";
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

describe("PreviewTable", () => {
  it("renders empty state when no fields", () => {
    renderWithProviders(
      <PreviewTable fields={[]} oldValue="old" newValue="new" />,
    );

    expect(screen.getByTestId("no-preview-matches")).toHaveTextContent(
      "No matching fields found.",
    );
  });

  it("renders a table with field rows", () => {
    renderWithProviders(
      <PreviewTable fields={sampleFields} oldValue="old" newValue="new" />,
    );

    expect(screen.getByTestId("preview-table")).toBeInTheDocument();
    expect(screen.getByTestId("preview-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("preview-row-1")).toBeInTheDocument();
  });

  it("shows old and new values in each row", () => {
    renderWithProviders(
      <PreviewTable
        fields={sampleFields.slice(0, 1)}
        oldValue="search-term"
        newValue="replacement"
      />,
    );

    const row = screen.getByTestId("preview-row-0");
    expect(row).toHaveTextContent("search-term");
    expect(row).toHaveTextContent("replacement");
  });

  it("displays entity type, table name, and column name", () => {
    renderWithProviders(
      <PreviewTable
        fields={sampleFields.slice(0, 1)}
        oldValue="a"
        newValue="b"
      />,
    );

    const row = screen.getByTestId("preview-row-0");
    expect(row).toHaveTextContent("character");
    expect(row).toHaveTextContent("characters");
    expect(row).toHaveTextContent("name");
  });
});
