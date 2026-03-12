/**
 * Tests for WidgetCatalogue component (PRD-89).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { WidgetCatalogue } from "../WidgetCatalogue";
import type { WidgetDefinition } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const sampleWidgets: WidgetDefinition[] = [
  {
    id: "cpu-monitor",
    name: "CPU Monitor",
    description: "Displays CPU usage metrics",
    category: "monitoring",
    default_width: 2,
    default_height: 1,
    min_width: 1,
    min_height: 1,
    settings_schema: null,
    source: "native",
  },
  {
    id: "task-list",
    name: "Task List",
    description: "Shows pending tasks",
    category: "productivity",
    default_width: 2,
    default_height: 2,
    min_width: 1,
    min_height: 1,
    settings_schema: null,
    source: "native",
  },
  {
    id: "render-stats",
    name: "Render Stats",
    description: "Rendering statistics",
    category: "reporting",
    default_width: 3,
    default_height: 2,
    min_width: 2,
    min_height: 1,
    settings_schema: null,
    source: "native",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("WidgetCatalogue", () => {
  const onClose = vi.fn();
  const onAddWidget = vi.fn();

  test("renders widget list when open", () => {
    renderWithProviders(
      <WidgetCatalogue
        open={true}
        onClose={onClose}
        widgets={sampleWidgets}
        onAddWidget={onAddWidget}
      />,
    );

    expect(screen.getByTestId("widget-catalogue")).toBeInTheDocument();
    expect(screen.getByText("CPU Monitor")).toBeInTheDocument();
    expect(screen.getByText("Task List")).toBeInTheDocument();
    expect(screen.getByText("Render Stats")).toBeInTheDocument();
  });

  test("does not render when closed", () => {
    renderWithProviders(
      <WidgetCatalogue
        open={false}
        onClose={onClose}
        widgets={sampleWidgets}
        onAddWidget={onAddWidget}
      />,
    );

    expect(screen.queryByTestId("widget-catalogue")).not.toBeInTheDocument();
  });

  test("shows category filter buttons", () => {
    renderWithProviders(
      <WidgetCatalogue
        open={true}
        onClose={onClose}
        widgets={sampleWidgets}
        onAddWidget={onAddWidget}
      />,
    );

    const filterContainer = screen.getByTestId("category-filter");
    expect(filterContainer).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
    // Filter buttons inside the filter container
    const filterButtons = filterContainer.querySelectorAll("button");
    expect(filterButtons.length).toBeGreaterThanOrEqual(4); // All + 4 categories
  });

  test("filters widgets by category", () => {
    renderWithProviders(
      <WidgetCatalogue
        open={true}
        onClose={onClose}
        widgets={sampleWidgets}
        onAddWidget={onAddWidget}
      />,
    );

    // Click the filter button inside category-filter, not the Badge on the card
    const filterContainer = screen.getByTestId("category-filter");
    const monitoringBtn = Array.from(filterContainer.querySelectorAll("button"))
      .find((btn) => btn.textContent === "Monitoring")!;
    fireEvent.click(monitoringBtn);

    expect(screen.getByText("CPU Monitor")).toBeInTheDocument();
    expect(screen.queryByText("Task List")).not.toBeInTheDocument();
    expect(screen.queryByText("Render Stats")).not.toBeInTheDocument();
  });

  test("shows widget dimensions", () => {
    renderWithProviders(
      <WidgetCatalogue
        open={true}
        onClose={onClose}
        widgets={sampleWidgets}
        onAddWidget={onAddWidget}
      />,
    );

    expect(screen.getByText("2x1")).toBeInTheDocument();
    expect(screen.getByText("2x2")).toBeInTheDocument();
    expect(screen.getByText("3x2")).toBeInTheDocument();
  });

  test("shows empty state for filtered category with no widgets", () => {
    renderWithProviders(
      <WidgetCatalogue
        open={true}
        onClose={onClose}
        widgets={sampleWidgets}
        onAddWidget={onAddWidget}
      />,
    );

    fireEvent.click(screen.getByText("System"));

    expect(screen.getByText(/no widgets available/i)).toBeInTheDocument();
  });
});
