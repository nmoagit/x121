import { THEME_STORAGE_KEY } from "@/tokens/types";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider";

/**
 * Mock window.matchMedia which is not available in jsdom.
 * Returns a MediaQueryList stub that defaults to not matching.
 */
function mockMatchMedia() {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];

  const mql = {
    matches: false,
    media: "(prefers-color-scheme: light)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.push(handler);
    }),
    removeEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(handler);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    dispatchEvent: vi.fn(),
  };

  window.matchMedia = vi.fn().mockReturnValue(mql);

  return { mql, listeners };
}

/** Helper component that exposes theme context values for testing */
function ThemeConsumer() {
  const {
    themeId,
    colorScheme,
    brandPalette,
    highContrast,
    setColorScheme,
    setBrandPalette,
    setHighContrast,
  } = useTheme();
  return (
    <div>
      <span data-testid="theme-id">{themeId}</span>
      <span data-testid="color-scheme">{colorScheme}</span>
      <span data-testid="brand-palette">{brandPalette}</span>
      <span data-testid="high-contrast">{String(highContrast)}</span>
      <button type="button" data-testid="set-light" onClick={() => setColorScheme("light")}>
        Light
      </button>
      <button type="button" data-testid="set-dark" onClick={() => setColorScheme("dark")}>
        Dark
      </button>
      <button type="button" data-testid="set-neon" onClick={() => setBrandPalette("neon")}>
        Neon
      </button>
      <button type="button" data-testid="set-hc" onClick={() => setHighContrast(true)}>
        High Contrast
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    mockMatchMedia();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-high-contrast");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets data-theme attribute on document.documentElement", () => {
    render(
      <ThemeProvider colorScheme="dark" brandPalette="obsidian">
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark-obsidian");
  });

  it("useTheme hook returns current theme values", () => {
    render(
      <ThemeProvider colorScheme="dark" brandPalette="obsidian">
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-id")).toHaveTextContent("dark-obsidian");
    expect(screen.getByTestId("color-scheme")).toHaveTextContent("dark");
    expect(screen.getByTestId("brand-palette")).toHaveTextContent("obsidian");
    expect(screen.getByTestId("high-contrast")).toHaveTextContent("false");
  });

  it("setColorScheme changes the theme", async () => {
    render(
      <ThemeProvider colorScheme="dark" brandPalette="obsidian">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("color-scheme")).toHaveTextContent("dark");

    await act(async () => {
      screen.getByTestId("set-light").click();
    });

    expect(screen.getByTestId("color-scheme")).toHaveTextContent("light");
    expect(screen.getByTestId("theme-id")).toHaveTextContent("light-obsidian");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light-obsidian");
  });

  it("setBrandPalette changes the brand palette", async () => {
    render(
      <ThemeProvider colorScheme="dark" brandPalette="obsidian">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await act(async () => {
      screen.getByTestId("set-neon").click();
    });

    expect(screen.getByTestId("brand-palette")).toHaveTextContent("neon");
    expect(screen.getByTestId("theme-id")).toHaveTextContent("dark-neon");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark-neon");
  });

  it("setHighContrast updates the high contrast flag", async () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await act(async () => {
      screen.getByTestId("set-hc").click();
    });

    expect(screen.getByTestId("high-contrast")).toHaveTextContent("true");
    expect(document.documentElement.getAttribute("data-high-contrast")).toBe("true");
  });

  it("persists preference to localStorage on change", async () => {
    render(
      <ThemeProvider colorScheme="dark" brandPalette="obsidian">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await act(async () => {
      screen.getByTestId("set-light").click();
    });

    const stored = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? "{}");
    expect(stored.colorScheme).toBe("light");
    expect(stored.brandPalette).toBe("obsidian");
    expect(stored.highContrast).toBe(false);
  });

  it("restores theme from localStorage on mount", () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({
        colorScheme: "light",
        brandPalette: "neon",
        highContrast: true,
      }),
    );

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("color-scheme")).toHaveTextContent("light");
    expect(screen.getByTestId("brand-palette")).toHaveTextContent("neon");
    expect(screen.getByTestId("high-contrast")).toHaveTextContent("true");
  });

  it("ignores invalid localStorage data", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "not valid json!!");

    // Should not throw, falls back to defaults
    render(
      <ThemeProvider colorScheme="dark" brandPalette="obsidian">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("color-scheme")).toHaveTextContent("dark");
    expect(screen.getByTestId("brand-palette")).toHaveTextContent("obsidian");
  });

  it("throws when useTheme is used outside ThemeProvider", () => {
    // Suppress console.error during expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<ThemeConsumer />);
    }).toThrow("useTheme must be used within a <ThemeProvider>");

    spy.mockRestore();
  });

  it("sets data-high-contrast attribute on document.documentElement", () => {
    render(
      <ThemeProvider highContrast>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-high-contrast")).toBe("true");
  });
});
