/**
 * Tests for DashboardCustomizationPage component (PRD-89).
 */

import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { DashboardCustomizationPage } from "../DashboardCustomizationPage";
import type { WidgetDefinition } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockWidgetMap = new Map<string, WidgetDefinition>([
  [
    "cpu-monitor",
    {
      id: "cpu-monitor",
      name: "CPU Monitor",
      description: "Displays CPU usage",
      category: "monitoring",
      default_width: 2,
      default_height: 1,
      min_width: 1,
      min_height: 1,
      settings_schema: null,
      source: "native",
    },
  ],
  [
    "job-queue",
    {
      id: "job-queue",
      name: "Job Queue",
      description: "Shows pending jobs",
      category: "productivity",
      default_width: 2,
      default_height: 1,
      min_width: 1,
      min_height: 1,
      settings_schema: null,
      source: "native",
    },
  ],
]);

const mockEditorState = {
  dashLoading: false,
  isEditing: false,
  activeLayout: [
    { widget_id: "cpu-monitor", instance_id: "inst_1", x: 0, y: 0, w: 2, h: 1 },
    { widget_id: "job-queue", instance_id: "inst_2", x: 2, y: 0, w: 2, h: 1 },
  ],
  activeSettings: {},
  widgetMap: mockWidgetMap,
  catalog: [...mockWidgetMap.values()],
  presets: [],
  catalogOpen: false,
  settingsInstanceId: null,
  settingsWidget: null,
  isSaving: false,
  isImporting: false,
  setCatalogOpen: vi.fn(),
  setSettingsInstanceId: vi.fn(),
  handleToggleEdit: vi.fn(),
  handleCancel: vi.fn(),
  handleSave: vi.fn(),
  handleAddWidget: vi.fn(),
  handleRemoveWidget: vi.fn(),
  handleSaveWidgetSettings: vi.fn(),
  activatePreset: vi.fn(),
  deletePreset: vi.fn(),
  createPreset: vi.fn(),
  sharePreset: vi.fn(),
  importPreset: vi.fn(),
};

let currentEditorState = { ...mockEditorState };

vi.mock("../hooks/use-dashboard-editor", () => ({
  useDashboardEditor: () => currentEditorState,
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("DashboardCustomizationPage", () => {
  beforeEach(() => {
    currentEditorState = { ...mockEditorState };
  });

  test("renders dashboard page with header", () => {
    renderWithProviders(<DashboardCustomizationPage />);

    expect(screen.getByTestId("dashboard-customization-page")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  test("renders layout with grid items", () => {
    renderWithProviders(<DashboardCustomizationPage />);

    expect(screen.getByTestId("layout-editor")).toBeInTheDocument();
    expect(screen.getByTestId("grid-item-inst_1")).toBeInTheDocument();
    expect(screen.getByTestId("grid-item-inst_2")).toBeInTheDocument();
  });

  test("renders widget names from catalog", () => {
    renderWithProviders(<DashboardCustomizationPage />);

    expect(screen.getByText("CPU Monitor")).toBeInTheDocument();
    expect(screen.getByText("Job Queue")).toBeInTheDocument();
  });

  test("shows edit mode controls", () => {
    renderWithProviders(<DashboardCustomizationPage />);

    expect(screen.getByTestId("edit-mode-controls")).toBeInTheDocument();
    expect(screen.getByText("Edit Dashboard")).toBeInTheDocument();
  });

  test("calls handleToggleEdit when Edit Dashboard is clicked", () => {
    renderWithProviders(<DashboardCustomizationPage />);

    fireEvent.click(screen.getByText("Edit Dashboard"));

    expect(currentEditorState.handleToggleEdit).toHaveBeenCalledOnce();
  });

  test("shows preset manager button", () => {
    renderWithProviders(<DashboardCustomizationPage />);

    expect(screen.getByTestId("preset-manager")).toBeInTheDocument();
    expect(screen.getByText("Presets")).toBeInTheDocument();
  });
});
