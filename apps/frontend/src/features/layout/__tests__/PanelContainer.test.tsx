import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { PanelContainer } from "../PanelContainer";
import { snapToGrid } from "../useSnapGrid";
import {
  registerViewModule,
  getViewModule,
  getAllViewModules,
  clearViewModules,
} from "../viewModuleRegistry";
import { serializeLayout, deserializeLayout } from "../layoutSerializer";
import { getDefaultLayoutForRole } from "../defaultLayouts";
import type { PanelState } from "../types";
import { MIN_PANEL_WIDTH, MIN_PANEL_HEIGHT } from "../types";
import { lazy } from "react";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

function makePanels(): PanelState[] {
  return [
    {
      id: "panel-1",
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      collapsed: false,
      viewModule: "test-module",
    },
    {
      id: "panel-2",
      position: { x: 420, y: 0 },
      size: { width: 300, height: 300 },
      collapsed: false,
      viewModule: "test-module",
    },
  ];
}

const DummyIcon = () => <span data-testid="icon">icon</span>;
const DummyComponent = () => <div data-testid="dummy-view">Hello</div>;

function registerTestModule() {
  registerViewModule({
    key: "test-module",
    label: "Test Module",
    icon: DummyIcon,
    component: lazy(() => Promise.resolve({ default: DummyComponent })),
    allowMultiple: true,
  });
}

/* --------------------------------------------------------------------------
   Tests: Panel resize respects constraints
   -------------------------------------------------------------------------- */

describe("Panel resize constraints", () => {
  it("enforces minimum panel dimensions via constants", () => {
    expect(MIN_PANEL_WIDTH).toBeGreaterThan(0);
    expect(MIN_PANEL_HEIGHT).toBeGreaterThan(0);
    expect(MIN_PANEL_WIDTH).toBe(200);
    expect(MIN_PANEL_HEIGHT).toBe(100);
  });

  it("renders panels with their specified dimensions", () => {
    const panels = makePanels();
    const onChange = vi.fn();

    const { container } = render(
      <PanelContainer layout={panels} onLayoutChange={onChange} />,
    );

    const panelEl = container.querySelector('[data-panel-id="panel-1"]') as HTMLElement;
    expect(panelEl).toBeTruthy();
    expect(panelEl.style.width).toBe("400px");
    expect(panelEl.style.height).toBe("300px");
  });
});

/* --------------------------------------------------------------------------
   Tests: Snap grid alignment
   -------------------------------------------------------------------------- */

describe("Snap grid alignment", () => {
  it("snaps coordinates to nearest grid intersection (default 20px)", () => {
    const result = snapToGrid({ x: 113, y: 47 });
    expect(result).toEqual({ x: 120, y: 40 });
  });

  it("snaps to nearest grid with custom grid size", () => {
    const result = snapToGrid({ x: 17, y: 33 }, 10);
    expect(result).toEqual({ x: 20, y: 30 });
  });

  it("preserves values that are already aligned", () => {
    const result = snapToGrid({ x: 100, y: 200 }, 20);
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it("handles zero coordinates", () => {
    const result = snapToGrid({ x: 0, y: 0 });
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("handles negative coordinates", () => {
    const result = snapToGrid({ x: -13, y: -47 });
    expect(result).toEqual({ x: -20, y: -40 });
  });
});

/* --------------------------------------------------------------------------
   Tests: Collapse/expand preserves content
   -------------------------------------------------------------------------- */

describe("Collapse/expand preserves content", () => {
  beforeEach(() => {
    clearViewModules();
  });

  it("toggling collapse changes the panel height but keeps the panel", () => {
    const panels: PanelState[] = [
      {
        id: "panel-c",
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        collapsed: false,
        viewModule: "unknown-module",
      },
    ];
    const onChange = vi.fn();

    const { container, rerender } = render(
      <PanelContainer layout={panels} onLayoutChange={onChange} />,
    );

    // Panel starts expanded
    const panelEl = container.querySelector('[data-panel-id="panel-c"]') as HTMLElement;
    expect(panelEl.style.height).toBe("300px");

    // Click collapse button
    const collapseBtn = screen.getByLabelText("Collapse panel");
    fireEvent.click(collapseBtn);

    // onChange should have been called with collapsed = true
    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedLayout = onChange.mock.calls[0]?.[0] as PanelState[];
    expect(updatedLayout[0]?.collapsed).toBe(true);

    // Re-render with collapsed panel
    rerender(
      <PanelContainer layout={updatedLayout} onLayoutChange={onChange} />,
    );

    // Panel still exists
    const collapsedPanelEl = container.querySelector('[data-panel-id="panel-c"]');
    expect(collapsedPanelEl).toBeTruthy();

    // Height should be the collapsed header height (36px)
    expect((collapsedPanelEl as HTMLElement).style.height).toBe("36px");
  });

  it("expand button appears when panel is collapsed", () => {
    const panels: PanelState[] = [
      {
        id: "panel-e",
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        collapsed: true,
        viewModule: "test",
      },
    ];

    render(
      <PanelContainer layout={panels} onLayoutChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("Expand panel")).toBeTruthy();
  });
});

/* --------------------------------------------------------------------------
   Tests: View module registry registration and lookup
   -------------------------------------------------------------------------- */

describe("View module registry", () => {
  beforeEach(() => {
    clearViewModules();
  });

  it("registers and retrieves a module by key", () => {
    registerTestModule();
    const mod = getViewModule("test-module");
    expect(mod).toBeDefined();
    expect(mod?.label).toBe("Test Module");
    expect(mod?.allowMultiple).toBe(true);
  });

  it("returns undefined for unregistered keys", () => {
    expect(getViewModule("nonexistent")).toBeUndefined();
  });

  it("lists all registered modules", () => {
    registerTestModule();
    registerViewModule({
      key: "another-module",
      label: "Another",
      icon: DummyIcon,
      component: lazy(() => Promise.resolve({ default: DummyComponent })),
      allowMultiple: false,
    });

    const all = getAllViewModules();
    expect(all).toHaveLength(2);
    expect(all.map((m) => m.key).sort()).toEqual(["another-module", "test-module"]);
  });

  it("overwrites existing registration with same key", () => {
    registerTestModule();
    registerViewModule({
      key: "test-module",
      label: "Updated Label",
      icon: DummyIcon,
      component: lazy(() => Promise.resolve({ default: DummyComponent })),
      allowMultiple: false,
    });

    const mod = getViewModule("test-module");
    expect(mod?.label).toBe("Updated Label");
    expect(mod?.allowMultiple).toBe(false);
    expect(getAllViewModules()).toHaveLength(1);
  });
});

/* --------------------------------------------------------------------------
   Tests: Layout serialization round-trip
   -------------------------------------------------------------------------- */

describe("Layout serialization", () => {
  beforeEach(() => {
    clearViewModules();
    registerTestModule();
  });

  it("round-trips a valid layout", () => {
    const panels = makePanels();
    const json = serializeLayout(panels);
    const restored = deserializeLayout(json);

    expect(restored).toHaveLength(2);
    expect(restored[0]?.id).toBe("panel-1");
    expect(restored[0]?.size.width).toBe(400);
    expect(restored[1]?.id).toBe("panel-2");
  });

  it("returns empty array for invalid JSON", () => {
    expect(deserializeLayout("not json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(deserializeLayout('{"foo": "bar"}')).toEqual([]);
  });

  it("filters out panels with unknown viewModules by default", () => {
    const panels: PanelState[] = [
      ...makePanels(),
      {
        id: "panel-unknown",
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        collapsed: false,
        viewModule: "nonexistent-module",
      },
    ];
    const json = serializeLayout(panels);
    const restored = deserializeLayout(json);

    expect(restored).toHaveLength(2); // unknown filtered out
  });

  it("keeps unknown viewModules in strict mode", () => {
    const panels: PanelState[] = [
      {
        id: "panel-unknown",
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        collapsed: false,
        viewModule: "nonexistent-module",
      },
    ];
    const json = serializeLayout(panels);
    const restored = deserializeLayout(json, true);

    expect(restored).toHaveLength(1);
    expect(restored[0]?.viewModule).toBe("nonexistent-module");
  });
});

/* --------------------------------------------------------------------------
   Tests: Role-based default selection
   -------------------------------------------------------------------------- */

describe("Role-based default layout selection", () => {
  it("returns the admin default for 'admin' role", () => {
    const layout = getDefaultLayoutForRole("admin");
    expect(layout.length).toBeGreaterThan(0);
    expect(layout[0]?.id).toContain("admin");
  });

  it("returns the creator default for 'creator' role", () => {
    const layout = getDefaultLayoutForRole("creator");
    expect(layout.length).toBeGreaterThan(0);
    expect(layout[0]?.id).toContain("creator");
  });

  it("returns the reviewer default for 'reviewer' role", () => {
    const layout = getDefaultLayoutForRole("reviewer");
    expect(layout.length).toBeGreaterThan(0);
    expect(layout[0]?.id).toContain("reviewer");
  });

  it("falls back to creator layout for unknown roles", () => {
    const layout = getDefaultLayoutForRole("unknown-role");
    const creatorLayout = getDefaultLayoutForRole("creator");
    expect(layout).toEqual(creatorLayout);
  });
});
