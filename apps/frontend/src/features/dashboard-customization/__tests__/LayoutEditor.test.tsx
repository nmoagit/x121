/**
 * Tests for LayoutEditor component (PRD-89).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { LayoutEditor } from "../LayoutEditor";
import type { LayoutItem, WidgetDefinition } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const sampleLayout: LayoutItem[] = [
  { widget_id: "cpu-monitor", instance_id: "inst_1", x: 0, y: 0, w: 2, h: 1 },
  { widget_id: "job-queue", instance_id: "inst_2", x: 2, y: 0, w: 2, h: 1 },
];

const widgetMap = new Map<string, WidgetDefinition>([
  [
    "cpu-monitor",
    {
      id: "cpu-monitor",
      name: "CPU Monitor",
      description: "Shows CPU usage",
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
      description: "Pending job list",
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

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("LayoutEditor", () => {
  const onRemove = vi.fn();
  const onSettings = vi.fn();

  test("renders grid items for each layout item", () => {
    renderWithProviders(
      <LayoutEditor
        layout={sampleLayout}
        widgetMap={widgetMap}
        isEditing={false}
        onRemoveWidget={onRemove}
        onOpenSettings={onSettings}
      />,
    );

    expect(screen.getByTestId("layout-editor")).toBeInTheDocument();
    expect(screen.getByTestId("grid-item-inst_1")).toBeInTheDocument();
    expect(screen.getByTestId("grid-item-inst_2")).toBeInTheDocument();
  });

  test("shows widget names from widget map", () => {
    renderWithProviders(
      <LayoutEditor
        layout={sampleLayout}
        widgetMap={widgetMap}
        isEditing={false}
        onRemoveWidget={onRemove}
        onOpenSettings={onSettings}
      />,
    );

    expect(screen.getByText("CPU Monitor")).toBeInTheDocument();
    expect(screen.getByText("Job Queue")).toBeInTheDocument();
  });

  test("shows empty state when layout is empty", () => {
    renderWithProviders(
      <LayoutEditor
        layout={[]}
        widgetMap={widgetMap}
        isEditing={false}
        onRemoveWidget={onRemove}
        onOpenSettings={onSettings}
      />,
    );

    expect(screen.getByTestId("layout-editor-empty")).toBeInTheDocument();
    expect(screen.getByText(/no widgets on this dashboard/i)).toBeInTheDocument();
  });

  test("shows edit mode prompt when empty and editing", () => {
    renderWithProviders(
      <LayoutEditor
        layout={[]}
        widgetMap={widgetMap}
        isEditing={true}
        onRemoveWidget={onRemove}
        onOpenSettings={onSettings}
      />,
    );

    expect(screen.getByText(/add widget/i)).toBeInTheDocument();
  });

  test("applies dashed border styling in edit mode", () => {
    renderWithProviders(
      <LayoutEditor
        layout={sampleLayout}
        widgetMap={widgetMap}
        isEditing={true}
        onRemoveWidget={onRemove}
        onOpenSettings={onSettings}
      />,
    );

    const gridItem = screen.getByTestId("grid-item-inst_1");
    expect(gridItem.className).toContain("border-dashed");
  });

  test("does not apply dashed border in view mode", () => {
    renderWithProviders(
      <LayoutEditor
        layout={sampleLayout}
        widgetMap={widgetMap}
        isEditing={false}
        onRemoveWidget={onRemove}
        onOpenSettings={onSettings}
      />,
    );

    const gridItem = screen.getByTestId("grid-item-inst_1");
    expect(gridItem.className).not.toContain("border-dashed");
  });
});
