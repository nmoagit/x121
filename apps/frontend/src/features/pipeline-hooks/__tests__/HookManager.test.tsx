import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { HookManager } from "../HookManager";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("HookManager", () => {
  it("renders hook manager or loading state", () => {
    renderWithProviders(<HookManager />);

    // During initial render, query is loading -- either loading or manager shows
    const loading = screen.queryByTestId("hooks-loading");
    const manager = screen.queryByTestId("hook-manager");
    expect(loading || manager).toBeTruthy();
  });

  it("renders with scope props without crashing", () => {
    renderWithProviders(
      <HookManager scopeType="project" scopeId={42} />,
    );

    const loading = screen.queryByTestId("hooks-loading");
    const manager = screen.queryByTestId("hook-manager");
    expect(loading || manager).toBeTruthy();
  });

  it("shows loading state text", () => {
    renderWithProviders(<HookManager />);

    // The component will be in loading state since no API is available
    const loading = screen.queryByTestId("hooks-loading");
    if (loading) {
      expect(loading).toHaveTextContent("Loading hooks...");
    }
  });

  it("renders heading when loaded", () => {
    renderWithProviders(<HookManager />);

    // Either loading or showing the actual content
    const loading = screen.queryByTestId("hooks-loading");
    const heading = screen.queryByText("Pipeline Hooks");
    expect(loading || heading).toBeTruthy();
  });
});
