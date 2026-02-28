/**
 * Tests for ReferenceManager component (PRD-65).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ReferenceManager } from "../ReferenceManager";
import type { RegressionReference } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockReferences: RegressionReference[] = [
  {
    id: 1,
    character_id: 10,
    scene_type_id: 5,
    reference_scene_id: 100,
    baseline_scores: { face_confidence: 0.92, boundary_ssim: 0.85 },
    notes: "Baseline for hero character",
    created_by: 1,
    created_at: "2026-02-28T10:00:00Z",
    updated_at: "2026-02-28T10:00:00Z",
  },
  {
    id: 2,
    character_id: 11,
    scene_type_id: 3,
    reference_scene_id: 101,
    baseline_scores: { motion: 0.75 },
    notes: null,
    created_by: 1,
    created_at: "2026-02-28T11:00:00Z",
    updated_at: "2026-02-28T11:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockData: RegressionReference[] | undefined;
let mockLoading = false;
const mockDeleteMutate = vi.fn();
const mockCreateMutate = vi.fn();

vi.mock("../hooks/use-regression", () => ({
  useRegressionReferences: () => ({
    data: mockData,
    isLoading: mockLoading,
  }),
  useDeleteReference: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
  useCreateReference: () => ({
    mutate: mockCreateMutate,
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ReferenceManager", () => {
  test("renders list of references", () => {
    mockData = mockReferences;
    mockLoading = false;

    renderWithProviders(<ReferenceManager />);

    expect(screen.getByTestId("reference-manager")).toBeInTheDocument();
    expect(screen.getByTestId("reference-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("reference-row-2")).toBeInTheDocument();

    // Check that baseline score badges appear.
    expect(screen.getByText(/Face Confidence/)).toBeInTheDocument();
    expect(screen.getByText(/Boundary SSIM/)).toBeInTheDocument();
  });

  test("delete button calls delete mutation", () => {
    mockData = mockReferences;
    mockLoading = false;
    mockDeleteMutate.mockClear();

    renderWithProviders(<ReferenceManager />);

    const deleteBtn = screen.getByTestId("delete-reference-1");
    fireEvent.click(deleteBtn);

    expect(mockDeleteMutate).toHaveBeenCalledWith(1);
  });

  test("shows empty state when no references", () => {
    mockData = [];
    mockLoading = false;

    renderWithProviders(<ReferenceManager />);

    expect(screen.getByTestId("references-empty")).toBeInTheDocument();
    expect(
      screen.getByText(/No references configured/),
    ).toBeInTheDocument();
  });

  test("shows loading state", () => {
    mockData = undefined;
    mockLoading = true;

    renderWithProviders(<ReferenceManager />);

    expect(screen.getByText("Loading references...")).toBeInTheDocument();
  });
});
