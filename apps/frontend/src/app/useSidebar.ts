import { create } from "zustand";

interface SidebarState {
  collapsed: boolean;
  mobileOpen: boolean;
  /** When true, only prominent nav items are shown. */
  compactNav: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleCompactNav: () => void;
  openMobile: () => void;
  closeMobile: () => void;
}

const STORAGE_KEY = "x121:sidebar-collapsed";
const COMPACT_NAV_KEY = "x121:compact-nav";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function loadCompactNav(): boolean {
  try {
    return localStorage.getItem(COMPACT_NAV_KEY) === "true";
  } catch {
    return false;
  }
}

export const useSidebar = create<SidebarState>((set) => ({
  collapsed: loadCollapsed(),
  mobileOpen: false,
  compactNav: loadCompactNav(),

  toggle: () =>
    set((s) => {
      const next = !s.collapsed;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return { collapsed: next };
    }),

  setCollapsed: (collapsed) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
    set({ collapsed });
  },

  toggleCompactNav: () =>
    set((s) => {
      const next = !s.compactNav;
      try {
        localStorage.setItem(COMPACT_NAV_KEY, String(next));
      } catch {
        /* ignore */
      }
      return { compactNav: next };
    }),

  openMobile: () => set({ mobileOpen: true }),
  closeMobile: () => set({ mobileOpen: false }),
}));
