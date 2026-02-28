/**
 * Tests for TemplateManager component (PRD-40).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { TemplateManager } from "../TemplateManager";
import type { SidecarTemplate } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockTemplates: SidecarTemplate[] = [
  {
    id: 1,
    name: "Nuke XML Sidecar",
    description: "Standard Nuke VFX sidecar",
    format: "xml",
    target_tool: "nuke",
    template_json: { root: "clip" },
    is_builtin: true,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: "Custom CSV Export",
    description: null,
    format: "csv",
    target_tool: null,
    template_json: { columns: ["frame", "x", "y"] },
    is_builtin: false,
    created_by: 1,
    created_at: "2026-02-15T10:00:00Z",
    updated_at: "2026-02-15T10:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockData: SidecarTemplate[] | undefined;
let mockLoading = false;
const mockDeleteMutate = vi.fn();

vi.mock("../hooks/use-sidecar", () => ({
  useSidecarTemplates: () => ({
    data: mockData,
    isLoading: mockLoading,
  }),
  useCreateTemplate: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useDeleteTemplate: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("TemplateManager", () => {
  test("renders template list", () => {
    mockData = mockTemplates;
    mockLoading = false;

    renderWithProviders(<TemplateManager />);

    expect(screen.getByTestId("template-manager")).toBeInTheDocument();
    expect(screen.getByTestId("template-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("template-row-2")).toBeInTheDocument();
  });

  test("shows format badges", () => {
    mockData = mockTemplates;
    mockLoading = false;

    renderWithProviders(<TemplateManager />);

    expect(screen.getByText("XML")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
  });

  test("shows builtin indicator", () => {
    mockData = mockTemplates;
    mockLoading = false;

    renderWithProviders(<TemplateManager />);

    expect(screen.getByTestId("builtin-badge-1")).toBeInTheDocument();
    expect(screen.queryByTestId("builtin-badge-2")).not.toBeInTheDocument();
  });

  test("blocks delete for builtin templates", () => {
    mockData = mockTemplates;
    mockLoading = false;

    renderWithProviders(<TemplateManager />);

    // Builtin template should NOT have a delete button.
    expect(screen.queryByTestId("delete-template-1")).not.toBeInTheDocument();

    // Non-builtin template SHOULD have a delete button.
    expect(screen.getByTestId("delete-template-2")).toBeInTheDocument();
  });
});
