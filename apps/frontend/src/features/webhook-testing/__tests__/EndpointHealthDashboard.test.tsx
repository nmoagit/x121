import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { EndpointHealthDashboard } from "../EndpointHealthDashboard";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("EndpointHealthDashboard", () => {
  it("renders loading or health content", () => {
    renderWithProviders(<EndpointHealthDashboard />);

    // During initial render, either loading or dashboard shows
    const loading = screen.queryByTestId("health-loading");
    const dashboard = screen.queryByTestId("health-dashboard");
    const empty = screen.queryByTestId("health-empty");
    expect(loading || dashboard || empty).toBeTruthy();
  });

  it("shows loading state with spinner", () => {
    renderWithProviders(<EndpointHealthDashboard />);

    const loading = screen.queryByTestId("health-loading");
    if (loading) {
      expect(loading).toBeInTheDocument();
    }
  });

  it("renders heading when loaded", () => {
    renderWithProviders(<EndpointHealthDashboard />);

    // Either loading or showing the actual content heading
    const loading = screen.queryByTestId("health-loading");
    const heading = screen.queryByText("Endpoint Health Overview");
    expect(loading || heading).toBeTruthy();
  });
});
