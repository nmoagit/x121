/**
 * Tests for RuleManager component (PRD-102).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { RuleManager } from "../RuleManager";
import type { ComplianceRule } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockRules: ComplianceRule[] = [
  {
    id: 1,
    name: "HD Resolution Check",
    description: "Ensures video is at least 1920x1080",
    rule_type: "resolution",
    config_json: { min_width: 1920, min_height: 1080 },
    is_global: true,
    project_id: null,
    created_by: 1,
    created_at: "2026-02-28T10:00:00Z",
    updated_at: "2026-02-28T10:00:00Z",
  },
  {
    id: 2,
    name: "Frame Rate Check",
    description: "Ensures 24fps or higher",
    rule_type: "framerate",
    config_json: { min_fps: 24 },
    is_global: false,
    project_id: 1,
    created_by: 1,
    created_at: "2026-02-28T11:00:00Z",
    updated_at: "2026-02-28T11:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockData: ComplianceRule[] | undefined;
let mockLoading = false;

vi.mock("../hooks/use-compliance", () => ({
  useComplianceRules: () => ({
    data: mockData,
    isLoading: mockLoading,
  }),
  useDeleteRule: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("RuleManager", () => {
  test("renders rule list", () => {
    mockData = mockRules;
    mockLoading = false;

    renderWithProviders(<RuleManager />);

    expect(screen.getByTestId("rule-manager")).toBeInTheDocument();
    expect(screen.getByTestId("rule-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("rule-row-2")).toBeInTheDocument();
  });

  test("shows type badges", () => {
    mockData = mockRules;
    mockLoading = false;

    renderWithProviders(<RuleManager />);

    expect(screen.getByText("Resolution")).toBeInTheDocument();
    expect(screen.getByText("Frame Rate")).toBeInTheDocument();
  });

  test("has create button", () => {
    mockData = mockRules;
    mockLoading = false;

    renderWithProviders(<RuleManager />);

    expect(screen.getByTestId("add-rule-btn")).toBeInTheDocument();
    expect(screen.getByText("New Rule")).toBeInTheDocument();
  });

  test("shows delete action for each rule", () => {
    mockData = mockRules;
    mockLoading = false;

    renderWithProviders(<RuleManager />);

    expect(screen.getByTestId("delete-rule-1")).toBeInTheDocument();
    expect(screen.getByTestId("delete-rule-2")).toBeInTheDocument();
  });
});
