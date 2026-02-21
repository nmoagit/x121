import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { ImportPreviewTree } from "../ImportPreviewTree";
import type { FolderImportPreview, ImportMappingEntry } from "../types";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeEntry(overrides: Partial<ImportMappingEntry> = {}): ImportMappingEntry {
  return {
    id: 1,
    session_id: 1,
    source_path: "Alice/portrait.png",
    file_name: "portrait.png",
    file_size_bytes: 1024,
    file_extension: "png",
    derived_entity_type: "image",
    derived_entity_name: "Alice",
    derived_category: null,
    target_entity_id: null,
    action: "create",
    conflict_details: null,
    validation_errors: [],
    validation_warnings: [],
    is_selected: true,
    created_at: "2026-02-21T00:00:00Z",
    updated_at: "2026-02-21T00:00:00Z",
    ...overrides,
  };
}

function makePreview(
  entries: ImportMappingEntry[] = [makeEntry()],
): FolderImportPreview {
  return {
    session_id: 1,
    total_files: entries.length,
    total_size_bytes: entries.reduce((sum, e) => sum + e.file_size_bytes, 0),
    entities_to_create: entries.filter((e) => e.action === "create").length,
    entities_to_update: entries.filter((e) => e.action === "update").length,
    uniqueness_conflicts: [],
    entries,
  };
}

describe("ImportPreviewTree", () => {
  it("renders the summary header with file and create counts", () => {
    const preview = makePreview();
    renderWithProviders(
      <ImportPreviewTree preview={preview} onSelectionChange={vi.fn()} />,
    );

    // The header contains "N files", "N to create", "N to update"
    expect(screen.getByText(/files/)).toBeInTheDocument();
    expect(screen.getByText(/to create/)).toBeInTheDocument();
    expect(screen.getByText(/to update/)).toBeInTheDocument();
  });

  it("renders entity name from entries", () => {
    const preview = makePreview([makeEntry({ derived_entity_name: "Bob" })]);
    renderWithProviders(
      <ImportPreviewTree preview={preview} onSelectionChange={vi.fn()} />,
    );

    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows action badges", () => {
    const preview = makePreview([
      makeEntry({ id: 1, action: "create" }),
      makeEntry({ id: 2, action: "update", derived_entity_name: "Bob" }),
    ]);
    renderWithProviders(
      <ImportPreviewTree preview={preview} onSelectionChange={vi.fn()} />,
    );

    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Update")).toBeInTheDocument();
  });

  it("shows entity type badges", () => {
    const preview = makePreview([
      makeEntry({ derived_entity_type: "image" }),
    ]);
    renderWithProviders(
      <ImportPreviewTree preview={preview} onSelectionChange={vi.fn()} />,
    );

    expect(screen.getByText("Image")).toBeInTheDocument();
  });

  it("shows category when present", () => {
    const preview = makePreview([
      makeEntry({ derived_category: "portraits" }),
    ]);
    renderWithProviders(
      <ImportPreviewTree preview={preview} onSelectionChange={vi.fn()} />,
    );

    expect(screen.getByText("/ portraits")).toBeInTheDocument();
  });

  it("shows conflict count when conflicts exist", () => {
    const preview: FolderImportPreview = {
      ...makePreview(),
      uniqueness_conflicts: [
        { entity_name: "Alice", paths: ["a/Alice", "b/Alice"], suggested_action: "RenameWithPath" },
      ],
    };
    renderWithProviders(
      <ImportPreviewTree preview={preview} onSelectionChange={vi.fn()} />,
    );

    expect(screen.getByText(/conflicts/)).toBeInTheDocument();
  });

  it("has the test id", () => {
    const preview = makePreview();
    renderWithProviders(
      <ImportPreviewTree preview={preview} onSelectionChange={vi.fn()} />,
    );

    expect(screen.getByTestId("import-preview-tree")).toBeInTheDocument();
  });
});
