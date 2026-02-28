/**
 * Tests for useScreenShareMode hook (PRD-82).
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockToggle = vi.fn();
const mockRegister = vi.fn();

let mockScreenShareMode = false;

vi.mock("../SensitivityProvider", () => ({
  useSensitivity: () => ({
    screenShareMode: mockScreenShareMode,
    toggleScreenShareMode: mockToggle,
  }),
}));

vi.mock("@/features/shortcuts/useShortcut", () => ({
  useShortcut: (binding: { id: string; action: () => void }) => {
    mockRegister(binding);
  },
}));

/* --------------------------------------------------------------------------
   Import after mocks
   -------------------------------------------------------------------------- */

import { useScreenShareMode } from "../hooks/useScreenShareMode";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("useScreenShareMode", () => {
  test("registers keyboard shortcut on mount", () => {
    renderHook(() => useScreenShareMode());

    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "general.screenShareMode",
        key: "Ctrl+Shift+s",
        category: "general",
      }),
    );
  });

  test("toggling calls toggleScreenShareMode", () => {
    const { result } = renderHook(() => useScreenShareMode());

    act(() => {
      result.current.toggle();
    });

    expect(mockToggle).toHaveBeenCalled();
  });

  test("returns correct isActive state", () => {
    mockScreenShareMode = false;
    const { result, rerender } = renderHook(() => useScreenShareMode());

    expect(result.current.isActive).toBe(false);

    mockScreenShareMode = true;
    rerender();

    expect(result.current.isActive).toBe(true);
  });
});
