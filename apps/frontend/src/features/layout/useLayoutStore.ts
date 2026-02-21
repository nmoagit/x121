/**
 * Zustand store for layout state management (PRD-30).
 *
 * Manages the current set of panels, supports CRUD operations on panels,
 * and tracks the active layout metadata (name, id) for persistence.
 */

import { create } from "zustand";
import type { PanelSize, PanelState } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface LayoutMeta {
  /** Server-side layout ID (null for unsaved layouts). */
  id: number | null;
  /** Layout name. */
  name: string;
}

interface LayoutState {
  /** Current panels in the layout. */
  panels: PanelState[];
  /** Metadata about the active layout. */
  activeMeta: LayoutMeta;
  /** Whether the layout has unsaved changes. */
  dirty: boolean;
}

interface LayoutActions {
  /** Replace the entire panel set (e.g., when switching presets). */
  setPanels: (panels: PanelState[], meta?: LayoutMeta) => void;
  /** Add a new panel. */
  addPanel: (panel: PanelState) => void;
  /** Remove a panel by ID. */
  removePanel: (panelId: string) => void;
  /** Update a specific panel by ID. */
  updatePanel: (panelId: string, updates: Partial<PanelState>) => void;
  /** Toggle the collapsed state of a panel. */
  toggleCollapse: (panelId: string) => void;
  /** Resize a panel. */
  resizePanel: (panelId: string, size: PanelSize) => void;
  /** Mark layout as saved (clears dirty flag). */
  markSaved: (id: number, name: string) => void;
  /** Mark layout as dirty. */
  markDirty: () => void;
}

export type LayoutStore = LayoutState & LayoutActions;

/* --------------------------------------------------------------------------
   Initial state
   -------------------------------------------------------------------------- */

const INITIAL_STATE: LayoutState = {
  panels: [],
  activeMeta: { id: null, name: "Untitled" },
  dirty: false,
};

/* --------------------------------------------------------------------------
   Store
   -------------------------------------------------------------------------- */

export const useLayoutStore = create<LayoutStore>((set) => ({
  ...INITIAL_STATE,

  setPanels: (panels, meta) =>
    set({
      panels,
      activeMeta: meta ?? INITIAL_STATE.activeMeta,
      dirty: false,
    }),

  addPanel: (panel) =>
    set((state) => ({
      panels: [...state.panels, panel],
      dirty: true,
    })),

  removePanel: (panelId) =>
    set((state) => ({
      panels: state.panels.filter((p) => p.id !== panelId),
      dirty: true,
    })),

  updatePanel: (panelId, updates) =>
    set((state) => ({
      panels: state.panels.map((p) =>
        p.id === panelId ? { ...p, ...updates } : p,
      ),
      dirty: true,
    })),

  toggleCollapse: (panelId) =>
    set((state) => ({
      panels: state.panels.map((p) =>
        p.id === panelId ? { ...p, collapsed: !p.collapsed } : p,
      ),
      dirty: true,
    })),

  resizePanel: (panelId, size) =>
    set((state) => ({
      panels: state.panels.map((p) =>
        p.id === panelId ? { ...p, size } : p,
      ),
      dirty: true,
    })),

  markSaved: (id, name) =>
    set({ activeMeta: { id, name }, dirty: false }),

  markDirty: () => set({ dirty: true }),
}));
