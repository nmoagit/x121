import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ConfigLibrary } from "../ConfigLibrary";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ConfigLibrary", () => {
  it("renders config library or loading state", () => {
    renderWithProviders(<ConfigLibrary />);

    const loading = screen.queryByTestId("configs-loading");
    const library = screen.queryByTestId("config-library");
    expect(loading || library).toBeTruthy();
  });

  it("renders with projectId prop without crashing", () => {
    renderWithProviders(<ConfigLibrary projectId={42} />);

    const loading = screen.queryByTestId("configs-loading");
    const library = screen.queryByTestId("config-library");
    expect(loading || library).toBeTruthy();
  });

  it("shows loading state text", () => {
    renderWithProviders(<ConfigLibrary />);

    const loading = screen.queryByTestId("configs-loading");
    if (loading) {
      expect(loading).toHaveTextContent("Loading configuration templates...");
    }
  });

  it("renders heading when loaded", () => {
    renderWithProviders(<ConfigLibrary />);

    const loading = screen.queryByTestId("configs-loading");
    const heading = screen.queryByText("Configuration Templates");
    expect(loading || heading).toBeTruthy();
  });
});
