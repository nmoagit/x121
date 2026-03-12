import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ImportDialog } from "../ImportDialog";
import type { LibraryCharacter } from "../types";

const MOCK_CHARACTER: LibraryCharacter = {
  id: 1,
  name: "Alice",
  project_id: 10,
  project_name: "Fantasy Project",
  group_name: null,
  hero_variant_id: null,
  scene_count: 3,
  image_count: 5,
  clip_count: 2,
  has_metadata: true,
  status_id: 1,
  created_at: "2026-02-22T10:00:00Z",
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({
      id: 10,
      project_id: 5,
      library_character_id: 1,
      project_character_id: 42,
      linked_fields: [],
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

  it("shows no linkable fields message for cross-project characters", () => {
    renderWithProviders(
      <ImportDialog
        open={true}
        onClose={onClose}
        character={MOCK_CHARACTER}
        projectId={5}
      />,
    );

    // No linkable fields in the new cross-project view.
    expect(screen.getByText(/No linkable metadata fields/)).toBeInTheDocument();
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
