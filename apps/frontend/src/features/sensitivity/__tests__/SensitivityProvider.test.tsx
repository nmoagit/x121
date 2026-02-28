/**
 * Tests for SensitivityProvider context (PRD-82).
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { BlurLevel } from "../types";
import { SENSITIVITY_STORAGE_KEY } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockRejectedValue(new Error("not authenticated")),
    put: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: false }),
}));

/* --------------------------------------------------------------------------
   Import after mocks
   -------------------------------------------------------------------------- */

import { SensitivityProvider, useSensitivity } from "../SensitivityProvider";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function wrapper({ children }: { children: React.ReactNode }) {
  return <SensitivityProvider>{children}</SensitivityProvider>;
}

function wrapperWithAdmin(adminMinLevel: BlurLevel) {
  return function AdminWrapper({ children }: { children: React.ReactNode }) {
    return (
      <SensitivityProvider adminMinLevel={adminMinLevel}>
        {children}
      </SensitivityProvider>
    );
  };
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SensitivityProvider", () => {
  beforeEach(() => {
    localStorage.removeItem(SENSITIVITY_STORAGE_KEY);
  });

  test("provides default values", () => {
    const { result } = renderHook(() => useSensitivity(), { wrapper });

    expect(result.current.globalLevel).toBe("full");
    expect(result.current.screenShareMode).toBe(false);
    expect(result.current.watermarkEnabled).toBe(false);
    expect(result.current.adminMinLevel).toBe("full");
  });

  test("getViewLevel returns placeholder when screen-share mode is active", () => {
    const { result } = renderHook(() => useSensitivity(), { wrapper });

    act(() => {
      result.current.toggleScreenShareMode();
    });

    expect(result.current.getViewLevel("timeline")).toBe("placeholder");
    expect(result.current.getViewLevel("preview")).toBe("placeholder");
  });

  test("getViewLevel returns view override when set", () => {
    const { result } = renderHook(() => useSensitivity(), { wrapper });

    act(() => {
      result.current.setViewOverride("timeline", "soft_blur");
    });

    expect(result.current.getViewLevel("timeline")).toBe("soft_blur");
    expect(result.current.getViewLevel("preview")).toBe("full"); // No override
  });

  test("getViewLevel enforces admin minimum", () => {
    const { result } = renderHook(
      () => useSensitivity(),
      { wrapper: wrapperWithAdmin("heavy_blur") },
    );

    // Global level is "full" (less restrictive than admin min "heavy_blur")
    expect(result.current.getViewLevel("preview")).toBe("heavy_blur");

    // Even view override less restrictive than admin is clamped
    act(() => {
      result.current.setViewOverride("timeline", "soft_blur");
    });
    expect(result.current.getViewLevel("timeline")).toBe("heavy_blur");
  });

  test("setGlobalLevel updates state", () => {
    const { result } = renderHook(() => useSensitivity(), { wrapper });

    act(() => {
      result.current.setGlobalLevel("heavy_blur");
    });

    expect(result.current.globalLevel).toBe("heavy_blur");
    expect(result.current.getViewLevel("any-view")).toBe("heavy_blur");
  });
});
