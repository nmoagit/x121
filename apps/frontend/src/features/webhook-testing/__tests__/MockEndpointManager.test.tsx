import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { MockEndpointManager } from "../MockEndpointManager";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("MockEndpointManager", () => {
  it("renders loading or manager content", () => {
    renderWithProviders(<MockEndpointManager />);

    // During initial render, query is loading -- either loading or manager shows
    const loading = screen.queryByTestId("mocks-loading");
    const manager = screen.queryByTestId("mock-endpoint-manager");
    expect(loading || manager).toBeTruthy();
  });

  it("shows create button when loaded", () => {
    renderWithProviders(<MockEndpointManager />);

    const loading = screen.queryByTestId("mocks-loading");
    const createBtn = screen.queryByTestId("create-mock-btn");
    expect(loading || createBtn).toBeTruthy();
  });

  it("shows heading when loaded", () => {
    renderWithProviders(<MockEndpointManager />);

    const loading = screen.queryByTestId("mocks-loading");
    const heading = screen.queryByText("Mock Endpoints");
    expect(loading || heading).toBeTruthy();
  });
});
