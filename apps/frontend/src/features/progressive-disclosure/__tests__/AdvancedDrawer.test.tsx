import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdvancedDrawer } from "@/components/composite/AdvancedDrawer";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((_index: number) => null),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("AdvancedDrawer", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("defaults to closed", () => {
    render(
      <AdvancedDrawer>
        <p>Advanced content</p>
      </AdvancedDrawer>,
    );

    const trigger = screen.getByRole("button", { name: /advanced/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens when the toggle button is clicked", () => {
    render(
      <AdvancedDrawer>
        <p>Advanced content</p>
      </AdvancedDrawer>,
    );

    const trigger = screen.getByRole("button", { name: /advanced/i });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("supports custom label text", () => {
    render(
      <AdvancedDrawer label="More Options">
        <p>Content</p>
      </AdvancedDrawer>,
    );

    expect(
      screen.getByRole("button", { name: /more options/i }),
    ).toBeInTheDocument();
  });

  it("persists open state to localStorage when persistKey is provided", () => {
    render(
      <AdvancedDrawer persistKey="test-drawer">
        <p>Content</p>
      </AdvancedDrawer>,
    );

    const trigger = screen.getByRole("button", { name: /advanced/i });
    fireEvent.click(trigger);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "advanced-drawer-test-drawer",
      "true",
    );
  });

  it("restores open state from localStorage on mount", () => {
    localStorageMock.setItem("advanced-drawer-restored", "true");

    render(
      <AdvancedDrawer persistKey="restored">
        <p>Content</p>
      </AdvancedDrawer>,
    );

    const trigger = screen.getByRole("button", { name: /advanced/i });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("starts open when defaultOpen is true", () => {
    render(
      <AdvancedDrawer defaultOpen>
        <p>Content</p>
      </AdvancedDrawer>,
    );

    const trigger = screen.getByRole("button", { name: /advanced/i });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("renders children content", () => {
    render(
      <AdvancedDrawer defaultOpen>
        <p>Hidden advanced panel</p>
      </AdvancedDrawer>,
    );

    expect(screen.getByText("Hidden advanced panel")).toBeInTheDocument();
  });
});
