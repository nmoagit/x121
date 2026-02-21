import { create } from "zustand";
import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type FocusMode = "review" | "generation" | null;

interface FocusModeState {
  focusMode: FocusMode;
  isLoading: boolean;
}

interface FocusModeActions {
  /** Enter a focus mode (review or generation). Persists to API. */
  enterFocus: (mode: NonNullable<FocusMode>) => Promise<void>;
  /** Exit focus mode. Persists to API. */
  exitFocus: () => Promise<void>;
  /** Load focus mode preference from the API (call once on mount). */
  loadFromApi: () => Promise<void>;
}

export type FocusModeStore = FocusModeState & FocusModeActions;

/* --------------------------------------------------------------------------
   API helpers
   -------------------------------------------------------------------------- */

interface FocusPreferenceResponse {
  focus_mode: string | null;
}

async function persistFocusMode(mode: FocusMode): Promise<void> {
  await api.put("/user/proficiency/focus-mode", { focus_mode: mode });
}

/* --------------------------------------------------------------------------
   Store
   -------------------------------------------------------------------------- */

export const useFocusMode = create<FocusModeStore>((set) => ({
  focusMode: null,
  isLoading: false,

  enterFocus: async (mode) => {
    set({ focusMode: mode });
    try {
      await persistFocusMode(mode);
    } catch {
      // Silently degrade -- local state is still applied.
    }
  },

  exitFocus: async () => {
    set({ focusMode: null });
    try {
      await persistFocusMode(null);
    } catch {
      // Silently degrade.
    }
  },

  loadFromApi: async () => {
    set({ isLoading: true });
    try {
      const data = await api.get<FocusPreferenceResponse | undefined>(
        "/user/proficiency/focus-mode",
      );
      if (data?.focus_mode) {
        set({ focusMode: data.focus_mode as FocusMode });
      }
    } catch {
      // Non-critical -- default to no focus mode.
    } finally {
      set({ isLoading: false });
    }
  },
}));
