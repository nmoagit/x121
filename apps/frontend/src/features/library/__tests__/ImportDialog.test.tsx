import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ImportDialog } from "../ImportDialog";
import type { LibraryCharacter } from "../types";

const MOCK_CHARACTER: LibraryCharacter = {
  id: 1,
  name: "Alice",
  source_character_id: null,
  source_project_id: null,
  master_metadata: { hair: "blonde", eyes: "blue", height: "170cm" },
  tags: ["hero"],
  description: "A brave adventurer",
  thumbnail_path: null,
  is_published: true,
  created_by_id: 1,
  created_at: "2026-02-22T10:00:00Z",
  updated_at: "2026-02-22T10:00:00Z",
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({
      id: 10,
      project_id: 5,
      library_character_id: 1,
      project_character_id: 42,
      linked_fields: ["hair", "eyes", "height"],
      imported_at: "2026-02-22T12:00:00Z",
      created_at: "2026-02-22T12:00:00Z",
      updated_at: "2026-02-22T12:00:00Z",
    }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("ImportDialog", () => {
  const onClose = vi.fn();

  it("renders the import dialog with character name", () => {
    renderWithProviders(
      <ImportDialog
        open={true}
        onClose={onClose}
        character={MOCK_CHARACTER}
        projectId={5}
        projectName="My Project"
      />,
    );

    expect(screen.getByTestId("import-dialog")).toBeInTheDocument();
    expect(screen.getByText('Import "Alice"')).toBeInTheDocument();
    expect(screen.getByText("My Project")).toBeInTheDocument();
  });

  it("shows linkable metadata fields", () => {
    renderWithProviders(
      <ImportDialog
        open={true}
        onClose={onClose}
        character={MOCK_CHARACTER}
        projectId={5}
      />,
    );

    expect(screen.getByTestId("field-list")).toBeInTheDocument();
    expect(screen.getByText("hair")).toBeInTheDocument();
    expect(screen.getByText("eyes")).toBeInTheDocument();
    expect(screen.getByText("height")).toBeInTheDocument();
  });

  it("has a toggle all button", () => {
    renderWithProviders(
      <ImportDialog
        open={true}
        onClose={onClose}
        character={MOCK_CHARACTER}
        projectId={5}
      />,
    );

    const toggleBtn = screen.getByTestId("toggle-all-fields");
    expect(toggleBtn).toHaveTextContent("Deselect all");

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveTextContent("Select all");
  });

  it("has import and cancel buttons", () => {
    renderWithProviders(
      <ImportDialog
        open={true}
        onClose={onClose}
        character={MOCK_CHARACTER}
        projectId={5}
      />,
    );

    expect(screen.getByTestId("confirm-import")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-import")).toBeInTheDocument();
  });
});
