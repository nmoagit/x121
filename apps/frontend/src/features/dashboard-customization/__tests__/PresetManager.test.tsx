/**
 * Tests for PresetManager component (PRD-89).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { PresetManager } from "../PresetManager";
import type { DashboardPreset } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const samplePresets: DashboardPreset[] = [
  {
    id: 1,
    user_id: 10,
    name: "Default Layout",
    layout_json: [],
    widget_settings_json: {},
    is_active: true,
    share_token: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-20T00:00:00Z",
  },
  {
    id: 2,
    user_id: 10,
    name: "Compact View",
    layout_json: [],
    widget_settings_json: {},
    is_active: false,
    share_token: "abc123",
    created_at: "2026-02-10T00:00:00Z",
    updated_at: "2026-02-15T00:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("PresetManager", () => {
  const defaultProps = {
    presets: samplePresets,
    onActivate: vi.fn(),
    onDelete: vi.fn(),
    onCreate: vi.fn(),
    onShare: vi.fn(),
    onImport: vi.fn(),
  };

  test("shows active preset name on button", () => {
    renderWithProviders(<PresetManager {...defaultProps} />);

    expect(screen.getByText("Default Layout")).toBeInTheDocument();
  });

  test("shows 'Presets' when no active preset", () => {
    const inactivePresets = samplePresets.map((p) => ({
      ...p,
      is_active: false,
    }));
    renderWithProviders(
      <PresetManager {...defaultProps} presets={inactivePresets} />,
    );

    expect(screen.getByText("Presets")).toBeInTheDocument();
  });

  test("opens popover with preset list on click", () => {
    renderWithProviders(<PresetManager {...defaultProps} />);

    fireEvent.click(screen.getByText("Default Layout"));

    expect(screen.getByTestId("preset-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("preset-item-2")).toBeInTheDocument();
  });

  test("shows Active badge on active preset", () => {
    renderWithProviders(<PresetManager {...defaultProps} />);

    fireEvent.click(screen.getByText("Default Layout"));

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  test("shows Create Preset option", () => {
    renderWithProviders(<PresetManager {...defaultProps} />);

    fireEvent.click(screen.getByText("Default Layout"));

    expect(screen.getByText("Create Preset")).toBeInTheDocument();
  });

  test("shows empty state when no presets", () => {
    renderWithProviders(<PresetManager {...defaultProps} presets={[]} />);

    fireEvent.click(screen.getByText("Presets"));

    expect(screen.getByText(/no presets yet/i)).toBeInTheDocument();
  });
});
