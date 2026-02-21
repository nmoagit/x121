import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { MetadataForm } from "../MetadataForm";
import { CompletenessBar } from "../CompletenessBar";
import { BulkEditDialog } from "../BulkEditDialog";
import { CsvExport } from "../CsvExport";
import { CsvImport } from "../CsvImport";
import type { CharacterMetadataResponse, CompletenessResult, MetadataFieldDef } from "../types";

// Mock the api module to prevent real HTTP requests.
const mockCharacterMetadata: CharacterMetadataResponse = {
  character_id: 1,
  character_name: "Alice",
  fields: [
    {
      name: "full_name",
      label: "Full Name",
      field_type: "text",
      category: "biographical",
      is_required: true,
      options: [],
      value: "Alice",
    },
    {
      name: "description",
      label: "Description",
      field_type: "text",
      category: "biographical",
      is_required: true,
      options: [],
      value: null,
    },
    {
      name: "age",
      label: "Age",
      field_type: "number",
      category: "biographical",
      is_required: false,
      options: [],
      value: 25,
    },
    {
      name: "hair_color",
      label: "Hair Color",
      field_type: "select",
      category: "physical",
      is_required: false,
      options: ["Black", "Brown", "Blonde", "Red"],
      value: "Brown",
    },
    {
      name: "personality_traits",
      label: "Personality Traits",
      field_type: "multi_select",
      category: "preferences",
      is_required: false,
      options: ["Introverted", "Extroverted", "Creative"],
      value: ["Creative"],
    },
  ],
  completeness: {
    character_id: 1,
    total_required: 2,
    filled: 1,
    missing_fields: ["description"],
    percentage: 50,
  },
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/metadata/completeness")) {
        return Promise.resolve(mockCharacterMetadata.completeness);
      }
      if (path.includes("/metadata")) {
        return Promise.resolve(mockCharacterMetadata);
      }
      return Promise.resolve([]);
    }),
    put: vi.fn().mockResolvedValue({
      status: "updated",
      character_id: 1,
      metadata: {},
    }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("MetadataForm", () => {
  it("renders the character name", async () => {
    renderWithProviders(<MetadataForm characterId={1} />);

    await waitFor(() => {
      expect(screen.getByText("Alice - Metadata")).toBeInTheDocument();
    });
  });

  it("renders field category headings", async () => {
    renderWithProviders(<MetadataForm characterId={1} />);

    await waitFor(() => {
      expect(screen.getByText("Biographical")).toBeInTheDocument();
      expect(screen.getByText("Physical Attributes")).toBeInTheDocument();
      expect(screen.getByText("Preferences")).toBeInTheDocument();
    });
  });

  it("marks required fields with asterisk", async () => {
    renderWithProviders(<MetadataForm characterId={1} />);

    await waitFor(() => {
      expect(screen.getByText("Full Name *")).toBeInTheDocument();
      expect(screen.getByText("Description *")).toBeInTheDocument();
    });
  });

  it("renders a save button", async () => {
    renderWithProviders(<MetadataForm characterId={1} />);

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });
  });

  it("shows completeness bar", async () => {
    renderWithProviders(<MetadataForm characterId={1} />);

    await waitFor(() => {
      expect(screen.getByText("1 / 2 required")).toBeInTheDocument();
    });
  });

  it("renders loading state initially", () => {
    renderWithProviders(<MetadataForm characterId={1} />);
    const spinner = document.querySelector('[class*="animate-spin"]');
    expect(spinner).toBeTruthy();
  });
});

describe("CompletenessBar", () => {
  const fullCompleteness: CompletenessResult = {
    character_id: 1,
    total_required: 3,
    filled: 3,
    missing_fields: [],
    percentage: 100,
  };

  const partialCompleteness: CompletenessResult = {
    character_id: 1,
    total_required: 4,
    filled: 2,
    missing_fields: ["field_a", "field_b"],
    percentage: 50,
  };

  it("shows filled/total text", () => {
    renderWithProviders(<CompletenessBar completeness={fullCompleteness} />);
    expect(screen.getByText("3 / 3 required")).toBeInTheDocument();
  });

  it("shows missing fields toggle when incomplete", () => {
    renderWithProviders(<CompletenessBar completeness={partialCompleteness} />);
    expect(screen.getByText("Show 2 missing fields")).toBeInTheDocument();
  });

  it("expands missing fields on click", () => {
    renderWithProviders(<CompletenessBar completeness={partialCompleteness} />);
    fireEvent.click(screen.getByText("Show 2 missing fields"));
    expect(screen.getByText("Missing: field_a, field_b")).toBeInTheDocument();
  });

  it("does not show toggle when complete", () => {
    renderWithProviders(<CompletenessBar completeness={fullCompleteness} />);
    expect(screen.queryByText(/missing field/)).toBeNull();
  });
});

describe("BulkEditDialog", () => {
  const fieldDefs: MetadataFieldDef[] = [
    {
      name: "full_name",
      label: "Full Name",
      field_type: "text",
      category: "biographical",
      is_required: true,
      options: [],
    },
    {
      name: "hair_color",
      label: "Hair Color",
      field_type: "select",
      category: "physical",
      is_required: false,
      options: ["Black", "Brown"],
    },
  ];

  it("shows selected character count", () => {
    renderWithProviders(
      <BulkEditDialog
        selectedCharacterIds={[1, 2, 3]}
        fieldDefs={fieldDefs}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/selected character/)).toBeInTheDocument();
  });

  it("renders field selector and action buttons", () => {
    renderWithProviders(
      <BulkEditDialog
        selectedCharacterIds={[1]}
        fieldDefs={fieldDefs}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Apply")).toBeInTheDocument();
  });
});

describe("CsvExport", () => {
  it("renders export button", () => {
    renderWithProviders(<CsvExport projectId={1} />);
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
  });
});

describe("CsvImport", () => {
  it("renders import button", () => {
    renderWithProviders(<CsvImport projectId={1} />);
    expect(screen.getByText("Import CSV")).toBeInTheDocument();
  });
});
