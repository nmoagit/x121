/**
 * Zustand store for activity console state (PRD-118).
 *
 * Manages filter state, panel open/close, mode toggle,
 * and the client-side ring buffer of log entries.
 */

import { create } from "zustand";

import type {
  ActivityLogCategory,
  ActivityLogEntry,
  ActivityLogLevel,
  ActivityLogSource,
} from "../types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_MAX_ENTRIES = 10_000;

/* --------------------------------------------------------------------------
   Store interface
   -------------------------------------------------------------------------- */

interface ActivityConsoleState {
  // Panel state
  isOpen: boolean;

  // Filter state
  levels: Set<ActivityLogLevel>;
  sources: Set<ActivityLogSource>;
  mode: ActivityLogCategory;
  entityFilter: { type?: string; id?: number } | null;
  searchText: string;

  // Ring buffer
  entries: ActivityLogEntry[];
  maxEntries: number;
  isPaused: boolean;
  skippedCount: number;

  // Actions
  togglePanel: () => void;
  setMode: (mode: ActivityLogCategory) => void;
  toggleLevel: (level: ActivityLogLevel) => void;
  toggleSource: (source: ActivityLogSource) => void;
  setSearchText: (text: string) => void;
  setEntityFilter: (filter: { type?: string; id?: number } | null) => void;
  addEntry: (entry: ActivityLogEntry) => void;
  addSkipped: (count: number) => void;
  clearEntries: () => void;
  setPaused: (paused: boolean) => void;
}

/* --------------------------------------------------------------------------
   Store
   -------------------------------------------------------------------------- */

export const useActivityConsoleStore = create<ActivityConsoleState>((set) => ({
  isOpen: false,
  levels: new Set<ActivityLogLevel>(["info", "warn", "error"]),
  sources: new Set<ActivityLogSource>(),
  mode: "curated",
  entityFilter: null,
  searchText: "",
  entries: [],
  maxEntries: DEFAULT_MAX_ENTRIES,
  isPaused: false,
  skippedCount: 0,

  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),

  setMode: (mode) => set({ mode }),

  toggleLevel: (level) =>
    set((s) => {
      const next = new Set(s.levels);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return { levels: next };
    }),

  toggleSource: (source) =>
    set((s) => {
      const next = new Set(s.sources);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return { sources: next };
    }),

  setSearchText: (searchText) => set({ searchText }),

  setEntityFilter: (entityFilter) => set({ entityFilter }),

  addEntry: (entry) =>
    set((s) => {
      if (s.isPaused) return s;
      const entries = [...s.entries, entry];
      if (entries.length > s.maxEntries) {
        entries.splice(0, entries.length - s.maxEntries);
      }
      return { entries };
    }),

  addSkipped: (count) =>
    set((s) => ({ skippedCount: s.skippedCount + count })),

  clearEntries: () => set({ entries: [], skippedCount: 0 }),

  setPaused: (isPaused) => set({ isPaused }),
}));
