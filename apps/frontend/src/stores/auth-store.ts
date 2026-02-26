import { create } from "zustand";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type UserRole = "admin" | "creator" | "reviewer";

export interface UserInfo {
  id: number;
  username: string;
  email: string;
  role: UserRole;
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserInfo;
}

interface AuthState {
  user: UserInfo | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthActions {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  setLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export type AuthStore = AuthState & AuthActions;

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const BASE_URL = `${import.meta.env.BASE_URL}api/v1`;

const INITIAL_STATE: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
};

/* --------------------------------------------------------------------------
   Store
   -------------------------------------------------------------------------- */

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...INITIAL_STATE,

  login: async (username: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({
          error: { message: "Login failed" },
        }));
        throw new Error(body.error?.message ?? "Login failed");
      }

      const body = await response.json();
      const data: AuthResponse = body.data;

      set({
        user: data.user,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ ...INITIAL_STATE });
      throw error;
    }
  },

  logout: async () => {
    const { accessToken } = get();

    // Clear state first so the UI updates immediately
    set({ ...INITIAL_STATE });

    // Best-effort server-side logout (fire and forget)
    if (accessToken) {
      try {
        await fetch(`${BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        // Server-side logout failure is non-critical
      }
    }
  },

  refresh: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        set({ ...INITIAL_STATE });
        return false;
      }

      const body = await response.json();
      const data: AuthResponse = body.data;

      set({
        user: data.user,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        isAuthenticated: true,
      });

      return true;
    } catch {
      set({ ...INITIAL_STATE });
      return false;
    }
  },

  setLoading: (loading: boolean) => set({ isLoading: loading }),

  clearAuth: () => set({ ...INITIAL_STATE }),
}));
